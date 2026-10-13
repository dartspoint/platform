import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis,transaction} from '../../packages/data/src/db';
import {authAdmin,actorById,type Actor} from '../../packages/data/src/auth';
import {onboard,joinRoom} from '../../packages/data/src/community';
import {createMatch,acquireMatch,matchCommand,matchAccess,settleImpacts,captureMatchIngress} from '../../packages/data/src/matches';
import {practiceCommand,capturePracticeIngress} from '../../packages/data/src/practice';
import {IngressOrder} from '../../packages/data/src/ingress-order';
import {TIMING_VERSION,meterPosition} from '../../packages/game-core/src/timing';
import {scoreDart} from '../../packages/game-core/src/darts-rules';
import {domainTiming} from './timing-fixture';
assert.equal(process.env.APP_ENV,'development');const admin=authAdmin(),prefix='Sample'+randomUUID().slice(0,6),ids:string[]=[];
try{
 await(await redis()).set('dartspoint:draining','0');const users:Actor[]=[];
 for(let i=0;i<3;i++){const created=await admin.auth.admin.createUser({email:`${prefix}-${i}@dartspoint.local`,email_confirm:true});assert.equal(created.error,null);const id=created.data.user!.id;await onboard(await actorById(id,Date.now()+3600000,false),{username:prefix+i});users.push(await actorById(id,Date.now()+3600000));}
 const room=(await db().query("select id from community_rooms where name='Nederland 1'")).rows[0].id;for(const user of users)await joinRoom(user,{roomId:room});
 const game=await transaction(c=>createMatch(c,users[0],users[1].id,room,{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},'casual'));ids.push(game.matchId);const writer=randomUUID(),fence=await acquireMatch(game.matchId,writer);
 async function command(seat:number,type:string,extra:any={},ingressExtra:any={}){const snapshot=await matchAccess(users[seat],game.matchId),timing=domainTiming(snapshot.state,type),payload={protocolVersion:1,commandId:randomUUID(),matchId:game.matchId,expectedStateVersion:snapshot.stateVersion,phaseToken:snapshot.state.phaseToken,type,...(timing.renderSample?{renderSample:timing.renderSample}:{}),...extra},ingress={...timing.ingress,...ingressExtra};return {payload,ingress,receipt:await matchCommand(users[seat],payload,writer,fence,ingress)};}
 await command(0,'match.ready');await command(1,'match.ready');const start=await matchAccess(users[0],game.matchId);assert.equal(start.state.timingVersion,TIMING_VERSION);await new Promise(r=>setTimeout(r,30));
 const connectionId=randomUUID(),receivedAt=Date.now(),sampleAt=receivedAt-16,payload={protocolVersion:1,commandId:randomUUID(),matchId:game.matchId,expectedStateVersion:start.stateVersion,phaseToken:start.state.phaseToken,type:'dart.stop_horizontal',renderSample:{sampleAt,connectionId,dartNumber:1}};
 await new Promise(r=>setTimeout(r,300));const ordering=new IngressOrder(),first=ordering.reserve('match'),second=ordering.reserve('match'),originalIngress={receivedAt,connectionId,admissionWindowMs:94,latencyMs:20};let laterCaptured=false;
 const later=second.run(async()=>{laterCaptured=true;return captureMatchIngress(users[0],payload,{receivedAt:Date.now(),connectionId:randomUUID(),admissionWindowMs:124});});await new Promise(r=>setTimeout(r,20));assert.equal(laterCaptured,false);
 const original=await first.run(()=>captureMatchIngress(users[0],payload,originalIngress));assert.deepEqual(await later,original);assert.equal(original.receivedAt,receivedAt);assert.equal(original.connectionId,connectionId);assert.equal(original.admissionWindowMs,94);
 const horizontal=await matchCommand(users[0],payload,writer,fence,originalIngress);assert.equal(horizontal.commandId,payload.commandId);assert.equal(horizontal.timing.admittedAt,sampleAt);assert.equal(horizontal.state.lockedX,meterPosition(sampleAt,start.state.phaseStartedAt,'horizontal'));
 const retry=await matchCommand(users[0],payload,writer,fence,{receivedAt:Date.now(),connectionId:randomUUID(),admissionWindowMs:124});assert.deepEqual(retry,horizontal,'Original connection, ingress/window and admitted sample remain immutable');
 await assert.rejects(matchCommand(users[0],{...payload,renderSample:{...payload.renderSample,sampleAt:sampleAt+1}},writer,fence),{code:'idempotency_conflict'});
 const before=await matchAccess(users[0],game.matchId);
 for(const variant of ['old','future','wrong-connection','wrong-dart','cold']){
  const now=Date.now(),cid=randomUUID(),sample={sampleAt:Math.max(now-1,before.state.phaseStartedAt),connectionId:cid,dartNumber:1};if(variant==='old')sample.sampleAt=now-300;if(variant==='future')sample.sampleAt=now+5;if(variant==='wrong-connection')sample.connectionId=randomUUID();if(variant==='wrong-dart')sample.dartNumber=2;
  await assert.rejects(command(0,'dart.stop_vertical',{renderSample:sample},{receivedAt:now,connectionId:cid,admissionWindowMs:variant==='cold'?0:94}),{code:variant==='wrong-connection'?'timing_connection_mismatch':variant==='wrong-dart'?'stale_dart':variant==='cold'?'timing_not_calibrated':'invalid_render_sample'});
  assert.equal((await matchAccess(users[0],game.matchId)).stateVersion,before.stateVersion);
 }
 await assert.rejects(command(2,'dart.stop_vertical'),{code:'spectator_read_only'});
 const vertical=await command(0,'dart.stop_vertical');assert.deepEqual(vertical.receipt.state.pendingDart!.hit,scoreDart(horizontal.state.lockedX!,vertical.receipt.state.lockedY!));assert.equal((await db().query('select 1 from match_darts where match_id=$1',[game.matchId])).rowCount,1);
 await new Promise(r=>setTimeout(r,600));await settleImpacts();assert.deepEqual(await matchCommand(users[0],vertical.payload,writer,fence),vertical.receipt);assert.equal((await matchAccess(users[0],game.matchId)).state.events.length,1);await command(1,'match.forfeit');
 const session=await practiceCommand(users[0],{type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}});await new Promise(r=>setTimeout(r,20));const practiceAt=Date.now(),practiceCid=randomUUID(),practicePayload={type:'horizontal',commandId:randomUUID(),sessionId:session.id,expectedStateVersion:session.stateVersion,phaseToken:session.state.phaseToken,renderSample:{sampleAt:practiceAt-10,connectionId:practiceCid,dartNumber:1}};
 const practiceFirst=ordering.reserve('practice'),practiceSecond=ordering.reserve('practice'),practiceLater=practiceSecond.run(()=>capturePracticeIngress(users[0],practicePayload,{receivedAt:Date.now(),connectionId:randomUUID(),admissionWindowMs:124}));
 const practiceOriginal=await practiceFirst.run(()=>capturePracticeIngress(users[0],practicePayload,{receivedAt:practiceAt,connectionId:practiceCid,admissionWindowMs:54}));assert.deepEqual(await practiceLater,practiceOriginal);assert.equal(practiceOriginal.receivedAt,practiceAt);assert.equal(practiceOriginal.connectionId,practiceCid);
 const practice=await practiceCommand(users[0],practicePayload,{receivedAt:practiceAt},practiceOriginal);assert.equal(practice.state.lockedX,meterPosition(practiceAt-10,session.state.phaseStartedAt,'horizontal'));assert.deepEqual(await practiceCommand(users[0],practicePayload),practice);
 // Compatibility fixture creates a new local match with the previous policy.
 const oldGame=await transaction(c=>createMatch(c,users[0],users[1].id,room,{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},'casual'));ids.push(oldGame.matchId);await db().query("update matches set state=jsonb_set(state,'{timingVersion}','\"bounded-latency-v2\"') where id=$1",[oldGame.matchId]);const oldWriter=randomUUID(),oldFence=await acquireMatch(oldGame.matchId,oldWriter);
 async function oldCommand(seat:number,type:string){const s=await matchAccess(users[seat],oldGame.matchId);return matchCommand(users[seat],{protocolVersion:1,commandId:randomUUID(),matchId:oldGame.matchId,expectedStateVersion:s.stateVersion,phaseToken:s.state.phaseToken,type},oldWriter,oldFence,{receivedAt:Date.now(),latencyMs:20});}
 await oldCommand(0,'match.ready');await oldCommand(1,'match.ready');assert.equal((await oldCommand(0,'dart.stop_horizontal')).timing.timingVersion,'bounded-latency-v2');await oldCommand(1,'match.forfeit');
 await writeFile('artifacts/render-sample-integration-result.json',JSON.stringify({ok:true,concurrentMatchAndPracticeCopiesPreserveFirstReceive:true,originalIngressConnectionWindowImmutable:true,exactSharedPosition:true,invalidClaimsNoStateMutation:true,coldRejected:true,spectatorDenied:true,oneImpactAfterReplay:true,practiceExact:true,previousV2PolicyPreserved:true},null,2));console.log('Durable v3 samples, ordered concurrent copies, immutable retries, invalid/cold claims, actor rights, exact impact and v2 compatibility passed');
}finally{if(ids.length){await db().query("update matches set lifecycle='cancelled',ended_at=now() where id=any($1::uuid[]) and lifecycle in('assigned','playing','paused')",[ids]);await db().query('delete from active_player_reservations where match_id=any($1::uuid[])',[ids]);await db().query('delete from board_reservations where match_id=any($1::uuid[])',[ids]);}await db().end();await(await redis()).quit();}
