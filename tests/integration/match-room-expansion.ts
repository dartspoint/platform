import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {db,redis,transaction} from '../../packages/data/src/db';
import {actorById} from '../../packages/data/src/auth';
import {joinRoom,heartbeat,expireRoomMemberships,sendMessage,chatHistory,resolveChannel,social} from '../../packages/data/src/community';
import {createMatch,matchAccess,matchAccessBatch,matchCommand,acquireMatch,spectateMatch} from '../../packages/data/src/matches';
import {maintainMatches} from '../../packages/data/src/lifecycle';
import {bootstrap,chatChannelsProjection} from '../../packages/data/src/projections';
import {matchHistory} from '../../packages/data/src/history';
import {domainTiming} from './timing-fixture';

assert.equal(process.env.APP_ENV,'development');
for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
const privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const ids=Array.from({length:6},()=>randomUUID()),prefix='QaRules'+randomUUID().replaceAll('-','').slice(0,7),room=randomUUID(),roomChannel=randomUUID();
const matches:string[]=[],checks:Record<string,boolean>={};let mainMatch='',writer='',fence=0;
const rules={startScore:501 as const,bestOf:1,format:'legs' as const,bestOfSets:1,doubleIn:false,doubleOut:true};
let actors:Awaited<ReturnType<typeof actorById>>[]=[];
async function orderedHeartbeatRace(firstActive:boolean){
 const gatePool=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1}),gate=await gatePool.connect(),application=db();
 const connect=application.connect,realConnect=connect.bind(application);let count=0,releaseFirst!:()=>void,firstStarted!:()=>void;
 const released=new Promise<void>(resolve=>{releaseFirst=resolve;}),begun=new Promise<void>(resolve=>{firstStarted=resolve;});
 const pids:number[]=[];let first:Promise<any>|undefined,second:Promise<any>|undefined;
 const waitFor=async(predicate:()=>Promise<boolean>)=>{for(let n=0;n<200;n++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Owned heartbeat lock ordering not established');};
 try{
  await gate.query('begin');await gate.query('select user_id from room_memberships where user_id=$1 for update',[ids[4]]);
  // Delay the older transaction's BEGIN acknowledgement, not its SQL result.
  // The newer real heartbeat queues on the owned membership before the older
  // heartbeat attempts that lock. Both requests still execute the actual domain.
  (application as any).connect=async()=>{const client=await realConnect(),ordinal=++count;pids[ordinal-1]=Number((client as any).processID);
   if(ordinal===1){const query=client.query;(client as any).query=(...args:any[])=>{
    const result=(query as any).apply(client,args);
    if(args[0]==='begin')return Promise.resolve(result).then(async value=>{client.query=query;firstStarted();await released;return value;});return result;
   };}return client;
  };
  first=heartbeat(actors[4],{active:firstActive});void first.catch(()=>{});await begun;
  await new Promise(resolve=>setTimeout(resolve,120));second=heartbeat(actors[4],{active:true});void second.catch(()=>{});
  await waitFor(async()=>pids.length===2&&(await privileged.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pids[1]])).rowCount===1);
  const laterStarted=Number((await privileged.query('select extract(epoch from xact_start)*1000 started from pg_stat_activity where pid=$1',[pids[1]])).rows[0].started);
  releaseFirst();await waitFor(async()=>(await privileged.query("select count(*)::int n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'",[pids])).rows[0].n===2);
  await gate.query('commit');assert.equal((await second).ok,true);assert.equal((await first).ok,true);
  const final=(await privileged.query('select extract(epoch from last_activity_at)*1000 activity,extract(epoch from lease_until)*1000 lease from room_memberships where user_id=$1',[ids[4]])).rows[0];
  assert.ok(Number(final.activity)>=laterStarted,'An older queued transaction never regresses the newer activity');
  assert.ok(Math.abs(Number(final.lease)-Number(final.activity)-300000)<=5,'A queued quiet pulse never shortens the renewed five-minute lease');
 }finally{
  (application as any).connect=connect;releaseFirst();await gate.query('rollback').catch(()=>{});await Promise.allSettled([...(first?[first]:[]),...(second?[second]:[])]);gate.release();await gatePool.end();
 }
}
async function command(seat:number,type:string,extra:any={}){
 const snapshot=await matchAccess(actors[seat],mainMatch),timing=domainTiming(snapshot.state,type);
 const payload={protocolVersion:1 as const,commandId:randomUUID(),matchId:mainMatch,expectedStateVersion:snapshot.stateVersion,type,phaseToken:snapshot.state.phaseToken,...(timing.renderSample?{renderSample:timing.renderSample}:{}),...extra};
 return {payload,ingress:timing.ingress,receipt:await matchCommand(actors[seat],payload,writer,fence,timing.ingress)};
}
async function expireTurn(){await privileged.query("update matches set state=jsonb_set(state,'{turnStartedAt}',to_jsonb($2::bigint)) where id=$1",[mainMatch,Date.now()-31000]);await Promise.all([maintainMatches(),maintainMatches()]);return matchAccess(actors[0],mainMatch);}
try{
 await privileged.query('insert into auth.users(id) select unnest($1::uuid[])',[ids]);
 await privileged.query('update profiles p set username=fixture.name,onboarded_at=now() from unnest($1::uuid[],$2::text[]) fixture(id,name) where p.id=fixture.id',[ids,ids.map((_,index)=>prefix+index)]);
 await privileged.query('insert into player_ratings(user_id) select unnest($1::uuid[])',[ids]);
 await privileged.query("insert into preferences(user_id,data) select id,'{}'::jsonb from unnest($1::uuid[]) id",[ids]);
 await privileged.query('insert into community_rooms(id,name,slug,capacity,min_rating,max_rating) values($1,$2,$2,50,0,5000)',[room,prefix]);
 await privileged.query("insert into channels(id,kind,room_id) values($1,'community',$2)",[roomChannel,room]);
 actors=await Promise.all(ids.map(id=>actorById(id,Date.now()+3600000)));
 for(const actor of actors.slice(0,5))await joinRoom(actor,{roomId:room});
 await orderedHeartbeatRace(false);await orderedHeartbeatRace(true);checks.realQueuedQuietAndOlderActivePulsesCannotRegressLease=true;
 const allocated=await Promise.all([transaction(c=>createMatch(c,actors[0],ids[1],room,rules,'casual')),transaction(c=>createMatch(c,actors[2],ids[3],room,rules,'casual'))]);
 matches.push(...allocated.map(value=>value.matchId));mainMatch=matches[0];
 const numbers=allocated.map(value=>value.publicGameId);assert.equal(new Set(numbers).size,2);assert.ok(numbers.every(value=>Number.isSafeInteger(value)&&value>0));assert.ok(matches.every(value=>/^[-a-f0-9]{36}$/.test(value)));
 const storedNumbers=(await privileged.query('select id,game_number from matches where id=any($1::uuid[])',[matches])).rows;
 for(const value of allocated)assert.equal(value.publicGameId,Number(storedNumbers.find(row=>row.id===value.matchId).game_number));checks.concurrentUniquePublicNumberInternalUuid=true;
 writer=randomUUID();fence=await acquireMatch(mainMatch,writer);
 await command(0,'match.ready');await command(1,'match.ready');
 let current=await expireTurn();assert.equal(current.lifecycle,'playing');assert.equal(current.state.turn,0);assert.deepEqual(current.state.timeoutStrikes,[1,0]);assert.equal(current.state.timeoutWarning?.strike,1);assert.equal(current.publicGameId,numbers[0]);
 assert.equal((await privileged.query('select 1 from match_results where match_id=$1',[mainMatch])).rowCount,0);
 await maintainMatches();assert.deepEqual((await matchAccess(actors[0],mainMatch)).state.timeoutStrikes,[1,0],'repeated maintenance does not duplicate a warning');
 current=await expireTurn();assert.deepEqual(current.state.timeoutStrikes,[2,0]);assert.equal(current.state.timeoutWarning?.strike,2);assert.equal(current.state.timeoutWarning!.deadlineAt-current.state.timeoutWarning!.at,30000);
 const beforeRejected=current.stateVersion,valid=domainTiming(current.state,'dart.stop_horizontal');
 for(const sampleAt of [valid.ingress.receivedAt+100,valid.ingress.receivedAt-500]){
  await assert.rejects(matchCommand(actors[0],{protocolVersion:1,commandId:randomUUID(),matchId:mainMatch,expectedStateVersion:beforeRejected,type:'dart.stop_horizontal',phaseToken:current.state.phaseToken,renderSample:{...valid.renderSample!,sampleAt}},writer,fence,valid.ingress),{code:'invalid_render_sample'});
 }
 for(const meterSpeedVersion of [undefined,'standard-v1']){
  await assert.rejects(matchCommand(actors[0],{protocolVersion:1,commandId:randomUUID(),matchId:mainMatch,expectedStateVersion:beforeRejected,type:'dart.stop_horizontal',phaseToken:current.state.phaseToken,renderSample:{...valid.renderSample!,meterSpeedVersion}},writer,fence,valid.ingress),{code:'meter_speed_update_required'});
 }
 assert.equal((await matchAccess(actors[0],mainMatch)).stateVersion,beforeRejected);assert.deepEqual((await matchAccess(actors[0],mainMatch)).state.timeoutStrikes,[2,0]);checks.rejectedAndCachedOldClientDoNotResetStrikesOrScore=true;
 const accepted=await command(0,'dart.stop_horizontal');assert.deepEqual(accepted.receipt.state.timeoutStrikes,[0,0]);assert.equal(accepted.receipt.state.timeoutWarning,null);checks.onlyValidStopResetsOwnConsecutiveWarnings=true;
 // An earlier accepted UUID is retried after a later warning: the receipt must
 // remain immutable and must not clear the newly accrued authoritative strike.
 current=await expireTurn();assert.deepEqual(current.state.timeoutStrikes,[1,0]);
 assert.deepEqual(await matchCommand(actors[0],accepted.payload,writer,fence,accepted.ingress),accepted.receipt);
 assert.deepEqual((await matchAccess(actors[0],mainMatch)).state.timeoutStrikes,[1,0]);checks.retryCannotClearLaterWarnings=true;
 current=await expireTurn();assert.deepEqual(current.state.timeoutStrikes,[2,0]);current=await expireTurn();assert.equal(current.lifecycle,'completed');assert.equal(current.state.winner,1);assert.equal(current.state.timeoutStrikes![0],3);
 assert.equal((await privileged.query('select count(*)::int n from match_results where match_id=$1',[mainMatch])).rows[0].n,1);await maintainMatches();assert.equal((await privileged.query('select count(*)::int n from match_results where match_id=$1',[mainMatch])).rows[0].n,1);checks.exactThirdTimeoutForfeitsOnce=true;
 assert.equal((await matchHistory(actors[0],{})).find(value=>value.id===mainMatch)!.publicGameId,numbers[0]);checks.publicNumberStableThroughReceiptsWarningsAndHistory=true;
 const postgame=(await resolveChannel(actors[0],{kind:'match',target:mainMatch})).channelId;
 const sportsmanlike=await sendMessage(actors[0],{channelId:postgame,clientMessageId:randomUUID(),body:'Goed gespeeld!'});assert.ok((await chatHistory(actors[1],postgame)).some(row=>row.id===sportsmanlike.id));
 assert.ok((await chatChannelsProjection(actors[0])).some(value=>value.id===postgame));
 await assert.rejects(sendMessage(actors[4],{channelId:postgame,clientMessageId:randomUUID(),body:'Late spectator message.'}),{code:'match_ended'});checks.participantPostgameChatPreservedSpectatorEndedWritesDenied=true;
 const observerMatch=matches[1],snapshot=await spectateMatch(actors[4],{matchId:observerMatch});assert.equal(snapshot.seat,null);assert.equal(snapshot.publicGameId,numbers[1]);
 assert.equal((await resolveChannel(actors[4],{kind:'match',target:observerMatch})).channelId,snapshot.channelId);
 const message=await sendMessage(actors[4],{channelId:snapshot.channelId,clientMessageId:randomUUID(),body:'Een echte toeschouwer reageert.'});assert.ok((await chatHistory(actors[2],snapshot.channelId)).some(row=>row.id===message.id));checks.actualRoomMemberCanSpectateAndChat=true;
 const separate=await transaction(c=>createMatch(c,actors[0],ids[1],room,rules,'casual'));matches.push(separate.matchId);
 const ownPresence=(await privileged.query('select presence from room_memberships where user_id=$1',[ids[2]])).rows[0].presence;
 await spectateMatch(actors[2],{matchId:separate.matchId});
 assert.equal((await privileged.query('select match_id from active_player_reservations where user_id=$1',[ids[2]])).rows[0].match_id,observerMatch);
 assert.equal((await privileged.query('select presence from room_memberships where user_id=$1',[ids[2]])).rows[0].presence,ownPresence);checks.spectatorModalPreservesOwnActiveMatchAndPresence=true;
 await assert.rejects(spectateMatch(actors[5],{matchId:observerMatch}),{code:'join_room_first'});await assert.rejects(spectateMatch(actors[4],{matchId:randomUUID()}),{code:'match_not_found'});
 const observerWriter=randomUUID(),observerFence=await acquireMatch(observerMatch,observerWriter);
 await assert.rejects(matchCommand(actors[4],{protocolVersion:1,commandId:randomUUID(),matchId:observerMatch,expectedStateVersion:snapshot.stateVersion,type:'match.ready'},observerWriter,observerFence),{code:'spectator_read_only'});checks.nonMemberForgedIdAndSpectatorWritesDenied=true;
 await privileged.query("update community_rooms set status='private' where id=$1",[room]);
 await assert.rejects(spectateMatch(actors[4],{matchId:observerMatch}),{code:'room_private'});assert.equal((await bootstrap(actors[4])).matches.length,0);
 await privileged.query('insert into room_access(room_id,user_id) values($1,$2)',[room,ids[4]]);await spectateMatch(actors[4],{matchId:observerMatch});
 await privileged.query('delete from room_access where room_id=$1 and user_id=$2',[room,ids[4]]);assert.equal((await matchAccessBatch([actors[4]],observerMatch)).size,0);await assert.rejects(chatHistory(actors[4],snapshot.channelId),{code:'room_private'});checks.privateGrantRevocationImmediate=true;
 await privileged.query("update community_rooms set status='open',min_rating=1600 where id=$1",[room]);await assert.rejects(spectateMatch(actors[4],{matchId:observerMatch}),{code:'room_rating_restricted'});await privileged.query('update community_rooms set min_rating=0 where id=$1',[room]);checks.rankedRoomRatingGatePreserved=true;
 await social(actors[2],{action:'block',targetId:ids[4]});await assert.rejects(spectateMatch(actors[4],{matchId:observerMatch}),{code:'blocked'});assert.equal((await matchAccessBatch([actors[4]],observerMatch)).size,0);await assert.rejects(sendMessage(actors[4],{channelId:snapshot.channelId,clientMessageId:randomUUID(),body:'Geblokkeerde context.'}),{code:'blocked'});assert.equal((await chatChannelsProjection(actors[4])).filter(value=>value.matchId===observerMatch).length,0);checks.BidirectionalSpectatorBlocksFresh=true;await social(actors[2],{action:'unblock',targetId:ids[4]});
 await privileged.query("insert into sanctions(target_id,actor_id,room_id,kind,reason,ends_at) values($1,$2,$3,'mute','Owned fixture mute',now()+interval '1 minute')",[ids[4],ids[2],room]);await assert.rejects(sendMessage(actors[4],{channelId:snapshot.channelId,clientMessageId:randomUUID(),body:'Mute context.'}),{code:'muted'});await spectateMatch(actors[4],{matchId:observerMatch});checks.mutedSpectatorReadsButCannotWrite=true;
 // This participant has its own reservation on observerMatch. A separate view
 // of a third match is not needed to verify no spectator path steals any seat.
 assert.equal((await privileged.query('select count(*)::int n from active_player_reservations where match_id=$1',[observerMatch])).rows[0].n,2);assert.equal((await privileged.query('select count(*)::int n from match_players where match_id=$1',[observerMatch])).rows[0].n,2);checks.spectatingCreatesNoSeatOrReservation=true;
 const activityBefore=(await privileged.query('select last_activity_at from room_memberships where user_id=$1',[ids[4]])).rows[0].last_activity_at.getTime();assert.equal((await heartbeat(actors[4])).ok,true);
 assert.equal((await privileged.query('select last_activity_at from room_memberships where user_id=$1',[ids[4]])).rows[0].last_activity_at.getTime(),activityBefore);checks.backgroundHeartbeatDoesNotResetIdle=true;
 await privileged.query("update room_memberships set last_activity_at=now()-interval '4 minutes',lease_until=now()+interval '5 minutes' where user_id=$1",[ids[4]]);assert.equal((await heartbeat(actors[4],{active:true})).ok,true);
 assert.ok((await privileged.query('select extract(epoch from now()-last_activity_at) age,extract(epoch from lease_until-now()) lease from room_memberships where user_id=$1',[ids[4]])).rows[0].lease>290);checks.explicitRecentInputKeepsFiveMinuteLease=true;
 await privileged.query("update room_memberships set last_activity_at=now()-interval '301 seconds',lease_until=now()+interval '5 minutes' where user_id=$1",[ids[4]]);assert.equal((await heartbeat(actors[4],{active:true})).ok,false,'a stale pulse cannot revive an expired room');await assert.rejects(spectateMatch(actors[4],{matchId:observerMatch}),{code:'join_room_first'});checks.fiveMinuteIdleExpiresWithLiveConnectivity=true;
 await joinRoom(actors[4],{roomId:room});await privileged.query("update room_memberships set last_activity_at=now()-interval '301 seconds' where user_id=$1",[ids[4]]);await expireRoomMemberships();assert.equal((await privileged.query('select lease_until<=now() expired from room_memberships where user_id=$1',[ids[4]])).rows[0].expired,true);checks.workerExpiresIdleWithoutHeartbeat=true;
 await joinRoom(actors[4],{roomId:room});await privileged.query("update room_memberships set lease_until=now()-interval '1 second' where user_id=$1",[ids[4]]);assert.equal((await heartbeat(actors[4],{active:true})).ok,false);checks.offlineExpiryCannotBeRevivedByPulse=true;
}finally{
 const c=await privileged.connect();try{
  await c.query('begin');await c.query('select id from profiles where id=any($1::uuid[]) order by id for update',[ids]);
  // Promise.all may reject after the other independent creation committed.
  // Recover only matches containing this invocation's newly created players.
  const discovered=(await c.query('select distinct match_id from match_players where user_id=any($1::uuid[])',[ids])).rows.map(row=>row.match_id);
  for(const matchId of discovered)if(!matches.includes(matchId))matches.push(matchId);
  const channels=(await c.query('select id from channels where room_id=$1 or match_id=any($2::uuid[])',[room,matches])).rows.map(row=>row.id);
  await c.query('delete from private.moderation_cases where target_id=any($1::uuid[]) or reporter_id=any($1::uuid[])',[ids]);await c.query('delete from sanctions where target_id=any($1::uuid[]) or actor_id=any($1::uuid[])',[ids]);
  await c.query('delete from chat_messages where channel_id=any($1::uuid[])',[channels]);await c.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channels where id=any($1::uuid[])',[channels]);
  for(const table of ['private.match_commands','match_darts','match_events','match_statistics','rating_ledger','user_badges','player_opponents','active_player_reservations','match_players','match_results']){
   const column=table==='player_opponents'?'first_match_id':'match_id';await c.query(`delete from ${table} where ${column}=any($1::uuid[])`,[matches]);
  }
  await c.query('delete from private.command_ingress where actor_id=any($1::uuid[])',[ids]);
  await c.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[]))',[ids,matches]);await c.query('delete from notifications where user_id=any($1::uuid[])',[ids]);await c.query('delete from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[])',[ids,matches]);
  await c.query('delete from private.audit_events where actor_id=any($1::uuid[]) or subject=any($2::text[])',[ids,[room,...matches,...ids]]);await c.query('delete from matches where id=any($1::uuid[])',[matches]);
  await c.query('delete from private.room_visits where user_id=any($1::uuid[])',[ids]);await c.query('delete from room_memberships where user_id=any($1::uuid[])',[ids]);await c.query('delete from room_access where room_id=$1',[room]);await c.query('delete from community_rooms where id=$1',[room]);
  await c.query('delete from user_blocks where blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])',[ids]);await c.query('delete from personal_mutes where user_id=any($1::uuid[]) or muted_id=any($1::uuid[])',[ids]);await c.query('delete from preferences where user_id=any($1::uuid[])',[ids]);await c.query('delete from player_ratings where user_id=any($1::uuid[])',[ids]);await c.query('delete from profiles where id=any($1::uuid[])',[ids]);await c.query('delete from auth.users where id=any($1::uuid[])',[ids]);
  await c.query('commit');assert.equal((await c.query('select count(*)::int n from profiles where id=any($1::uuid[])',[ids])).rows[0].n,0);checks.ownedFixturesCleaned=true;
 }catch(error){await c.query('rollback');throw error;}finally{c.release();await privileged.end();await db().end();await(await redis()).quit();}
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/match-room-expansion-result.json',JSON.stringify({ok:true,checks},null,2));console.log('Three timeout intervals, actual idle, stable numeric IDs and spectator ACL passed');
