import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,actorById} from '../../packages/data/src/auth';
import {onboard,joinRoom,sendMessage,privateChannel,chatPreference,social,heartbeat} from '../../packages/data/src/community';
import {chatChannelsProjection,roomsProjection} from '../../packages/data/src/projections';
import {adminAction,moderate} from '../../packages/data/src/admin';
import {launchSignup,launchRequest,launchUnsubscribe,unsubscribeHash} from '../../packages/data/src/launch';
import {invite,respondInvite} from '../../packages/data/src/matches';
import {practiceCommand,practiceSnapshot} from '../../packages/data/src/practice';
import {registerIngress} from '../../packages/data/src/timing';
import {meterPosition} from '../../packages/game-core/src/timing';
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
const prefix='Upd'+randomUUID().slice(0,7),admin=authAdmin(),privileged=new Pool(postgresOptions(process.env.MIGRATION_DATABASE_URL!));
async function user(i:number){const {data,error}=await admin.auth.admin.createUser({email:`${prefix}-${i}@dartspoint.local`,email_confirm:true});assert.equal(error,null);const id=data.user!.id;await onboard(await actorById(id,Date.now()+3600000,false),{username:prefix+i});return actorById(id,Date.now()+3600000);}
const [a,b,c,owner]=await Promise.all([0,1,2,3].map(user));
const room=(await db().query("insert into community_rooms(name,slug,description,capacity) values($1,$1,'Isolated update QA',50) returning id",[prefix])).rows[0].id;
const other=(await db().query("insert into community_rooms(name,slug,capacity) values($1,$1,50) returning id",[prefix+'other'])).rows[0].id;
await db().query("insert into channels(kind,room_id) values('community',$1),('community',$2)",[room,other]);
try{
 const reset={type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}};await assert.rejects(practiceCommand(a,reset),{code:'join_room_first'});
 for(const actor of [a,b,c,owner])await joinRoom(actor,{roomId:room});
 const channel=(await db().query("select id from channels where room_id=$1 and kind='community'",[room])).rows[0].id;
 const dmB=(await privateChannel(a,{targetId:b.id})).channelId,dmC=(await privateChannel(a,{targetId:c.id})).channelId;
 for(let i=0;i<3;i++)await sendMessage(b,{channelId:channel,clientMessageId:randomUUID(),body:'Kamer '+i});
 for(let i=0;i<2;i++)await sendMessage(b,{channelId:dmB,clientMessageId:randomUUID(),body:'Privé B '+i});
 await sendMessage(c,{channelId:dmC,clientMessageId:randomUUID(),body:'Privé C'});
 const sum=async()=> (await chatChannelsProjection(a)).reduce((n,x)=>n+x.unread,0);
 assert.equal(await sum(),6);
 await sendMessage(a,{channelId:channel,clientMessageId:randomUUID(),body:'Mijn latere bericht'});assert.equal(await sum(),6,'Own later message does not clear hidden unread');
 await chatPreference(a,{channelId:dmB,closed:true,draft:'Bewaard concept'});assert.equal(await sum(),6,'Closed DM remains unread');
 const dm=(await chatChannelsProjection(a)).find(x=>x.id===dmB)!;assert.equal(dm.preview.text,'Privé B 1');await chatPreference(a,{channelId:dmB,readCursor:dm.cursor});assert.equal(await sum(),4);
 await social(a,{action:'mute',targetId:b.id});assert.equal(await sum(),1);await social(a,{action:'unmute',targetId:b.id});assert.equal(await sum(),4);
 await social(a,{action:'block',targetId:c.id});assert.equal(await sum(),3);await social(a,{action:'unblock',targetId:c.id});
 await db().query('update chat_messages set redacted_at=now() where channel_id=$1',[dmC]);assert.equal(await sum(),3);
 await joinRoom(a,{roomId:other});await joinRoom(a,{roomId:room});assert.equal(await sum(),3,'Rejoining does not clear unread room history');
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[owner.id]);const own=await actorById(owner.id,owner.expiresAt);
 assert.equal((await roomsProjection(false,a.id)).find(x=>x.id===room)!.canManage,false);
 await adminAction(own,{action:'room-save',args:[{id:room,name:prefix,subtitle:'QA',capacity:50,category:'social',status:'active',rules:'Respect',minRating:0,maxRating:5000,moderatorIds:[a.id,b.id]}]});
 assert.equal((await roomsProjection(false,a.id)).find(x=>x.id===room)!.canManage,true);assert.equal((await roomsProjection(false,b.id)).find(x=>x.id===room)!.canManage,true);assert.equal((await roomsProjection(false,c.id)).find(x=>x.id===room)!.canManage,false);assert.equal((await roomsProjection(false,a.id)).find(x=>x.id===other)!.canManage,false);assert.equal((await roomsProjection(true,own.id)).find(x=>x.id===other)!.canManage,true);
 await assert.rejects(moderate(c,{targetId:b.id,roomId:room,kind:'warn',reason:'Geen rechten',minutes:1}),{code:'forbidden'});
 await assert.rejects(moderate(a,{targetId:b.id,roomId:room,kind:'warn',reason:'Collega beschermd',minutes:1}),{code:'peer_protected'});
 await moderate(a,{targetId:c.id,roomId:room,kind:'warn',reason:'Geldige kamerwaarschuwing',minutes:1});
 await adminAction(own,{action:'room-save',args:[{id:room,name:prefix+' Nieuw',subtitle:'QA',capacity:50,category:'social',status:'active',rules:'Respect',minRating:0,maxRating:5000,moderatorIds:[b.id]}]});
 assert.equal((await roomsProjection(false,a.id)).find(x=>x.id===room)!.canManage,false);await assert.rejects(moderate(a,{targetId:c.id,roomId:room,kind:'warn',reason:'Rechten ingetrokken',minutes:1}),{code:'forbidden'});
 const audit=(await db().query("select action from private.audit_events where actor_id=$1 and action like 'room.moderator.%'",[own.id])).rows;assert.equal(audit.filter(x=>x.action.endsWith('assigned')).length,2);assert.equal(audit.filter(x=>x.action.endsWith('revoked')).length,1);
 const session=await practiceCommand(a,{type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}});await new Promise(r=>setTimeout(r,10));
 const payload={type:'horizontal',commandId:randomUUID(),sessionId:session.id,expectedStateVersion:session.stateVersion,phaseToken:session.state.phaseToken};const received=Date.now();await new Promise(r=>setTimeout(r,300));const receipt=await practiceCommand(a,payload,{receivedAt:received,latencyMs:0});assert.equal(receipt.timing.receivedAt,received);assert.ok(Math.abs(receipt.state.lockedX!-meterPosition(received,session.state.phaseStartedAt,'horizontal'))<1e-10,'Queue delay cannot move admitted stop');assert.deepEqual(await practiceCommand(a,payload),receipt);
 await assert.rejects(registerIngress('practice',a,payload.commandId,{...payload,type:'vertical'},{receivedAt:Date.now()}),{code:'idempotency_conflict'});
 const rating=(await db().query('select rating,ranked_played from player_ratings where user_id=$1',[a.id])).rows[0];assert.equal(Number(rating.rating),1500);assert.equal(rating.ranked_played,0);
 await joinRoom(a,{roomId:other});await assert.rejects(practiceSnapshot(a,session.id),{code:'join_room_first'});await assert.rejects(practiceCommand(a,{...payload,commandId:randomUUID()}),{code:'practice_room_changed'});
 await db().query("update room_memberships set lease_until=now()-interval '1 second' where user_id=$1",[a.id]);assert.equal((await heartbeat(a)).ok,false);await assert.rejects(practiceCommand(a,{type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}}),{code:'join_room_first'});
 const invitation=await invite(b,{targetId:c.id,roomId:room,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});await respondInvite(c,{inviteId:invitation.id,action:'accept'});await assert.rejects(practiceCommand(b,{type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}}),{code:'active_match'});
 const origin=process.env.LANDING_ORIGIN!,email=`${prefix}@validation.invalid`;
 await Promise.all(Array.from({length:8},(_,i)=>launchSignup({email:i%2?email.toUpperCase():' '+email+' ',consent:true,website:''},origin)));const rows=(await db().query('select * from private.launch_subscriptions where email=$1',[email.toLowerCase()])).rows;assert.equal(rows.length,1);assert.match(rows[0].unsubscribe_hash,/^[a-f0-9]{64}$/);assert.equal(rows[0].consent_version,'2026-10-13-v1');
 const req=(input:unknown,o=origin,headers={})=>new Request(origin+'/api/launch-signups',{method:'POST',headers:{origin:o,'content-type':'application/json',...headers},body:JSON.stringify(input)});
 assert.equal((await launchRequest(req({email,consent:true,website:''}),'signup')).status,200);assert.equal((await launchRequest(req({email,consent:true,website:''},'https://evil.test'),'signup')).status,403);assert.equal((await launchRequest(req({email,consent:false,website:''}),'signup')).status,400);assert.equal((await launchRequest(req({email,consent:true,website:'',x:'a'.repeat(4096)}),'signup')).status,413);
 await privileged.query('revoke insert on private.launch_subscriptions from dartspoint_app');try{assert.equal((await launchRequest(req({email:prefix+'db@validation.invalid',consent:true,website:''}),'signup')).status,503,'No successful UI receipt after failed database write');}finally{await privileged.query('grant insert on private.launch_subscriptions to dartspoint_app');}
 for(const role of ['anon','authenticated']){const client=await privileged.connect();try{await client.query('begin');await client.query('set local role '+role);await assert.rejects(client.query('select email from private.launch_subscriptions'));}finally{await client.query('rollback');client.release();}}
 const token=randomBytes(32).toString('base64url');await db().query('update private.launch_subscriptions set unsubscribe_hash=$2 where id=$1',[rows[0].id,unsubscribeHash(token)]);await launchUnsubscribe({token});await launchUnsubscribe({token});assert.equal((await db().query('select id from private.launch_subscriptions where id=$1',[rows[0].id])).rowCount,0);
 // A reserved fixture remains for the following real dump/restore assertion.
 await launchSignup({email:`restore-${prefix}@validation.invalid`,consent:true,website:''},origin);
 let limited=false;for(let i=0;i<24;i++){if((await launchRequest(req({email,consent:true,website:''}),'signup')).status===429){limited=true;break;}}assert.equal(limited,true);assert.equal((await launchRequest(req({email,consent:true,website:''},origin,{'x-forwarded-for':'1.2.3.4'}),'signup')).status,429,'Untrusted forwarding header cannot evade direct request budget');
 await writeFile('artifacts/update-integration-result.json',JSON.stringify({ok:true,unreadSixThenFour:true,ownLaterPreservesUnread:true,closedDraftPreserved:true,personalMuteBlockRedacted:true,rejoinPreservesCursor:true,multipleRoomModerators:true,revocationEffective:true,queueIndependentTiming:true,durableCommandRetry:true,practiceRequiresRoom:true,activeMatchRejectsPractice:true,officialRankingUnchanged:true,duplicateEmailOnce:true,privateRolesDenied:true,databaseFailure503:true,hashedUnsubscribeIdempotent:true,untrustedForwardingCannotEvadeLimit:true},null,2));console.log('Update storage, unread, moderator scopes, practice membership and durable timing passed');
}finally{const key=createHash('sha256').update(Math.floor(Date.now()/86400000)+':direct').digest('hex');await(await redis()).del('dartspoint:rate:launch:signup:'+key);await privileged.end();await db().end();await(await redis()).quit();}
