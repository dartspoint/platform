import {randomUUID} from 'node:crypto';
import {transaction,audit,outbox,draining,redis} from './db';
import {finishMatch,persist,type ServerGame} from './matches';
import {dartsGameReducer} from '../../game-core/src/darts-game-state';
import {observeTurnTimeout} from '../../game-core/src/turn-timeout';
export async function maintainMatches(){return transaction(async c=>{
 // A lost writer cannot make elapsed infrastructure downtime into a player loss.
 const recovery=(await c.query("select * from matches where lifecycle='playing' and writer_id is not null and lease_until<now() and not exists(select 1 from match_darts d where d.match_id=matches.id and impacted_at is null) for update skip locked")).rows;
 for(const m of recovery){
  await c.query("update matches set lifecycle='paused',writer_id=null,lease_until=null,writer_fence=writer_fence+1 where id=$1",[m.id]);m.lifecycle='paused';
  await c.query('update match_players set disconnected_at=null,ready=false where match_id=$1',[m.id]);
  await persist(c,m,{...m.state,ready:[false,false],phase:'horizontal',lockedX:null,phaseStartedAt:Date.now(),phaseToken:randomUUID()},'writer-recovery',null);await audit(c,null,'match.recovery',m.id);
 }
 const assigned=(await c.query("select * from matches where lifecycle='assigned' and created_at<now()-interval '5 minutes' for update skip locked")).rows;
 for(const m of assigned){
  const present=(await c.query('select p.seat from match_players p join room_memberships r on r.user_id=p.user_id and r.room_id=$2 and r.lease_until>now() where p.match_id=$1 and p.ready',[m.id,m.room_id])).rows;
  const winner=present.length===1?present[0].seat as 0|1:null;
  const state={...m.state,phase:'won',winner};await finishMatch(c,m,state,'no-show',winner);await persist(c,m,state,'no-show',null);
  await audit(c,null,'match.no-show',m.id,{winner,deadlineMinutes:5},winner===null?'Geen eenduidige aanwezige speler; hernieuwde bevestiging of beheerbesluit nodig':'Enige aanwezige speler had de wedstrijd bevestigd; administratieve walkover');
 }
 const turns=(await c.query("select m.* from matches m where lifecycle='playing' and state->'pendingDart'='null'::jsonb and not exists(select 1 from match_players p where p.match_id=m.id and disconnected_at is not null) and coalesce((state->>'turnStartedAt')::bigint,(state->>'phaseStartedAt')::bigint)+coalesce((competition->>'turnSeconds')::integer,30)*1000<$1 for update skip locked",[Date.now()])).rows;
 for(const m of turns){
  const now=Date.now(),intervalMs=(m.competition?.turnSeconds??30)*1000,timeout=observeTurnTimeout(m.state,now,intervalMs);if(!timeout)continue;
  if(timeout.forfeit){
   const s={...m.state,...dartsGameReducer(m.state,{type:'forfeit',player:m.state.turn}),...timeout,phaseToken:randomUUID(),lastResult:'Wedstrijd verloren na drie opeenvolgende beurttijdoverschrijdingen.'};
   await finishMatch(c,m,s,'forfeit',s.winner);await persist(c,m,s,'turn-timeout',null);await audit(c,null,'match.turn-timeout',m.id,{player:m.state.turn,strike:3,intervalMs});
  }else{
   await persist(c,m,{...m.state,...timeout,phaseToken:randomUUID(),phaseStartedAt:now},'turn-timeout-warning',null);
   await audit(c,null,'match.turn-timeout-warning',m.id,{player:m.state.turn,strike:timeout.timeoutWarning!.strike,deadlineAt:timeout.timeoutWarning!.deadlineAt,intervalMs});
  }
 }
});}
export async function scheduleReminders(){return transaction(async c=>{
 const tournaments=(await c.query("select * from tournaments where published and status in('registration','checkin') and nullif(model->'settings'->>'startsAt','')::timestamptz between now() and now()+interval '30 minutes'")).rows;
 for(const t of tournaments)for(const p of t.model.participants.filter((p:any)=>['confirmed','checkedin'].includes(p.status)))await outbox(c,'tournament-reminder:'+t.id+':'+p.id,'tournament-reminder',p.id,{tournamentId:t.id,eventName:t.name,startsAt:t.model.settings.startsAt,timeZone:"Europe/Amsterdam",checkInFromSchedule:true,startsAtLabel:new Date(t.model.settings.startsAt).toLocaleString("nl-NL",{timeZone:"Europe/Amsterdam"}),checkInLabel:"Controleer je incheckvenster op de toernooipagina",roomName:t.model.settings.room,actionUrl:process.env.NEXT_PUBLIC_APP_URL+"/toernooi/"+t.id});
 const fixtures=(await c.query("select f.*,s.name,s.model season from division_fixtures f join seasons s on s.id=f.season_id where s.status='live' and f.model->>'status'='scheduled' and (f.model->>'dueOn')::date between current_date and current_date+1")).rows;
 for(const f of fixtures)for(const id of [f.player_low,f.player_high])await outbox(c,'division-reminder:'+f.id+':'+id,'match-reminder',id,{opponent:f.season.members.find((p:any)=>p.id!==id&&[f.player_low,f.player_high].includes(p.id))?.name,gameMode:'501',dueOn:f.model.dueOn,startsAtLabel:f.model.dueOn,actionUrl:process.env.NEXT_PUBLIC_APP_URL+'/divisies'});
});}

export async function drainAdmissions(){return transaction(async c=>{
 await c.query('select * from private.admission_lock where id=1 for update');await(await redis()).set('dartspoint:draining','1');
 const ids=(await c.query("select id from matches where lifecycle='assigned' order by id for update")).rows.map(m=>m.id);if(!ids.length)return;
 const nodes=(await c.query('select tournament_id,node_id from tournament_nodes where match_id=any($1::uuid[])',[ids])).rows;
 await c.query('delete from board_reservations where match_id=any($1::uuid[])',[ids]);await c.query('delete from active_player_reservations where match_id=any($1::uuid[])',[ids]);
 await c.query("update matches set lifecycle='cancelled',ended_at=now() where id=any($1::uuid[])",[ids]);
 await c.query('update tournament_nodes set match_id=null where match_id=any($1::uuid[])',[ids]);
 for(const tournamentId of [...new Set(nodes.map(n=>n.tournament_id))].sort()){
  const row=(await c.query('select model from tournaments where id=$1 for update',[tournamentId])).rows[0];
  const cancelled=new Set(nodes.filter(n=>n.tournament_id===tournamentId).map(n=>n.node_id));
  const model={...row.model,matches:row.model.matches.map((n:any)=>cancelled.has(n.id)?{...n,status:'ready',startedAt:null,assignedAt:null}:n)};
  await c.query('update tournaments set model=$2,version=version+1 where id=$1',[tournamentId,JSON.stringify(model)]);
  for(const node of model.matches.filter((n:any)=>cancelled.has(n.id)))await c.query('update tournament_nodes set model=$3 where tournament_id=$1 and node_id=$2',[tournamentId,node.id,JSON.stringify(node)]);
 }
 await audit(c,null,'deploy.drain-cancel-assigned','platform',{matches:ids.length});
});}
