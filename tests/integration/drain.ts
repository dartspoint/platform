import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {actorById} from '../../packages/data/src/auth';
import {joinRoom} from '../../packages/data/src/community';
import {invite,respondInvite,acquireMatch,matchCommand,matchAccess} from '../../packages/data/src/matches';
import {domainTiming} from './timing-fixture';
assert.equal(process.env.APP_ENV,'development');
async function control(action:string,headers:Record<string,string>={}){const response=await fetch('http://127.0.0.1:42567/internal/deploy/'+action,{method:action==='status'?'GET':'POST',headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN,...headers}});assert.equal(response.status,200);return response.json();}
try{
 const denied=await fetch('http://127.0.0.1:42567/internal/deploy/status');assert.equal(denied.status,404);const proxy=await fetch('http://127.0.0.1:42567/internal/deploy/status',{headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN,'X-Forwarded-For':'127.0.0.1'}});assert.equal(proxy.status,404);
 await control('resume');const ids=(await db().query("select p.id from profiles p where p.username like 'qa%' and not exists(select 1 from active_player_reservations a where a.user_id=p.id) order by p.created_at desc limit 2")).rows;const actors=await Promise.all(ids.map(p=>actorById(p.id,Date.now()+3600000)));const room=(await db().query("select id from community_rooms where name='Nederland 1'")).rows[0].id;for(const actor of actors)await joinRoom(actor,{roomId:room});
 const input={targetId:actors[1].id,roomId:room,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false};const invitation=await invite(actors[0],input),accepted=await respondInvite(actors[1],{inviteId:invitation.id,action:'accept'}),id=accepted.matchId!;const writer=crypto.randomUUID(),fence=await acquireMatch(id,writer);
 async function command(actor:any,type:string){const state=await matchAccess(actor,id),timing=domainTiming(state.state,type);return matchCommand(actor,{protocolVersion:1,commandId:crypto.randomUUID(),matchId:id,expectedStateVersion:state.stateVersion,type,phaseToken:state.state.phaseToken,...(timing.renderSample?{renderSample:timing.renderSample}:{})},writer,fence,timing.ingress);}
 await command(actors[0],'match.ready');await command(actors[1],'match.ready');await command(actors[0],'dart.stop_horizontal');await command(actors[0],'dart.stop_vertical');
 await control('drain');const status=await control('status');assert.equal(status.draining,true);assert.ok(status.activeMatches>=1);assert.equal(status.safeToStop,false);await assert.rejects(invite(actors[0],input),{code:'maintenance'});
 await new Promise(r=>setTimeout(r,750));const after=await matchAccess(actors[0],id);assert.equal(after.state.events.length,1);assert.equal(after.state.pendingDart,null,'Drain must settle committed throws');await command(actors[1],'match.forfeit');
 for(let i=0;i<40;i++){const s=await control('status');if(s.safeToStop)break;await new Promise(r=>setTimeout(r,100));}
 const complete=await control('status');assert.equal(complete.safeToStop,true);assert.deepEqual([complete.activeMatches,complete.pendingImpacts,complete.pendingWrites],[0,0,0]);
 await control('resume');assert.equal((await control('status')).draining,false);await writeFile('artifacts/drain-result.json',JSON.stringify({ok:true,controlProtected:true,forwardedRejected:true,activeGamePreventsStop:true,newGamesBlocked:true,committedImpactFinishes:true,realCountersZero:true,resumeExplicit:true},null,2));console.log('Protected drain, existing impact completion, safe counters and explicit resume passed');
}finally{await control('resume').catch(()=>{});await db().end();await (await redis()).quit();}
