import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../packages/data/src/postgres';
import {correctLegacyLegResult,planLegacyLegCorrection} from '../packages/data/src/legacy-leg-correction';
import {DomainError,requireThat} from '../packages/contracts/src/index';
import {normalizeOperatorDatabaseUrl} from './operator-database';

let phase='configuration';
async function main(){
const mode=process.env.RECONCILE_OPERATION??'inspect';
requireThat(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/production'&&process.env.APP_ENV==='production','operator_production_workflow_required');
requireThat(['inspect','repair'].includes(mode),'operator_invalid_operation');
const a=process.env.RECONCILE_PLAYER_A??'',b=process.env.RECONCILE_PLAYER_B??'',game=process.env.RECONCILE_GAME_NUMBER??'',hash=process.env.RECONCILE_EXPECTED_HASH??'',before=process.env.RECONCILE_BEFORE??'';
requireThat(/^[A-Za-z0-9_-]{3,20}$/.test(a)&&/^[A-Za-z0-9_-]{3,20}$/.test(b)&&a.toLowerCase()!==b.toLowerCase(),'operator_invalid_players');
requireThat(!game||/^\d{1,15}$/.test(game),'operator_invalid_game');
requireThat(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(before)&&Number.isFinite(Date.parse(before)),'operator_cutoff_required');
if(mode==='repair'){
 requireThat(!!game&&/^[a-f0-9]{64}$/.test(hash),'operator_exact_game_and_hash_required');
 const origin=process.env.NEXT_PUBLIC_APP_URL;requireThat(origin==='https://dartspoint.nl','operator_invalid_origin');
 for(const path of ['/healthz','/readyz']){const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});const data=await response.json();requireThat(response.ok&&data.ok&&data.release===process.env.GITHUB_SHA,'operator_release_not_active');}
}
const pool=new Pool({...postgresOptions(normalizeOperatorDatabaseUrl(process.env.DATABASE_URL!)),max:1,connectionTimeoutMillis:15000});phase='connect';const c=await pool.connect();phase='query';
try{
 await c.query(mode==='inspect'?'begin read only':'begin');await c.query('set local role dartspoint_app');await c.query("set local lock_timeout='5s'");await c.query("set local statement_timeout='20s'");
 const m=(await c.query(`select m.*,r.kind,r.winner_id,r.result_hash,r.data result_data from matches m join match_results r on r.match_id=m.id
 where m.lifecycle='completed' and m.ended_at<=$3::timestamptz and ($4::bigint is null or m.game_number=$4)
 and exists(select 1 from match_players mp join profiles p on p.id=mp.user_id where mp.match_id=m.id and lower(p.username)=lower($1))
 and exists(select 1 from match_players mp join profiles p on p.id=mp.user_id where mp.match_id=m.id and lower(p.username)=lower($2))
 order by m.ended_at desc,m.game_number desc limit 1 ${mode==='repair'?'for update of m':''}`,[a,b,before,game||null])).rows[0];
 requireThat(m,'operator_match_not_found',404);
 const players=(await c.query('select mp.user_id,mp.seat,p.username from match_players mp join profiles p on p.id=mp.user_id where match_id=$1 order by seat',[m.id])).rows;
 requireThat(players.length===2,'operator_two_current_players_required');
 const ledger=(await c.query('select user_id id,before::text,after::text,delta::text from rating_ledger where match_id=$1',[m.id])).rows;
 const ordered=players.flatMap(player=>ledger.filter(entry=>entry.id===player.user_id)),winner=players.find(player=>player.user_id===m.winner_id)?.seat;
 const already=!!m.result_data.ratingCorrection;
 let plan:ReturnType<typeof planLegacyLegCorrection>|null=null,repairRefusal:string|null=null;
 if(!already)try{plan=planLegacyLegCorrection(m.result_data,m.kind,winner,m.ranked,ordered);}catch(error){if(mode==='repair')throw error;repairRefusal=error instanceof DomainError?error.code:'correction_invalid_evidence';}
 const applied=mode==='repair'?await correctLegacyLegResult(c,m,players,hash,'User-requested correction of the last match between '+a+' and '+b+'; GitHub run '+process.env.GITHUB_RUN_ID):null;
 const report={ok:true,operation:mode,gameNumber:Number(m.game_number),endedAt:m.ended_at,kind:m.kind,ranked:m.ranked,resultHash:m.result_hash,players:players.map(player=>({seat:player.seat,name:player.username})),winner,originalLegs:m.result_data.totalLegs,correctedLegs:plan?.state.totalLegs??m.result_data.totalLegs,alreadyCorrected:already,repairRefusal,originalLedger:ordered.map(entry=>({seat:players.find(player=>player.user_id===entry.id)?.seat,before:entry.before,after:entry.after,delta:entry.delta})),changed:applied?.changed??false,adjustments:(applied?.correction.adjustments??plan?.adjustments??[]).map((entry:{id:string;delta:string})=>({seat:players.find(player=>player.user_id===entry.id)?.seat,delta:entry.delta}))};
 await c.query('commit');await mkdir('artifacts/match-reconciliation',{recursive:true});await writeFile('artifacts/match-reconciliation/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){await c.query('rollback');console.error(JSON.stringify({ok:false,code:error instanceof DomainError?error.code:'operator_database_unavailable'}));process.exitCode=1;}
finally{c.release();await pool.end();}

}
await main().catch(error=>{const driverCode=error&&typeof error==='object'&&'code'in error?String(error.code):'';console.error(JSON.stringify({ok:false,code:error instanceof DomainError?error.code:"operator_action_unavailable",phase,...(/^(?:[0-9A-Z]{5}|E[A-Z_]{2,35})$/.test(driverCode)?{driverCode}:{})}));process.exitCode=1;});
