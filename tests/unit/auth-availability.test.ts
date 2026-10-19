import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {verifyToken,verifyLogoutToken} from '../../packages/data/src/auth';
import {db} from '../../packages/data/src/db';
import {DomainError} from '../../packages/contracts/src/index';

test('Authentication rejects without an actor when any mandatory verification is unavailable',async t=>{
 const project='https://auth-fixture.invalid',userId='00000000-0000-4000-8000-000000000001',sessionId='00000000-0000-4000-8000-000000000002';
 const names=['APP_ENV','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','DATABASE_URL','DATABASE_ROLE'] as const;
 const saved=new Map(names.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{APP_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:project,SUPABASE_SECRET_KEY:'unit-only-key',DATABASE_URL:'postgresql://unit:unit@127.0.0.1:5432/unit'});delete process.env.DATABASE_ROLE;
 const pool=db(),pair=await generateKeyPair('ES256'),otherPair=await generateKeyPair('ES256'),jwk={...await exportJWK(pair.publicKey),kid:'unit-key',alg:'ES256',use:'sig'};
 const symmetricKey=new TextEncoder().encode('unit-only-signing-material-at-least-thirty-two-bytes');
 let calls:string[]=[],lookups=0,providerMode:number|'timeout'|'invalid-json'=200,jwksMode:'timeout'|'server'|'invalid'|'ok'='ok',databaseFailure:unknown;
 const active={id:userId,actor_kind:'human',auth_user_id:userId,username:'UnitPlayer',role:'player',status:'active',onboarded_at:new Date(),session_version:1,globally_suspended:false,session_revoked:false,rename_required:false};
 let profile={...active},providerUserId=userId,confirmed=true;
 const fetchMock=mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
  const url=new URL(input instanceof Request?input.url:String(input));assert.equal(url.origin,project,'Mock must intercept every provider request');calls.push(url.pathname);
  if(url.pathname==='/auth/v1/.well-known/jwks.json'){
   if(jwksMode==='timeout')throw new DOMException('private upstream detail','TimeoutError');
   if(jwksMode==='server')return new Response('{}',{status:503});
   return Response.json(jwksMode==='invalid'?{keys:'invalid'}:{keys:[jwk]});
  }
  assert.equal(url.pathname,'/auth/v1/user');
  if(providerMode==='timeout')throw new DOMException('private upstream detail','TimeoutError');
  if(providerMode==='invalid-json')return new Response('not-json',{status:200});
  if(providerMode!==200)return Response.json({msg:'private upstream detail',code:providerMode===400?'session_not_found':'bad_jwt'},{status:providerMode,headers:{'x-supabase-api-version':'2024-01-01'}});
  return Response.json({id:providerUserId,email_confirmed_at:confirmed?'2026-01-01T00:00:00Z':null});
 });
 // No real PG client is acquired. Exercise the actual fresh actor lookup and
 // its security predicates through the same query result boundary.
 const queryMock=mock.method(pool,'query',(async()=>{lookups++;if(databaseFailure)throw databaseFailure;return {rows:[profile],rowCount:1};}) as unknown as typeof pool.query);
 // The installed SDK logs a thrown fetch error itself; the fixture supplies
 // no request data and suppresses that synthetic private message.
 const consoleMock=mock.method(console,'error',()=>{});
 const token=async(alg:'HS256'|'ES256'='HS256',claims:Record<string,unknown>={},key=pair.privateKey,kid='unit-key')=>new SignJWT({sub:userId,role:'authenticated',session_id:sessionId,iss:project+'/auth/v1',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims}).setProtectedHeader(alg==='HS256'?{alg}:{alg,kid}).sign(alg==='HS256'?symmetricKey:key);
 const awaitableToken=await token(),signedToken=await token('ES256');
 const reset=()=>{calls=[];lookups=0;providerMode=200;jwksMode='ok';databaseFailure=undefined;profile={...active};providerUserId=userId;confirmed=true;};
 const denied=async(operation:()=>Promise<unknown>,status:number,code:string)=>{
  let returned=false;
  await assert.rejects(async()=>{const actor=await operation();returned=!!actor;},error=>error instanceof DomainError&&error.status===status&&error.code===code&&!error.message.includes('private upstream'));
  assert.equal(returned,false,'Unavailable or invalid verification never returns an authorized actor');
 };
 try{
  await t.test('malformed and unsupported tokens fail before provider or storage',async()=>{
   reset();await denied(()=>verifyToken('invalid-token-with-no-valid-header'),401,'unauthenticated');
   const unsupported=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from('{}').toString('base64url')+'.signature';
   await denied(()=>verifyToken(unsupported),401,'unauthenticated');assert.deepEqual(calls,[]);assert.equal(lookups,0);
  });
  for(const status of ['timeout',502,503,504,429,'invalid-json'] as const)await t.test(`getUser ${status} is an unavailable dependency, not invalid credentials`,async()=>{
   reset();providerMode=status;await denied(()=>verifyToken(awaitableToken),503,'auth_provider_unavailable');assert.deepEqual(calls,['/auth/v1/user']);assert.equal(lookups,0);
  });
  await t.test('provider rejection and missing session still fail401',async()=>{
   for(const status of [400,401,403]){reset();providerMode=status;await denied(()=>verifyToken(awaitableToken),401,'unauthenticated');assert.equal(lookups,0);}
  });
  await t.test('legacy confirmed identity still needs valid issuer/audience/expiry/session and fresh profile',async()=>{
   for(const claims of [{iss:'https://other.invalid/auth/v1'},{aud:'other'},{role:'other'},{exp:1},{session_id:'not-a-session'}]){reset();const value=await token('HS256',claims);await denied(()=>verifyToken(value),401,'unauthenticated');assert.equal(lookups,0);}
   reset();const actor=await verifyToken(awaitableToken);assert.equal(actor.id,userId);assert.equal(actor.sessionId,sessionId);assert.equal(lookups,1);assert.deepEqual(calls,['/auth/v1/user']);assert.equal(pool.totalCount,0);
  });
  for(const mode of ['timeout','server','invalid'] as const)await t.test(`JWKS ${mode} fails503 before getUser or actor lookup`,async()=>{
   reset();jwksMode=mode;await denied(()=>verifyToken(signedToken),503,'auth_keys_unavailable');assert.deepEqual(calls,['/auth/v1/.well-known/jwks.json']);assert.equal(lookups,0);
  });
  await t.test('asymmetric signature and provider are both mandatory; key cache is never an authorization cache',async()=>{
   reset();assert.equal((await verifyToken(signedToken)).id,userId);assert.equal(lookups,1);assert.deepEqual(calls,['/auth/v1/.well-known/jwks.json','/auth/v1/user']);
   reset();providerMode=503;await denied(()=>verifyToken(signedToken),503,'auth_provider_unavailable');assert.deepEqual(calls,['/auth/v1/user']);assert.equal(lookups,0);
   reset();providerUserId='00000000-0000-4000-8000-000000000003';await denied(()=>verifyToken(signedToken),401,'unauthenticated');assert.equal(lookups,0);
   reset();confirmed=false;await denied(()=>verifyToken(signedToken),401,'unauthenticated');assert.equal(lookups,0);
  });
  await t.test('invalid signatures and signed claims remain401 without provider or storage',async()=>{
   for(const value of [await token('ES256',{},otherPair.privateKey),await token('ES256',{exp:1}),await token('ES256',{iss:'https://other.invalid/auth/v1'}),await token('ES256',{aud:'other'}),await token('ES256',{session_id:'not-a-session'})]){reset();await denied(()=>verifyToken(value),401,'unauthenticated');assert.deepEqual(calls,[]);assert.equal(lookups,0);}
  });
  await t.test('an unresolved signing key cannot establish either identity or invalid-session truth',async()=>{
   reset();const value=await token('ES256',{},pair.privateKey,'unknown-key');await denied(()=>verifyToken(value),503,'auth_keys_unavailable');assert.deepEqual(calls,[]);assert.equal(lookups,0);
  });
  await t.test('fresh database failure is503 and cannot return a verified actor',async()=>{
   reset();databaseFailure=Object.assign(new Error('private SQL detail'),{code:'08006'});await denied(()=>verifyToken(signedToken),503,'auth_storage_unavailable');assert.deepEqual(calls,['/auth/v1/user']);assert.equal(lookups,1);
  });
  await t.test('fresh bans, onboarding and revocation retain their actual denial and are never cached',async()=>{
   for(const [fields,status,code] of [[{status:'suspended'},403,'banned'],[{globally_suspended:true},403,'banned'],[{onboarded_at:null},403,'profile_incomplete'],[{session_revoked:true},401,'session_revoked']] as const){reset();Object.assign(profile,fields);await denied(()=>verifyToken(signedToken),status,code);assert.equal(lookups,1);}
   reset();assert.equal((await verifyToken(signedToken)).id,userId);assert.equal(lookups,1);
   reset();profile.session_revoked=true;await denied(()=>verifyToken(signedToken),401,'session_revoked');assert.equal(lookups,1);
  });
  await t.test('logout remains verified and scoped even for a suspended profile',async()=>{
   reset();profile.status='suspended';assert.equal((await verifyLogoutToken(signedToken)).id,userId);assert.equal(lookups,1);
   reset();providerMode=503;await denied(()=>verifyLogoutToken(signedToken),503,'auth_provider_unavailable');assert.equal(lookups,0);
  });
 }finally{
  fetchMock.mock.restore();queryMock.mock.restore();consoleMock.mock.restore();await pool.end();
  for(const name of names){const value=saved.get(name);if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
 // Tokens stay in memory and are never included in test output or artifacts.
});
