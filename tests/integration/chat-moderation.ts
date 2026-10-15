import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,actorById,type Actor} from '../../packages/data/src/auth';
import {onboard,joinRoom,heartbeat,sendMessage,chatHistory,privateChannel,chatPreference} from '../../packages/data/src/community';
import {bootstrap,publicProjection,chatChannelsProjection,playersProjection,roomsProjection} from '../../packages/data/src/projections';
import {filterAction,moderationSettings,renameProfile} from '../../packages/data/src/content-filter';
import {moderationCapabilities,moderate,moderateMessage,revokeSanction,report} from '../../packages/data/src/admin';
import {invite,respondInvite,createMatch,acquireMatch,matchAccess,matchAccessBatch,matchCommand,finishMatch} from '../../packages/data/src/matches';
import {matchHistory} from '../../packages/data/src/history';
import {scoreDart} from '../../packages/game-core/src/darts-rules';
import {DEFAULT_TOURNAMENT_SETTINGS} from '../../packages/game-core/src/darts-tournament-model';
import {transaction} from '../../packages/data/src/db';
import {deliverGameInviteNotification} from '../../packages/data/src/notifications';
import {Pool,type PoolClient} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
const prefix='Chat'+randomUUID().slice(0,7),auth=authAdmin();
async function joinBoundaryAndConcurrentInvites(){
 assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 const privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:2}),ownedUsers:string[]=[],ownedRooms:string[]=[];
 const checks={roomJoinBudget10:false,renewalsAtJoinLimitDoNotConsume:false,denied11thJoinUnchanged:false,concurrentInviteAcceptExactlyOne:false,concurrentInviteCancelledNoNotification:false,ownedBoundaryFixturesRemoved:false};
 try{
  const actors:Actor[]=[];
  for(let i=0;i<4;i++){
   const {data,error}=await auth.auth.admin.createUser({email:`${prefix}-boundary-${i}@dartspoint.local`,email_confirm:true});assert.equal(error,null);assert.ok(data.user);ownedUsers.push(data.user.id);
   const initial=await actorById(data.user.id,Date.now()+3600000,false);await onboard(initial,{username:prefix+'J'+i});actors.push(await actorById(initial.id,initial.expiresAt));
  }
  const [visitor,left,right,receiver]=actors;
  ownedRooms.push(...(await privileged.query('insert into community_rooms(name,slug,capacity) values($1,$1,50),($2,$2,50) returning id',[prefix+'Visits1',prefix+'Visits2'])).rows.map(r=>r.id));
  await privileged.query("insert into channels(kind,room_id) select 'community',unnest($1::uuid[])",[ownedRooms]);
  const joins:string[]=[];
  for(let i=0;i<10;i++)joins.push((await joinRoom(visitor,{roomId:ownedRooms[i%2]})).visitId);
  assert.equal(new Set(joins).size,10,'Ten real room transitions receive ten distinct visit IDs');
  const snapshot=async()=>{
   const member=(await privileged.query('select room_id,visit_id,joined_at from room_memberships where user_id=$1',[visitor.id])).rows[0];
   const visits=(await privileged.query('select id,room_id,created_at from private.room_visits where user_id=$1 order by created_at,id',[visitor.id])).rows;
   const events=(await privileged.query("select id,event_id,actor_id,sender_id,client_message_id,room_id,channel_id,seq,kind from chat_messages where actor_id=$1 order by created_at,id",[visitor.id])).rows;
   const cursors=(await privileged.query('select id,cursor from channels where room_id=any($1::uuid[]) order by id',[ownedRooms])).rows;
   return {member,visits,events,cursors};
  };
  const atLimit=await snapshot();assert.equal(atLimit.visits.length,10);assert.equal(atLimit.events.length,10);
  assert.deepEqual(new Set(atLimit.visits.map(v=>v.id)),new Set(joins));assert.deepEqual(new Set(atLimit.events.map(e=>e.event_id)),new Set(joins));
  assert.ok(new Date(atLimit.visits.at(-1)!.created_at).getTime()-new Date(atLimit.visits[0].created_at).getTime()<60000,'The boundary uses ten genuine visits within one minute');
  for(const event of atLimit.events){assert.equal(event.kind,'room.member_joined');assert.equal(event.actor_id,visitor.id);assert.equal(event.sender_id,null);assert.equal(event.client_message_id,null);assert.equal(atLimit.visits.find(v=>v.id===event.event_id)!.room_id,event.room_id);}
  checks.roomJoinBudget10=true;
  assert.equal((await heartbeat(visitor)).ok,true);assert.equal((await joinRoom(visitor,{roomId:ownedRooms[1]})).visitId,joins[9]);assert.equal((await heartbeat(visitor)).ok,true);
  assert.deepEqual(await snapshot(),atLimit,'Heartbeats and renewing the same room do not consume a visit or emit another typed event at the limit');checks.renewalsAtJoinLimitDoNotConsume=true;
  const membershipBeforeDenial=(await privileged.query('select * from room_memberships where user_id=$1',[visitor.id])).rows[0];
  await assert.rejects(joinRoom(visitor,{roomId:ownedRooms[0]}),(error:any)=>{assert.equal(error.code,'room_join_rate');assert.equal(error.status,429);assert.ok(Number.isInteger(error.retryAfter)&&error.retryAfter>=1&&error.retryAfter<=60);return true;});
  assert.deepEqual(await snapshot(),atLimit,'The eleventh transition changes no membership, visit, event or channel cursor');
  assert.deepEqual((await privileged.query('select * from room_memberships where user_id=$1',[visitor.id])).rows[0],membershipBeforeDenial,'A denied join does not renew or move the current lease');checks.denied11thJoinUnchanged=true;

  for(const actor of [left,right,receiver])await joinRoom(actor,{roomId:ownedRooms[0]});
  const rules={startScore:501 as const,bestOf:1,format:'legs' as const,bestOfSets:1,doubleIn:false};
  const first=await invite(left,{targetId:receiver.id,roomId:ownedRooms[0],rules,ranked:false}),second=await invite(right,{targetId:receiver.id,roomId:ownedRooms[0],rules,ranked:false}),inviteIds=[first.id,second.id];
  assert.equal((await privileged.query("select count(*)::int n from game_invites where id=any($1::uuid[]) and state='pending'",[inviteIds])).rows[0].n,2,'Both invitations are valid while all three players are free');
  // Hold a real admission row, observe the actual connections of both domain
  // calls, and release only once both acceptances demonstrably wait together.
  const gate=await privileged.connect(),application=db(),pids=new Set<number>();let outcomes:Promise<PromiseSettledResult<any>[]>|undefined,settled=0,gateOpen=false,notificationsBefore:any[]=[];
  const acquired=(client:PoolClient)=>{if(pids.size<2)pids.add((client as PoolClient&{processID:number}).processID);};
  try{
   await gate.query('begin');gateOpen=true;await gate.query('select id from private.admission_lock where id=1 for update');const gatePid=Number((await gate.query('select pg_backend_pid() pid')).rows[0].pid);
   application.on('acquire',acquired);
   outcomes=Promise.allSettled(inviteIds.map(inviteId=>respondInvite(receiver,{inviteId,action:'accept'}).finally(()=>{settled++;})));
   const deadline=Date.now()+5000;let bothBlocked=false;
   while(Date.now()<deadline){
    if(pids.size===2){
     const waiting=(await privileged.query("select pid,wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=any($1::int[]) or wait_event_type='Lock'",[Array.from(pids)])).rows;
     const reachesGate=(pid:number,seen=new Set<number>()):boolean=>{if(pid===gatePid)return true;if(seen.has(pid))return false;seen.add(pid);return (waiting.find(r=>Number(r.pid)===pid)?.blockers??[]).some((blocker:number)=>reachesGate(Number(blocker),seen));};
     bothBlocked=Array.from(pids).every(pid=>waiting.find(row=>Number(row.pid)===pid)?.wait_event_type==='Lock'&&reachesGate(pid));
     if(bothBlocked)break;
    }
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.ok(bothBlocked,'Both overlapping accept calls are genuinely blocked concurrently on the same admission transaction');assert.equal(settled,0,'Neither acceptance resolves before the gate is released');
   await gate.query('commit');gateOpen=false;
  }finally{application.off('acquire',acquired);if(gateOpen)await gate.query('rollback');gate.release();if(outcomes)await outcomes;}
  assert.ok(outcomes);const accepted=await outcomes,winners=accepted.filter((r):r is PromiseFulfilledResult<any>=>r.status==='fulfilled'),losers=accepted.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
  assert.equal(winners.length,1);assert.equal(losers.length,1);assert.equal(losers[0].reason.code,'sender_already_playing');
  const matchId=winners[0].value.matchId;assert.ok(matchId);
  const storedInvites=(await privileged.query('select id,state,match_id from game_invites where id=any($1::uuid[]) order by id',[inviteIds])).rows;
  assert.equal(storedInvites.filter(i=>i.state==='accepted'&&i.match_id===matchId).length,1);assert.equal(storedInvites.filter(i=>i.state==='cancelled'&&i.match_id===null).length,1);assert.equal(storedInvites.some(i=>i.state==='pending'),false);
  const matches=(await privileged.query('select id from matches where room_id=any($1::uuid[])',[ownedRooms])).rows;assert.deepEqual(matches.map(m=>m.id),[matchId]);
  const reservations=(await privileged.query('select user_id,match_id from active_player_reservations where user_id=any($1::uuid[]) order by user_id',[ownedUsers])).rows;
  assert.equal(reservations.length,2);assert.ok(reservations.some(r=>r.user_id===receiver.id));assert.ok(reservations.every(r=>r.match_id===matchId));
  const winnerInvite=storedInvites.find(i=>i.state==='accepted')!,winnerSender=winnerInvite.id===first.id?left.id:right.id;assert.deepEqual(new Set(reservations.map(r=>r.user_id)),new Set([receiver.id,winnerSender]));checks.concurrentInviteAcceptExactlyOne=true;
  notificationsBefore=(await privileged.query('select id from notifications where user_id=$1 order by id',[receiver.id])).rows;
  const events=(await privileged.query("select * from private.outbox_events where kind='game-invite' and payload->>'inviteId'=any($1::text[])",[inviteIds])).rows;assert.equal(events.length,2);
  for(const event of events)assert.equal(await deliverGameInviteNotification(event),false,'A resolved accepted or cancelled invitation cannot deliver a stale pending invite notification');
  assert.deepEqual((await privileged.query('select id from notifications where user_id=$1 order by id',[receiver.id])).rows,notificationsBefore,'Concurrent acceptance and delayed delivery emit no extra receiver notification');checks.concurrentInviteCancelledNoNotification=true;
 }finally{
  const client=await privileged.connect();try{
   await client.query('begin');
   // A worker may be delivering an owned welcome/invite concurrently. Lock
   // only our parent profiles first, in a fixed order, before child deletes.
   await client.query('select id from profiles where id=any($1::uuid[]) order by id for update',[ownedUsers]);
   const matchIds=(await client.query('select id from matches where room_id=any($1::uuid[])',[ownedRooms])).rows.map(r=>r.id);
   const channels=(await client.query('select id from channels where room_id=any($1::uuid[]) or match_id=any($2::uuid[])',[ownedRooms,matchIds])).rows.map(r=>r.id);
   await client.query('delete from notifications where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=any($1::uuid[]))',[ownedUsers]);await client.query('delete from private.outbox_events where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from private.audit_events where actor_id=any($1::uuid[])',[ownedUsers]);
   await client.query('delete from chat_messages where channel_id=any($1::uuid[])',[channels]);await client.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channels]);await client.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await client.query('delete from channels where id=any($1::uuid[])',[channels]);
   await client.query('delete from game_invites where inviter_id=any($1::uuid[]) or invitee_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from active_player_reservations where match_id=any($1::uuid[])',[matchIds]);await client.query('delete from match_players where match_id=any($1::uuid[])',[matchIds]);await client.query('delete from matches where id=any($1::uuid[])',[matchIds]);
   await client.query('delete from private.room_visits where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from room_memberships where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from community_rooms where id=any($1::uuid[])',[ownedRooms]);await client.query('delete from preferences where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from player_ratings where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from private.legal_acceptances where user_id=any($1::uuid[])',[ownedUsers]);await client.query('delete from profiles where id=any($1::uuid[])',[ownedUsers]);await client.query('delete from auth.users where id=any($1::uuid[])',[ownedUsers]);await client.query('commit');
   assert.equal((await client.query('select count(*)::int n from profiles where id=any($1::uuid[])',[ownedUsers])).rows[0].n,0);assert.equal((await client.query('select count(*)::int n from community_rooms where id=any($1::uuid[])',[ownedRooms])).rows[0].n,0);checks.ownedBoundaryFixturesRemoved=true;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await privileged.end();}
 }
 return checks;
}
async function user(i:number){const {data,error}=await auth.auth.admin.createUser({email:`${prefix}-${i}@dartspoint.local`,email_confirm:true});assert.equal(error,null);const actor=await actorById(data.user!.id,Date.now()+3600000,false);await onboard(actor,{username:prefix+i});return actorById(actor.id,actor.expiresAt);}
const [a,b,c,d,owner,quota,burst]=await Promise.all([0,1,2,3,4,5,6].map(user));
const rooms=(await db().query("insert into community_rooms(name,slug,capacity) values($1,$1,50),($2,$2,50) returning id",[prefix,prefix+'two'])).rows.map(r=>r.id);
await db().query("insert into channels(kind,room_id) values('community',$1),('community',$2)",rooms);
const room=rooms[0],other=rooms[1],channel=(await db().query('select id from channels where room_id=$1',[room])).rows[0].id;
const send=(actor:Actor,body:string,id=randomUUID(),ch=channel)=>sendMessage(actor,{channelId:ch,body,clientMessageId:id});
try{
 const boundaryChecks=await joinBoundaryAndConcurrentInvites();
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[owner.id]);const own=await actorById(owner.id,owner.expiresAt);
 for(const actor of [a,b,c,d,own,quota,burst])await joinRoom(actor,{roomId:room});
 const first=(await db().query('select visit_id from room_memberships where user_id=$1',[a.id])).rows[0].visit_id;
 await Promise.all([joinRoom(a,{roomId:room}),joinRoom(a,{roomId:room}),heartbeat(a)]);
 assert.equal((await db().query('select count(*)::int n from chat_messages where actor_id=$1 and room_id=$2 and kind=\'room.member_joined\'',[a.id,room])).rows[0].n,1);
 assert.equal((await chatChannelsProjection(b)).find(x=>x.id===channel)!.unread,0,'System joins are not human unread');
 assert.ok((await chatHistory(b,channel)).some(m=>m.kind==='room.member_joined'&&m.actor_id===a.id&&m.sender_id===null));
 await joinRoom(a,{roomId:other});await joinRoom(a,{roomId:room});await db().query("update room_memberships set lease_until=now()-interval '1 second' where user_id=$1",[a.id]);assert.equal((await heartbeat(a)).ok,false);await joinRoom(a,{roomId:room});
 assert.notEqual((await db().query('select visit_id from room_memberships where user_id=$1',[a.id])).rows[0].visit_id,first);
 assert.equal((await db().query('select count(*)::int n from chat_messages where actor_id=$1 and room_id=$2',[a.id,room])).rows[0].n,3);
 await db().query("update community_rooms set status='closed' where id=$1",[other]);const countBefore=(await db().query('select count(*)::int n from chat_messages where room_id=$1',[other])).rows[0].n;await assert.rejects(joinRoom(a,{roomId:other}),{code:'room_unavailable'});assert.equal((await db().query('select count(*)::int n from chat_messages where room_id=$1',[other])).rows[0].n,countBefore);await db().query("update community_rooms set status='open' where id=$1",[other]);
 const privateRoom=(await db().query("insert into community_rooms(name,slug,status,capacity) values($1,$1,'private',50) returning id",[prefix+'private'])).rows[0].id;await db().query("insert into channels(kind,room_id) values('community',$1)",[privateRoom]);const privateChat=(await db().query('select id from channels where room_id=$1',[privateRoom])).rows[0].id;await assert.rejects(joinRoom(a,{roomId:privateRoom}),{code:'room_private'});await db().query('insert into room_access(room_id,user_id) values($1,$2)',[privateRoom,c.id]);assert.ok((await roomsProjection(false,c.id)).some(r=>r.id===privateRoom));await joinRoom(c,{roomId:privateRoom});await assert.rejects(chatHistory(a,privateChat),{code:'room_private'});await db().query('delete from room_access where room_id=$1 and user_id=$2',[privateRoom,c.id]);assert.ok(!(await chatChannelsProjection(c)).some(ch=>ch.id===privateChat));await assert.rejects(chatHistory(c,privateChat),{code:'room_private'});await joinRoom(c,{roomId:room});
 const simultaneous=await Promise.allSettled([0,1,2,3].map(i=>send(burst,'Gelijktijdige intentie '+i)));assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,3);assert.equal(simultaneous.filter(r=>r.status==='rejected').length,1);
 const id=randomUUID(),receipts=await Promise.all([send(a,'Eén intentie',id),send(a,'Eén intentie',id),send(a,'Eén intentie',id)]);assert.equal(new Set(receipts.map(m=>m.id)).size,1);assert.equal(receipts[0].client_message_id,id);assert.ok(Number(receipts[0].seq)>0);
 await assert.rejects(send(a,'Andere tekst',id),{code:'idempotency_conflict'});await assert.rejects(send(a,'  EÉN  intentie  '),{code:'chat_duplicate'});
 await send(a,'Bericht twee');await send(a,'Bericht drie');await assert.rejects(send(a,'Bericht vier'),{code:'chat_burst_limited'});assert.equal((await send(a,'Eén intentie',id)).id,receipts[0].id,'A durable retry consumes no new-message quota');
 const history=await chatHistory(b,channel,Number(receipts[0].seq));assert.equal(history.filter(m=>m.kind==='human').length,2);
 const dm=(await privateChannel(b,{targetId:c.id})).channelId;
 for(const [who,ch] of [[b,channel],[b,dm]] as const){await assert.rejects(send(who,'g3il',randomUUID(),ch),{code:'message_filtered'});await assert.rejects(send(who,'k.a.n.k.e.r',randomUUID(),ch),{code:'message_filtered'});}
 await send(b,'Essex en gewone namen',randomUUID(),dm);assert.equal((await chatHistory(c,dm)).length,1);
 await assert.rejects(renameProfile(c,{username:'GeileBoerin'}),{code:'username_filtered'});await renameProfile(c,{username:prefix+'Essex'});
 const {data:newData,error:newError}=await auth.auth.admin.createUser({email:`${prefix}-filtered@dartspoint.local`,email_confirm:true});assert.equal(newError,null);await assert.rejects(onboard(await actorById(newData.user!.id,Date.now()+3600000,false),{username:'GeileBoerin'}),{code:'username_filtered'});
 await assert.rejects(moderationSettings(a),{code:'forbidden'});await assert.rejects(filterAction(a,{action:'test',text:'geil',scope:'chat'}),{code:'forbidden'});
 const newRule={term:prefix.toLowerCase(),category:'QA',scope:'chat',matchType:'word',active:true,allow:false,description:'Isolated QA rule',aliases:[]};await filterAction(own,{action:'save',rule:newRule,reason:'Isolated filter verification'});
 const stored=(await moderationSettings(own)).rules.find(r=>r.term===newRule.term)!;await assert.rejects(send(c,prefix),{code:'message_filtered'});
 await filterAction(own,{action:'save',rule:{...stored,active:false},reason:'Disable isolated filter rule'});await send(c,prefix);
 const ruleAudit=(await db().query("select * from private.audit_events where action='chat.filter.save' and subject=$1 order by id desc limit 1",[stored.id])).rows[0];assert.equal(ruleAudit.data.subjectName,newRule.term);assert.equal(ruleAudit.data.before.active,true);assert.equal(ruleAudit.data.after.active,false);assert.equal(ruleAudit.data.after.version,stored.version+1);assert.equal(ruleAudit.reason,'Disable isolated filter rule');
 await assert.rejects(filterAction(own,{action:'save',rule:{...stored,active:true},reason:'Do not overwrite a stale rule version'}),{code:'filter_rule_changed'});
 const settings=await moderationSettings(own);await filterAction(own,{action:'limits',limits:{...settings.limits,chatBurstCount:4},reason:'Test configurable burst limit'});assert.equal((await moderationSettings(own)).limits.chatBurstCount,4);await filterAction(own,{action:'limits',limits:settings.limits,reason:'Restore original chat limits'});
 await db().query('update profiles set username=$2 where id=$1',[c.id,prefix+'-geil']);assert.ok((await filterAction(own,{action:'scan'}) as any).users.some((p:any)=>p.id===c.id));await filterAction(own,{action:'require-rename',targetId:c.id,reason:'Test controlled rename requirement'});const flagged=await actorById(c.id,c.expiresAt);assert.equal(flagged.renameRequired,true);assert.match(flagged.username!,/^Speler-/);assert.equal((await playersProjection()).find(p=>p.id===c.id)!.name,flagged.username);assert.ok((await chatHistory(b,channel)).filter(m=>m.kind==='room.member_joined'&&m.actor_id===c.id).every(m=>m.body===flagged.username+' komt de kamer binnen.'));await renameProfile(flagged,{username:prefix+'Rename'});assert.equal((await actorById(c.id,c.expiresAt)).renameRequired,false);
 for(let i=0;i<30;i++){await send(quota,'Quota '+i);await db().query("update chat_messages set created_at=now()-interval '3 seconds' where sender_id=$1",[quota.id]);}await assert.rejects(send(quota,'Quota 31'),{code:'chat_rate_limited'});
 await db().query('insert into room_moderators(room_id,user_id) values($1,$2)',[room,b.id]);const caps=await moderationCapabilities(b,{targetId:d.id,roomId:room});assert.equal(caps.canWarn,true);assert.equal((await moderationCapabilities(a,{targetId:d.id,roomId:room})).canWarn,false);assert.equal((await moderationCapabilities(b,{targetId:c.id,channelId:dm})).canWarn,false);assert.equal((await moderationCapabilities(b,{targetId:d.id})).canWarn,false);
 const sanction=await moderate(b,{targetId:d.id,roomId:room,kind:'warn',reason:'Authorized scoped warning',minutes:1});await revokeSanction(b,{id:sanction.id,reason:'Withdraw warning with explanation'});await revokeSanction(b,{id:sanction.id,reason:'Withdraw warning with explanation'});assert.equal((await db().query("select count(*)::int n from private.audit_events where action='sanction.revoke' and subject=$1",[sanction.id])).rows[0].n,1);
 const message=await send(d,'Verwijder dit testbericht'),beforeRedaction=Number((await db().query('select cursor from channels where id=$1',[channel])).rows[0].cursor),unreadBefore=(await chatChannelsProjection(a)).find(ch=>ch.id===channel)!.unread;
 await moderateMessage(b,{messageId:message.id,reason:'Scoped message moderation'});
 const tombstone=(await chatHistory(a,channel,beforeRedaction)).find(m=>m.id===message.id);assert.ok(tombstone,'Reconnect discovers an older edited message');assert.equal(tombstone.body,null);assert.equal(tombstone.redacted,true);assert.equal(Number(tombstone.seq),Number(message.seq));assert.equal(Number(tombstone.cursor),beforeRedaction+1);assert.ok((await chatHistory(a,channel)).some(m=>m.id===message.id&&m.redacted&&m.body===null));
 assert.equal((await chatChannelsProjection(a)).find(ch=>ch.id===channel)!.unread,unreadBefore-1,'Redaction creates no human unread');await moderateMessage(b,{messageId:message.id,reason:'Scoped message moderation'});assert.equal(Number((await db().query('select cursor from channels where id=$1',[channel])).rows[0].cursor),beforeRedaction+1);assert.equal((await db().query("select count(*)::int n from private.audit_events where action='chat.message.redact' and data->>'messageId'=$1",[message.id])).rows[0].n,1);
 await assert.rejects(moderateMessage(b,{messageId:(await chatHistory(c,dm))[0].id,reason:'Private context prohibited'}),{code:'forbidden'});
 // Both users can legitimately enter the other room; the old message cannot
 // be presented as evidence from that new room by omitting channelId.
 const warningsBefore=Number((await db().query("select count(*) n from sanctions where actor_id=$1 and target_id=$2",[b.id,d.id])).rows[0].n),warningAuditsBefore=Number((await db().query("select count(*) n from private.audit_events where actor_id=$1 and action='moderation.warn'",[b.id])).rows[0].n);
 await db().query('insert into room_moderators(room_id,user_id) values($1,$2)',[other,b.id]);await joinRoom(d,{roomId:other});await joinRoom(b,{roomId:other});
 await assert.rejects(moderate(b,{targetId:d.id,roomId:other,messageId:message.id,kind:'warn',reason:'Message belongs to the previous room',minutes:1}),{code:'invalid_context'});
 await joinRoom(d,{roomId:room});await assert.rejects(moderate(b,{targetId:d.id,roomId:room,kind:'warn',reason:'Moderator left after opening the menu',minutes:1}),{code:'join_room_first'});
 assert.equal(Number((await db().query("select count(*) n from sanctions where actor_id=$1 and target_id=$2",[b.id,d.id])).rows[0].n),warningsBefore);assert.equal(Number((await db().query("select count(*) n from private.audit_events where actor_id=$1 and action='moderation.warn'",[b.id])).rows[0].n),warningAuditsBefore);await joinRoom(b,{roomId:room});await db().query('delete from room_moderators where room_id=$1 and user_id=$2',[other,b.id]);
 await db().query('delete from room_moderators where room_id=$1 and user_id=$2',[room,b.id]);await assert.rejects(moderate(b,{targetId:d.id,roomId:room,kind:'warn',reason:'Stale opened menu capability',minutes:1}),{code:'forbidden'});
 const rules={startScore:501 as const,bestOf:1,format:'legs' as const,bestOfSets:1,doubleIn:false};
 const pending=await invite(d,{targetId:c.id,roomId:room,rules,ranked:false});const game=await transaction(client=>createMatch(client,a,b.id,room,{...rules,doubleOut:true},'casual'));
 await assert.rejects(invite(a,{targetId:d.id,roomId:room,rules,ranked:false}),{code:'sender_already_playing'});await assert.rejects(invite(d,{targetId:b.id,roomId:room,rules,ranked:false}),{code:'target_already_playing'});
 const mc=(await db().query('select id from channels where match_id=$1',[game.matchId])).rows[0].id;await assert.rejects(send(b,'k@nker',randomUUID(),mc),{code:'message_filtered'});
 const spectatorMessage=await send(d,'Een toeschouwer reageert',randomUUID(),mc),spectatorReport=await report(c,{targetId:d.id,messageId:spectatorMessage.id,channelId:mc,matchId:game.matchId,roomId:room,reason:'Test echte wedstrijdchatcontext'});const reportedContext=(await db().query('select match_id,room_id,evidence from private.moderation_cases where id=$1',[spectatorReport.id])).rows[0];assert.equal(reportedContext.match_id,game.matchId);assert.equal(reportedContext.room_id,room);assert.equal(reportedContext.evidence.channel.id,mc);await assert.rejects(report(c,{targetId:d.id,messageId:spectatorMessage.id,channelId:channel,reason:'Test vervalst kanaal'}),{code:'invalid_context'});await assert.rejects(report(c,{targetId:d.id,messageId:message.id,matchId:game.matchId,roomId:room,reason:'Test vervalste wedstrijdcontext'}),{code:'invalid_context'});
 const directReport=await report(c,{targetId:b.id,channelId:dm,reason:'Test echte privécontext'}),privateCase=(await db().query('select room_id,match_id,evidence from private.moderation_cases where id=$1',[directReport.id])).rows[0];assert.equal(privateCase.room_id,null);assert.equal(privateCase.match_id,null);assert.equal(privateCase.evidence.channel.kind,'private');await assert.rejects(report(c,{targetId:d.id,channelId:dm,reason:'Test verkeerde privéontvanger'}),{code:'invalid_context'});await assert.rejects(report(c,{targetId:b.id,channelId:dm,roomId:room,reason:'Test onterechte privé kamercontext'}),{code:'invalid_context'});
 await db().query("update matches set lifecycle='paused' where id=$1",[game.matchId]);await assert.rejects(invite(a,{targetId:d.id,roomId:room,rules,ranked:false}),{code:'sender_already_playing'});
 const inviteEvent=(await db().query("select * from private.outbox_events where kind='game-invite' and payload->>'inviteId'=$1",[pending.id])).rows[0];assert.equal(await deliverGameInviteNotification(inviteEvent),true,'The still-pending invitation may legitimately be delivered before cancellation');
 const otherGame=await transaction(client=>createMatch(client,c,d.id,room,{...rules,doubleOut:true},'casual'));await assert.rejects(respondInvite(c,{inviteId:pending.id,action:'accept'}),{code:'sender_already_playing'});assert.equal((await db().query('select state from game_invites where id=$1',[pending.id])).rows[0].state,'cancelled');assert.equal((await db().query('select count(*)::int n from active_player_reservations where user_id=any($1::uuid[])',[[a.id,b.id,c.id,d.id]])).rows[0].n,4);
 // The real worker may have delivered this invitation while it was still
 // pending. Establish the cancelled baseline under the same admission lock
 // as delivery, so an earlier legitimate insert cannot arrive after cleanup.
 await transaction(async client=>{await client.query('select id from private.admission_lock where id=1 for update');assert.equal((await client.query('select state from game_invites where id=$1',[pending.id])).rows[0].state,'cancelled');await client.query('delete from notifications where source_event=$1 and user_id=$2',[inviteEvent.id,c.id]);});
 assert.equal(await deliverGameInviteNotification(inviteEvent),false);assert.equal((await db().query('select id from notifications where source_event=$1',[inviteEvent.id])).rowCount,0,'Cancelled busy invitation cannot emit a delayed useless notification');
 for(const matchId of [game.matchId,otherGame.matchId]){await db().query("update matches set lifecycle='cancelled' where id=$1",[matchId]);await db().query('delete from active_player_reservations where match_id=$1',[matchId]);}
 // Simulate a pre-filter profile and its persisted display snapshots. Projection
 // must hide it while flagged and after a safe rename without rewriting history.
 const legacyName=prefix+'-geil';await db().query('update profiles set username=$2 where id=$1',[d.id,legacyName]);await db().query("update room_memberships set lease_until=now()-interval '1 second' where user_id=$1",[d.id]);const legacyActor=await actorById(d.id,d.expiresAt);await joinRoom(legacyActor,{roomId:room});
 const legacyJoin=(await db().query("select id,actor_name from chat_messages where actor_id=$1 and kind='room.member_joined' order by created_at desc limit 1",[d.id])).rows[0];assert.equal(legacyJoin.actor_name,legacyName);
 const privacyMatch=await transaction(client=>createMatch(client,c,d.id,room,{...rules,doubleOut:true},'casual')),writer=randomUUID(),fence=await acquireMatch(privacyMatch.matchId,writer),tournamentId=randomUUID(),seasonId=randomUUID(),divisionId=randomUUID();
 try{
  const now=Date.now(),legacyTournament={id:tournamentId,name:prefix+' legacy tournament',description:'Persisted name privacy fixture',organizer:'DartsPoint',status:'registration',published:true,settings:DEFAULT_TOURNAMENT_SETTINGS,participants:[{id:d.id,name:legacyName,rating:1000,played:0,role:'player',status:'confirmed',ready:false,rulesAccepted:true,approved:true,seed:1,joinedAt:now}],matches:[],championId:null,createdAt:now,updatedAt:now},legacySeason={id:seasonId,name:prefix+' legacy season',description:'Persisted name privacy fixture',status:'live',startsOn:'2026-10-13',bestOf:1,divisions:[{id:divisionId,name:prefix+' legacy division',level:1,color:'gold'}],members:[{id:d.id,name:legacyName,rating:1000,divisionId}],fixtures:[],promoteCount:0,relegateCount:0,previousSeasonId:null,createdAt:now,updatedAt:now,completedAt:null,completionReason:''};
  await db().query("insert into tournaments(id,room_id,name,status,published,model) values($1,$2,$3,'registration',true,$4)",[tournamentId,room,legacyTournament.name,JSON.stringify(legacyTournament)]);await db().query("insert into seasons(id,name,status,model) values($1,$2,'live',$3)",[seasonId,legacySeason.name,JSON.stringify(legacySeason)]);const storedModels=async()=>({tournament:(await db().query('select model::text model from tournaments where id=$1',[tournamentId])).rows[0].model,season:(await db().query('select model::text model from seasons where id=$1',[seasonId])).rows[0].model}),originalModels=await storedModels();
  const oldResult=legacyName+' · D20 — 40 punten',oldDart={id:1,hit:scoreDart(0,0),opponentName:legacyName};await db().query("update matches set state=jsonb_set(jsonb_set(state,'{lastResult}',to_jsonb($2::text)),'{pendingDart}',$3::jsonb) where id=$1",[privacyMatch.matchId,oldResult,JSON.stringify(oldDart)]);
  const start=await matchAccess(c,privacyMatch.matchId),readyInput={protocolVersion:1,commandId:randomUUID(),matchId:privacyMatch.matchId,expectedStateVersion:start.stateVersion,type:'match.ready',phaseToken:start.state.phaseToken};await matchCommand(c,readyInput,writer,fence);
  const stored=async()=>({state:(await db().query('select state::text state from matches where id=$1',[privacyMatch.matchId])).rows[0].state,events:(await db().query('select sequence,payload::text payload from match_events where match_id=$1 order by sequence',[privacyMatch.matchId])).rows,receipts:(await db().query('select receipt::text receipt from private.match_commands where match_id=$1 order by command_id',[privacyMatch.matchId])).rows});const beforeNames=await stored();
  async function checkPublicName(name:string){
   const snapshot=await matchAccess(c,privacyMatch.matchId),batch=(await matchAccessBatch([c],privacyMatch.matchId)).get(c.id)!,retry=await matchCommand(c,readyInput,writer,fence),resync=await matchCommand(c,{protocolVersion:1,commandId:randomUUID(),matchId:privacyMatch.matchId,expectedStateVersion:snapshot.stateVersion,type:'match.resync',phaseToken:snapshot.state.phaseToken},writer,fence);
   const platform=await bootstrap(c),boot=platform.matches.find(m=>m.id===privacyMatch.matchId)!;for(const view of [snapshot,batch,retry,resync,boot]){assert.equal(view.state.names[1],name);assert.equal(view.state.lastResult,name+' · D20 — 40 punten');assert.equal(view.state.pendingDart!.opponentName,name);assert.ok(!JSON.stringify(view.state).includes(legacyName));}
   assert.equal(platform.tournaments.find(t=>t.id===tournamentId)!.participants[0].name,name);assert.equal(platform.seasons.find(s=>s.id===seasonId)!.members[0].name,name);assert.equal((await publicProjection()).divisions.find(d=>d.id===divisionId)!.standings[0].name,name);assert.deepEqual(await storedModels(),originalModels,'Competition display projections preserve persisted participant models');
   assert.deepEqual(await stored(),beforeNames,'Public name projections preserve original state, events and stored receipts');assert.equal((await chatHistory(c,channel)).find(m=>m.id===legacyJoin.id)!.actor_name,name);
  }
  await filterAction(own,{action:'require-rename',targetId:d.id,reason:'Verify legacy active match name safety'});const activeAlias=(await actorById(d.id,d.expiresAt)).username!;await checkPublicName(activeAlias);await db().query("update profiles set status='suspended' where id=$1",[d.id]);try{const missing=await bootstrap(c);assert.equal(missing.players.some(p=>p.id===d.id),false);assert.equal(missing.tournaments.find(t=>t.id===tournamentId)!.participants[0].name,activeAlias);assert.equal(missing.seasons.find(s=>s.id===seasonId)!.members[0].name,activeAlias);assert.equal((await publicProjection()).divisions.find(d=>d.id===divisionId)!.standings[0].name,activeAlias);}finally{await db().query("update profiles set status='active' where id=$1",[d.id]);}await renameProfile(await actorById(d.id,d.expiresAt),{username:prefix+'Safe'});await checkPublicName(prefix+'Safe');assert.equal((await db().query('select actor_name from chat_messages where id=$1',[legacyJoin.id])).rows[0].actor_name,legacyName);
  await transaction(async client=>{const m=(await client.query('select * from matches where id=$1 for update',[privacyMatch.matchId])).rows[0];await finishMatch(client,m,m.state,'abandoned',null);});const originalResult=(await db().query('select data::text data,result_hash from match_results where match_id=$1',[privacyMatch.matchId])).rows[0];
  await filterAction(own,{action:'require-rename',targetId:d.id,reason:'Verify completed history name safety'});const historyAlias=(await actorById(d.id,d.expiresAt)).username!;
  for(const name of [historyAlias,prefix+'Final']){if(name!==historyAlias)await renameProfile(await actorById(d.id,d.expiresAt),{username:name});const record=(await matchHistory(c,{})).find(m=>m.id===privacyMatch.matchId)!;assert.equal(record.players.find((p:any)=>p.id===d.id).name,name);assert.equal(record.data.names[1],name);assert.equal(record.data.lastResult,name+' · D20 — 40 punten');assert.equal(record.data.pendingDart.opponentName,name);assert.ok(!JSON.stringify(record).includes(legacyName));assert.deepEqual((await db().query('select data::text data,result_hash from match_results where match_id=$1',[privacyMatch.matchId])).rows[0],originalResult,'History projection preserves the original result JSON and hash');}
 }finally{await db().query("update matches set lifecycle='cancelled' where id=$1 and lifecycle not in('completed','abandoned')",[privacyMatch.matchId]);await db().query('delete from active_player_reservations where match_id=$1',[privacyMatch.matchId]);await db().query('delete from tournaments where id=$1',[tournamentId]);await db().query('delete from seasons where id=$1',[seasonId]);}
 const result={ok:true,...boundaryChecks,typedVisitsUnique:true,renewalsDoNotCount:true,systemUnreadExcluded:true,expiredVisitNewId:true,deniedJoinNoEvent:true,duplicateIntentOnce:true,retriesNoNewQuota:true,burstAtomic:true,duplicateNormalized:true,minuteBudget30:true,historyCursor:true,redactionReconnectTombstone:true,redactionImmutableMessageOrder:true,redactionOnceNoUnread:true,filterReasonAndVersionAudited:true,allChannelFilters:true,onboardRenameFilter:true,exceptionsAllowed:true,ownerRulesImmediate:true,forcedRenameStableIdAlias:true,forcedRenameSafeLegacyJoin:true,forcedRenameSafeMatchViewsAndReceipts:true,forcedRenameSafeCompletedHistory:true,nameProjectionPreservesStoredHistory:true,moderationRoomOnly:true,dmNoModeration:true,revokedRightsEffective:true,revokeAuditOnce:true,forgedModerationMessageRoomRejected:true,moderatorLeavingRoomDenied:true,deniedModerationNoAuditOrSanction:true,bothBusyInvitesRejected:true,pausedReservationBusy:true,staleInviteCancelled:true,spectatorMessageReportContext:true,forgedMatchReportRejected:true};await writeFile('artifacts/chat-moderation-result.json',JSON.stringify(result,null,2));console.log('Chat visits, atomic quotas, editable filters, rename, scopes and reserved invites passed');
}finally{await db().end();await(await redis()).quit();}
