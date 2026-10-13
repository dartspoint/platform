import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db,transaction,audit,outbox,rateLimit,redis} from './db';
import {actorById,publicPlayerName,type Actor} from './auth';
import {requireThat,usernameSchema as username,uuid,DomainError} from '../../contracts/src/index';
import {assertContentAllowed,assertContentAllowedWithRules,filterRulesFromRows,normalizeDuplicateText} from './content-filter';

export async function onboard(actor:Actor,input:unknown){
 const raw=z.object({username:z.string().max(80)}).strict().parse(input).username;
 return transaction(async c=>{
  await assertContentAllowed(c,actor,raw,'name','profile.onboard');const name=username.parse(raw);
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
 uuid.parse(id); const p=(await c.query('select id,username,status,rename_required from profiles where id=$1 and onboarded_at is not null',[id])).rows[0];
 requireThat(p && p.status==='active','player_unavailable',404);return {...p,username:publicPlayerName(p.id,p.username,p.rename_required)};
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
 const result=await transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['presence:'+actor.id]);
  const room=await roomAccess(c,actor,roomId,true);
  const current=(await c.query('select room_id,lease_until,visit_id,lease_until>now() valid from room_memberships where user_id=$1',[actor.id])).rows[0];
  requireThat(!(await c.query("select 1 from active_player_reservations r join matches m on m.id=r.match_id where r.user_id=$1 and m.room_id<>$2",[actor.id,roomId])).rowCount,'active_match_in_other_room',409);
  const transition=current?.room_id!==roomId||!current?.valid;
  if(transition){
   const count=Number((await c.query('select count(*) n from room_memberships where room_id=$1 and lease_until>now()',[roomId])).rows[0].n);requireThat(count<room.capacity,'room_full',409);
   const budget=(await c.query("select count(*)::int n,extract(epoch from min(created_at)+interval '60 seconds'-now()) retry from private.room_visits where user_id=$1 and created_at>now()-interval '60 seconds'",[actor.id])).rows[0];
   if(budget.n>=10)throw new DomainError('room_join_rate',429,'Je wisselt erg vaak van kamer. Probeer het zo opnieuw.',Math.max(1,Math.ceil(Number(budget.retry))));
  }
  const visitId=transition?randomUUID():current.visit_id;
  await c.query("insert into room_memberships(user_id,room_id,lease_until,visit_id) values($1,$2,now()+interval '60 seconds',$3) on conflict(user_id) do update set room_id=$2,lease_until=excluded.lease_until,visit_id=$3,joined_at=case when room_memberships.visit_id=$3 then room_memberships.joined_at else now() end",[actor.id,roomId,visitId]);
  const channel=(await c.query("select id from channels where room_id=$1 and kind='community'",[roomId])).rows[0];
  if(channel)await ensureChannelReadState(c,actor.id,channel.id);
  let event:any;
  if(transition){
   await c.query('insert into private.room_visits(id,user_id,room_id) values($1,$2,$3)',[visitId,actor.id,roomId]);
   if(channel){
    const seq=(await c.query('update channels set cursor=cursor+1 where id=$1 returning cursor',[channel.id])).rows[0].cursor;
    const profile=(await c.query('select username,rename_required from profiles where id=$1',[actor.id])).rows[0];const name=publicPlayerName(actor.id,profile.username,profile.rename_required)!;
    event=(await c.query("insert into chat_messages(channel_id,seq,body,kind,event_id,actor_id,actor_name,room_id) values($1,$2,$3,'room.member_joined',$4,$5,$6,$7) returning id,seq",[channel.id,seq,name+' komt de kamer binnen.',visitId,actor.id,name,roomId])).rows[0];
   }
  }
  return {roomId,visitId,channelId:channel?.id,event};
 });
 if(result.event)await publishChatChange(result.channelId!,result.event.id,Number(result.event.seq),'room.member_joined');
 return {roomId:result.roomId,visitId:result.visitId};
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
const systemName=`case when joined.rename_required then 'Speler-'||left(replace(joined.id::text,'-',''),12) else coalesce(joined.username,m.actor_name) end`;
const chatMessageSelect=`select m.id,m.channel_id,m.seq,coalesce(m.change_cursor,m.seq) cursor,m.redacted_at is not null redacted,case when m.redacted_at is not null then null when m.kind='room.member_joined' then (${systemName})||' komt de kamer binnen.' else m.body end body,m.client_message_id,m.sender_id,m.kind,m.event_id,m.actor_id,${systemName} actor_name,m.room_id,
 case when m.kind='room.member_joined' then ${systemName} when p.rename_required then 'Speler-'||left(replace(p.id::text,'-',''),12) else p.username end username,m.created_at
 from chat_messages m left join profiles p on p.id=m.sender_id left join profiles joined on joined.id=m.actor_id`;
