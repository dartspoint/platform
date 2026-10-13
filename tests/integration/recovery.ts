import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {actorById} from '../../packages/data/src/auth';
import {joinRoom} from '../../packages/data/src/community';
import {createMatch,acquireMatch,matchCommand,matchAccess,settleImpacts,connection} from '../../packages/data/src/matches';
import {maintainMatches,drainAdmissions} from '../../packages/data/src/lifecycle';
import {queue,advanceQueues} from '../../packages/data/src/queue';
import {respondInvite} from '../../packages/data/src/matches';
import {transaction} from '../../packages/data/src/db';
import {adminAction} from '../../packages/data/src/admin';
import {domainTiming} from './timing-fixture';
assert.equal(process.env.APP_ENV,'development');
try{
 await(await redis()).set('dartspoint:draining','0');
 const users=(await db().query("select p.id from profiles p where p.username like 'qa%' and p.status='active' and not exists(select 1 from active_player_reservations a where a.user_id=p.id) and not exists(select 1 from user_roles r where r.user_id=p.id and revoked_at is null) order by p.created_at desc limit 4")).rows;
 const actors=await Promise.all(users.map(p=>actorById(p.id,Date.now()+3600000)));const room=(await db().query("select id from community_rooms where name='Nederland 1'")).rows[0].id;for(const a of actors)await joinRoom(a,{roomId:room});
 const rules={startScore:701 as const,doubleIn:false,doubleOut:true,bestOf:3,format:'sets' as const,bestOfSets:3};
 const {matchId}=await transaction(c=>createMatch(c,actors[0],actors[1].id,room,rules,'casual'));let writer=crypto.randomUUID(),fence=await acquireMatch(matchId,writer);
 async function command(actor:any,type:string,override:any={}){const s=await matchAccess(actor,matchId),timing=domainTiming(s.state,type);const payload={protocolVersion:1,commandId:crypto.randomUUID(),matchId,expectedStateVersion:s.stateVersion,type,phaseToken:s.state.phaseToken,...(timing.renderSample?{renderSample:timing.renderSample}:{}),...override};return {payload,receipt:await matchCommand(actor,payload,writer,fence,timing.ingress)};}
 await command(actors[0],'match.ready');await command(actors[1],'match.ready');await command(actors[0],'dart.stop_horizontal');const launch=await command(actors[0],'dart.stop_vertical');
 const ownerId=(await db().query("select user_id from user_roles where role='owner' and revoked_at is null limit 1")).rows[0].user_id;const owner=await actorById(ownerId,Date.now()+3600000);
 await adminAction(owner,{action:'room-close',args:[room]});await assert.rejects(adminAction(owner,{action:'room-delete',args:[room]}),{code:'active_matches'});
 assert.equal(launch.receipt.state.events.length,0);await db().query("update matches set lease_until=now()-interval '1 second' where id=$1",[matchId]);
 await new Promise(r=>setTimeout(r,600));await Promise.all([settleImpacts(),settleImpacts()]);await maintainMatches();
 let recovered=await matchAccess(actors[0],matchId);assert.equal(recovered.state.events.length,1);assert.equal(recovered.lifecycle,'paused');assert.deepEqual(recovered.state.ready,[false,false]);assert.equal((await db().query('select 1 from rating_ledger where match_id=$1',[matchId])).rowCount,0);
 await assert.rejects(command(actors[0],'dart.stop_horizontal'),{code:'stale_writer'});
 writer=crypto.randomUUID();fence=await acquireMatch(matchId,writer);
 const retry=await matchCommand(actors[0],launch.payload,writer,fence);assert.deepEqual(retry,launch.receipt,'Committed receipt survives writer replacement');assert.equal((await matchAccess(actors[0],matchId)).state.events.length,1);
 await command(actors[0],'match.ready');assert.equal((await matchAccess(actors[0],matchId)).lifecycle,'paused');await command(actors[1],'match.ready');assert.equal((await matchAccess(actors[0],matchId)).lifecycle,'playing');
 await connection(actors[0],matchId,false);await new Promise(r=>setTimeout(r,50));await connection(actors[0],matchId,true);recovered=await matchAccess(actors[0],matchId);assert.ok(recovered.remainingReconnectMs<120000);assert.equal(recovered.state.events.length,1);
 await queue(actors[2],{matchId});await queue(actors[3],{matchId});await command(actors[1],'match.forfeit');
 await db().query("update community_rooms set status='open' where id=$1",[room]);
 await Promise.all([advanceQueues(),advanceQueues()]);const invitation=(await db().query('select i.* from private.queue_advances a join game_invites i on i.id=a.invite_id where a.match_id=$1',[matchId])).rows[0];assert.equal(invitation.invitee_id,actors[2].id);
 const accepted=await respondInvite(actors[2],{inviteId:invitation.id,action:'accept'});await advanceQueues();assert.equal((await db().query('select 1 from match_queues where match_id=$1 and user_id=$2',[accepted.matchId,actors[3].id])).rowCount,1,'Queue order transfers to actual new match');
 await drainAdmissions();assert.equal((await db().query('select lifecycle from matches where id=$1',[accepted.matchId])).rows[0].lifecycle,'cancelled');assert.equal((await db().query('select 1 from active_player_reservations where match_id=$1',[accepted.matchId])).rowCount,0);
 await(await redis()).set('dartspoint:draining','0');
 for(const confirmed of [true,false]){
  const absent=await transaction(c=>createMatch(c,actors[0],actors[1].id,room,rules,'casual'));const writerId=crypto.randomUUID(),writerFence=await acquireMatch(absent.matchId,writerId);
  if(confirmed){const current=await matchAccess(actors[0],absent.matchId);await matchCommand(actors[0],{protocolVersion:1,commandId:crypto.randomUUID(),matchId:absent.matchId,expectedStateVersion:current.stateVersion,phaseToken:current.state.phaseToken,type:'match.ready'},writerId,writerFence);}
  await db().query("update matches set created_at=now()-interval '6 minutes' where id=$1",[absent.matchId]);await maintainMatches();
  const result=(await db().query('select * from match_results where match_id=$1',[absent.matchId])).rows[0];assert.equal(result.kind,'no-show');assert.equal(result.winner_id,confirmed?actors[0].id:null);
  assert.equal((await db().query('select 1 from rating_ledger where match_id=$1',[absent.matchId])).rowCount,0);assert.equal((await db().query('select 1 from match_statistics where match_id=$1',[absent.matchId])).rowCount,0);
 }
 await writeFile('artifacts/recovery-result.json',JSON.stringify({ok:true,sealedFlightSettledOnce:true,twoWorkersIdempotent:true,expiredWriterFenced:true,infrastructurePauseNoElo:true,bothPlayersResume:true,durableReceiptRetry:true,cumulativeReconnect:true,queueAdvanceOnce:true,queueTransferred:true,assignedDrainReleases:true,roomClosePreservesMatch:true,noShowOnlyConfirmedPresentWinner:true,noShowNoEloOrStats:true},null,2));console.log('Real writer recovery, sealed impacts, retry, reconnect, queue handover, no-show and admission drain passed');
}finally{await db().query("update community_rooms set status='open' where name='Nederland 1'");await(await redis()).set('dartspoint:draining','0');await db().end();await(await redis()).quit();}
