import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {authAdmin,verifyToken,type Actor} from '../../packages/data/src/auth';
import {db,redis} from '../../packages/data/src/db';
import {postgresOptions} from '../../packages/data/src/postgres';
import {profileContact} from '../../packages/data/src/profile-contact';
import {bootstrap,playersProjection,publicProjection} from '../../packages/data/src/projections';
import {DomainError} from '../../packages/contracts/src/index';

assert.equal(process.env.APP_ENV,'development');
for(const name of ['DATABASE_URL','MIGRATION_DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL'])assert.equal(new URL(process.env[name]!).hostname,'127.0.0.1','Owned fixtures must remain local');
const control=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:2});
const auth=authAdmin(),prefix='Mail'+randomUUID().replaceAll('-','').slice(0,8),ids:string[]=[],checks:Record<string,boolean>={};
const room=randomUUID();
let transport:ReturnType<typeof mock.method>|undefined;
async function fixture(index:number){
 const email=`qa-profile-contact-${prefix.toLowerCase()}-${index}@dartspoint.local`,password=randomUUID()+randomUUID();
 const created=await auth.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{private_note:'Never include provider metadata'}});
 assert.equal(created.error,null);const id=created.data.user!.id;ids.push(id);
 // No onboarding/welcome outbox task is created by this read-only feature test.
 await control.query('update profiles set username=$2,onboarded_at=now() where id=$1',[id,prefix+index]);
 await control.query('insert into player_ratings(user_id) values($1)',[id]);
 const login=await authAdmin().auth.signInWithPassword({email,password});assert.equal(login.error,null);
 return {id,email,token:login.data.session!.access_token};
}
try{
 const fixtures=[];for(let index=0;index<7;index++)fixtures.push(await fixture(index));
 const [ownerFixture,adminFixture,playerFixture,vipFixture,moderatorFixture,supportFixture,target]=fixtures;
 await control.query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1),($2,'admin',$1)",[ownerFixture.id,adminFixture.id]);
 await control.query("insert into vip_entitlements(user_id,source) values($1,'owned-profile-contact-test')",[vipFixture.id]);
 await control.query('insert into community_rooms(id,name,slug,capacity) values($1,$2,$2,10)',[room,prefix]);
 await control.query('insert into room_moderators(room_id,user_id) values($1,$2)',[room,moderatorFixture.id]);
 await control.query("insert into private.support_team_roles(user_id,role,granted_by,reason) values($1,'platform',$2,'Owned profile contact isolation test')",[supportFixture.id,ownerFixture.id]);
 const [owner,admin,player,vip,moderator,support]=await Promise.all(fixtures.slice(0,6).map(f=>verifyToken(f.token)));
 assert.equal(owner.role,'owner');assert.equal(admin.role,'admin');assert.equal(vip.role,'vip');assert.equal(support.role,'player');
 const originalFetch=globalThis.fetch;let providerReads=0;
 let mode:'normal'|'unavailable'|'wrong-user'='normal';
 let afterProvider:(()=>Promise<void>)|undefined;
 transport=mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  const isContact=url.origin===process.env.NEXT_PUBLIC_SUPABASE_URL&&url.pathname==='/auth/v1/admin/users/'+target.id&&(init?.method??'GET')==='GET';
  if(!isContact)return originalFetch(input,init);
  providerReads++;
  if(mode==='unavailable')return Response.json({message:'PRIVATE provider detail '+target.email},{status:503});
  const response=await originalFetch(input,init);
  if(afterProvider)await afterProvider();
  if(mode==='wrong-user'){const data=await response.json();return Response.json({...data,id:owner.id});}
  return response;
 });
 const denied=async(actor:Actor,code:string,noProvider=true,userId=target.id)=>{
  const before=providerReads;
  await assert.rejects(()=>profileContact(actor,{userId}),error=>error instanceof DomainError&&error.code===code&&!error.message.includes(target.email)&&!error.message.includes('PRIVATE'));
  if(noProvider)assert.equal(providerReads,before,'Denied requests never query the privileged provider endpoint');
 };
 const ownerContact=await profileContact(owner,{userId:target.id});
 assert.deepEqual(ownerContact,{id:target.id,email:target.email});assert.deepEqual(Object.keys(ownerContact).sort(),['email','id']);
 assert.deepEqual(await profileContact(admin,{userId:target.id}),ownerContact);checks.ownerAndAdministratorReadActualLocalAuthEmail=true;
 for(const actor of [player,vip,moderator,support,{...player,role:'admin' as const},{...support,role:'owner' as const}])await denied(actor,'forbidden');
 checks.playerVipRoomModeratorSupportAndForgedRolesDenied=true;
 await denied({...admin,expiresAt:Date.now()-1},'session_expired');await denied({...admin,sessionId:undefined},'verified_session_required');
 await denied({...admin,sessionVersion:admin.sessionVersion+1},'session_revoked');
 await control.query('update profiles set session_version=session_version+1 where id=$1',[admin.id]);await denied(admin,'session_revoked');await control.query('update profiles set session_version=session_version-1 where id=$1',[admin.id]);
 await control.query('insert into private.revoked_sessions(session_id,user_id,expires_at) values($1,$2,$3)',[admin.sessionId,admin.id,new Date(admin.expiresAt)]);await denied(admin,'session_revoked');await control.query('delete from private.revoked_sessions where session_id=$1',[admin.sessionId]);
 await control.query("update profiles set status='suspended' where id=$1",[admin.id]);await denied(admin,'unauthenticated');await control.query("update profiles set status='active',rename_required=true where id=$1",[admin.id]);await denied(admin,'rename_required');await control.query('update profiles set rename_required=false where id=$1',[admin.id]);
 await control.query("insert into sanctions(target_id,actor_id,kind,reason,ends_at) values($1,$2,'suspend','Owned contact access check',now()+interval '5 minutes')",[admin.id,owner.id]);await denied(admin,'banned');await control.query('delete from sanctions where target_id=$1 and actor_id=$2',[admin.id,owner.id]);
 checks.expiredUnverifiedStaleRevokedSuspendedAndRenameSessionsDenied=true;
 await control.query("update user_roles set revoked_at=now() where user_id=$1 and role='admin'",[admin.id]);await denied(admin,'forbidden');await control.query("update user_roles set revoked_at=null where user_id=$1 and role='admin'",[admin.id]);checks.revokedAdministratorRoleDenied=true;
 await denied(admin,'player_not_found',true,randomUUID());
 await control.query("update profiles set status='deleted' where id=$1",[target.id]);await denied(admin,'player_not_found');await control.query("update profiles set status='active',username=null,onboarded_at=null where id=$1",[target.id]);await denied(admin,'player_not_found');await control.query('update profiles set username=$2,onboarded_at=now() where id=$1',[target.id,prefix+6]);
 await assert.rejects(()=>profileContact(admin,{userId:'invalid'}));await assert.rejects(()=>profileContact(admin,{userId:target.id,role:'owner'}));checks.missingDeletedIncompleteAndInvalidTargetsDenied=true;
 mode='unavailable';await denied(admin,'unavailable',false);mode='wrong-user';await denied(admin,'unavailable',false);mode='normal';checks.providerFailureAndWrongIdentityReturnNoPersonalData=true;
 afterProvider=async()=>{await control.query("update user_roles set revoked_at=now() where user_id=$1 and role='admin'",[admin.id]);};
 await denied(admin,'forbidden',false);afterProvider=undefined;await control.query("update user_roles set revoked_at=null where user_id=$1 and role='admin'",[admin.id]);
 afterProvider=async()=>{await control.query('insert into private.revoked_sessions(session_id,user_id,expires_at) values($1,$2,$3)',[admin.sessionId,admin.id,new Date(admin.expiresAt)]);};
 await denied(admin,'session_revoked',false);afterProvider=undefined;await control.query('delete from private.revoked_sessions where session_id=$1',[admin.sessionId]);
 afterProvider=async()=>{await control.query("update profiles set status='deleted' where id=$1",[target.id]);};
 await denied(admin,'player_not_found',false);afterProvider=undefined;await control.query("update profiles set status='active' where id=$1",[target.id]);checks.revocationAndTargetClosureDuringProviderAwaitDenied=true;
 const nextEmail=`qa-profile-contact-${prefix.toLowerCase()}-changed@dartspoint.local`;
 const changed=await auth.auth.admin.updateUserById(target.id,{email:nextEmail,email_confirm:true});assert.equal(changed.error,null);
 assert.deepEqual(await profileContact(admin,{userId:target.id}),{id:target.id,email:nextEmail});checks.emailReadFreshFromProviderWithoutMetadataOrCache=true;
 for(const projection of [await playersProjection(admin.id),await bootstrap(admin),await bootstrap(player),await publicProjection()]){
  const serialized=JSON.stringify(projection);assert.equal(serialized.includes(nextEmail),false);assert.equal(serialized.includes(target.email),false);assert.equal(serialized.includes('Never include provider metadata'),false);
 }
 await assert.rejects(()=>db().query('select id,email from auth.users limit 1'),(error:unknown)=>(error as {code?:string}).code==='42501');checks.directoryBootstrapAndPublicProjectionContainNoAccountMail=true;checks.noAuthSchemaGrantAdded=true;
}finally{
 transport?.mock.restore();
 await control.query('delete from private.revoked_sessions where user_id=any($1::uuid[])',[ids]);
 await control.query('delete from sanctions where target_id=any($1::uuid[]) or actor_id=any($1::uuid[])',[ids]);
 await control.query('delete from room_moderators where room_id=$1',[room]);await control.query('delete from community_rooms where id=$1',[room]);
 await control.query('delete from private.support_team_roles where user_id=any($1::uuid[]) or granted_by=any($1::uuid[])',[ids]);
 await control.query('delete from user_roles where user_id=any($1::uuid[]) or granted_by=any($1::uuid[])',[ids]);await control.query('delete from vip_entitlements where user_id=any($1::uuid[])',[ids]);
 await control.query('delete from preferences where user_id=any($1::uuid[])',[ids]);await control.query('delete from player_ratings where user_id=any($1::uuid[])',[ids]);
 await control.query('delete from profiles where id=any($1::uuid[])',[ids]);
 for(const id of ids){await control.query("update profiles set status='deleted' where id=$1",[id]);const deleted=await auth.auth.admin.deleteUser(id);assert.equal(deleted.error,null);}
 assert.equal((await control.query('select count(*)::int count from profiles where id=any($1::uuid[])',[ids])).rows[0].count,0);checks.ownedFixturesRemoved=true;
 await control.end();await db().end();await(await redis()).quit();
}
await mkdir('artifacts/profile-contact',{recursive:true});await writeFile('artifacts/profile-contact/integration-result.json',JSON.stringify({ok:true,actualLocalAuthAndDatabase:true,providerFaultsScopedToOwnedTarget:true,checks},null,2));
console.log('Profile contact real Auth, durable administrator rights, revocation, provider faults and projection isolation passed');
