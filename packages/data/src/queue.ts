import {z} from 'zod';
import {db,transaction,outbox,draining} from './db';
import {actorById,type Actor} from './auth';
import {uuid,requireThat} from '../../contracts/src/index';
import {roomAccess,blocked} from './community';
import {admission,invite} from './matches';
export async function queue(actor:Actor,input:unknown){const {matchId}=z.object({matchId:uuid}).strict().parse(input);return transaction(async c=>{
 const m=(await c.query('select * from matches where id=$1 for update',[matchId])).rows[0];requireThat(m,'match_not_found',404);requireThat(!m.competition,'competition_queue_forbidden',403);await roomAccess(c,actor,m.room_id);
 requireThat((await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>now()',[actor.id,m.room_id])).rowCount,'join_room_first',403);
 const existing=(await c.query('delete from match_queues where match_id=$1 and user_id=$2 returning user_id',[matchId,actor.id])).rowCount;
 if(!existing){requireThat(!(await c.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount,'already_playing',409);requireThat(Number((await c.query('select count(*) n from match_queues where match_id=$1',[matchId])).rows[0].n)<20,'queue_full',409);await c.query('insert into match_queues(match_id,user_id) values($1,$2)',[matchId,actor.id]);}return {ok:true};
});}
async function handover(c:import('pg').PoolClient,actor:Actor,m:any){
 await c.query('insert into private.queue_advances(match_id) values($1) on conflict do nothing',[m.id]);
 const progress=(await c.query('select * from private.queue_advances where match_id=$1 for update',[m.id])).rows[0];if(progress.finished)return {name:null};
 if(progress.invite_id){
  const invitation=(await c.query('select * from game_invites where id=$1 for update',[progress.invite_id])).rows[0];
  if(invitation.state==='accepted'){
   await c.query('insert into match_queues(match_id,user_id,joined_at) select $2,user_id,joined_at from match_queues where match_id=$1 on conflict do nothing',[m.id,invitation.match_id]);
   await c.query('delete from match_queues where match_id=$1',[m.id]);await c.query('update private.queue_advances set finished=true where match_id=$1',[m.id]);return {name:null};
  }
  if(invitation.state==='pending'&&new Date(invitation.expires_at).getTime()>Date.now())return {name:null,inviteId:invitation.id};
 }
 if((await c.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount)return {name:null};
 if(!(await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>now()',[actor.id,m.room_id])).rowCount)return {name:null};
 const candidates=(await c.query('select q.user_id,p.username from match_queues q join profiles p on p.id=q.user_id and p.status=\'active\' join room_memberships rm on rm.user_id=q.user_id and rm.room_id=$2 and rm.lease_until>now() where q.match_id=$1 and not exists(select 1 from active_player_reservations a where a.user_id=q.user_id) order by q.joined_at,q.user_id for update of q skip locked',[m.id,m.room_id])).rows;
 for(const next of candidates){
  if(await blocked(c,actor.id,next.user_id))continue;
  try{await actorById(next.user_id,Date.now()+3600000);}catch{continue;}
  await c.query('delete from match_queues where match_id=$1 and user_id=$2',[m.id,next.user_id]);
  const invitation=(await c.query("insert into game_invites(inviter_id,invitee_id,room_id,rules,ranked,expires_at) values($1,$2,$3,$4,$5,now()+interval '60 seconds') returning id",[actor.id,next.user_id,m.room_id,JSON.stringify(m.rules),m.mode==='ranked'])).rows[0];
  await c.query('update private.queue_advances set invite_id=$2 where match_id=$1',[m.id,invitation.id]);await outbox(c,'invite:'+invitation.id,'game-invite',next.user_id,{inviteId:invitation.id,name:actor.username});return {name:next.username,inviteId:invitation.id};
 }
 return {name:null};
}
export async function advanceQueue(actor:Actor,input:unknown){const {matchId}=z.object({matchId:uuid}).strict().parse(input);return transaction(async c=>{
 await admission(c);const m=(await c.query('select m.*,r.winner_id from matches m join match_results r on r.match_id=m.id where m.id=$1 for update of m',[matchId])).rows[0];requireThat(m&&m.winner_id===actor.id&&!m.competition,'winner_only',403);return handover(c,actor,m);
});}
export async function advanceQueues(){if(await draining())return;return transaction(async c=>{
 await admission(c);await c.query("update game_invites set state='expired' where state='pending' and expires_at<=now()");
 const matches=(await c.query("select m.*,r.winner_id from matches m join match_results r on r.match_id=m.id where m.competition is null and r.winner_id is not null and (exists(select 1 from match_queues q where q.match_id=m.id) or exists(select 1 from private.queue_advances a where a.match_id=m.id and not a.finished)) order by m.id for update of m skip locked limit 16")).rows;
 for(const m of matches){let actor:Actor;try{actor=await actorById(m.winner_id,Date.now()+3600000);}catch{continue;}await handover(c,actor,m);}
});}
export async function rematch(actor:Actor,input:unknown){const {matchId}=z.object({matchId:uuid}).strict().parse(input);const info=await transaction(async c=>{const m=(await c.query('select * from matches where id=$1',[matchId])).rows[0];requireThat(m&&m.lifecycle==='completed'&&!m.competition,'rematch_unavailable',409);const players=(await c.query('select user_id,seat from match_players where match_id=$1',[matchId])).rows;requireThat(players.some(p=>p.user_id===actor.id),'players_only',403);return {starterUserId:players.find(p=>p.seat!==m.state.starter).user_id,targetId:players.find(p=>p.user_id!==actor.id).user_id,roomId:m.room_id,rules:m.rules,ranked:m.mode==='ranked'};});const {starterUserId,...invitationInput}=info;return invite(actor,invitationInput,starterUserId);}