/** All reads happen in the snapshot acquired after the separate user lock. */
async function chatSendSnapshot(c:PoolClient,actor:Actor,channelId:string,clientMessageId:string){
 return (await c.query(`with context as (
  select ch.*,game.id is not null match_found,room.id actual_room_id,room.status room_status,room.min_rating,room.max_rating,
   coalesce((select rating from player_ratings where user_id=$1),1500) rating,
   exists(select 1 from user_roles role where role.user_id=$1 and role.role in('admin','owner') and role.revoked_at is null) staff_allowed,
   exists(select 1 from room_access grant_access where grant_access.room_id=room.id and grant_access.user_id=$1) private_grant,
   exists(select 1 from room_memberships membership where membership.user_id=$1 and membership.room_id=room.id and membership.lease_until>now()) live_membership,
   exists(select 1 from sanctions sanction where sanction.target_id=$1 and sanction.room_id=room.id and sanction.kind in('remove','suspend') and sanction.revoked_at is null and sanction.starts_at<=now() and sanction.ends_at>now()) room_removed,
   exists(select 1 from sanctions sanction where sanction.target_id=$1 and (sanction.room_id is null or sanction.room_id=room.id) and sanction.kind in('mute','suspend') and sanction.revoked_at is null and sanction.starts_at<=now() and sanction.ends_at>now()) writing_muted,
   exists(select 1 from user_blocks block where (block.blocker_id=ch.user_low and block.blocked_id=ch.user_high) or (block.blocker_id=ch.user_high and block.blocked_id=ch.user_low)) pair_blocked,
   coalesce((select data->>'privateMessages' from preferences where user_id=case when ch.user_low=$1 then ch.user_high else ch.user_low end),'everyone') private_policy,
   exists(select 1 from friendships friend where friend.user_low=ch.user_low and friend.user_high=ch.user_high) friends
  from channels ch left join matches game on game.id=ch.match_id left join community_rooms room on room.id=coalesce(ch.room_id,game.room_id) where ch.id=$2
 ) select (select row_to_json(context) from context) context,
  (select row_to_json(existing) from(select id,channel_id,body from chat_messages where sender_id=$1 and client_message_id=$3) existing) existing,
  coalesce((select jsonb_agg(rule order by rule.category,rule.term,rule.id) from private.content_filter_rules rule),'[]'::jsonb) rules,
  coalesce((select data->'platform' from private.system_settings where key='settings'),'{}'::jsonb) settings,
  coalesce((select jsonb_agg(recent order by recent.created_at desc) from(select channel_id,body,normalized_body,created_at,extract(epoch from now()-created_at) age from chat_messages where sender_id=$1 and kind='human' and created_at>now()-interval '60 seconds') recent),'[]'::jsonb) recent`,[actor.id,channelId,clientMessageId])).rows[0];
}
function requireChatSendAccess(actor:Actor,ch:any){
 requireThat(ch,'channel_not_found',404);
 if(ch.kind==='private'){
  requireThat([ch.user_low,ch.user_high].includes(actor.id),'forbidden',403);requireThat(!ch.pair_blocked,'blocked',403);
  requireThat(ch.private_policy==='everyone'||ch.private_policy==='friends'&&ch.friends,'private_messages_closed',403);
 }else{
  if(ch.kind==='match')requireThat(ch.match_found,'not_found',404);
  requireThat(ch.actual_room_id,'room_unavailable',403);requireThat(ch.room_status!=='private'||ch.staff_allowed||ch.private_grant,'room_private',403);
  requireThat(!ch.room_removed,'room_removed',403);requireThat(Number(ch.rating)>=ch.min_rating&&Number(ch.rating)<=ch.max_rating,'room_rating_restricted',403);
  requireThat(ch.live_membership,'join_room_first',403);
 }
 requireThat(!ch.writing_muted,'muted',403);
}
export async function chatHistory(actor:Actor,channelId:string,after?:number){return transaction(async c=>{
 await channelAccess(c,actor,channelId);
 requireThat(after===undefined||Number.isSafeInteger(after)&&after>=0,'invalid_cursor',400);
 const rows=(await c.query(chatMessageSelect+` where m.channel_id=$1
 and not exists(select 1 from personal_mutes u where u.user_id=$2 and u.muted_id=coalesce(m.sender_id,m.actor_id))
 and not exists(select 1 from user_blocks b where (b.blocker_id=$2 and b.blocked_id=coalesce(m.sender_id,m.actor_id)) or (b.blocked_id=$2 and b.blocker_id=coalesce(m.sender_id,m.actor_id)))
 ${after===undefined?'':'and coalesce(m.change_cursor,m.seq)>$3'} order by coalesce(m.change_cursor,m.seq) ${after===undefined?'desc':'asc'} limit 80`,after===undefined?[channelId,actor.id]:[channelId,actor.id,after])).rows;
 return after===undefined?rows.reverse():rows;
});}
export async function resolveChannel(actor:Actor,input:unknown){const {kind,target}=z.object({kind:z.enum(['private','room','match']),target:z.string().min(1).max(150)}).strict().parse(input);return transaction(async c=>{
 let row;
 if(kind==='room')row=(await c.query("select c.id from channels c join community_rooms r on r.id=c.room_id where (r.id::text=$1 or r.name=$1) and c.kind='community'",[target])).rows[0];
 if(kind==='match')row=(await c.query("select id from channels where match_id=$1 and kind='match'",[uuid.parse(target)])).rows[0];
 if(kind==='private'){const user=(await c.query(uuid.safeParse(target).success?'select id from profiles where id=$1':'select id from profiles where username_key=lower($1)',[target])).rows[0];requireThat(user,'not_found',404);const [lo,hi]=[actor.id,user.id].sort();row=(await c.query("select id from channels where user_low=$1 and user_high=$2 and kind='private'",[lo,hi])).rows[0];}
 requireThat(row,'channel_not_found',404);await channelAccess(c,actor,row.id);return {channelId:row.id};
 });}
