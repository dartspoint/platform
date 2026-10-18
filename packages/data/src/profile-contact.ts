import type {PoolClient} from 'pg';
import {z} from 'zod';
import {authAdmin,type Actor} from './auth';
import {transaction} from './db';
import {DomainError,requireThat,uuid} from '../../contracts/src/index';

const contactInput=z.object({userId:uuid}).strict();
export type ProfileContact={id:string;email:string|null};

/** Ticket roles and a cached Actor role never grant access to account mail. */
async function freshAdministrator(c:PoolClient,actor:Actor){
 requireThat(actor.expiresAt>Date.now(),'session_expired',401);
 requireThat(actor.sessionId&&uuid.safeParse(actor.sessionId).success,'verified_session_required',401);
 const profile=(await c.query('select status,onboarded_at,session_version,rename_required from public.profiles where id=$1 for share',[actor.id])).rows[0];
 requireThat(profile?.status==='active'&&profile.onboarded_at,'unauthenticated',401);
 requireThat(Number(profile.session_version)===actor.sessionVersion,'session_revoked',401);
 requireThat(!profile.rename_required,'rename_required',403);
 requireThat(!(await c.query('select 1 from private.revoked_sessions where session_id=$1',[actor.sessionId])).rowCount,'session_revoked',401);
 requireThat(!(await c.query("select 1 from public.sanctions where target_id=$1 and room_id is null and kind='suspend' and starts_at<=now() and ends_at>now() and revoked_at is null",[actor.id])).rowCount,'banned',403);
 requireThat((await c.query("select 1 from public.user_roles where user_id=$1 and role in('owner','admin') and revoked_at is null for share",[actor.id])).rowCount,'forbidden',403);
}

async function contactAccess(actor:Actor,userId:string){
 await transaction(async c=>{
  await freshAdministrator(c,actor);
  requireThat((await c.query("select id from public.profiles where id=$1 and status in('active','suspended') and onboarded_at is not null for share",[userId])).rowCount,'player_not_found',404);
 });
}

/** Separate from all directory, bootstrap and realtime projections. */
export async function profileContact(actor:Actor,input:unknown):Promise<ProfileContact>{
 const {userId}=contactInput.parse(input);
 await contactAccess(actor,userId);
 let contact:ProfileContact;
 try{
  const {data,error}=await authAdmin().auth.admin.getUserById(userId);
  if(error||data.user?.id!==userId||data.user.email!==undefined&&data.user.email!==null&&typeof data.user.email!=='string')throw new Error('account_contact_unavailable');
  contact={id:userId,email:data.user.email??null};
 }catch{
  // Provider payloads and errors may contain personal data. Never forward them.
  throw new DomainError('unavailable',503,'Het e-mailadres kan tijdelijk niet worden opgehaald. Probeer het opnieuw.');
 }
 // Provider I/O holds no database locks. Recheck durable rights and the target
 // after it completes so a revocation or account closure cannot use stale access.
 await contactAccess(actor,userId);
 return contact;
}
