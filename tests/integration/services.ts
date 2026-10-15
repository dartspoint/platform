import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {db,redis,transaction} from '../../packages/data/src/db';
import {authAdmin,actorById,type Actor} from '../../packages/data/src/auth';
import {onboard,joinRoom,preferences,social,privateChannel,chatPreference,sendMessage,chatHistory} from '../../packages/data/src/community';
import {adminAction,moderate,report} from '../../packages/data/src/admin';
import {publicProjection,bootstrap,roomsProjection} from '../../packages/data/src/projections';
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,'127.0.0.1');
const prefix='qa'+randomUUID().slice(0,8),admin=authAdmin();
async function fixture(index:number){const email=`${prefix}-${index}@dartspoint.local`;const {data,error}=await admin.auth.admin.createUser({email,email_confirm:true});assert.equal(error,null,'Fixture Auth creation failed');const id=data.user!.id;await onboard(await actorById(id,Date.now()+3600000,false),{username:prefix+index});return actorById(id,Date.now()+3600000);}
const actors:Actor[]=[];for(let i=0;i<52;i+=4)actors.push(...await Promise.all(Array.from({length:Math.min(4,52-i)},(_,n)=>fixture(i+n))));
const [a,b,c,owner,staff]=actors;
try{
 for(const actor of actors){assert.equal(actor.role,'player');const rating=(await db().query('select rating,ranked_played from player_ratings where user_id=$1',[actor.id])).rows[0];assert.equal(Number(rating.rating),1500);assert.equal(rating.ranked_played,0);}
 const room=(await db().query("insert into community_rooms(name,slug,description,capacity) values($1,$1,'Explicit isolated QA fixture',50) returning id",[prefix])).rows[0].id;
 await db().query("insert into channels(kind,room_id) values('community',$1)",[room]);
 const joined=await Promise.allSettled(actors.map(actor=>joinRoom(actor,{roomId:room})));
 assert.equal(joined.filter(r=>r.status==='fulfilled').length,50);assert.equal(joined.filter(r=>r.status==='rejected').length,2);
 await Promise.all([joinRoom(a,{roomId:room}),joinRoom(a,{roomId:room})]);assert.equal(Number((await db().query('select count(*) n from room_memberships where room_id=$1',[room])).rows[0].n),50);
 // An expired lease in the same room must not bypass the atomic capacity gate.
 const rejected=actors[joined.findIndex(r=>r.status==='rejected')];await db().query("insert into room_memberships(user_id,room_id,lease_until) values($1,$2,now()-interval '1 minute') on conflict(user_id) do update set room_id=$2,lease_until=excluded.lease_until",[rejected.id,room]);await assert.rejects(joinRoom(rejected,{roomId:room}),{code:'room_full'});
 await preferences(b,{privateMessages:'friends'});await assert.rejects(privateChannel(a,{targetId:b.id}),{code:'private_messages_closed'});
 await social(a,{action:'request',targetId:b.id});await assert.rejects(social(a,{action:'accept',targetId:b.id}));await social(b,{action:'accept',targetId:a.id});
 const channel=await privateChannel(a,{targetId:b.id});await chatPreference(b,{channelId:channel.channelId,closed:true,draft:'Bewaard concept'});
 const message={channelId:channel.channelId,clientMessageId:randomUUID(),body:'Werkelijk privébericht'};const [first,second]=await Promise.all([sendMessage(a,message),sendMessage(a,message)]);assert.deepEqual(first,second);
 await assert.rejects(sendMessage(a,{...message,body:'Gewijzigd'}),{code:'idempotency_conflict'});await assert.rejects(chatHistory(c,channel.channelId));
 await preferences(b,{privateMessages:"nobody"});await assert.rejects(sendMessage(a,{...message,clientMessageId:randomUUID()}),{code:"private_messages_closed"});await preferences(b,{privateMessages:"friends"});
 const preference=(await db().query('select * from chat_preferences where channel_id=$1 and user_id=$2',[channel.channelId,b.id])).rows[0];assert.ok(preference.closed_at);assert.equal(preference.draft,'Bewaard concept');assert.equal((await chatHistory(b,channel.channelId)).length,1);
 await social(b,{action:'mute',targetId:a.id});assert.equal((await chatHistory(b,channel.channelId)).length,0);await social(b,{action:'unmute',targetId:a.id});
 await social(b,{action:'block',targetId:a.id});await assert.rejects(sendMessage(a,{...message,clientMessageId:randomUUID()}),{code:'blocked'});await assert.rejects(privateChannel(a,{targetId:b.id}),{code:'blocked'});await social(b,{action:'unblock',targetId:a.id});
 // Privileged fixture roles are explicit, local-only and never seeded into deployment.
 await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1),($2,'admin',$1)",[owner.id,staff.id]);const own=await actorById(owner.id,owner.expiresAt),mod=await actorById(staff.id,staff.expiresAt);
 await assert.rejects(adminAction(a,{action:'role',args:[a.id,'owner']}),{code:'forbidden'});await assert.rejects(adminAction(mod,{action:'role',args:[a.id,'owner']}),{code:'forbidden'});await assert.rejects(moderate(mod,{targetId:owner.id,kind:'suspend',reason:'Test owner protection',minutes:1}),{code:'owner_protected'});
 await assert.rejects(adminAction(own,{action:"role",args:[own.id,"player"]}),{code:"self_role_protected"});
 await adminAction(own,{action:'role',args:[c.id,'vip']});assert.equal((await actorById(c.id,c.expiresAt)).role,'vip');await assert.rejects(adminAction(await actorById(c.id,c.expiresAt),{action:'role',args:[a.id,'admin']}),{code:'forbidden'});
 // Capture genuine private evidence, forbid outsiders, and deliver a single resolution.
 const messageId=(await db().query('select id from chat_messages where channel_id=$1',[channel.channelId])).rows[0].id;
 await assert.rejects(report(c,{targetId:a.id,reason:'Ongewenst bericht',messageId}),{code:'forbidden'});
 const reported=await report(b,{targetId:a.id,reason:'Ongewenst bericht',messageId,channelId:channel.channelId});
 const duplicateInput={targetId:a.id,reason:'Herhaalbare technische melding',messageId,channelId:channel.channelId,clientRequestId:randomUUID()};const duplicates=await Promise.all([report(b,duplicateInput),report(b,duplicateInput)]);assert.equal(duplicates[0].id,duplicates[1].id);assert.equal(duplicates[0].ticketId,duplicates[1].ticketId);assert.equal((await db().query('select count(*) n from private.support_tickets where id=$1',[duplicates[0].ticketId])).rows[0].n,'1');
 const saved=(await db().query('select * from private.moderation_cases where id=$1',[reported.id])).rows[0];assert.equal(saved.evidence.message.body,message.body);assert.equal(saved.evidence.channel.id,channel.channelId);assert.equal(saved.room_id,null);
 const response='Je melding is onderzocht en afgehandeld.';await adminAction(own,{action:'case',args:[reported.id,'resolved',response]});await adminAction(own,{action:'case',args:[reported.id,'resolved',response]});
 assert.equal((await db().query("select count(*) n from private.outbox_events where kind='report-resolution' and payload->>'caseId'=$1",[reported.id])).rows[0].n,'1');
 assert.equal((await bootstrap(b)).social.reports.find(r=>r.id===reported.id)?.response,response);assert.equal((await bootstrap(c)).social.reports.some(r=>r.id===reported.id),false);
 await adminAction(own,{action:'room-close',args:[room]});await assert.rejects(joinRoom(rejected,{roomId:room}),{code:'room_unavailable'});assert.equal((await db().query('select count(*) n from room_memberships where room_id=$1',[room])).rows[0].n,'51');
 assert.ok((await roomsProjection(false,a.id)).some(r=>r.id===room));assert.equal((await roomsProjection()).some(r=>r.id===room),false);
 const anonymous=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const table of ['profiles','player_ratings','chat_messages','matches']){const result=await anonymous.from(table).select('*');assert.ok(result.error||result.data?.length===0,'Anonymous access leaked private rows');}
 const publicData=await publicProjection();const text=JSON.stringify(publicData);for(const forbidden of ['@dartspoint.local','Bewaard concept','Werkelijk privébericht','sessionVersion','resolution','source_event'])assert.equal(text.includes(forbidden),false);
 await writeFile('artifacts/services-result.json',JSON.stringify({ok:true,newUsersNormal1500:true,roomCapacity50:true,twoTabsCountOnce:true,expiredLeaseNoBypass:true,friendsRecipientOnly:true,privateTwoMembers:true,privatePolicy:true,closedDraftPersists:true,chatReceipts:true,personalMuteSeparate:true,blockBothDirections:true,ownerProtected:true,adminCannotGrant:true,vipNoStaff:true,reportEvidenceScoped:true,reportResolutionOnce:true,ownReportFeedback:true,roomClosePreservesMembers:true,anonymousRls:true,publicAllowlist:true},null,2));console.log('Atomic rooms, social/chat persistence, reports, roles, RLS and public projection passed');
}finally{await db().end();await (await redis()).quit();}