export async function sendMessage(actor:Actor,input:unknown){
 const {channelId,clientMessageId,body}=z.object({channelId:uuid,clientMessageId:uuid,body:z.string().trim().min(1).max(2000)}).strict().parse(input);
 await rateLimit('chat-endpoint:'+actor.id,120,60);
 const result=await transaction(async c=>{
  // Acquire the lock in a separate statement. Reads in the next statement must
  // see earlier senders' commits even when this transaction waited for the lock.
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['chat-send:'+actor.id]);
  const snapshot=await chatSendSnapshot(c,actor,channelId,clientMessageId);requireChatSendAccess(actor,snapshot.context);
  const existing=snapshot.existing;
  if(existing){requireThat(existing.channel_id===channelId&&existing.body===body,'idempotency_conflict',409);await c.query(`with read_state as (insert into channel_memberships(channel_id,user_id,last_read_cursor) select id,$2,cursor from channels where id=$1 on conflict(channel_id,user_id) do update set left_at=null returning channel_id)
   select channel_id from read_state`,[channelId,actor.id]);
   // A concurrent moderator may redact while the read-state UPSERT waits.
   return (await c.query(chatMessageSelect+' where m.id=$1',[existing.id])).rows[0];}
  assertContentAllowedWithRules(actor,body,'chat','channel:'+channelId,filterRulesFromRows(snapshot.rules));
  const settings=snapshot.settings??{};
  const burst=Math.max(1,Math.min(30,Number(settings.chatBurstCount??3))),window=Math.max(1,Math.min(10,Number(settings.chatBurstSeconds??2))),duplicate=Math.max(0,Math.min(30,Number(settings.chatDuplicateSeconds??2))),slow=Math.max(0,Math.min(60,Number(settings.chatSlowMode??0)));
  const recent=snapshot.recent as Array<{channel_id:string;body:string;normalized_body:string|null;age:number}>;
  if(recent.length>=30)throw new DomainError('chat_rate_limited',429,'Je kunt maximaal 30 nieuwe berichten per minuut verzenden.',Math.max(1,Math.ceil(60-Number(recent.at(-1)!.age))));
  const fast=recent.filter(m=>Number(m.age)<window);
  if(fast.length>=burst)throw new DomainError('chat_burst_limited',429,'Je verstuurt berichten erg snel. Wacht heel even.',Math.max(1,Math.ceil(window-Number(fast.at(-1)!.age))));
  const normalized=normalizeDuplicateText(body);
  const repeated=recent.find(m=>m.channel_id===channelId&&Number(m.age)<duplicate&&(m.normalized_body??normalizeDuplicateText(m.body))===normalized);
  if(repeated)throw new DomainError('chat_duplicate',429,'Dit bericht is zojuist al verstuurd.',Math.max(1,Math.ceil(duplicate-Number(repeated.age))));
  if(slow>0&&recent[0]&&Number(recent[0].age)<slow)throw new DomainError('chat_slow_mode',429,'In deze chat staat langzame modus aan. Wacht '+Math.ceil(slow-Number(recent[0].age))+' seconden.',Math.max(1,Math.ceil(slow-Number(recent[0].age))));
  // Read state precedes cursor advance. Projection needs another statement:
  // profiles may change while this statement waits on a membership/cursor lock.
  const saved=(await c.query(`with read_state as (insert into channel_memberships(channel_id,user_id,last_read_cursor) select id,$2,cursor from channels where id=$1 on conflict(channel_id,user_id) do update set left_at=null returning channel_id),
   next_cursor as (update channels set cursor=cursor+1 where id=$1 and exists(select 1 from read_state) returning cursor),
   inserted as (insert into chat_messages(channel_id,sender_id,client_message_id,seq,body,normalized_body) select $1,$2,$3,cursor,$4,$5 from next_cursor returning *)
   select id from inserted`,[channelId,actor.id,clientMessageId,body,normalized])).rows[0];
  return (await c.query(chatMessageSelect+' where m.id=$1',[saved.id])).rows[0];
 });
 await publishChatChange(channelId,result.id,Number(result.seq),'human',result.redacted,Number(result.cursor));return result;
}
export async function publishChatChange(channelId:string,messageId:string,seq:number,kind:string,redacted=false,cursor=seq){
 // Commit first. Notifications carry IDs only; persistence never depends on delivery.
 try{
  const recipients=await db().query(`select cm.user_id from channel_memberships cm join channels c on c.id=cm.channel_id left join matches m on m.id=c.match_id left join community_rooms room on room.id=coalesce(c.room_id,m.room_id)
   where c.id=$1 and (c.kind='private' and cm.user_id in(c.user_low,c.user_high) and not exists(select 1 from user_blocks b where (b.blocker_id=c.user_low and b.blocked_id=c.user_high) or (b.blocker_id=c.user_high and b.blocked_id=c.user_low))
   or c.kind<>'private' and exists(select 1 from room_memberships rm join profiles p on p.id=rm.user_id join player_ratings pr on pr.user_id=p.id where rm.user_id=cm.user_id and rm.room_id=room.id and rm.lease_until>now() and p.status='active' and pr.rating between room.min_rating and room.max_rating
   and (room.status<>'private' or exists(select 1 from room_access ra where ra.room_id=room.id and ra.user_id=p.id) or exists(select 1 from user_roles ur where ur.user_id=p.id and ur.role in('admin','owner') and ur.revoked_at is null))
   and not exists(select 1 from sanctions s where s.target_id=p.id and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now() and (s.room_id=room.id and s.kind in('remove','suspend') or s.room_id is null and s.kind='suspend'))))`,[channelId]);
  await(await redis()).publish('dartspoint:chat-events',JSON.stringify({channelId,messageId,seq,cursor,kind,redacted,userIds:recipients.rows.map(r=>r.user_id)}));
 }catch{console.error(JSON.stringify({event:'chat_notification_delayed'}));}
}
/** Resolve content only at the authenticated personal inbox delivery boundary.
 * Redis carries IDs; every recipient/session is checked together with the row
 * in one fresh database snapshot. A missed push remains recoverable by history.
 */
