import {z} from 'zod';
import {createHash} from 'node:crypto';
import {db,transaction,audit,outbox} from './db';
import {actorById,staff,type Actor} from './auth';
import {requireThat,uuid,DomainError} from '../../contracts/src/index';
import {target,roomAccess} from './community';
import type {PoolClient} from 'pg';

async function resolveCase(c:PoolClient,actor:Actor,id:string,status:string,response:string,targetId?:string){
 const before=(await c.query('select * from private.moderation_cases where id=$1 for update',[id])).rows[0];requireThat(before,'not_found',404);
 requireThat(!targetId||before.target_id===targetId,'case_target_mismatch',403);
 await c.query("update private.moderation_cases set state=$2,resolution=$3,assigned_to=$4,resolved_at=case when $2='resolved' then now() else null end where id=$1",[id,status,response,actor.id]);
 if(status==='resolved'&&(before.state!==status||before.resolution!==response))await outbox(c,'report-resolution:'+id+':'+createHash('sha256').update(response).digest('hex'),'report-resolution',before.reporter_id,{caseId:id,status,response});
}

const reason=z.string().trim().min(5).max(500);
export async function moderate(actor:Actor,input:unknown){
 const p=z.object({targetId:uuid,roomId:uuid.optional(),kind:z.enum(['warn','mute','remove','suspend']),reason,minutes:z.number().int().min(1).max(525600).default(10),caseId:uuid.optional()}).strict().parse(input);
 requireThat(p.targetId!==actor.id,'self_target',403);
 return transaction(async c=>{
  const victim=(await c.query("select p.id,coalesce((select role from user_roles r where r.user_id=p.id and revoked_at is null order by case role when 'owner' then 0 else 1 end limit 1),'player') role from profiles p where id=$1 for update",[p.targetId])).rows[0];requireThat(victim,'player_not_found',404);requireThat(victim.role!=='owner','owner_protected',403);
  if(actor.role==='owner'){}else if(actor.role==='admin')requireThat(victim.role!=='admin','peer_protected',403);
  else{requireThat(p.roomId&&['warn','mute','remove'].includes(p.kind)&&p.minutes<=60,'room_scope_only',403);requireThat((await c.query('select 1 from room_moderators where room_id=$1 and user_id=$2',[p.roomId,actor.id])).rowCount,'forbidden',403);requireThat(victim.role==='player'&&!(await c.query('select 1 from room_moderators where room_id=$1 and user_id=$2',[p.roomId,p.targetId])).rowCount,'peer_protected',403);}
  const r=await c.query('insert into sanctions(target_id,actor_id,room_id,kind,reason,ends_at) values($1,$2,$3,$4,$5,now()+($6::integer*interval \'1 minute\')) returning id',[p.targetId,actor.id,p.roomId??null,p.kind,p.reason,p.minutes]);
  if(p.kind==='suspend')await c.query('update profiles set session_version=session_version+1 where id=$1',[p.targetId]);
  if(p.kind==='remove'&&p.roomId)await c.query('delete from room_memberships where user_id=$1 and room_id=$2',[p.targetId,p.roomId]);
  await audit(c,actor.id,'moderation.'+p.kind,p.targetId,{roomId:p.roomId,sanctionId:r.rows[0].id},p.reason);
  await outbox(c,'moderation:'+r.rows[0].id,'moderation',p.targetId,{action:p.kind,reason:p.reason,caseId:p.caseId??r.rows[0].id,durationLabel:p.minutes+' minuten'});
  if(p.caseId){staff(actor);await resolveCase(c,actor,p.caseId,'resolved',p.reason,p.targetId);}return {ok:true,id:r.rows[0].id};
 });
}
export async function report(actor:Actor,input:unknown){
 const p=z.object({targetId:uuid,reason:z.string().trim().min(3).max(80),detail:z.string().max(2000).default(''),messageId:uuid.optional(),matchId:uuid.optional(),roomId:uuid.optional()}).strict().parse(input);
 requireThat(p.targetId!==actor.id,'self_target');return transaction(async c=>{
  await target(c,p.targetId);const evidence:Record<string,unknown>={};let roomId=p.roomId??null;
  if(roomId)await roomAccess(c,actor,roomId);
  if(p.messageId){const message=(await c.query('select m.*,ch.kind,ch.room_id,ch.user_low,ch.user_high from chat_messages m join channels ch on ch.id=m.channel_id where m.id=$1',[p.messageId])).rows[0];requireThat(message?.sender_id===p.targetId,'invalid_context',403);
   if(message.kind==='private')requireThat([message.user_low,message.user_high].includes(actor.id),'forbidden',403);else{const {channelAccess}=await import('./community');await channelAccess(c,actor,message.channel_id);}
   evidence.message={id:message.id,channelId:message.channel_id,body:message.body,senderId:message.sender_id,createdAt:message.created_at};roomId=message.room_id??roomId;
  }
  if(p.matchId){const m=(await c.query('select id,room_id,game_number,lifecycle,rules,state_version from matches where id=$1',[p.matchId])).rows[0];requireThat(m,'match_not_found',404);await roomAccess(c,actor,m.room_id);requireThat((await c.query('select 1 from match_players where match_id=$1 and user_id=$2',[m.id,p.targetId])).rowCount,'invalid_context',403);evidence.match=m;roomId=m.room_id;}
  const r=await c.query('insert into private.moderation_cases(reporter_id,target_id,message_id,match_id,reason,detail,room_id,evidence) values($1,$2,$3,$4,$5,$6,$7,$8) returning id',[actor.id,p.targetId,p.messageId??null,p.matchId??null,p.reason,p.detail,roomId,JSON.stringify(evidence)]);await audit(c,actor.id,'report.create',r.rows[0].id,{targetId:p.targetId});return {ok:true,id:r.rows[0].id};
 });
}
export async function adminAction(actor:Actor,input:unknown){
 const {action,args}=z.object({action:z.string(),args:z.array(z.unknown()).max(4)}).strict().parse(input);
 if(action==='revoke-sanction')return revokeSanction(actor,{id:args[0],reason:args[1]});staff(actor);
 return transaction(async c=>{
  if(action==='role'){
   staff(actor,true);const id=uuid.parse(args[0]),role=z.enum(['player','vip','admin','owner']).parse(args[1]);requireThat(id!==actor.id,'self_role_protected',403);
   await c.query('select pg_advisory_xact_lock(1247281199)');await target(c,id);
   await c.query('update user_roles set revoked_at=now() where user_id=$1 and revoked_at is null and role<>$2',[id,role]);
   if(['owner','admin'].includes(role))await c.query('insert into user_roles(user_id,role,granted_by) values($1,$2,$3) on conflict(user_id,role) do update set revoked_at=null,granted_by=$3,granted_at=now()',[id,role,actor.id]);
   if(role==='vip')await c.query("insert into vip_entitlements(user_id,source) values($1,'owner') on conflict(user_id) do update set status='active',starts_at=now(),ends_at=null",[id]);else await c.query("update vip_entitlements set status='revoked',ends_at=now() where user_id=$1",[id]);
   await c.query('update profiles set session_version=session_version+1 where id=$1',[id]);await audit(c,actor.id,'member.role',id,{role});return {ok:true};
  }
  if(action==='room-save'){
   const p=z.object({id:uuid.optional(),name:z.string().trim().min(1).max(80),subtitle:z.string().max(300),capacity:z.number().int().min(2).max(50),category:z.enum(['social','ranked','beginners','tournament']),status:z.enum(['active','closed','private']),rules:z.string().max(2000),minRating:z.number().int().min(0).max(5000),maxRating:z.number().int().min(0).max(5000),moderator:z.string().max(20).default('')}).strict().parse(args[0]);requireThat(p.minRating<=p.maxRating,'rating_range');
   const id=p.id??crypto.randomUUID();if(p.id){const existing=(await c.query('select * from community_rooms where id=$1 for update',[id])).rows[0];requireThat(existing,'room_not_found',404);const live=Number((await c.query('select count(*) n from room_memberships where room_id=$1 and lease_until>now()',[id])).rows[0].n);requireThat(p.capacity>=live,'capacity_below_occupancy',409);requireThat(!(await c.query("select 1 from matches where room_id=$1 and lifecycle in('assigned','playing','paused')",[id])).rowCount||p.status!=='private','active_matches',409);}
   await c.query('insert into community_rooms(id,name,slug,description,capacity,category,status,rules,min_rating,max_rating) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do update set name=$2,description=$4,capacity=$5,category=$6,status=$7,rules=$8,min_rating=$9,max_rating=$10,version=community_rooms.version+1',[id,p.name,p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+id.slice(0,8),p.subtitle,p.capacity,p.category,p.status==='active'?'open':p.status,p.rules,p.minRating,p.maxRating]);
   await c.query("insert into channels(kind,room_id) values('community',$1) on conflict do nothing",[id]);await c.query('delete from room_moderators where room_id=$1',[id]);
   if(p.moderator){const mod=(await c.query('select id from profiles where username_key=lower($1) and status=$2',[p.moderator,'active'])).rows[0];requireThat(mod,'moderator_not_found',400);await c.query('insert into room_moderators(room_id,user_id) values($1,$2)',[id,mod.id]);}
   await audit(c,actor.id,'room.save',id);return {ok:true,id};
  }
  if(action==='room-close'||action==='room-delete'){
   const id=uuid.parse(args[0]);const r=(await c.query('select * from community_rooms where id=$1 for update',[id])).rows[0];requireThat(r,'room_not_found',404);if(action==='room-delete')requireThat(!(await c.query("select 1 from matches where room_id=$1 and lifecycle in('assigned','playing','paused')",[id])).rowCount,'active_matches',409);
   // History retains its room identity; deletion archives a closed room.
   await c.query("update community_rooms set status='closed',version=version+1 where id=$1",[id]);if(action==='room-delete')await c.query('delete from room_memberships where room_id=$1',[id]);await audit(c,actor.id,action,id);return {ok:true};
  }
  if(action==='case'){
   const id=uuid.parse(args[0]),status=z.enum(['open','review','resolved']).parse(args[1]),response=z.string().trim().max(2000).parse(args[2]);requireThat(status!=='resolved'||response.length>=5,'resolution_required');await resolveCase(c,actor,id,status,response);await audit(c,actor.id,'case.'+status,id,{},response);return {ok:true};
  }
  throw new DomainError('unknown_action',400);
 });
}

export async function revokeSanction(actor:Actor,input:unknown){const p=z.object({id:uuid,reason}).strict().parse(input);return transaction(async c=>{
 const sanction=(await c.query('select * from sanctions where id=$1 for update',[p.id])).rows[0];requireThat(sanction,'sanction_not_found',404);
 const targetRole=(await c.query("select role from user_roles where user_id=$1 and revoked_at is null order by case role when 'owner' then 0 else 1 end limit 1",[sanction.target_id])).rows[0]?.role??'player';
 if(actor.role==='owner'){}else if(actor.role==='admin')requireThat(!['owner','admin'].includes(targetRole),'peer_protected',403);
 else requireThat(sanction.room_id&&sanction.actor_id===actor.id&&(await c.query('select 1 from room_moderators where user_id=$1 and room_id=$2',[actor.id,sanction.room_id])).rowCount,'room_scope_only',403);
 await c.query('update sanctions set revoked_at=now() where id=$1',[p.id]);await audit(c,actor.id,'sanction.revoke',p.id,{},p.reason);return {ok:true};
});}
