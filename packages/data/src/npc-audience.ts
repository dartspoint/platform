import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {transaction} from './db';
import {roomAccess} from './community';
import {requireThat} from '../../contracts/src/index';
/** All audience mutations and publication checks serialize in one fixed order. */
export async function audienceLock(c:PoolClient){await c.query('select id from private.npc_publication_lock where id=1 for update');}
export async function refreshAudience(c:PoolClient){
 // Actual room subscriptions, not bootstrap, cached counters or profile.online.
 const rows=(await c.query(`select connection.room_id,count(distinct p.id)::int humans,array_agg(distinct p.id) user_ids
 from private.npc_room_connections connection join profiles p on p.id=connection.user_id join room_memberships member on member.user_id=p.id and member.room_id=connection.room_id
 where p.actor_kind='human' and p.status='active' and p.session_version=connection.session_version and p.auth_user_id=p.id
 and member.lease_until>clock_timestamp() and member.last_activity_at>clock_timestamp()-interval '5 minutes'
 and connection.expires_at>clock_timestamp() and connection.token_expires_at>clock_timestamp() and private.npc_session_live(p.id,connection.session_id)
 and not exists(select 1 from private.revoked_sessions r where r.session_id=connection.session_id)
 and not exists(select 1 from sanctions s where s.target_id=p.id and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now() and (s.room_id is null and s.kind='suspend' or s.room_id=connection.room_id and s.kind in('suspend','remove')))
 group by connection.room_id`)).rows;
 const total=new Set(rows.flatMap(r=>r.user_ids)).size;
 const prior=(await c.query('select * from private.npc_audience')).rows;
 const counts=new Map<string,number>([['global',total],...rows.map(r=>[r.room_id,r.humans] as [string,number])]);
 for(const id of new Set([...prior.map(r=>r.id),...counts.keys()])){
  const old=prior.find(r=>r.id===id),n=counts.get(id)??0;
  await c.query(`insert into private.npc_audience(id,awake,humans) values($1,$2,$3) on conflict(id) do update set epoch=npc_audience.epoch+case when npc_audience.awake and not $2 then 1 else 0 end,changed_at=case when npc_audience.awake<>$2 then clock_timestamp() else npc_audience.changed_at end,awake=$2,humans=$3`,[id,n>0,n]);
  if(old?.awake&&n===0)await c.query("update private.npc_action_jobs set state='cancelled',reason='audience-empty' where state in('pending','running') and ($1='global' or room_id::text=$1)",[id]);
 }
 return (await c.query('select * from private.npc_audience')).rows;
}
export async function roomSubscription(actor:Actor,connectionId:string,roomId:string|null){return transaction(async c=>{
 await audienceLock(c);
 if(roomId){requireThat(actor.sessionId,'verified_session_required',401);await roomAccess(c,actor,roomId);requireThat((await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>clock_timestamp()',[actor.id,roomId])).rowCount,'join_room_first',403);
 await c.query(`insert into private.npc_room_connections(connection_id,user_id,session_id,session_version,room_id,expires_at,token_expires_at) values($1,$2,$3,$4,$5,clock_timestamp()+interval '45 seconds',$6) on conflict(connection_id) do update set room_id=$5,expires_at=clock_timestamp()+interval '45 seconds',token_expires_at=$6,session_id=$3,session_version=$4 where npc_room_connections.user_id=$2`,[connectionId,actor.id,actor.sessionId,actor.sessionVersion,roomId,new Date(actor.expiresAt)]);
 }else await c.query('delete from private.npc_room_connections where connection_id=$1 and user_id=$2',[connectionId,actor.id]);
 await refreshAudience(c);
 });}
export async function removeRoomSubscription(connectionId:string){return transaction(async c=>{await audienceLock(c);await c.query('delete from private.npc_room_connections where connection_id=$1',[connectionId]);await refreshAudience(c);});}
export function audienceMatches(rows:any[],job:{room_id:string;room_epoch:string|number;global_epoch:string|number}){const room=rows.find(r=>r.id===job.room_id),global=rows.find(r=>r.id==='global');return room?.awake&&global?.awake&&Number(room.epoch)===Number(job.room_epoch)&&Number(global.epoch)===Number(job.global_epoch);}
/** Cheap live check for deterministic NPC-only gameplay, never model generation. */
export async function hasRoomAudience(c:PoolClient,roomId:string){return !!(await c.query(`select 1 from private.npc_room_connections rc join profiles p on p.id=rc.user_id join room_memberships rm on rm.user_id=p.id and rm.room_id=rc.room_id where rc.room_id=$1 and p.actor_kind='human' and p.status='active' and p.session_version=rc.session_version and rm.lease_until>clock_timestamp() and rm.last_activity_at>clock_timestamp()-interval '5 minutes' and rc.expires_at>clock_timestamp() and rc.token_expires_at>clock_timestamp() and private.npc_session_live(p.id,rc.session_id) and not exists(select 1 from private.revoked_sessions where session_id=rc.session_id) and not exists(select 1 from sanctions s where s.target_id=p.id and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now() and (s.room_id is null and s.kind='suspend' or s.room_id=rc.room_id and s.kind in('remove','suspend'))) limit 1`,[roomId])).rowCount;}
