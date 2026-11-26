import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Client,Pool} from 'pg';
import sharp from 'sharp';
import {migrate} from '../../scripts/migrate';
import {db} from '../../packages/data/src/db';
import {DomainError} from '../../packages/contracts/src/index';
import {credentialHash,type PairingClaim} from '../../packages/socialhero/src/index';
import {authenticateBlogToken,blogCapabilities,getSocialHeroPost,listPublishedBlogArticles,publishSocialHeroPost,saveSocialHeroDraft,storeBlogMedia} from '../../packages/data/src/blog';
import {checkSocialHeroConnection,disconnectSocialHero,pairSocialHero,revokeSocialHeroCredential,setSocialHeroPolicy,socialHeroAdminStatus} from '../../packages/data/src/socialhero';
import type {Actor} from '../../packages/data/src/auth';

// All database effects stay in a disposable local database. Only the provider
// transport is mocked: callbacks run real credential, capability and blog code.
assert.equal(process.env.APP_ENV,'development');
const source=new URL(process.env.MIGRATION_DATABASE_URL!);assert.equal(source.hostname,'127.0.0.1');
const database='socialhero_test_'+randomUUID().replaceAll('-','');
const control=new Pool({connectionString:source.toString(),max:1});
await control.query('create database '+database);
const url=new URL(source);url.pathname='/'+database;
const setup=new Client({connectionString:url.toString()});
process.env.DATABASE_URL=url.toString();process.env.MIGRATION_DATABASE_URL=url.toString();process.env.DATABASE_ROLE='dartspoint_app';
process.env.SOCIALHERO_SERVER_URL='https://socialhero.test';
process.env.SOCIALHERO_PROVISIONING_KEY=randomBytes(32).toString('base64url');
process.env.BLOG_SITE_ID='socialhero-integration';process.env.NEXT_PUBLIC_APP_URL='http://127.0.0.1:4300';
process.argv.push('--expand-only');
const originalFetch=globalThis.fetch;
const checks:string[]=[];
type Fixture={code:string;claim:PairingClaim;attemptId?:string;claimCalls:number;verifyCalls:number;loseClaimOnce?:boolean;verifyMode:'verified'|'interrupted'|'mismatch'|'INVALID_CREDENTIAL';onClaim?:()=>Promise<void>;onVerify?:()=>Promise<void>};
const fixtures=new Map<string,Fixture>();
const rawProviderDetail='RAW_PROVIDER_SECRET_NEVER_PUBLIC';
const makeFixture=(name:string,destinationId='stable-destination'):Fixture=>{
 const fixture:Fixture={code:'pair-'+name+'-'+randomBytes(12).toString('base64url'),claim:{connectionId:'connection-'+randomUUID(),destinationId,accessToken:randomBytes(32).toString('base64url'),expiresAt:new Date(Date.now()+600_000).toISOString()},claimCalls:0,verifyCalls:0,verifyMode:'verified'};
 fixtures.set(fixture.code,fixture);return fixture;
};
const errorCodes=new Map<string,string>();
const denied=async(fn:()=>Promise<unknown>,code:string)=>{
 await assert.rejects(fn,error=>{
  assert.ok(error instanceof DomainError,'Unexpected error type '+(error as Error)?.name+' / '+(error as {code?:string})?.code+' while expecting '+code);assert.equal(error.code,code);
  assert.ok(!error.message.includes(rawProviderDetail));
  for(const fixture of fixtures.values()){assert.ok(!error.message.includes(fixture.code));assert.ok(!error.message.includes(fixture.claim.accessToken));}
  return true;
 });
};
const safeStatus=(value:unknown)=>{
 const serialized=JSON.stringify(value);
 assert.ok(!/accessToken|token_hash|encrypted_token|code_hash|provisioning_key/i.test(serialized));
 assert.ok(!serialized.includes(process.env.SOCIALHERO_PROVISIONING_KEY!));
 for(const fixture of fixtures.values()){assert.ok(!serialized.includes(fixture.code));assert.ok(!serialized.includes(fixture.claim.accessToken));}
};
globalThis.fetch=async(input,options)=>{
 const requestUrl=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 assert.equal(requestUrl.origin,'https://socialhero.test');assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
 const headers=new Headers(options?.headers),payload=JSON.parse(String(options?.body));
 if(requestUrl.pathname==='/api/integrations/blog/v1/pairings/claim'){
  assert.equal(headers.get('authorization'),null);
  assert.deepEqual(Object.keys(payload).sort(),['attemptId','code','contractVersion','environment','origin','siteId']);
  assert.match(payload.attemptId,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(payload.siteId,'socialhero-integration');assert.equal(payload.origin,'http://127.0.0.1:4300');assert.equal(payload.environment,'development');assert.equal(payload.contractVersion,1);
  const rejection=errorCodes.get(payload.code);
  if(rejection)return Response.json({code:rejection,message:rawProviderDetail,accessToken:rawProviderDetail},{status:400});
  const fixture=fixtures.get(payload.code);assert.ok(fixture,'Only explicit local provider fixtures may be claimed');
  fixture.claimCalls++;if(fixture.attemptId)assert.equal(payload.attemptId,fixture.attemptId);else fixture.attemptId=payload.attemptId;
  const attempt=(await setup.query('select code_hash from private.socialhero_pairing_attempts where id=$1',[fixture.attemptId])).rows[0];
  assert.equal(attempt.code_hash,credentialHash(fixture.code));assert.notEqual(attempt.code_hash,fixture.code);
  await fixture.onClaim?.();
  if(fixture.loseClaimOnce){fixture.loseClaimOnce=false;throw new Error(rawProviderDetail);}
  return Response.json(fixture.claim);
 }
 const fixture=[...fixtures.values()].find(item=>requestUrl.pathname==='/api/integrations/blog/v1/pairings/'+item.claim.connectionId+'/verify');
 assert.ok(fixture,'Only claimed connection verification is allowed');fixture.verifyCalls++;
 assert.equal(headers.get('authorization'),'Bearer '+fixture.claim.accessToken);assert.deepEqual(payload,{});
 // This separate database connection proves the pending hash was committed
 // before the provider's authenticated callback begins.
 const row=(await setup.query('select * from private.blog_tokens where connection_id=$1',[fixture.claim.connectionId])).rows[0];
 assert.equal(row.token_hash,credentialHash(fixture.claim.accessToken));assert.equal(row.credential_state,'pending');
 assert.ok(row.encrypted_token);assert.ok(!row.encrypted_token.includes(fixture.claim.accessToken));
 const principal=await authenticateBlogToken(fixture.claim.accessToken,'capabilities:read');
 const capabilities=await blogCapabilities(principal);
 assert.equal(capabilities.contractVersion,1);assert.equal(capabilities.credentialState,'pending');assert.equal(capabilities.connectionId,fixture.claim.connectionId);assert.equal(capabilities.destinationId,fixture.claim.destinationId);assert.equal(capabilities.siteId,'socialhero-integration');assert.equal(capabilities.origin,'http://127.0.0.1:4300');assert.equal(capabilities.environment,'development');
 await denied(()=>getSocialHeroPost(principal,'pending-post'),'PAIRING_IN_PROGRESS');
 await denied(()=>saveSocialHeroDraft(principal,'pending-post',{}, {key:'pending-write'}),'PAIRING_IN_PROGRESS');
 await denied(()=>authenticateBlogToken(fixture.claim.accessToken,'drafts:write'),'PAIRING_IN_PROGRESS');
 safeStatus(await socialHeroAdminStatus(owner));
 await fixture.onVerify?.();
 if(fixture.verifyMode==='interrupted')throw new Error(rawProviderDetail);
 if(fixture.verifyMode==='INVALID_CREDENTIAL')return Response.json({code:'INVALID_CREDENTIAL',message:rawProviderDetail},{status:401});
 return Response.json({connectionId:fixture.verifyMode==='mismatch'?'another-connection':fixture.claim.connectionId,status:'verified'});
};
let owner:Actor;
try{
 await setup.connect();
 await setup.query("create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(user_id text);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$");
 await migrate();await migrate();
 const makeActor=async(role:'owner'|'admin'|'player'):Promise<Actor>=>{
  const id=randomUUID();await setup.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);
  await setup.query("insert into profiles(id,username,onboarded_at) values($1,$2,now()) on conflict(id) do update set username=excluded.username,onboarded_at=excluded.onboarded_at",[id,'Social'+id.replaceAll('-','').slice(0,12)]);
  if(role!=='player')await setup.query('insert into user_roles(user_id,role) values($1,$2)',[id,role]);
  return {id,username:'SocialHeroTest',role,sessionVersion:1,expiresAt:Date.now()+3_600_000,onboarded:true,sessionId:randomUUID()};
 };
 owner=await makeActor('owner');const admin=await makeActor('admin'),player=await makeActor('player');
 await denied(()=>socialHeroAdminStatus(admin),'forbidden');await denied(()=>pairSocialHero(player,'unknown-pairing'),'forbidden');
 assert.deepEqual(await socialHeroAdminStatus(owner),{configured:true,connection:null});checks.push('owner-only administration');

 const first=makeFixture('interrupted');first.verifyMode='interrupted';
 await denied(()=>pairSocialHero(owner,first.code),'SOCIALHERO_UNAVAILABLE');
 const pendingStatus=await socialHeroAdminStatus(owner);assert.equal(pendingStatus.connection?.status,'pending');safeStatus(pendingStatus);
 assert.equal((await setup.query('select count(*)::int n from private.blog_tokens')).rows[0].n,1);
 first.verifyMode='verified';const activeStatus=await checkSocialHeroConnection(owner);
 assert.equal(activeStatus.connection?.status,'active');assert.deepEqual(activeStatus.connection?.scopes,['read','draft']);safeStatus(activeStatus);
 const firstToken=await authenticateBlogToken(first.claim.accessToken),firstCaps=await blogCapabilities(firstToken);
 assert.equal(firstCaps.credentialState,'active');assert.equal(firstCaps.permissions.publish,false);assert.equal(first.verifyCalls,2);
 assert.equal((await setup.query('select encrypted_token from private.blog_tokens where connection_id=$1',[first.claim.connectionId])).rows[0].encrypted_token,null);
 checks.push('durable pending callback, blocked pending writes and resumed verification');

 const image=await sharp({create:{width:800,height:1000,channels:3,background:'#226044'}}).webp().toBuffer();
 const asset=await storeBlogMedia(firstToken,{bytes:image,width:800,height:1000,mime:'image/webp'},'paired-media');
 const payload={baseRevision:null,type:'blog',locale:'nl-NL',title:'Connector integration draft',slug:'connector-integration-draft',excerpt:'A disposable local article.',content:{format:'markdown',body:'## Local connector\n\nA durable draft.'},hero:{assetId:asset.assetId,alt:'Green local test image'}};
 const initial=await saveSocialHeroDraft(firstToken,'external-article',payload,{key:'paired-create'});
 assert.equal(initial.revision,1);assert.deepEqual(await saveSocialHeroDraft(firstToken,'external-article',payload,{key:'paired-create'}),initial);
 const updated=await saveSocialHeroDraft(firstToken,'external-article',{...payload,baseRevision:1,title:'Updated same article'},{key:'paired-update'});
 assert.equal(updated.postId,initial.postId);assert.equal(updated.revision,2);assert.equal((await listPublishedBlogArticles()).length,0);
 await denied(()=>saveSocialHeroDraft(firstToken,'external-article',{...payload,baseRevision:1},{key:'stale-update'}),'REVISION_CONFLICT');
 await denied(()=>publishSocialHeroPost(firstToken,'external-article',2,'publish-denied'),'PERMISSION_DENIED');
 // A forged cached principal scope cannot override the current local policy.
 firstToken.scopes.push('publish');await denied(()=>publishSocialHeroPost(firstToken,'external-article',2,'publish-denied-forged'),'PERMISSION_DENIED');
 await setSocialHeroPolicy(owner,true);const published=await publishSocialHeroPost(firstToken,'external-article',2,'paired-publish');
 assert.equal(published.state,'published');assert.equal(published.publicUrl,'http://127.0.0.1:4300/blog/connector-integration-draft');
 await setSocialHeroPolicy(owner,false);await denied(()=>publishSocialHeroPost(firstToken,'external-article',2,'publish-policy-off'),'PERMISSION_DENIED');
 checks.push('draft replay, update, revision conflicts and local publication policy');

 const rotated=makeFixture('lost-claim');rotated.loseClaimOnce=true;
 await denied(()=>pairSocialHero(owner,rotated.code),'SOCIALHERO_UNAVAILABLE');
 assert.equal((await setup.query('select count(*)::int n from private.blog_tokens')).rows[0].n,1);
 await authenticateBlogToken(first.claim.accessToken);
 rotated.onVerify=async()=>{await authenticateBlogToken(first.claim.accessToken);assert.equal((await getSocialHeroPost(firstToken,'external-article')).postId,initial.postId);};
 const rotatedStatus=await pairSocialHero(owner,rotated.code);safeStatus(rotatedStatus);
 assert.equal(rotated.claimCalls,2);assert.equal(rotatedStatus.connection?.destinationId,first.claim.destinationId);assert.equal(rotatedStatus.connection?.status,'active');
 await denied(()=>authenticateBlogToken(first.claim.accessToken),'INVALID_CREDENTIAL');await denied(()=>getSocialHeroPost(firstToken,'external-article'),'INVALID_CREDENTIAL');
 const rotatedToken=await authenticateBlogToken(rotated.claim.accessToken);
 assert.equal((await getSocialHeroPost(rotatedToken,'external-article')).postId,initial.postId);
 assert.deepEqual(await saveSocialHeroDraft(rotatedToken,'external-article',payload,{key:'paired-create'}),initial);
 const tokenCount=(await setup.query('select count(*)::int n from private.blog_tokens')).rows[0].n;
 await pairSocialHero(owner,rotated.code);assert.equal((await setup.query('select count(*)::int n from private.blog_tokens')).rows[0].n,tokenCount);
 checks.push('lost-claim idempotence, same destination mapping and credential handover');

 const reusedConnection=makeFixture('reused-connection');reusedConnection.claim={...rotated.claim};
 await denied(()=>pairSocialHero(owner,reusedConnection.code),'DESTINATION_MISMATCH');assert.equal(reusedConnection.verifyCalls,0);await authenticateBlogToken(rotated.claim.accessToken);
 const limited=makeFixture('local-deadline');limited.verifyMode='interrupted';
 limited.onClaim=async()=>{await setup.query("update private.socialhero_pairing_attempts set expires_at=now()+interval '1 minute' where id=$1",[limited.attemptId]);};
 await denied(()=>pairSocialHero(owner,limited.code),'SOCIALHERO_UNAVAILABLE');
 const deadline=(await setup.query('select t.provisioning_expires_at,a.expires_at from private.blog_tokens t join private.socialhero_pairing_attempts a on a.id=t.pairing_attempt_id where t.connection_id=$1',[limited.claim.connectionId])).rows[0];
 assert.equal(new Date(deadline.provisioning_expires_at).getTime(),new Date(deadline.expires_at).getTime());assert.ok(new Date(deadline.provisioning_expires_at).getTime()<Date.now()+90_000);await authenticateBlogToken(rotated.claim.accessToken);
 checks.push('claim attempt binding and local provisioning deadline');

 for(const code of ['INVALID_PAIRING_CODE','PAIRING_EXPIRED','DESTINATION_MISMATCH']){
  const input='rejected-'+code;errorCodes.set(input,code);await denied(()=>pairSocialHero(owner,input),code);await authenticateBlogToken(rotated.claim.accessToken);
 }
 for(const verifyMode of ['mismatch','INVALID_CREDENTIAL'] as const){
  const rejected=makeFixture('verify-'+verifyMode);rejected.verifyMode=verifyMode;
  await denied(()=>pairSocialHero(owner,rejected.code),verifyMode==='mismatch'?'DESTINATION_MISMATCH':'INVALID_CREDENTIAL');
  await denied(()=>authenticateBlogToken(rejected.claim.accessToken),'INVALID_CREDENTIAL');await authenticateBlogToken(rotated.claim.accessToken);
  const retainedStatus=await socialHeroAdminStatus(owner);assert.equal(retainedStatus.connection?.status,'active');assert.equal(retainedStatus.connection?.connectionId,rotated.claim.connectionId);safeStatus(retainedStatus);
  assert.equal((await setup.query('select encrypted_token from private.blog_tokens where connection_id=$1',[rejected.claim.connectionId])).rows[0].encrypted_token,null);
 }
 checks.push('controlled invalid, expired, wrong-site and rejected-verification errors');

 const expired=makeFixture('expiry');expired.verifyMode='interrupted';await denied(()=>pairSocialHero(owner,expired.code),'SOCIALHERO_UNAVAILABLE');
 await setup.query("update private.blog_tokens set provisioning_expires_at=now()-interval '1 second' where connection_id=$1",[expired.claim.connectionId]);
 const expiredStatus=await checkSocialHeroConnection(owner);assert.equal(expiredStatus.connection?.status,'active');assert.equal(expiredStatus.connection?.connectionId,rotated.claim.connectionId);safeStatus(expiredStatus);
 await denied(()=>authenticateBlogToken(expired.claim.accessToken),'INVALID_CREDENTIAL');await authenticateBlogToken(rotated.claim.accessToken);
 const expiredRow=(await setup.query('select encrypted_token,credential_state,revoked_at from private.blog_tokens where connection_id=$1',[expired.claim.connectionId])).rows[0];assert.equal(expiredRow.encrypted_token,null);assert.equal(expiredRow.credential_state,'expired');assert.ok(expiredRow.revoked_at);
 await setup.query("update private.socialhero_pairing_attempts set expires_at=now()-interval '1 second' where id=$1",[expired.attemptId]);
 await denied(()=>pairSocialHero(owner,expired.code),'PAIRING_EXPIRED');
 checks.push('expired provisioning cleanup and expired claim reuse denied');

 const other=makeFixture('other-destination','other-destination');await pairSocialHero(owner,other.code);
 const otherToken=await authenticateBlogToken(other.claim.accessToken);
 await denied(()=>getSocialHeroPost(otherToken,'external-article'),'POST_NOT_FOUND');
 await denied(()=>saveSocialHeroDraft(otherToken,'other-post',{...payload,slug:'foreign-media'},{key:'foreign-media'}),'INVALID_CONTENT');
 const originalSite=process.env.BLOG_SITE_ID;process.env.BLOG_SITE_ID='another-installation';
 await denied(()=>authenticateBlogToken(other.claim.accessToken),'INVALID_CREDENTIAL');await denied(()=>getSocialHeroPost(otherToken,'external-article'),'PERMISSION_DENIED');process.env.BLOG_SITE_ID=originalSite;
 process.env.APP_ENV='staging';await denied(()=>authenticateBlogToken(other.claim.accessToken),'INVALID_CREDENTIAL');process.env.APP_ENV='development';
 checks.push('destination, installation and environment isolation');

 const cancelled=makeFixture('disconnect-during-verification');cancelled.onVerify=async()=>{await disconnectSocialHero(owner);};
 await denied(()=>pairSocialHero(owner,cancelled.code),'PAIRING_EXPIRED');await denied(()=>authenticateBlogToken(cancelled.claim.accessToken),'INVALID_CREDENTIAL');
 const disconnected=await disconnectSocialHero(owner);assert.equal(disconnected.connection?.status,'revoked');assert.deepEqual(disconnected.connection?.scopes,[]);safeStatus(disconnected);
 await denied(()=>authenticateBlogToken(other.claim.accessToken),'INVALID_CREDENTIAL');await disconnectSocialHero(owner);
 assert.equal((await setup.query('select count(*)::int n from private.blog_posts')).rows[0].n,1);assert.equal((await listPublishedBlogArticles()).length,1);
 const final=makeFixture('machine-revoke');await pairSocialHero(owner,final.code);const finalToken=await authenticateBlogToken(final.claim.accessToken);
 await revokeSocialHeroCredential(finalToken);await revokeSocialHeroCredential(finalToken);await denied(()=>authenticateBlogToken(final.claim.accessToken),'INVALID_CREDENTIAL');
 checks.push('idempotent local and machine revocation preserve publication history');

 // A failed handover must keep the actual active connection visible, so an
 // administrator can still disconnect the credential that retains access.
 const retained=makeFixture('retained-active');await pairSocialHero(owner,retained.code);
 const failedHandover=makeFixture('failed-handover');failedHandover.verifyMode='INVALID_CREDENTIAL';
 await denied(()=>pairSocialHero(owner,failedHandover.code),'INVALID_CREDENTIAL');
 await authenticateBlogToken(retained.claim.accessToken);await denied(()=>authenticateBlogToken(failedHandover.claim.accessToken),'INVALID_CREDENTIAL');
 const retainedStatus=await socialHeroAdminStatus(owner);assert.equal(retainedStatus.connection?.status,'active');assert.equal(retainedStatus.connection?.connectionId,retained.claim.connectionId);assert.deepEqual(retainedStatus.connection?.scopes,['read','draft']);safeStatus(retainedStatus);
 const revokedStatus=await disconnectSocialHero(owner);assert.equal(revokedStatus.connection?.status,'revoked');assert.deepEqual(revokedStatus.connection?.scopes,[]);safeStatus(revokedStatus);
 await denied(()=>authenticateBlogToken(retained.claim.accessToken),'INVALID_CREDENTIAL');
 checks.push('failed handover reports the retained active connection and permits full disconnect');

 const tables=['socialhero_settings','socialhero_pairing_attempts'];
 for(const table of tables){
  assert.equal((await setup.query("select rowsecurity from pg_tables where schemaname='private' and tablename=$1",[table])).rows[0].rowsecurity,true);
  for(const role of ['anon','authenticated']){
   assert.equal((await setup.query("select has_table_privilege($1,$2,'select') allowed",[role,'private.'+table])).rows[0].allowed,false);
   await setup.query('set role '+role);await assert.rejects(setup.query('select * from private.'+table),/permission denied/);await setup.query('reset role');
  }
 }
 const auditDetails=JSON.stringify((await setup.query('select data from private.audit_events')).rows);
 for(const fixture of fixtures.values()){assert.ok(!auditDetails.includes(fixture.code));assert.ok(!auditDetails.includes(fixture.claim.accessToken));}
 checks.push('private RLS and grants, sanitized administration and audit data');
 console.log(JSON.stringify({event:'socialhero_pairing_integration_passed',checks,scope:'isolated PostgreSQL with mocked provider transport and real local callback services'}));
}finally{
 globalThis.fetch=originalFetch;
 await db().end();await setup.end();await control.query('drop database '+database+' with (force)');await control.end();
}
