import {z} from 'zod';
import type {PoolClient} from 'pg';
import {db,transaction,audit,outbox,rateLimit,redis} from './db';
import {actorById,type Actor} from './auth';
import {requireThat,usernameSchema as username,uuid} from '../../contracts/src/index';

export async function onboard(actor:Actor,input:unknown){
 const name=username.parse(z.object({username}).strict().parse(input).username);
 return transaction(async c=>{
  const row=(await c.query('select * from profiles where id=$1 for update',[actor.id])).rows[0];
  requireThat(!row.onboarded_at,'already_onboarded',409);
  try{await c.query('update profiles set username=$2,onboarded_at=now(),updated_at=now(),version=version+1 where id=$1',[actor.id,name]);}
  catch(e){if((e as {code:string}).code==='23505') throw new Error('username_unavailable');throw e;}
  await c.query('insert into player_ratings(user_id) values($1) on conflict do nothing',[actor.id]);
  const defaults=(await c.query("select data->'platform'->>'privateMessages' policy from private.system_settings where key='settings'")).rows[0]?.policy??'everyone';await c.query('insert into preferences(user_id,data) values($1,$2) on conflict do nothing',[actor.id,JSON.stringify({privateMessages:defaults})]);
  await audit(c,actor.id,'profile.onboard',actor.id,{username:name});
  await outbox(c,'welcome:'+actor.id,'welcome',actor.id,{username:name});
  return {id:actor.id,username:name,role:'player',rating:1500};
 });
}
export async function target(c:PoolClient,id:string){
 uuid.parse(id); const p=(await c.query('select id,username,status from profiles where id=$1 and onboarded_at is not null',[id])).rows[0];
 requireThat(p && p.status==='active','player_unavailable',404);return p;
}
export async function blocked(c:PoolClient,a:string,b:string){return !!(await c.query('select 1 from user_blocks where (blocker_id=$1 and blocked_id=$2) or (blocker_id=$2 and blocked_id=$1)',[a,b])).rowCount;}
export async function ensureChannelReadState(c:PoolClient,userId:string,channelId:string){
 await c.query('insert into channel_memberships(channel_id,user_id,last_read_cursor) select id,$2,cursor from channels where id=$1 on conflict(channel_id,user_id) do update set left_at=null',[channelId,userId]);
}
export async function currentRoomMembership(c:PoolClient,actor:Actor,expectedRoomId?:string){
 const membership=(await c.query('select room_id from room_memberships where user_id=$1 and lease_until>now()',[actor.id])).rows[0];
 requireThat(membership&&(!expectedRoomId||membership.room_id===expectedRoomId),'join_room_first',403,'Kies eerst een kamer om te oefenen.');
 await roomAccess(c,actor,membership.room_id);return membership.room_id as string;
}
export async function roomAccess(c:PoolClient,actor:Actor,roomId:string,join=false){
 uuid.parse(roomId);
 const room=(await c.query('select * from community_rooms where id=$1'+(join?' for update':''),[roomId])).rows[0];
 requireThat(room && (!join||room.status!=='closed'),'room_unavailable',403);
 requireThat(room.status!=='private' || ['admin','owner'].includes(actor.role) || (await c.query('select 1 from room_access where room_id=$1 and user_id=$2',[roomId,actor.id])).rowCount,'room_private',403);
 requireThat(!(await c.query("select 1 from sanctions where target_id=$1 and room_id=$2 and kind in('remove','suspend') and revoked_at is null and starts_at<=now() and ends_at>now()",[actor.id,roomId])).rowCount,'room_removed',403);
 const rating=Number((await c.query('select rating from player_ratings where user_id=$1',[actor.id])).rows[0]?.rating??1500);
 requireThat(rating>=room.min_rating && rating<=room.max_rating,'room_rating_restricted',403);
 return room;
}
export async function joinRoom(actor:Actor,input:unknown){
 const {roomId}=z.object({roomId:uuid}).strict().parse(input);
 return transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['presence:'+actor.id]);
  const room=await roomAccess(c,actor,roomId,true);
  const current=(await c.query('select room_id,lease_until from room_memberships where user_id=$1',[actor.id])).rows[0];
  requireThat(!(await c.query("select 1 from active_player_reservations r join matches m on m.id=r.match_id where r.user_id=$1 and m.room_id<>$2",[actor.id,roomId])).rowCount,'active_match_in_other_room',409);
  if(current?.room_id!==roomId||new Date(current.lease_until).getTime()<=Date.now()){const count=Number((await c.query('select count(*) n from room_memberships where room_id=$1 and lease_until>now()',[roomId])).rows[0].n);requireThat(count<room.capacity,'room_full',409);}
  await c.query("insert into room_memberships(user_id,room_id,lease_until) values($1,$2,now()+interval '60 seconds') on conflict(user_id) do update set room_id=$2,lease_until=excluded.lease_until,joined_at=case when room_memberships.room_id=$2 then room_memberships.joined_at else now() end",[actor.id,roomId]);
  const channel=(await c.query("select id from channels where room_id=$1 and kind='community'",[roomId])).rows[0];
  if(channel)await ensureChannelReadState(c,actor.id,channel.id);
  return {roomId};
 });
}
export async function heartbeat(actor:Actor){return transaction(async c=>{
 const member=(await c.query('select room_id from room_memberships where user_id=$1 and lease_until>now()',[actor.id])).rows[0];
 if(!member)return {ok:false,code:'room_membership_expired'};
 await roomAccess(c,actor,member.room_id);
 await c.query("update room_memberships set lease_until=now()+interval '60 seconds' where user_id=$1 and room_id=$2 and lease_until>now()",[actor.id,member.room_id]);return {ok:true};
});}
const preferencesSchema=z.object({favoriteRooms:z.array(z.string().max(100)).max(50),sound:z.boolean(),lessMotion:z.boolean(),leftHanded:z.boolean(),haptics:z.boolean(),quietTurn:z.boolean(),privateMessages:z.enum(['everyone','friends','nobody']),availability:z.enum(['available','playing','watching'])}).partial().strict();
export async function preferences(actor:Actor,input:unknown){const patch=preferencesSchema.parse(input);await db().query('insert into preferences(user_id,data) values($1,$2) on conflict(user_id) do update set data=preferences.data || excluded.data,updated_at=now()',[actor.id,JSON.stringify(patch)]);return {ok:true};}
export async function social(actor:Actor,input:unknown){
 const {action,targetId}=z.object({action:z.enum(['request','accept','reject','cancel','remove','block','unblock','mute','unmute']),targetId:uuid}).strict().parse(input);
 requireThat(targetId!==actor.id,'self_target');await rateLimit('social:'+actor.id,40,60);
 return transaction(async c=>{
  await target(c,targetId);const [lo,hi]=[actor.id,targetId].sort();
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['pair:'+lo+':'+hi]);
  if(action==='block'){
   await c.query('insert into user_blocks values($1,$2) on conflict do nothing',[actor.id,targetId]);
   await c.query("update friend_requests set state='cancelled',updated_at=now() where state='pending' and least(sender_id,recipient_id)=$1 and greatest(sender_id,recipient_id)=$2",[lo,hi]);
   await c.query('delete from friendships where user_low=$1 and user_high=$2',[lo,hi]);
  }else if(action==='unblock')await c.query('delete from user_blocks where blocker_id=$1 and blocked_id=$2',[actor.id,targetId]);
  else if(action==='mute')await c.query('insert into personal_mutes values($1,$2) on conflict do nothing',[actor.id,targetId]);
  else if(action==='unmute')await c.query('delete from personal_mutes where user_id=$1 and muted_id=$2',[actor.id,targetId]);
  else{
   requireThat(!await blocked(c,actor.id,targetId),'blocked',403);
   if(action==='request'){
    requireThat(!(await c.query('select 1 from friendships where user_low=$1 and user_high=$2',[lo,hi])).rowCount,'already_friends',409);
    const size=Number((await c.query('select count(*) n from friendships where $1 in(user_low,user_high)',[actor.id])).rows[0].n);requireThat(size<200,'friends_full',409);
    const r=await c.query('insert into friend_requests(sender_id,recipient_id) values($1,$2) returning id',[actor.id,targetId]);
    await outbox(c,'friend-request:'+r.rows[0].id,'friend-request',targetId,{name:actor.username,senderId:actor.id});
   }else if(action==='remove')await c.query('delete from friendships where user_low=$1 and user_high=$2',[lo,hi]);
   else{
    const sender=action==='cancel'?actor.id:targetId,recipient=action==='cancel'?targetId:actor.id;
    const r=await c.query("update friend_requests set state=$3,updated_at=now() where sender_id=$1 and recipient_id=$2 and state='pending' returning id",[sender,recipient,action==='accept'?'accepted':action==='cancel'?'cancelled':'rejected']);requireThat(r.rowCount,'request_not_pending',409);
    if(action==='accept'){const size=await c.query('select user_id,count(*) n from (select user_low user_id from friendships union all select user_high from friendships) x where user_id=any($1::uuid[]) group by user_id',[[actor.id,targetId]]);requireThat(size.rows.every(r=>Number(r.n)<200),'friends_full',409);await c.query('insert into friendships(user_low,user_high) values($1,$2) on conflict do nothing',[lo,hi]);}
   }
  }
  return {ok:true};
 });
}
export async function privateChannel(actor:Actor,input:unknown){
 const {targetId}=z.object({targetId:uuid}).strict().parse(input);requireThat(targetId!==actor.id,'self_target');
 return transaction(async c=>{
  await target(c,targetId);requireThat(!await blocked(c,actor.id,targetId),'blocked',403);
  const [lo,hi]=[actor.id,targetId].sort();await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['pair:'+lo+':'+hi]);
  let ch=(await c.query("select * from channels where kind='private' and user_low=$1 and user_high=$2",[lo,hi])).rows[0];
  if(!ch){
   const policy=(await c.query('select data from preferences where user_id=$1',[targetId])).rows[0]?.data?.privateMessages??'everyone';
   const friend=(await c.query('select 1 from friendships where user_low=$1 and user_high=$2',[lo,hi])).rowCount;
   requireThat(policy==='everyone'||(policy==='friends'&&friend),'private_messages_closed',403);
   ch=(await c.query("insert into channels(kind,user_low,user_high) values('private',$1,$2) returning *",[lo,hi])).rows[0];
   await c.query('insert into channel_memberships(channel_id,user_id) values($1,$2),($1,$3)',[ch.id,lo,hi]);
   await c.query('insert into chat_preferences(channel_id,user_id) values($1,$2),($1,$3)',[ch.id,lo,hi]);
  }
  await c.query('update chat_preferences set closed_at=null where channel_id=$1 and user_id=$2',[ch.id,actor.id]);return {channelId:ch.id};
 });
}
export async function channelAccess(c:PoolClient,actor:Actor,channelId:string,writing=false){
 const ch=(await c.query('select * from channels where id=$1',[uuid.parse(channelId)])).rows[0];requireThat(ch,'channel_not_found',404);
 let roomId:string|undefined;
 if(ch.kind==='private'){requireThat([ch.user_low,ch.user_high].includes(actor.id),'forbidden',403);requireThat(!await blocked(c,ch.user_low,ch.user_high),'blocked',403);if(writing){const recipient=ch.user_low===actor.id?ch.user_high:ch.user_low;const policy=(await c.query('select data from preferences where user_id=$1',[recipient])).rows[0]?.data?.privateMessages??'everyone';requireThat(policy==='everyone'||policy==='friends'&&(await c.query('select 1 from friendships where user_low=$1 and user_high=$2',[ch.user_low,ch.user_high])).rowCount,'private_messages_closed',403);}}
 else{
  roomId=ch.room_id;
  if(ch.kind==='match'){const m=(await c.query('select room_id from matches where id=$1',[ch.match_id])).rows[0];requireThat(m,'not_found',404);roomId=m.room_id;}
  await roomAccess(c,actor,roomId!);
  requireThat((await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>now()',[actor.id,roomId])).rowCount,'join_room_first',403);
 }
 if(writing){requireThat(!(await c.query("select 1 from sanctions where target_id=$1 and kind in('mute','suspend') and (room_id is null or room_id=$2) and revoked_at is null and starts_at<=now() and ends_at>now()",[actor.id,roomId??null])).rowCount,'muted',403);}
 await ensureChannelReadState(c,actor.id,ch.id);
 return ch;
}
export async function chatHistory(actor:Actor,channelId:string){return transaction(async c=>{await channelAccess(c,actor,channelId);return (await c.query('select m.id,m.seq,m.body,p.id sender_id,p.username,m.created_at from chat_messages m join profiles p on p.id=m.sender_id where m.channel_id=$1 and m.redacted_at is null and not exists(select 1 from personal_mutes u where u.user_id=$2 and u.muted_id=m.sender_id) and not exists(select 1 from user_blocks b where (b.blocker_id=$2 and b.blocked_id=m.sender_id) or (b.blocked_id=$2 and b.blocker_id=m.sender_id)) order by m.seq desc limit 80',[channelId,actor.id])).rows.reverse();});}
export async function resolveChannel(actor:Actor,input:unknown){const {kind,target}=z.object({kind:z.enum(['private','room','match']),target:z.string().min(1).max(150)}).strict().parse(input);return transaction(async c=>{
 let row;
 if(kind==='room')row=(await c.query("select c.id from channels c join community_rooms r on r.id=c.room_id where (r.id::text=$1 or r.name=$1) and c.kind='community'",[target])).rows[0];
 if(kind==='match')row=(await c.query("select id from channels where match_id=$1 and kind='match'",[uuid.parse(target)])).rows[0];
 if(kind==='private'){const user=(await c.query('select id from profiles where username_key=lower($1)',[target])).rows[0];requireThat(user,'not_found',404);const [lo,hi]=[actor.id,user.id].sort();row=(await c.query("select id from channels where user_low=$1 and user_high=$2 and kind='private'",[lo,hi])).rows[0];}
 requireThat(row,'channel_not_found',404);await channelAccess(c,actor,row.id);return {channelId:row.id};
 });}
export async function sendMessage(actor:Actor,input:unknown){
 const {channelId,clientMessageId,body}=z.object({channelId:uuid,clientMessageId:uuid,body:z.string().trim().min(1).max(2000)}).strict().parse(input);
 await rateLimit('chat:'+actor.id,30,60);
 const result=await transaction(async c=>{
  await channelAccess(c,actor,channelId,true);
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['chat:'+actor.id+':'+clientMessageId]);
  const existing=(await c.query('select id,channel_id,body from chat_messages where sender_id=$1 and client_message_id=$2',[actor.id,clientMessageId])).rows[0];
  if(existing){requireThat(existing.channel_id===channelId&&existing.body===body,'idempotency_conflict',409);return {id:existing.id};}
  const slow=Number((await c.query("select data->'platform'->>'chatSlowMode' seconds from private.system_settings where key='settings'")).rows[0]?.seconds??0);if(slow>0){const r=await import('./db');requireThat(await(await r.redis()).set('dartspoint:chat-slow:'+actor.id,'1',{NX:true,EX:slow}),'chat_slow_mode',429);}
  const seq=(await c.query('update channels set cursor=cursor+1 where id=$1 returning cursor',[channelId])).rows[0].cursor;
  const r=await c.query('insert into chat_messages(channel_id,sender_id,client_message_id,seq,body) values($1,$2,$3,$4,$5) returning id',[channelId,actor.id,clientMessageId,seq,body]);return r.rows[0];
 });
 // Commit first. Notifications carry IDs only; persistence never depends on delivery.
 try{
  const recipients=await db().query(`select cm.user_id from channel_memberships cm join channels c on c.id=cm.channel_id left join matches m on m.id=c.match_id
   where c.id=$1 and (c.kind='private' and cm.user_id in(c.user_low,c.user_high) or c.kind<>'private' and exists(select 1 from room_memberships rm where rm.user_id=cm.user_id and rm.room_id=coalesce(c.room_id,m.room_id) and rm.lease_until>now()))`,[channelId]);
  await(await redis()).publish('dartspoint:chat-events',JSON.stringify({channelId,messageId:result.id,userIds:recipients.rows.map(r=>r.user_id)}));
 }catch{console.error(JSON.stringify({event:'chat_notification_delayed'}));}
 return result;
}
export async function chatPreference(actor:Actor,input:unknown){const p=z.object({channelId:uuid,closed:z.boolean().optional(),draft:z.string().max(2000).optional(),readCursor:z.number().int().min(0).optional()}).strict().parse(input);return transaction(async c=>{await channelAccess(c,actor,p.channelId);if(p.closed!==undefined||p.draft!==undefined)await c.query('insert into chat_preferences(channel_id,user_id,closed_at,draft) values($1,$2,case when $3 then now() else null end,coalesce($4,\'\')) on conflict(channel_id,user_id) do update set closed_at=case when $3::boolean is null then chat_preferences.closed_at when $3 then now() else null end,draft=coalesce($4,chat_preferences.draft)',[p.channelId,actor.id,p.closed??null,p.draft??null]);if(p.readCursor!==undefined)await c.query('update channel_memberships set last_read_cursor=greatest(last_read_cursor,least($3,(select cursor from channels where id=$1))) where channel_id=$1 and user_id=$2',[p.channelId,actor.id,p.readCursor]);return {ok:true};});}
