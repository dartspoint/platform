import {providerFetch} from './fetch';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from 'jose';
import { db } from './db';
import { requireThat, DomainError, uuid } from '../../contracts/src/index';
export type Actor={id:string;username:string|null;role:'owner'|'admin'|'vip'|'player';sessionVersion:number;expiresAt:number;onboarded:boolean;renameRequired?:boolean;sessionId?:string};
export function publicPlayerName(id:string,name:string|null,renameRequired:boolean){return renameRequired?'Speler-'+id.replaceAll('-','').slice(0,12):name;}
let jwks:ReturnType<typeof createRemoteJWKSet>|undefined;
export function authAdmin() {
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{global:{fetch:providerFetch},auth:{persistSession:false,autoRefreshToken:false}});
}
export async function actorById(id:string,expiresAt:number,complete=true):Promise<Actor>{return loadActor(id,expiresAt,complete,'access');}
async function loadActor(id:string,expiresAt:number,complete:boolean,scope:'access'|'revoke',sessionId?:string):Promise<Actor> {
 const q=await db().query(`select p.*, coalesce((select role from user_roles r where r.user_id=p.id and r.revoked_at is null order by case role when 'owner' then 0 else 1 end limit 1), case when exists(select 1 from vip_entitlements v where v.user_id=p.id and v.status='active' and v.starts_at<=now() and (v.ends_at is null or v.ends_at>now())) then 'vip' else 'player' end) role,
 exists(select 1 from sanctions where target_id=p.id and room_id is null and kind='suspend' and starts_at<=now() and ends_at>now() and revoked_at is null) globally_suspended,
 exists(select 1 from private.revoked_sessions where session_id=$2::uuid) session_revoked from profiles p where p.id=$1`,[id,sessionId??null]);
 const p=q.rows[0]; requireThat(p,'unauthenticated',401);
 if(scope==='access')requireThat(p.status==='active','banned',403,'Je account heeft op dit moment geen toegang.');
 if(scope==='access')requireThat(!p.globally_suspended,'banned',403);
 requireThat(!complete || p.onboarded_at,'profile_incomplete',403,'Kies eerst je spelersnaam.');
 if(sessionId){requireThat(expiresAt>Date.now(),'session_expired',401);requireThat(!p.session_revoked,'session_revoked',401);}
 return {id:p.id,username:publicPlayerName(p.id,p.username,p.rename_required),role:p.role,sessionVersion:p.session_version,expiresAt,onboarded:!!p.onboarded_at,renameRequired:!!p.rename_required};
}
export async function verifyToken(token:string,complete=true):Promise<Actor>{return verifyIdentity(token,complete,'access');}
// A suspended player may revoke a verified session; this grants no application access.
export async function verifyLogoutToken(token:string):Promise<Actor>{return verifyIdentity(token,false,'revoke');}
async function verifyIdentity(token:string,complete:boolean,scope:'access'|'revoke'):Promise<Actor> {
 try {
  requireThat(typeof token==='string' && token.length>20 && token.length<8192,'unauthenticated',401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const header=decodeProtectedHeader(token);
  let id:string,expiry:number,sessionId:string;
  if(header.alg==='HS256') {
   // Local/legacy projects: Auth verifies signing material and session validity.
   const {data,error}=await authAdmin().auth.getUser(token);
   requireThat(!error && data.user?.email_confirmed_at,'unauthenticated',401);
   id=data.user.id;
   const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
   requireThat(claims.aud==='authenticated' && claims.role==='authenticated' && claims.iss===url+'/auth/v1' && claims.exp>Date.now()/1000,'unauthenticated',401);
   expiry=claims.exp*1000;sessionId=uuid.parse(claims.session_id);
  } else {
   jwks??=createRemoteJWKSet(new URL(url+'/auth/v1/.well-known/jwks.json'));
   const {payload}=await jwtVerify(token,jwks,{issuer:url+'/auth/v1',audience:'authenticated',algorithms:['ES256','RS256']});
   requireThat(payload.sub && payload.role==='authenticated' && payload.exp,'unauthenticated',401);
   id=payload.sub; expiry=payload.exp*1000;sessionId=uuid.parse(payload.session_id);
   const {data,error}=await authAdmin().auth.getUser(token);requireThat(!error&&data.user?.id===id&&data.user.email_confirmed_at,'unauthenticated',401);
  }
  return {...await loadActor(id,expiry,complete,scope,sessionId),sessionId};
 } catch(e) { if(e instanceof DomainError) throw e; throw new DomainError('unauthenticated',401); }
}
export function staff(actor:Actor,owner=false) { requireThat(owner?actor.role==='owner':['owner','admin'].includes(actor.role),'forbidden',403); }

export async function assertSessionActive(actor:Actor){
 requireThat(actor.expiresAt>Date.now(),'session_expired',401);
 if(actor.sessionId)requireThat(!(await db().query('select 1 from private.revoked_sessions where session_id=$1',[actor.sessionId])).rowCount,'session_revoked',401);
}
export async function revokeSession(actor:Actor){requireThat(actor.sessionId,'verified_session_required',401);await db().query('insert into private.revoked_sessions(session_id,user_id,expires_at) values($1,$2,$3) on conflict do nothing',[actor.sessionId,actor.id,new Date(actor.expiresAt)]);}
