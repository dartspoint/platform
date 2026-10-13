import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {db,redis} from '../../packages/data/src/db';
import {actorById,publicPlayerName} from '../../packages/data/src/auth';
import {bootstrap,playersProjection,publicProjection} from '../../packages/data/src/projections';

// Bulk directory fixtures are strictly local and owned by this invocation.
assert.equal(process.env.APP_ENV,'development');
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
const privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const prefix='Vis'+randomUUID().replaceAll('-','').slice(0,9);
const keys=['actor','live','expired','otherRoom','friend','openDm','closedDm','incomingBlock','outgoingBlock','incomingRequest','outgoingRequest','mute','block','suspended','deleted','unonboarded','missingRating','stranger','cancelledRequest'] as const;
const context=Object.fromEntries(keys.map(key=>[key,randomUUID()])) as Record<typeof keys[number],string>;
const directory=Array.from({length:2001},()=>randomUUID()),ids=[...directory,...Object.values(context)];
const names=ids.map((_,i)=>prefix+String(i).padStart(5,'0'));
const nameOf=(id:string)=>names[ids.indexOf(id)];
const room=randomUUID(),otherRoom=randomUUID(),community=randomUUID(),channels:string[]=[community];
const checks:Record<string,boolean>={};
const pair=(a:string,b:string)=>[a,b].sort();
async function privateFixture(target:string,closed=false){
 const id=randomUUID();channels.push(id);const [low,high]=pair(context.actor,target);
 await privileged.query("insert into channels(id,kind,user_low,user_high) values($1,'private',$2,$3)",[id,low,high]);
 await privileged.query('insert into channel_memberships(channel_id,user_id) values($1,$2),($1,$3)',[id,context.actor,target]);
 await privileged.query('insert into chat_preferences(channel_id,user_id,closed_at) values($1,$2,$3)',[id,context.actor,closed?new Date():null]);return id;
}
try{
 // Auth's real profile trigger runs for every directory identity; no fake client store.
 await privileged.query('insert into auth.users(id) select unnest($1::uuid[])',[ids]);
 await privileged.query('update profiles p set username=fixture.name,onboarded_at=now() from unnest($1::uuid[],$2::text[]) fixture(id,name) where p.id=fixture.id',[ids,names]);
 await privileged.query('insert into player_ratings(user_id,rating) select id,case when id=any($2::uuid[]) then 8000 else 1 end from unnest($1::uuid[]) id',[ids,directory]);
 await privileged.query("insert into preferences(user_id,data) select id,'{}'::jsonb from unnest($1::uuid[]) id",[Object.values(context)]);
 await privileged.query("insert into community_rooms(id,name,slug,capacity,min_rating,max_rating) values($1,$3,$3,50,0,9000),($2,$4,$4,50,0,9000)",[room,otherRoom,prefix,prefix+'Other']);
 await privileged.query("insert into channels(id,kind,room_id) values($1,'community',$2)",[community,room]);
 await privileged.query("insert into room_memberships(user_id,room_id,lease_until) values($1,$4,now()+interval '10 minutes'),($2,$4,now()+interval '10 minutes'),($3,$4,now()-interval '1 second'),($5,$6,now()+interval '10 minutes')",[context.actor,context.live,context.expired,room,context.otherRoom,otherRoom]);
 for(const target of [context.friend,context.suspended,context.deleted,context.unonboarded,context.missingRating])await privileged.query('insert into friendships(user_low,user_high) values($1,$2)',pair(context.actor,target));
 const openDm=await privateFixture(context.openDm);await privateFixture(context.closedDm,true);await privateFixture(context.incomingBlock);await privateFixture(context.outgoingBlock);
 await privileged.query('insert into user_blocks(blocker_id,blocked_id) values($1,$2),($3,$1),($1,$4)',[context.actor,context.block,context.incomingBlock,context.outgoingBlock]);
 await privileged.query('insert into personal_mutes(user_id,muted_id) values($1,$2)',[context.actor,context.mute]);
 await privileged.query("insert into friend_requests(sender_id,recipient_id,state) values($2,$1,'pending'),($1,$3,'pending'),($1,$4,'cancelled')",[context.actor,context.incomingRequest,context.outgoingRequest,context.cancelledRequest]);
 await privileged.query("update profiles set status='suspended' where id=$1",[context.suspended]);await privileged.query("update profiles set status='deleted' where id=$1",[context.deleted]);
 await privileged.query('update profiles set username=null,onboarded_at=null where id=$1',[context.unonboarded]);await privileged.query('delete from player_ratings where user_id=$1',[context.missingRating]);
 const legacyName=prefix+'-geil';await privileged.query('update profiles set username=$2,rename_required=true where id=$1',[context.live,legacyName]);
 const actor=await actorById(context.actor,Date.now()+3600000);
 const base=await playersProjection(),baseIds=new Set(base.map(p=>p.id));
 const expectedBase=(await privileged.query("select p.id from profiles p join player_ratings r on r.user_id=p.id where p.onboarded_at is not null and p.status='active' order by r.rating desc,p.username_key limit 2000")).rows.map(p=>p.id);
 assert.equal(base.length,2000);assert.deepEqual(base.map(p=>p.id),expectedBase);
 for(const id of Object.values(context))assert.equal(baseIds.has(id),false,'Every low-rating context identity is outside the real capped directory');
 checks.originalPublicDirectoryStillCapped=true;
 const scoped=await playersProjection(actor.id),byId=new Map(scoped.map(p=>[p.id,p]));
 const guaranteed=['actor','live','friend','openDm','outgoingBlock','incomingRequest','outgoingRequest','mute','block'] as const;
 for(const key of guaranteed)assert.ok(byId.has(context[key]),'Own '+key+' context must survive a full 2000-player directory');
 for(const key of ['expired','otherRoom','closedDm','incomingBlock','suspended','deleted','unonboarded','missingRating','stranger','cancelledRequest'] as const)assert.equal(byId.has(context[key]),false,key+' does not obtain a new visibility grant');
 assert.equal(scoped.length,2000+guaranteed.length);assert.equal(new Set(scoped.map(p=>p.id)).size,scoped.length);
 for(const id of baseIds)assert.ok(byId.has(id),'The bounded directory is preserved rather than displacing a general profile');
 const live=byId.get(context.live)!;assert.equal(live.name,publicPlayerName(context.live,legacyName,true));assert.equal(live.renameRequired,true);assert.equal(live.rating,1);assert.equal(live.presence.roomId,room);assert.equal(live.presence.online,true);assert.equal(live.invitationAvailable,false);assert.equal(JSON.stringify(scoped).includes(legacyName),false);
 checks.actorRoomFriendsAndOwnSocialGuaranteed=true;checks.aliasPresenceStatusAndRatingsPreserved=true;checks.expiredForeignClosedBlockedAndInactiveExcluded=true;
 const state=await bootstrap(actor);
 assert.ok(state.players.some(p=>p.id===context.actor));assert.ok(state.players.some(p=>p.id===context.live));assert.ok(state.social.friends.includes(nameOf(context.friend)));
 assert.deepEqual(new Set(state.social.friendRequests.map(r=>r.name)),new Set([nameOf(context.incomingRequest),nameOf(context.outgoingRequest)]));
 assert.ok(state.social.muted.includes(nameOf(context.mute)));assert.ok(state.social.blocked.includes(nameOf(context.block)));assert.ok(state.channels.some(c=>c.id===openDm&&c.userId===context.openDm));
 assert.equal(state.social.blocked.includes(''),false);assert.equal(state.social.muted.includes(''),false);
 const publicState=await publicProjection();assert.ok(publicState.players.length<=100);assert.equal(JSON.stringify(publicState).includes(legacyName),false);
 checks.actualBootstrapUsesScopedProjection=true;checks.actorlessPublicProjectionRemainsBounded=true;
 // No authorization/profile cache: safe rename, expired visit, removed friend,
 // completed request and closed private tab affect the next actual SQL read.
 const renamed=prefix+'Safe';await privileged.query('update profiles set username=$2,rename_required=false where id=$1',[context.live,renamed]);
 const fresh=(await playersProjection(actor.id)).find(p=>p.id===context.live)!;assert.equal(fresh.name,renamed);assert.equal(fresh.renameRequired,false);assert.equal(fresh.invitationAvailable,true);
 await privileged.query("update room_memberships set lease_until=now()-interval '1 second' where user_id=$1",[context.actor]);
 await privileged.query('delete from friendships where user_low=$1 and user_high=$2',pair(context.actor,context.friend));
 await privileged.query("update friend_requests set state='cancelled' where $1 in(sender_id,recipient_id)",[context.actor]);
 await privileged.query('update chat_preferences set closed_at=now() where channel_id=$1 and user_id=$2',[openDm,context.actor]);
 const after=new Set((await playersProjection(actor.id)).map(p=>p.id));
 assert.ok(after.has(context.actor));for(const key of ['live','friend','openDm','incomingRequest','outgoingRequest'] as const)assert.equal(after.has(context[key]),false,key+' removed immediately when its last context grant ends');
 assert.ok(after.has(context.mute));assert.ok(after.has(context.block));checks.everyReadUsesFreshProfilesAndRelationships=true;
}finally{
 const client=await privileged.connect();try{
  await client.query('begin');
  await client.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channels]);await client.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await client.query('delete from channels where id=any($1::uuid[])',[channels]);
  await client.query('delete from room_memberships where user_id=any($1::uuid[])',[ids]);await client.query('delete from community_rooms where id=any($1::uuid[])',[[room,otherRoom]]);
  await client.query('delete from friendships where user_low=any($1::uuid[]) or user_high=any($1::uuid[])',[ids]);await client.query('delete from friend_requests where sender_id=any($1::uuid[]) or recipient_id=any($1::uuid[])',[ids]);
  await client.query('delete from personal_mutes where user_id=any($1::uuid[]) or muted_id=any($1::uuid[])',[ids]);await client.query('delete from user_blocks where blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])',[ids]);
  await client.query('delete from preferences where user_id=any($1::uuid[])',[ids]);await client.query('delete from player_ratings where user_id=any($1::uuid[])',[ids]);await client.query('delete from profiles where id=any($1::uuid[])',[ids]);await client.query('delete from auth.users where id=any($1::uuid[])',[ids]);await client.query('commit');
  assert.equal((await client.query('select count(*)::int n from profiles where id=any($1::uuid[])',[ids])).rows[0].n,0);checks.ownedBulkFixturesRemoved=true;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await privileged.end();await db().end();await(await redis()).quit();}
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/player-visibility-result.json',JSON.stringify({ok:true,generalDirectoryCap:2000,ownedProfiles:ids.length,checks},null,2));
console.log('Capped public directory, guaranteed own context, fresh aliases and complete owned fixture cleanup passed');