export async function personalChatChange(messageId:string,actors:readonly Actor[]){
 const sessions=[...new Map(actors.filter(a=>a.sessionId&&a.expiresAt>Date.now()).map(a=>[a.id+':'+a.sessionId,{user_id:a.id,session_id:a.sessionId,session_version:a.sessionVersion,expires_at:a.expiresAt}])).values()];
 if(!sessions.length)return new Map<string,any>();
 // A community has at most 50 users and a personal inbox at most 20 clients.
 // Unexpected internal fanout fails closed and clients recover through history.
 requireThat(sessions.length<=1000,'chat_delivery_busy',503);
 const rows=(await db().query(`with sessions as(select * from jsonb_to_recordset($2::jsonb) as s(user_id uuid,session_id uuid,session_version integer,expires_at bigint)),message as(${chatMessageSelect} where m.id=$1)
  select s.user_id,s.session_id,row_to_json(message) message from sessions s
  join profiles viewer on viewer.id=s.user_id cross join message
  join channels ch on ch.id=message.channel_id
  join channel_memberships cm on cm.channel_id=ch.id and cm.user_id=s.user_id
  left join matches game on game.id=ch.match_id
  left join community_rooms room on room.id=coalesce(ch.room_id,game.room_id)
  where viewer.status='active' and viewer.onboarded_at is not null and viewer.session_version=s.session_version and to_timestamp(s.expires_at/1000.0)>now()
  and not exists(select 1 from private.revoked_sessions revoked where revoked.session_id=s.session_id)
  and not exists(select 1 from sanctions ban where ban.target_id=s.user_id and ban.room_id is null and ban.kind='suspend' and ban.revoked_at is null and ban.starts_at<=now() and ban.ends_at>now())
  and not exists(select 1 from personal_mutes mute where mute.user_id=s.user_id and mute.muted_id=coalesce(message.sender_id,message.actor_id))
  and not exists(select 1 from user_blocks b where (b.blocker_id=s.user_id and b.blocked_id=coalesce(message.sender_id,message.actor_id)) or (b.blocked_id=s.user_id and b.blocker_id=coalesce(message.sender_id,message.actor_id)))
  and (ch.kind='private' and s.user_id in(ch.user_low,ch.user_high)
   and (select count(*) from profiles peer where peer.id in(ch.user_low,ch.user_high) and peer.status='active' and peer.onboarded_at is not null)=2
   and not exists(select 1 from user_blocks b where (b.blocker_id=ch.user_low and b.blocked_id=ch.user_high) or (b.blocker_id=ch.user_high and b.blocked_id=ch.user_low))
   or ch.kind<>'private' and exists(select 1 from room_memberships membership join player_ratings rating on rating.user_id=membership.user_id
    where membership.user_id=s.user_id and membership.room_id=room.id and membership.lease_until>now() and rating.rating between room.min_rating and room.max_rating
    and (room.status<>'private' or exists(select 1 from room_access grant_access where grant_access.room_id=room.id and grant_access.user_id=s.user_id) or exists(select 1 from user_roles role where role.user_id=s.user_id and role.role in('admin','owner') and role.revoked_at is null))
    and not exists(select 1 from sanctions sanction where sanction.target_id=s.user_id and sanction.room_id=room.id and sanction.kind in('remove','suspend') and sanction.revoked_at is null and sanction.starts_at<=now() and sanction.ends_at>now())))`,[uuid.parse(messageId),JSON.stringify(sessions)])).rows;
 return new Map<string,any>(rows.map(r=>[r.user_id+':'+r.session_id,r.message]));
}
export async function chatPreference(actor:Actor,input:unknown){const p=z.object({channelId:uuid,closed:z.boolean().optional(),draft:z.string().max(2000).optional(),readCursor:z.number().int().min(0).optional()}).strict().parse(input);return transaction(async c=>{await channelAccess(c,actor,p.channelId);if(p.closed!==undefined||p.draft!==undefined)await c.query('insert into chat_preferences(channel_id,user_id,closed_at,draft) values($1,$2,case when $3 then now() else null end,coalesce($4,\'\')) on conflict(channel_id,user_id) do update set closed_at=case when $3::boolean is null then chat_preferences.closed_at when $3 then now() else null end,draft=coalesce($4,chat_preferences.draft)',[p.channelId,actor.id,p.closed??null,p.draft??null]);if(p.readCursor!==undefined)await c.query('update channel_memberships set last_read_cursor=greatest(last_read_cursor,least($3,(select cursor from channels where id=$1))) where channel_id=$1 and user_id=$2',[p.channelId,actor.id,p.readCursor]);return {ok:true};});}
