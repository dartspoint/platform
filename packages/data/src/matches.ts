import {randomUUID,createHash} from 'node:crypto';
import {meterPosition,admittedMoment,TIMING_VERSION} from '../../game-core/src/timing';
import {registerIngress,type TrustedIngress} from './timing';
export {meterPosition} from '../../game-core/src/timing';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {db,transaction,draining,rateLimit,outbox,audit} from './db';
import {assertSessionActive,actorById,type Actor} from './auth';
import {roomAccess,blocked,target,ensureChannelReadState} from './community';
import {commandSchema,requireThat,uuid,DomainError} from '../../contracts/src/index';
import {initialGameState,dartsGameReducer,type GameState} from '../../game-core/src/darts-game-state';
import {normalizeGameRules,type GameRules} from '../../game-core/src/darts-match-rules';
import {scoreDart} from '../../game-core/src/darts-rules';
import {calculateElo} from '../../game-core/src/darts-elo';

export const FLIGHT_MS=560;
export const RECONNECT_MS=120000;
export type ServerGame=GameState & {phaseToken:string;phaseStartedAt:number;turnStartedAt:number;lockedX:number|null;lockedY?:number|null;lastAcceptedAt?:number;timingVersion?:'receive-v1'|typeof TIMING_VERSION;impactAt:number|null;ready:[boolean,boolean];names:[string,string]};
const rulesSchema=z.object({startScore:z.union([z.literal(301),z.literal(501),z.literal(701)]),bestOf:z.number().int().min(1).max(21).refine(n=>n%2===1),format:z.enum(['legs','sets']),bestOfSets:z.number().int().min(1).max(7).refine(n=>n%2===1),doubleIn:z.boolean().optional(),doubleOut:z.literal(true).optional()}).strict().transform(r=>normalizeGameRules({...r,doubleIn:r.startScore===301,doubleOut:true}));
function initialServerGame(id:string,names:[string,string],rules:GameRules,starter:0|1=0):ServerGame{return {...initialGameState(starter,id,0,rules),phase:'horizontal',phaseToken:randomUUID(),phaseStartedAt:0,turnStartedAt:0,lockedX:null,lockedY:null,lastAcceptedAt:0,timingVersion:TIMING_VERSION,impactAt:null,ready:[false,false],names};}
export async function admission(c:PoolClient){await c.query('select * from private.admission_lock where id=1 for update');requireThat(!await draining(),'maintenance',503,'Er is onderhoud. Bestaande partijen kunnen doorgaan.');}
export async function createMatch(c:PoolClient,a:Actor,b:string,roomId:string,rules:GameRules,mode:'casual'|'ranked'|'tournament'|'division',competition?:unknown,starterUserId?:string){
 await admission(c);const room=await roomAccess(c,a,roomId,true);const opponent=await actorById(b,Date.now()+3600000);
 await roomAccess(c,opponent,roomId);
 requireThat(!await blocked(c,a.id,b),'blocked',403);requireThat(a.id!==b,'self_target');
 if(!competition) requireThat(room.category!=='tournament','competition_only',403);
 for(const userId of [a.id,b])requireThat((await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>now()',[userId,roomId])).rowCount,'players_must_be_in_room',409);
 const id=randomUUID(),state=initialServerGame(id,[a.username!,opponent.username!],rules,starterUserId===b?1:0);
 await c.query('insert into matches(id,room_id,mode,rules,state,competition,ranked) values($1,$2,$3,$4,$5,$6,$7)',[id,roomId,mode,JSON.stringify(rules),JSON.stringify(state),competition?JSON.stringify(competition):null,mode==='ranked'||!!(competition as {ranked?:boolean})?.ranked]);
 try {for(const userId of [a.id,b].sort())await c.query('insert into active_player_reservations(user_id,match_id) values($1,$2)',[userId,id]);}
 catch(e){if((e as {code:string}).code==='23505')throw new DomainError('player_already_reserved',409);throw e;}
 await c.query('insert into match_players(match_id,user_id,seat) values($1,$2,0),($1,$3,1)',[id,a.id,b]);
 const channel=(await c.query("insert into channels(kind,match_id) values('match',$1) returning id",[id])).rows[0];
 await ensureChannelReadState(c,a.id,channel.id);await ensureChannelReadState(c,b,channel.id);return {matchId:id};
}
export async function invite(actor:Actor,input:unknown,starterUserId?:string){
 const p=z.object({targetId:uuid,roomId:uuid,rules:rulesSchema,ranked:z.boolean()}).strict().parse(input);
 await rateLimit('invite:'+actor.id,10,60);
 return transaction(async c=>{
  await admission(c);const room=await roomAccess(c,actor,p.roomId);requireThat(room.category!=='tournament','competition_only',403);await target(c,p.targetId);requireThat(p.targetId!==actor.id&&!await blocked(c,actor.id,p.targetId),'invalid_target',403);
  for(const userId of [actor.id,p.targetId])requireThat((await c.query('select 1 from room_memberships where room_id=$1 and user_id=$2 and lease_until>now()',[p.roomId,userId])).rowCount,'players_must_be_in_room',409);
  const rules=normalizeGameRules(p.rules);
  const r=await c.query("insert into game_invites(inviter_id,invitee_id,room_id,rules,ranked,expires_at,first_starter_id) values($1,$2,$3,$4,$5,now()+interval '60 seconds',$6) returning id",[actor.id,p.targetId,p.roomId,JSON.stringify(rules),p.ranked,starterUserId??null]);
  await outbox(c,'invite:'+r.rows[0].id,'game-invite',p.targetId,{name:actor.username,inviteId:r.rows[0].id});return r.rows[0];
 });
}
export async function respondInvite(actor:Actor,input:unknown){
 const {inviteId,action}=z.object({inviteId:uuid,action:z.enum(['accept','reject','cancel'])}).strict().parse(input);
 return transaction(async c=>{
  const i=(await c.query('select * from game_invites where id=$1 for update',[inviteId])).rows[0];
  requireThat(i && (action==='cancel'?i.inviter_id===actor.id:i.invitee_id===actor.id),'forbidden',403);
  if(i.state==='accepted' && action==='accept')return {matchId:i.match_id};
  requireThat(i.state==='pending'&&new Date(i.expires_at).getTime()>Date.now(),'invite_expired',409);
  let matchId:string|null=null;
  if(action==='accept'){const inviter=await actorById(i.inviter_id,Date.now()+3600000);matchId=(await createMatch(c,inviter,actor.id,i.room_id,i.rules,i.ranked?'ranked':'casual',undefined,i.first_starter_id)).matchId;}
  await c.query('update game_invites set state=$2,match_id=$3 where id=$1',[inviteId,action==='accept'?'accepted':action==='reject'?'rejected':'cancelled',matchId]);return {matchId};
 });
}
export async function matchAccess(actor:Actor,id:string){
 uuid.parse(id);return transaction(async c=>{
  const m=(await c.query('select * from matches where id=$1',[id])).rows[0];requireThat(m,'match_not_found',404);await roomAccess(c,actor,m.room_id);
  const membership=(await c.query('select seat,reconnect_used_ms,disconnected_at from match_players where match_id=$1 and user_id=$2',[id,actor.id])).rows[0];const seat=membership?.seat;
  requireThat(seat!==undefined || (await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>now()',[actor.id,m.room_id])).rowCount,'join_room_first',403);
  const budget=(m.competition?.reconnectSeconds??RECONNECT_MS/1000)*1000;
  return {matchId:id,roomId:m.room_id,state:m.state as ServerGame,stateVersion:Number(m.state_version),lifecycle:m.lifecycle,mode:m.mode,seat:seat??null,gameNumber:Number(m.game_number),serverAt:Date.now(),remainingReconnectMs:Math.max(0,budget-Number(membership?.reconnect_used_ms??0)-(membership?.disconnected_at?Date.now()-new Date(membership.disconnected_at).getTime():0))};
 });
}
export async function acquireMatch(id:string,writerId:string){return transaction(async c=>{
 const r=await c.query("update matches set writer_id=$2,writer_fence=writer_fence+1,lease_until=now()+interval '30 seconds' where id=$1 and (writer_id=$2 or lease_until is null or lease_until<=now()) returning writer_fence",[id,writerId]);
 requireThat(r.rowCount,'writer_busy',409);return Number(r.rows[0].writer_fence);
});}
export async function matchAccessBatch(actors:readonly Actor[],id:string){
 return transaction(async c=>{
  const m=(await c.query('select m.*,r.status room_status,r.min_rating,r.max_rating from matches m join community_rooms r on r.id=m.room_id where m.id=$1',[id])).rows[0];
  requireThat(m,'match_not_found',404);
  const rows=(await c.query(`select p.id,p.session_version,mp.seat,mp.reconnect_used_ms,mp.disconnected_at,
   (r.rating between $3 and $4) rating_allowed,
   ($5<>'private' or exists(select 1 from user_roles ur where ur.user_id=p.id and ur.role in('admin','owner') and ur.revoked_at is null) or exists(select 1 from room_access ra where ra.user_id=p.id and ra.room_id=$2)) room_allowed,
   not exists(select 1 from sanctions s where s.target_id=p.id and (s.room_id is null and s.kind='suspend' or s.room_id=$2 and s.kind in('remove','suspend')) and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now()) sanctions_allowed,
   array(select rs.session_id from private.revoked_sessions rs where rs.session_id=any($6::uuid[]) and rs.user_id=p.id) revoked_sessions,
   (mp.seat is not null or exists(select 1 from room_memberships rm where rm.user_id=p.id and rm.room_id=$2 and rm.lease_until>now())) membership_allowed
   from profiles p join player_ratings r on r.user_id=p.id left join match_players mp on mp.user_id=p.id and mp.match_id=$7
   where p.id=any($1::uuid[]) and p.status='active' and p.onboarded_at is not null`,[actors.map(a=>a.id),m.room_id,m.min_rating,m.max_rating,m.room_status,actors.flatMap(a=>a.sessionId?[a.sessionId]:[]),id])).rows;
  const now=Date.now(),budget=(m.competition?.reconnectSeconds??RECONNECT_MS/1000)*1000;
  return new Map(actors.flatMap(actor=>{
   const p=rows.find(r=>r.id===actor.id);
   if(!p||actor.expiresAt<=now||p.session_version!==actor.sessionVersion||!p.rating_allowed||!p.room_allowed||!p.sanctions_allowed||(actor.sessionId&&p.revoked_sessions.includes(actor.sessionId))||!p.membership_allowed)return [];
   return [[actor.id,{matchId:id,roomId:m.room_id,state:m.state as ServerGame,stateVersion:Number(m.state_version),lifecycle:m.lifecycle,mode:m.mode,seat:p.seat??null,gameNumber:Number(m.game_number),serverAt:now,remainingReconnectMs:Math.max(0,budget-Number(p.reconnect_used_ms??0)-(p.disconnected_at?now-new Date(p.disconnected_at).getTime():0))}]] as const;
  }));
 });
}
export async function renewMatch(id:string,writerId:string,fence:number){const r=await db().query("update matches set lease_until=now()+interval '30 seconds' where id=$1 and writer_id=$2 and writer_fence=$3",[id,writerId,fence]);return !!r.rowCount;}
export async function persist(c:PoolClient,m:any,state:ServerGame,kind:string,actorId:string|null){
 const nextVersion=Number(m.state_version)+1;
 await c.query('update matches set state=$2,state_version=$3 where id=$1',[m.id,JSON.stringify({...state,history:[]}),nextVersion]);
 await c.query('insert into match_events(match_id,sequence,kind,actor_id,payload) values($1,$2,$3,$4,$5)',[m.id,nextVersion,kind,actorId,JSON.stringify({state:{...state,history:[]}})]);
 m.state=state;m.state_version=nextVersion;return {matchId:m.id,state,stateVersion:nextVersion,lifecycle:m.lifecycle,serverAt:Date.now()};
}
export async function finishMatch(c:PoolClient,m:any,state:ServerGame,kind:'played'|'forfeit'|'disconnect'|'no-show'|'abandoned',winner:0|1|null){
 const players=(await c.query('select user_id,seat from match_players where match_id=$1 order by seat',[m.id])).rows;
 const winnerId=winner===null?null:players[winner].user_id;
 const data={...state,history:[],kind,winner};
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const inserted=await c.query('insert into match_results(match_id,kind,winner_id,result_hash,final_version,data) values($1,$2,$3,$4,$5,$6) on conflict(match_id) do nothing returning match_id',[m.id,kind,winnerId,hash,Number(m.state_version)+1,JSON.stringify(data)]);
 if(!inserted.rowCount)return;
 const real=m.started_at&&['played','forfeit','disconnect'].includes(kind)&&state.events.length>0;
 if(real){
  if(m.ranked&&winner!==null){
   const ratings=(await c.query('select user_id,rating from player_ratings where user_id=any($1::uuid[]) order by user_id for update',[players.map(p=>p.user_id)])).rows;
   const rating=(id:string)=>Number(ratings.find(r=>r.user_id===id)!.rating);
   const elo=calculateElo(rating(players[0].user_id),rating(players[1].user_id),winner);
   // Decimal delta rounded once, applied with SQL numeric to both sides, preserving exact zero sum.
   const delta=elo.deltaA.toFixed(10);
   for(const seat of [0,1]){
    const uid=players[seat].user_id,opponent=players[1-seat].user_id,change=seat===0?delta:'-'+delta;
    const clean=change.replace('--','');
    await c.query('insert into rating_ledger(match_id,user_id,before,after,delta,policy_version) select $1,user_id,rating,rating+$3::numeric,$3::numeric,1 from player_ratings where user_id=$2',[m.id,uid,clean]);
    await c.query('update player_ratings set rating=rating+$2::numeric,ranked_played=ranked_played+1 where user_id=$1',[uid,clean]);
    await c.query('insert into player_opponents(user_id,opponent_id,first_match_id) values($1,$2,$3) on conflict do nothing',[uid,opponent,m.id]);
   }
  }
  for(const seat of [0,1]){const events=state.events.filter(e=>e.player===seat);const stats={won:winner===seat,darts:state.dartCount[seat],points:state.pointsScored[seat],average:state.dartCount[seat]?state.pointsScored[seat]/state.dartCount[seat]*3:0,highestVisit:state.highestVisit[seat],highestCheckout:state.highestCheckout[seat],legs:state.totalLegs[seat],oneEighties:events.filter((e,i,a)=>!e.bust&&e.before-e.after===60&&i>=2&&a[i-1]?.visit===e.visit&&a[i-2]?.visit===e.visit&&a[i-2].before-e.after===180).length};await c.query('insert into match_statistics(match_id,user_id,data) values($1,$2,$3)',[m.id,players[seat].user_id,JSON.stringify(stats)]);if(stats.won)await c.query("insert into user_badges(user_id,badge,match_id) values($1,'first-win',$2) on conflict do nothing",[players[seat].user_id,m.id]);if(stats.highestCheckout>0)await c.query("insert into user_badges(user_id,badge,match_id) values($1,'first-finish',$2) on conflict do nothing",[players[seat].user_id,m.id]);if(stats.highestVisit>=180)await c.query("insert into user_badges(user_id,badge,match_id) values($1,'180',$2) on conflict do nothing",[players[seat].user_id,m.id]);if(stats.highestCheckout>=100)await c.query("insert into user_badges(user_id,badge,match_id) values($1,'checkout-100',$2) on conflict do nothing",[players[seat].user_id,m.id]);}
  for(const seat of [0,1]){
   const uid=players[seat].user_id;const doubles=(await c.query("select count(distinct e->'hit'->>'label') n from match_results r join match_players p on p.match_id=r.match_id cross join lateral jsonb_array_elements(r.data->'events') e where p.user_id=$1 and (e->>'player')::integer=p.seat and (e->'hit'->>'double')::boolean and e->'hit'->>'label'<>'BULL' and exists(select 1 from match_statistics s where s.match_id=r.match_id and s.user_id=$1)",[uid])).rows[0];
   if(Number(doubles.n)>=10)await c.query("insert into user_badges(user_id,badge,match_id) values($1,'10-doubles',$2) on conflict do nothing",[uid,m.id]);
  }
 }
 await c.query("update matches set lifecycle=$2,ended_at=now() where id=$1",[m.id,kind==='abandoned'?'abandoned':'completed']);m.lifecycle=kind==='abandoned'?'abandoned':'completed';
 await c.query('delete from active_player_reservations where match_id=$1',[m.id]);
 await outbox(c,'result:'+m.id,'match-result',null,{matchId:m.id,competition:m.competition,kind,winnerId,score:state.totalLegs});
}
export async function matchCommand(actor:Actor,input:unknown,writerId:string,fence:number,ingress:TrustedIngress={receivedAt:Date.now()}){
 const handlerStarted=performance.now();
 const p=commandSchema.parse(input);const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
 await rateLimit('command:'+actor.id,120,60);
 await assertSessionActive(actor);const fresh=await actorById(actor.id,actor.expiresAt);requireThat(fresh.sessionVersion===actor.sessionVersion&&actor.expiresAt>Date.now(),'session_expired',401);
 const timingPolicy=(await db().query("select state->>'timingVersion' version from matches where id=$1",[p.matchId])).rows[0];requireThat(timingPolicy,'match_not_found',404);
 const registered=await registerIngress('match',actor,p.commandId,p,ingress,timingPolicy.version===TIMING_VERSION?TIMING_VERSION:'receive-v1');
 const authMs=performance.now()-handlerStarted;const transactionRequested=performance.now();
 return transaction(async c=>{
  const transactionEntered=performance.now(),lockStarted=performance.now();
  const m=(await c.query('select * from matches where id=$1 for update',[p.matchId])).rows[0];requireThat(m,'match_not_found',404);const lockMs=performance.now()-lockStarted;
  const prior=(await c.query('select * from private.match_commands where match_id=$1 and actor_id=$2 and command_id=$3',[m.id,actor.id,p.commandId])).rows[0];
  if(prior){requireThat(prior.payload_hash===hash,'idempotency_conflict',409);return prior.receipt;}
  requireThat(m.writer_id===writerId&&Number(m.writer_fence)===fence&&new Date(m.lease_until).getTime()>Date.now(),'stale_writer',409);
  requireThat(Number(m.state_version)===p.expectedStateVersion,'stale_state',409);
  const players=(await c.query('select * from match_players where match_id=$1 order by seat',[m.id])).rows;
  const seat=players.find(r=>r.user_id===actor.id)?.seat;requireThat(seat!==undefined,'spectator_read_only',403);
  await roomAccess(c,actor,m.room_id);requireThat(['assigned','playing','paused'].includes(m.lifecycle),'match_ended',409);
  let state=m.state as ServerGame;const now=Date.now();
  if(p.type==='match.ready'){
   requireThat(!await draining()||m.started_at,'maintenance',503);state={...state,ready:state.ready.map((v,i)=>i===seat?true:v) as [boolean,boolean]};
   await c.query('update match_players set ready=true where match_id=$1 and user_id=$2',[m.id,actor.id]);
   if(state.ready.every(Boolean)&&m.lifecycle!=='playing'){m.lifecycle='playing';state={...state,startedAt:state.startedAt||now,turnStartedAt:now,phaseStartedAt:now,phaseToken:randomUUID()};await c.query("update matches set lifecycle='playing',started_at=coalesce(started_at,now()) where id=$1",[m.id]);}
  }else if(p.type==='match.resync'){return {matchId:m.id,roomId:m.room_id,state:m.state,stateVersion:Number(m.state_version),lifecycle:m.lifecycle,mode:m.mode,seat,gameNumber:Number(m.game_number),serverAt:Date.now()};}
  else{
   requireThat(m.lifecycle==='playing','match_not_started',409);
   requireThat(!players.some(p=>p.disconnected_at),'opponent_disconnected',409);
   if(p.type==='match.forfeit'){
    requireThat(!state.pendingDart,'impact_pending',409);state={...state,...dartsGameReducer(state,{type:'forfeit',player:seat}),phaseToken:randomUUID(),phaseStartedAt:now,lockedX:null,impactAt:null,ready:state.ready,names:state.names};await finishMatch(c,m,state,'forfeit',state.winner);
   }else{
    requireThat(state.turn===seat,'not_your_turn',403);requireThat(p.phaseToken===state.phaseToken,'stale_phase',409);
    let admittedAt:number;try{admittedAt=admittedMoment(registered.receivedAt,state.timingVersion===TIMING_VERSION?registered.latencyMs:0,state.phaseStartedAt,state.lastAcceptedAt??0,now);}catch{throw new DomainError('invalid_timing',409);}
    state={...state,lastAcceptedAt:admittedAt};
    if(p.type==='dart.stop_horizontal'){
     requireThat(state.phase==='horizontal','wrong_phase',409);state={...state,phase:'vertical',lockedX:meterPosition(state.lastAcceptedAt!,state.phaseStartedAt,'horizontal'),lockedY:null,phaseStartedAt:now,phaseToken:randomUUID()};
    }else{
     requireThat(p.type==='dart.stop_vertical'&&state.phase==='vertical'&&state.lockedX!==null,'wrong_phase',409);
     const lockedY=meterPosition(state.lastAcceptedAt!,state.phaseStartedAt,'vertical');const hit=scoreDart(state.lockedX,lockedY);
     const id=Number(m.state_version)+1;
     state={...state,...dartsGameReducer(state,{type:'launch',dart:{id,hit,opponentName:state.names[1]}}),phaseToken:randomUUID(),phaseStartedAt:now,lockedX:state.lockedX,lockedY,impactAt:now+FLIGHT_MS,ready:state.ready,names:state.names};
     await c.query('insert into match_darts(match_id,dart_id,player_id,hit,impact_at) values($1,$2,$3,$4,$5)',[m.id,id,actor.id,JSON.stringify(hit),new Date(now+FLIGHT_MS)]);
    }
   }
  }
  const persisted=await persist(c,m,state,p.type,actor.id);
  const receipt={...persisted,timing:{receivedAt:registered.receivedAt,admittedAt:state.lastAcceptedAt??now,processedAt:now,timingVersion:state.timingVersion??'receive-v1',queueMs:Math.max(0,Date.now()-registered.receivedAt-(performance.now()-handlerStarted)),authMs,poolMs:transactionEntered-transactionRequested,lockMs,dbMs:performance.now()-transactionEntered}};
  await c.query('insert into private.match_commands(match_id,actor_id,command_id,payload_hash,receipt,received_at,admitted_at,timing_version) values($1,$2,$3,$4,$5,$6,$7,$8)',[m.id,actor.id,p.commandId,hash,JSON.stringify(receipt),new Date(registered.receivedAt),new Date(state.lastAcceptedAt??now),state.timingVersion??'receive-v1']);return receipt;
 });
}
export async function settleImpacts(){
 return transaction(async c=>{
  const rows=(await c.query("select m.* from matches m where m.lifecycle='playing' and exists(select 1 from match_darts d where d.match_id=m.id and d.impacted_at is null and d.impact_at<=now()) order by m.id for update skip locked limit 32")).rows;
  for(const m of rows){let state=m.state as ServerGame;const dart=(await c.query('select * from match_darts where match_id=$1 and impacted_at is null and impact_at<=now() order by dart_id for update limit 1',[m.id])).rows[0];
   requireThat(dart&&state.pendingDart?.id===Number(dart.dart_id),'impact_integrity',500);
   const oldTurn=state.turn;
   state={...state,...dartsGameReducer(state,{type:'land',id:Number(dart.dart_id),at:new Date(dart.impact_at).getTime()}),phaseToken:randomUUID(),phaseStartedAt:Date.now(),lockedX:null,impactAt:null,ready:state.ready,names:state.names};
   if(state.turn!==oldTurn)state.turnStartedAt=Date.now();
   state.lastResult=state.lastResult.replaceAll('Nick',state.names[0]);
   if(state.winner===null)state.phase='horizontal';
   await c.query('update match_darts set impacted_at=now() where match_id=$1 and dart_id=$2',[m.id,dart.dart_id]);
   if(state.winner!==null)await finishMatch(c,m,state,'played',state.winner);
   await persist(c,m,state,'impact',null);
  }
  return rows.map(m=>m.id);
 });
}
export async function connection(actor:Actor,id:string,connected:boolean){return transaction(async c=>{
 const m=(await c.query('select * from matches where id=$1 for update',[id])).rows[0];if(!m||m.lifecycle!=='playing')return;
 const p=(await c.query('select * from match_players where match_id=$1 and user_id=$2 for update',[id,actor.id])).rows[0];if(!p)return;
 if(connected){await c.query('update match_players set reconnect_used_ms=reconnect_used_ms+case when disconnected_at is null then 0 else floor(extract(epoch from now()-disconnected_at)*1000)::integer end,disconnected_at=null where match_id=$1 and user_id=$2',[id,actor.id]);
  const state=m.state as ServerGame;if(!state.pendingDart)await persist(c,m,{...state,turnStartedAt:Date.now(),phaseStartedAt:Date.now(),phaseToken:randomUUID()},'reconnect',actor.id);
 }else{await c.query('update match_players set disconnected_at=coalesce(disconnected_at,now()) where match_id=$1 and user_id=$2',[id,actor.id]);await persist(c,m,m.state,'disconnected',actor.id);}
});}
export async function expireDisconnects(){return transaction(async c=>{
 const rows=(await c.query("select m.* from matches m where m.lifecycle='playing' and exists(select 1 from match_players p where p.match_id=m.id and p.disconnected_at is not null and p.reconnect_used_ms+extract(epoch from now()-p.disconnected_at)*1000>=coalesce((m.competition->>'reconnectSeconds')::integer*1000,$1)) for update skip locked",[RECONNECT_MS])).rows;
 for(const m of rows){if(m.state.pendingDart)continue;const players=(await c.query('select * from match_players where match_id=$1 order by seat',[m.id])).rows;const budget=(m.competition?.reconnectSeconds??RECONNECT_MS/1000)*1000;const expired=players.filter(p=>p.disconnected_at&&p.reconnect_used_ms+Date.now()-new Date(p.disconnected_at).getTime()>=budget);
  if(expired.length===2){await finishMatch(c,m,m.state,'abandoned',null);await persist(c,m,{...m.state,phase:'won',winner:null},'abandoned',null);}
  else if(expired.length===1){const state={...m.state,...dartsGameReducer(m.state,{type:'forfeit',player:expired[0].seat})};await finishMatch(c,m,state,'disconnect',state.winner);await persist(c,m,state,'disconnect',null);}
 }return rows.length;
});}
