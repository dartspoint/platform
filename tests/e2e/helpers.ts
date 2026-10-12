import {chromium,type Page,type Browser} from '@playwright/test';
import {randomUUID} from 'node:crypto';
export const origin='http://127.0.0.1:4300';
// Isolate local browser IP budgets; native QA bypasses the production Caddy ingress.
export function testClientHeaders(){const id=randomUUID().replaceAll('-','');return {'x-forwarded-for':`198.18.${parseInt(id.slice(0,2),16)}.${parseInt(id.slice(2,4),16)}`};}
export async function login(browser:Browser,label:string){
 const context=await browser.newContext({viewport:{width:1366,height:768}});const headers=testClientHeaders();
 await context.route('**/api/platform/auth/**',route=>route.continue({headers:{...route.request().headers(),...headers}}));const page=await context.newPage();
 const suffix=randomUUID().replaceAll('-','').slice(0,8),email=`qa-${label}-${suffix}@dartspoint.local`,name=`${label}${suffix}`;
 await page.goto(origin+'/inloggen');await page.getByLabel('E-mailadres',{exact:true}).fill(email);await page.getByRole('button',{name:'Ontvang je inlogcode'}).click();await page.getByLabel('Je eenmalige code').waitFor();
 let code:string|undefined;
 for(let attempt=0;attempt<40&&!code;attempt++){
  const listing=await(await fetch('http://127.0.0.1:62424/api/v1/messages')).json();const sent=listing.messages.find((m:any)=>m.To.some((t:any)=>t.Address.toLowerCase()===email.toLowerCase()));
  if(sent){const mail=await(await fetch('http://127.0.0.1:62424/api/v1/message/'+sent.ID)).json();code=(mail.Text||mail.HTML).match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,100));
 }
 if(!code)throw new Error('OTP message not received');
 await page.getByLabel('Je eenmalige code').fill(code);await page.getByRole('button',{name:'Bevestig je code'}).click();await page.getByLabel('Spelersnaam',{exact:true}).waitFor();await page.getByLabel('Spelersnaam',{exact:true}).fill(name);await page.getByRole('button',{name:'Bevestig mijn spelersnaam'}).click();await page.getByRole('button',{name:'Open de lobby'}).waitFor();await page.getByRole('button',{name:'Open de lobby'}).click();await page.waitForURL('**/lobby');
 const state=await get(page,'bootstrap');
 const cookies=await context.cookies();const parts=cookies.filter(c=>/^sb-.*-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');
 const session=JSON.parse(Buffer.from(parts.replace(/^base64-/,''),'base64url').toString());
 return {page,context,email,name,id:state.actor.id,token:session.access_token};
}
export async function post(page:Page,path:string,input:unknown){const response=await page.request.post(origin+'/api/platform/'+path,{data:input});const data=await response.json();if(!response.ok())throw new Error(`API ${path}: ${response.status()} ${data.code}`);return data;}
export async function get(page:Page,path:string){const response=await page.request.get(origin+'/api/platform/'+path);if(!response.ok())throw new Error(`API ${path}: ${response.status()}`);return response.json();}
