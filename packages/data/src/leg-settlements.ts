import type {PoolClient} from 'pg';
import type {ServerGame} from './matches';
import {calculateElo} from '../../game-core/src/darts-elo';

/** Administrative loss of the current leg never fabricates a dart or checkout. */
export function awardForfeitLeg(state:ServerGame,winner:0|1):ServerGame{
 const legs:[number,number]=[...state.legs],sets:[number,number]=[...state.sets],totalLegs:[number,number]=[...state.totalLegs];
 legs[winner]++;totalLegs[winner]++;
 if(state.rules.format==='sets'&&legs[winner]>=(state.rules.bestOf+1)/2)sets[winner]++;
 return {...state,legs,sets,totalLegs,timeoutDecision:null,timeoutWarning:null,turnDeadlineAt:null};
}

export function matchPlayerStatistics(state:ServerGame,seat:number,winner:0|1|null){
 const events=state.events.filter(e=>e.player===seat);
 return {won:winner===seat,darts:state.dartCount[seat],points:state.pointsScored[seat],average:state.dartCount[seat]?state.pointsScored[seat]/state.dartCount[seat]*3:0,highestVisit:state.highestVisit[seat],highestCheckout:state.highestCheckout[seat],legs:state.totalLegs[seat],oneEighties:events.filter((e,i,a)=>!e.bust&&e.before-e.after===60&&i>=2&&a[i-1]?.visit===e.visit&&a[i-2]?.visit===e.visit&&a[i-2].before-e.after===180).length};
}

/** The caller owns the match row lock. The leg key and rating locks make retries
 * and competing workers atomic; the final match result never rates these twice. */
export async function settleLeg(c:PoolClient,m:any,state:ServerGame,winner:0|1,kind:'played'|'forfeit'){
 const leg=state.totalLegs[0]+state.totalLegs[1];
 const players=(await c.query('select user_id,seat from match_players where match_id=$1 order by seat',[m.id])).rows;
 const ratings=m.ranked?(await c.query('select user_id,rating from player_ratings where user_id=any($1::uuid[]) order by user_id for update',[players.map(p=>p.user_id)])).rows:[];
 const a=ratings.find(r=>r.user_id===players[0].user_id)?.rating,b=ratings.find(r=>r.user_id===players[1].user_id)?.rating;
 const delta=m.ranked?calculateElo(Number(a),Number(b),winner).deltaA.toFixed(10):null;
 const inserted=await c.query(`insert into private.match_leg_settlements(match_id,leg_number,winner_seat,kind,before_a,after_a,before_b,after_b,delta_a)
 values($1,$2,$3,$4,$5::numeric,$5::numeric+$7::numeric,$6::numeric,$6::numeric-$7::numeric,$7::numeric) on conflict do nothing returning leg_number`,[m.id,leg,winner,kind,a??null,b??null,delta]);
 if(!inserted.rowCount)return;
 if(delta!==null){
  await c.query('update player_ratings set rating=rating+$2::numeric where user_id=$1',[players[0].user_id,delta]);
  await c.query('update player_ratings set rating=rating-$2::numeric where user_id=$1',[players[1].user_id,delta]);
 }
 for(const seat of [0,1])await c.query(`insert into match_statistics(match_id,user_id,data) values($1,$2,$3) on conflict(match_id,user_id) do update set data=excluded.data`,[m.id,players[seat].user_id,JSON.stringify(matchPlayerStatistics(state,seat,state.winner))]);
}

export async function finalizeLegRatings(c:PoolClient,m:any,players:{user_id:string;seat:number}[],countMatch=true){
 const legs=(await c.query('select * from private.match_leg_settlements where match_id=$1 and delta_a is not null order by leg_number',[m.id])).rows;
 if(!legs.length)return;
 for(const seat of [0,1]){
  const uid=players[seat].user_id,first=legs[0],last=legs.at(-1)!,side=seat===0?'a':'b';
  await c.query(`insert into rating_ledger(match_id,user_id,before,after,delta,policy_version) values($1,$2,$3::numeric,$4::numeric,$4::numeric-$3::numeric,2)`,[m.id,uid,first['before_'+side],last['after_'+side]]);
  if(countMatch)await c.query('update player_ratings set ranked_played=ranked_played+1 where user_id=$1',[uid]);
  await c.query('insert into player_opponents(user_id,opponent_id,first_match_id) values($1,$2,$3) on conflict do nothing',[uid,players[1-seat].user_id,m.id]);
 }
}
