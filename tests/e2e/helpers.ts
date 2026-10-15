import {chromium,type Page,type Browser} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
export const origin=process.env.E2E_ORIGIN??'http://127.0.0.1:4300';
let stagingAccount=0;
// Isolate local browser IP budgets; native QA bypasses the production Caddy ingress.
export function testClientHeaders(){const id=randomUUID().replaceAll('-','');return {'x-forwarded-for':`198.18.${parseInt(id.slice(0,2),16)}.${parseInt(id.slice(2,4),16)}`};}
export async function login(browser:Browser,label:string,{hasTouch=false}:{hasTouch?:boolean}={}){
 if(process.env.E2E_STAGING_FIXTURE){
  if(origin!=='https://staging.dartspoint.nl')throw new Error('Reserved staging fixture only');
  const path=process.env.E2E_STAGING_FIXTURE,metadata=statSync(path);
  if(metadata.mode&0o077)throw new Error('Browser fixture requires private file permissions');
  const fixture=JSON.parse(readFileSync(path,'utf8'));
  if(fixture.origin!==origin||!Array.isArray(fixture.fixtures)||fixture.fixtures.length!==2)throw new Error('Unexpected staging fixture');
  const user=fixture.fixtures[stagingAccount++%2],context=await browser.newContext({viewport:{width:1366,height:768},hasTouch,...(process.env.E2E_STAGING_PROXY?{proxy:{server:process.env.E2E_STAGING_PROXY}}:{})});
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  const cookieName='sb-'+new URL(fixture.supabaseUrl).hostname.split('.')[0]+'-auth-token',encoded='base64-'+Buffer.from(JSON.stringify(user.session)).toString('base64url');
  const pieces=encoded.match(/.{1,3180}/g)!;
  await context.addCookies(pieces.map((value,index)=>({name:cookieName+(pieces.length>1?'.'+index:''),value,url:origin,secure:true,sameSite:'Lax' as const,httpOnly:false})));
  const page=await context.newPage();await page.goto(origin+'/lobby');
  const state=await get(page,'bootstrap');if(state.actor.id!==user.id||state.actor.role!=='player')throw new Error('Fixture identity mismatch');
  return {page,context,email:user.session.user.email,name:user.username,id:user.id,token:user.session.access_token};
 }
 const context=await browser.newContext({viewport:{width:1366,height:768},hasTouch});await context.addInitScript('globalThis.__name = (fn) => fn;');const headers=testClientHeaders();
 await context.route('**/api/platform/auth/**',route=>route.continue({headers:{...route.request().headers(),...headers}}));const page=await context.newPage();
 const suffix=randomUUID().replaceAll('-','').slice(0,8),email=`qa-${label}-${suffix}@dartspoint.local`,name=`${label}${suffix}`;
 await page.goto(origin+'/inloggen');await page.getByLabel('E-mailadres',{exact:true}).fill(email);await page.getByRole('button',{name:'Ontvang je inlogcode'}).click();await page.getByLabel('Je eenmalige code').waitFor();
 let code:string|undefined;
 const otpPoll={pollAttempts:0,listingHTTPStatus:null as number|null,mailboxCount:null as number|null,recipientMailFound:false,mailDetailHTTPStatus:null as number|null,otpPatternPresent:false};
 const otpPollStartedAt=performance.now();
 try{
  for(let attempt=0;attempt<40&&!code;attempt++){
   otpPoll.pollAttempts++;const listingResponse=await fetch('http://127.0.0.1:62424/api/v1/messages');otpPoll.listingHTTPStatus=listingResponse.status;
   const listing=await listingResponse.json();otpPoll.mailboxCount=Array.isArray(listing.messages)?listing.messages.length:null;const sent=listing.messages.find((m:any)=>m.To.some((t:any)=>t.Address.toLowerCase()===email.toLowerCase()));
   if(sent){otpPoll.recipientMailFound=true;const mailResponse=await fetch('http://127.0.0.1:62424/api/v1/message/'+sent.ID);otpPoll.mailDetailHTTPStatus=mailResponse.status;const mail=await mailResponse.json();code=(mail.Text||mail.HTML).match(/\b\d{6}\b/)?.[0];otpPoll.otpPatternPresent=Boolean(code);}if(!code)await new Promise(r=>setTimeout(r,100));
  }
  if(!code)throw new Error('OTP message not received');
 }catch(error){console.error(JSON.stringify({event:'otp_delivery_poll_failed',...otpPoll,elapsedMs:performance.now()-otpPollStartedAt}));throw error;}
 await page.getByLabel('Je eenmalige code').fill(code);await page.getByRole('button',{name:'Bevestig je code'}).click();await page.getByLabel('Spelersnaam',{exact:true}).waitFor();await page.getByLabel('Spelersnaam',{exact:true}).fill(name);await page.getByRole('checkbox',{name:/Ik ben ten minste 16 jaar/}).check();await page.getByRole('checkbox',{name:/Ik aanvaard de/}).check();await page.getByRole('button',{name:'Bevestig mijn spelersnaam'}).click();await page.getByRole('button',{name:'Open de lobby'}).waitFor();await page.getByRole('button',{name:'Open de lobby'}).click();await page.waitForURL('**/lobby');
 const state=await get(page,'bootstrap');
 const cookies=await context.cookies();const parts=cookies.filter(c=>/^sb-.*-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');
 const session=JSON.parse(Buffer.from(parts.replace(/^base64-/,''),'base64url').toString());
 return {page,context,email,name,id:state.actor.id,token:session.access_token};
}
export async function post(page:Page,path:string,input:unknown){const response=await page.request.post(origin+'/api/platform/'+path,{data:input});const data=await response.json();if(!response.ok())throw new Error(`API ${path}: ${response.status()} ${data.code}`);return data;}
export async function get(page:Page,path:string){const response=await page.request.get(origin+'/api/platform/'+path);if(!response.ok())throw new Error(`API ${path}: ${response.status()}`);return response.json();}

/** Only for the caller's newly created local player fixtures, inside its cleanup
 * transaction. Keep normal Auth onboarding intact; remove its owned evidence
 * before the existing fixture-specific profile/Auth cleanup. Never use this for
 * privacy/retention tests or to remove published legal documents. */
export async function cleanupOwnedOnboarding(client:PoolClient,fixtures:readonly {id:string;email:string;name?:string}[]){
 assert.equal(process.env.APP_ENV,'development');
 assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
 for(const value of [origin,process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.DATABASE_URL!,process.env.MIGRATION_DATABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
 if(!fixtures.length)return;
 const ids=fixtures.map(fixture=>fixture.id);
 assert.equal(new Set(ids).size,ids.length,'Each owned fixture UUID is supplied once');
 for(const fixture of fixtures){assert.match(fixture.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);assert.ok(fixture.email.toLowerCase().endsWith('@dartspoint.local'));}
 const rows=(await client.query('select p.id,p.username,u.email,exists(select 1 from user_roles r where r.user_id=p.id) staff from profiles p join auth.users u on u.id=p.id where p.id=any($1::uuid[]) order by p.id for update of p',[ids])).rows;
 assert.equal(rows.length,fixtures.length,'All cleanup identities must still be the exact owned local fixtures');
 for(const fixture of fixtures){const row=rows.find(value=>value.id===fixture.id);assert.ok(row&&!row.staff&&row.email.toLowerCase()===fixture.email.toLowerCase(),'Cleanup is restricted to the exact owned normal-player identity');if(fixture.name!==undefined)assert.equal(row.username,fixture.name);}
 await client.query('delete from private.legal_acceptances where user_id=any($1::uuid[])',[ids]);
 await client.query('delete from private.privacy_reauths where user_id=any($1::uuid[])',[ids]);
 await client.query('delete from private.revoked_sessions where user_id=any($1::uuid[])',[ids]);
}
