import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {writeFile} from 'node:fs/promises';
import {origin,login,get,testClientHeaders} from './helpers';
import {authAdmin,actorById,verifyToken} from '../../packages/data/src/auth';
import {db,redis} from '../../packages/data/src/db';
import {onboard} from '../../packages/data/src/community';
assert.equal(process.env.APP_ENV,'development');const browser=await chromium.launch(),migration=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1});let providerStopped=false;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function code(email:string){email=email.toLowerCase();for(let i=0;i<50;i++){const list=await(await fetch('http://127.0.0.1:62424/api/v1/messages')).json();const sent=list.messages.find((m:any)=>m.To.some((t:any)=>t.Address.toLowerCase()===email));if(sent){const mail=await(await fetch('http://127.0.0.1:62424/api/v1/message/'+sent.ID)).json();return (mail.Text||mail.HTML).match(/\b\d{6}\b/)[0];}await sleep(100);}throw new Error('Real OTP mail was not received');}
try{
 const a=await login(browser,'AuthQA');await a.page.request.post(origin+'/api/platform/auth/logout',{data:{}});await assert.rejects(verifyToken(a.token),{status:401});assert.equal((await a.page.request.get(origin+'/api/platform/bootstrap')).status(),401);
 // A returning player receives a new real OTP and keeps the existing username/rating.
 await sleep(61000);await a.page.goto(origin+'/inloggen');await a.page.getByLabel('E-mailadres',{exact:true}).fill(a.email);await a.page.getByRole('button',{name:'Ontvang je inlogcode'}).click();await a.page.getByLabel('Je eenmalige code').waitFor();await a.page.getByLabel('Je eenmalige code').fill(await code(a.email));await a.page.getByRole('button',{name:'Bevestig je code'}).click();await a.page.getByRole('button',{name:'Open de lobby'}).waitFor();assert.equal(await a.page.getByLabel('Spelersnaam',{exact:true}).count(),0);await a.page.getByRole('button',{name:'Open de lobby'}).click();await a.page.waitForURL('**/lobby');assert.equal((await get(a.page,'bootstrap')).actor.username,a.name);
 const context=await browser.newContext({extraHTTPHeaders:testClientHeaders()}),page=await context.newPage();const email='qa-auth-'+randomUUID().slice(0,8)+'@dartspoint.local';
 const requested=await page.request.post(origin+'/api/platform/auth/request',{data:{email}});assert.equal(requested.status(),200);const first=await code(email);
 assert.equal((await page.request.post(origin+'/api/platform/auth/request',{data:{email}})).status(),429,'Real resend cooldown');
 assert.equal((await page.request.post(origin+'/api/platform/auth/verify',{data:{email,code:first==='000000'?'111111':'000000'}})).status(),400);
 await migration.query("update auth.users set confirmation_sent_at=now()-interval '11 minutes',recovery_sent_at=now()-interval '11 minutes' where email=$1",[email]);
 assert.equal((await page.request.post(origin+'/api/platform/auth/verify',{data:{email,code:first}})).status(),400,'Provider enforces expiry');
 await sleep(61000);assert.equal((await page.request.post(origin+'/api/platform/auth/request',{data:{email}})).status(),200);const second=await code(email);
 if(first!==second)assert.equal((await page.request.post(origin+'/api/platform/auth/verify',{data:{email,code:first}})).status(),400,'Previous code replaced');
 assert.equal((await page.request.post(origin+'/api/platform/auth/verify',{data:{email,code:second}})).status(),200);
 assert.equal((await page.request.post(origin+'/api/platform/auth/verify',{data:{email,code:second}})).status(),400,'OTP cannot be reused');
 const raceActors=[];for(let i=0;i<2;i++){const made=await authAdmin().auth.admin.createUser({email:'qa-name-race-'+randomUUID()+'@dartspoint.local',email_confirm:true});assert.equal(made.error,null);raceActors.push(await actorById(made.data.user!.id,Date.now()+3600000,false));}
 const username='Race'+randomUUID().replaceAll('-','').slice(0,8),race=await Promise.allSettled(raceActors.map((actor,i)=>onboard(actor,{username:i?username.toUpperCase():username})));assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'Case insensitive username reserved atomically');
 const parts=(await a.context.cookies()).filter(c=>/^sb-.*-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');const activeToken=JSON.parse(Buffer.from(parts.replace(/^base64-/,''),'base64url').toString()).access_token;
 await db().query("update profiles set status='suspended' where id=$1",[a.id]);assert.equal((await a.page.request.get(origin+'/api/platform/bootstrap')).status(),403);assert.equal((await a.page.request.post(origin+'/api/platform/auth/logout',{data:{}})).status(),200,'Suspension cannot prevent session revocation');await db().query("update profiles set status='active' where id=$1",[a.id]);await assert.rejects(verifyToken(activeToken),{status:401});
 // The owned local Auth service is stopped briefly to exercise an actual provider error.
 const stopped=spawnSync('docker',['stop','--time','1','supabase_auth_dartspoint-development'],{stdio:'ignore'});assert.equal(stopped.status,0);providerStopped=true;
 const failed=await fetch(origin+'/api/platform/auth/request',{method:'POST',headers:{'Content-Type':'application/json',...testClientHeaders()},body:JSON.stringify({email:'qa-outage-'+randomUUID()+'@dartspoint.local'}),signal:AbortSignal.timeout(20000)});assert.equal(failed.status,503);assert.equal((await failed.json()).code,'auth_provider');
 spawnSync('docker',['start','supabase_auth_dartspoint-development'],{stdio:'ignore'});providerStopped=false;
 await writeFile('artifacts/auth-result.json',JSON.stringify({ok:true,realOtpMail:true,returningProfileRetained:true,logoutRevokesJwt:true,resendCooldown:true,wrongExpiredReplacedReusedCodesRejected:true,usernameRace:true,suspendedAccountDenied:true,suspendedLogoutRevokes:true,actualProviderOutage:true},null,2));console.log('Real OTP lifecycle, returning login, username race, session revocation, suspension and provider outage passed');
}finally{if(providerStopped)spawnSync('docker',['start','supabase_auth_dartspoint-development'],{stdio:'ignore'});await browser.close();await migration.end();await db().end();await(await redis()).quit();}
