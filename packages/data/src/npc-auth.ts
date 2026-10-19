import type {PoolClient} from 'pg';
import {db} from './db';
import {actorById,type Actor} from './auth';
import {requireThat} from '../../contracts/src/index';
/** Never authorize from cached UI roles or support-team roles. */
export async function requireNpcOwner(actor:Actor,c:Pick<PoolClient,'query'>=db(),recent=false){
 requireThat(actor.expiresAt>Date.now(),'session_expired',401);
 requireThat(actor.sessionId,'verified_session_required',401);
 const row=(await c.query(`select p.id from profiles p join user_roles r on r.user_id=p.id and r.role='owner' and r.revoked_at is null

 where p.id=$1 and private.npc_session_live(p.id,$2) and p.actor_kind='human' and p.status='active' and p.onboarded_at is not null and not p.rename_required and p.session_version=$3
 and not exists(select 1 from private.revoked_sessions where session_id=$2)
 and not exists(select 1 from sanctions where target_id=p.id and room_id is null and kind='suspend' and revoked_at is null and starts_at<=now() and ends_at>now()) for share of p,r`,[actor.id,actor.sessionId,actor.sessionVersion])).rows[0];
 requireThat(row,'forbidden',403);
 if(recent)requireThat((await c.query('select 1 from private.privacy_reauths where user_id=$1 and session_id=$2 and expires_at>clock_timestamp()',[actor.id,actor.sessionId])).rowCount,'reauthentication_required',403);
}
/** Registry lookup is internal only; token authentication never calls this path. */
export async function npcActor(id:string,c:Pick<PoolClient,'query'>=db()):Promise<Actor>{
 const p=(await c.query("select p.* from profiles p join private.npc_definitions d on d.user_id=p.id where p.id=$1 and p.actor_kind='npc' and p.status='active'",[id])).rows[0];
 requireThat(p,'invalid_npc',403);return {id:p.id,username:p.username,role:'player',sessionVersion:p.session_version,expiresAt:Date.now()+60000,onboarded:true};
}

export async function domainPlayerActor(id:string){const p=(await db().query("select actor_kind from profiles where id=$1",[id])).rows[0];return p?.actor_kind==='npc'?npcActor(id):actorById(id,Date.now()+3600000);}
