import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireThat} from '../../contracts/src/index';
import {calculateElo} from '../../game-core/src/darts-elo';
import {awardForfeitLeg} from './leg-settlements';
import {persist,type ServerGame} from './matches';
import {audit} from './db';

const scale=10000000000n;
function units(value:string){const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^[-+]/,'').split('.');requireThat(/^\d+$/.test(whole)&&/^\d{0,10}$/.test(fraction),'correction_invalid_decimal',409);return (negative?-1n:1n)*(BigInt(whole)*scale+BigInt(fraction.padEnd(10,'0')));}
function decimal(value:bigint){const sign=value<0n?'-':'',absolute=value<0n?-value:value;return sign+String(absolute/scale)+'.'+String(absolute%scale).padStart(10,'0');}
type Entry={id:string;before:string;after:string;delta:string};

/** Reconstruct only this match. Preserve all rating changes from later matches. */
export function planLegacyLegCorrection(state:ServerGame,kind:string,winner:0|1,ranked:boolean,ledger:Entry[]){
 requireThat(winner===0||winner===1,'correction_winner_missing',409);
 requireThat(['forfeit','disconnect'].includes(kind)&&!state.ratingPolicyVersion,'correction_not_legacy_forfeit',409);
 const checkouts=state.events.filter(event=>event.checkout);
 requireThat(checkouts.length>0&&checkouts.every((event,index)=>event.leg===index+1),'correction_leg_evidence_missing',409);
 const completed:[number,number]=[checkouts.filter(event=>event.player===0).length,checkouts.filter(event=>event.player===1).length];
 requireThat(completed.every((count,seat)=>count===state.totalLegs[seat]),'correction_score_evidence_mismatch',409);
 const corrected=awardForfeitLeg(state,winner);
 if(!ranked)return {state:corrected,ledger:[],adjustments:[]};
 requireThat(ledger.length===2,'correction_original_ledger_missing',409);
 let a=units(ledger[0].before),b=units(ledger[1].before);
 for(const seat of [...checkouts.map(event=>event.player),winner]){
  const delta=units(calculateElo(Number(decimal(a)),Number(decimal(b)),seat).deltaA.toFixed(10));a+=delta;b-=delta;
 }
 const after=[a,b];
 const correctedLedger=ledger.map((entry,seat)=>({...entry,after:decimal(after[seat]),delta:decimal(after[seat]-units(entry.before))}));
 const adjustments=correctedLedger.map((entry,seat)=>({id:entry.id,delta:decimal(units(entry.delta)-units(ledger[seat].delta))}));
 requireThat(units(adjustments[0].delta)+units(adjustments[1].delta)===0n,'correction_not_balanced',409);
 return {state:corrected,ledger:correctedLedger,adjustments};
}

/** Operator-only caller locks the exact completed match and supplies the hash
 * observed in the preceding inspection. Original immutable ledgers stay intact. */
export async function correctLegacyLegResult(c:PoolClient,m:any,players:{user_id:string;seat:number}[],expectedHash:string,reason:string){
 if(m.result_data.ratingCorrection)return {changed:false,correction:m.result_data.ratingCorrection};
 requireThat(m.result_hash===expectedHash,'correction_source_changed',409);
 requireThat(m.lifecycle==='completed'&&!m.competition,'correction_requires_completed_noncompetition_match',409);
 const winner=players.find(player=>player.user_id===m.winner_id)?.seat;
 requireThat(winner===0||winner===1,'correction_winner_missing',409);
 const original=(await c.query('select user_id id,before::text,after::text,delta::text from rating_ledger where match_id=$1',[m.id])).rows;
 const ledger=players.flatMap(player=>original.filter(entry=>entry.id===player.user_id));
 const plan=planLegacyLegCorrection(m.result_data,m.kind,winner,m.ranked,ledger);
 const ratings=(await c.query('select user_id from player_ratings where user_id=any($1::uuid[]) order by user_id for update',[players.map(player=>player.user_id)])).rows;
 requireThat(!m.ranked||ratings.length===2,'correction_player_rating_missing',409);
 for(const change of plan.adjustments)await c.query('update player_ratings set rating=rating+$2::numeric where user_id=$1',[change.id,change.delta]);
 const correction={policyVersion:2,sourceHash:expectedHash,ledger:plan.ledger,adjustments:plan.adjustments};
 const state={...m.state,legs:plan.state.legs,sets:plan.state.sets,totalLegs:plan.state.totalLegs};
 await persist(c,m,state,'leg-score-correction',null);
 const data={...m.result_data,legs:state.legs,sets:state.sets,totalLegs:state.totalLegs,ratingCorrection:correction};
 const result=(await c.query("update match_results set data=$2,final_version=$3,result_hash=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') where match_id=$1 returning result_hash",[m.id,JSON.stringify(data),m.state_version])).rows[0];
 for(const player of players)await c.query("update match_statistics set data=jsonb_set(data,'{legs}',to_jsonb($3::integer)) where match_id=$1 and user_id=$2",[m.id,player.user_id,state.totalLegs[player.seat]]);
 await audit(c,null,'match.leg-score-correction',m.id,{resultHash:result.result_hash,originalLedgerHash:createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),...correction},reason);
 return {changed:true,correction};
}
