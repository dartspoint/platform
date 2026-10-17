import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect,type Page} from '@playwright/test';

// Exercise the actual React widget and auth flow, with only the external SDK
// and auth HTTP responses simulated. No provider, email, account or DB is used.
const sitekey='1x00000000000000000000AA',directory='artifacts/turnstile-browser';
const fixture=await build({
 stdin:{contents:`
  import {StrictMode,useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {DartsAuthFlow} from './apps/web/components/darts-login';
  import {Turnstile} from './apps/web/components/turnstile';
  import {LocaleProvider} from './apps/web/lib/i18n/provider';
  import loginNl from './packages/i18n/src/catalogs/login.nl.json';
  import loginEn from './packages/i18n/src/catalogs/login.en.json';
  import turnstileNl from './packages/i18n/src/catalogs/turnstile.nl.json';
  import turnstileEn from './packages/i18n/src/catalogs/turnstile.en.json';
  import designStudioNl from './packages/i18n/src/catalogs/designStudio.nl.json';
  import designStudioEn from './packages/i18n/src/catalogs/designStudio.en.json';
  const catalogs={nl:{login:loginNl,turnstile:turnstileNl,designStudio:designStudioNl},en:{login:loginEn,turnstile:turnstileEn,designStudio:designStudioEn}};
  function Probe(){const [token,setToken]=useState('');return <><Turnstile onToken={setToken}/><output aria-label="Current token">{token}</output></>;}
  const root=createRoot(document.getElementById('root'));let generation=0;
  window.mountFixture=(mode)=>root.render(<StrictMode key={++generation}><LocaleProvider initialLocale="nl" publicPage={false} catalogs={catalogs}>{mode==='widget'?<Probe/>:mode==='register'?<DartsAuthFlow intent="register"/>:mode==='auth'?<DartsAuthFlow/>:null}</LocaleProvider></StrictMode>);
  window.mountFixture(new URLSearchParams(location.search).get('mode')||'widget');
 `,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,write:false,outfile:'fixture.js',platform:'browser',format:'iife',jsx:'automatic',
 tsconfig:'apps/web/tsconfig.json',define:{'process.env':'{}','process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY':JSON.stringify(sitekey)},
});
const js=fixture.outputFiles.find(file=>file.path.endsWith('.js'))!,css=fixture.outputFiles.find(file=>file.path.endsWith('.css'));
const html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}.brand img{max-width:120px}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>';
const server=createServer((request,response)=>{
 const path=new URL(request.url!,'http://127.0.0.1').pathname;
 if(path==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(js.contents);}
 else if(path==='/fixture.css'){response.setHeader('Content-Type','text/css');response.end(css?.contents??'');}
 else if(path==='/'){response.setHeader('Content-Type','text/html');response.end(html);}
 else{response.statusCode=404;response.end();}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
const sdk=`
 window.__sdk={records:[],removed:[]};
 window.turnstile={render(element,options){
  const id='widget-'+window.__sdk.records.length;
  const frame=document.createElement('iframe');frame.title='Simulated Turnstile';frame.style.cssText='border:0;display:block;width:'+(options.size==='compact'?'150px':'300px')+';height:65px';element.appendChild(frame);
  window.__sdk.records.push({id,options,element});return id;
 },remove(id){window.__sdk.removed.push(id);window.__sdk.records.find(record=>record.id===id)?.element.replaceChildren();},reset(){}};
`;
const browser=await chromium.launch({headless:true}),failures:string[]=[],report:{ok:boolean;sdkSimulated:boolean;realProviderVerified:boolean;checks:string[]}={ok:false,sdkSimulated:true,realProviderVerified:false,checks:[]};
async function pageFor(mode:string,{delayed=false,failFirst=false,width=1000}={}){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 await context.addInitScript('globalThis.__name = (fn) => fn;');
 let release!:()=>void,loads=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 const requests:{path:string;body:any}[]=[];let failAuth=true;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='challenges.cloudflare.com'&&url.pathname==='/turnstile/v0/api.js'){
   loads++;if(delayed)await gate;
   if(failFirst&&loads===1){await route.abort('failed');return;}
   await route.fulfill({contentType:'text/javascript',body:sdk});return;
  }
  if(url.origin!==origin){failures.push('Unexpected external request: '+url.hostname);await route.abort();return;}
  if(url.pathname.startsWith('/api/platform/')){
   assert.equal(route.request().method(),'POST');requests.push({path:url.pathname,body:route.request().postDataJSON()});
   const failed=url.pathname.endsWith('/auth/request')&&failAuth;
   await route.fulfill({status:failed?503:200,contentType:'application/json',body:JSON.stringify(failed?{error:'Probeer het nog eens.',code:'auth_provider'}:{ok:true})});return;
  }
  await route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>failures.push(error.message));
 await page.goto(origin+'/?mode='+mode,{waitUntil:'domcontentloaded'});
 return {page,context,release,requests,loads:()=>loads,allowAuth:()=>{failAuth=false;}};
}
async function rendered(page:Page,count:number){await expect.poll(()=>page.evaluate(()=>((window as any).__sdk?.records.length??0))).toBe(count);}
async function signal(page:Page,name:string,value?:string,index?:number){await page.evaluate(({name,value,index})=>{
 const records=(window as any).__sdk.records,record=records[index??records.length-1];record.options[name](value);
 },{name,value,index});}
async function remount(page:Page,mode:string){await page.evaluate(mode=>(window as any).mountFixture(mode),mode);}
const requestButton=(page:Page)=>page.getByRole('button',{name:'Ontvang je inlogcode',exact:true});
try{
 const lifecycle=await pageFor('widget',{delayed:true}),page=lifecycle.page;
 await expect.poll(lifecycle.loads).toBe(1);
 await remount(page,'none');await expect(page.getByLabel('Current token')).toHaveCount(0);
 await remount(page,'widget');await expect(page.getByLabel('Current token')).toHaveCount(1);
 assert.equal(await page.locator('script[src*="challenges.cloudflare.com"]').count(),1);
 lifecycle.release();await rendered(page,1);assert.equal(lifecycle.loads(),1);
 const options=await page.evaluate(()=>{const options=(window as any).__sdk.records[0].options;return {sitekey:options.sitekey,action:options.action,language:options.language};});
 assert.deepEqual(options,{sitekey,action:'login',language:'nl'});
 const token=page.getByLabel('Current token');await signal(page,'callback','completed');await expect(token).toHaveText('completed');
 for(const name of ['expired-callback','timeout-callback','error-callback']){
  await signal(page,'callback','completed');await signal(page,name);await expect(token).toHaveText('');await expect(page.getByRole('alert')).toBeVisible();
 }
 await remount(page,'none');await expect(page.getByLabel('Current token')).toHaveCount(0);
 await remount(page,'widget');await rendered(page,2);
 await signal(page,'callback','stale',0);await signal(page,'expired-callback',undefined,0);await signal(page,'error-callback',undefined,0);
 await expect(page.getByLabel('Current token')).toHaveText('');assert.deepEqual(await page.evaluate(()=>(window as any).__sdk.removed),['widget-0']);
 report.checks.push('One delayed SDK script across StrictMode and remount; cancelled mounts do not render; expiry, timeout and error clear tokens; stale callbacks ignored and widgets removed');
 await lifecycle.context.close();

 const retry=await pageFor('widget',{failFirst:true});await expect(retry.page.getByRole('alert')).toContainText('kon niet laden');
 await retry.page.getByRole('button',{name:'Opnieuw proberen',exact:true}).click();await rendered(retry.page,1);
 assert.equal(retry.loads(),2);assert.equal(await retry.page.locator('script[src*="challenges.cloudflare.com"]').count(),1);
 await signal(retry.page,'callback','retried');await expect(retry.page.getByLabel('Current token')).toHaveText('retried');await expect(retry.page.getByRole('alert')).toHaveCount(0);
 report.checks.push('Failed SDK load is removed and user retry loads one new script successfully');await retry.context.close();

 const auth=await pageFor('auth'),authPage=auth.page;await rendered(authPage,1);
 await authPage.getByLabel('E-mailadres',{exact:true}).fill(' Player@Example.test ');await expect(requestButton(authPage)).toBeDisabled();
 await authPage.getByLabel('E-mailadres',{exact:true}).press('Enter');assert.equal(auth.requests.length,0,'Enter cannot bypass CAPTCHA');
 for(const name of ['expired-callback','timeout-callback','error-callback']){
  await signal(authPage,'callback','ready');await expect(requestButton(authPage)).toBeEnabled();await signal(authPage,name);await expect(requestButton(authPage)).toBeDisabled();
 }
 await signal(authPage,'callback','request-token');await requestButton(authPage).click();await rendered(authPage,2);
 await expect(requestButton(authPage)).toBeDisabled();await expect(authPage.getByRole('alert')).toHaveText('De inlogcode kon niet worden verstuurd. Probeer het later opnieuw.');
 assert.deepEqual(auth.requests,[{path:'/api/platform/auth/request',body:{email:'player@example.test',locale:'nl',captchaToken:'request-token'}}]);
 await signal(authPage,'callback','stale-request-token',0);await expect(requestButton(authPage)).toBeDisabled();
 auth.allowAuth();await signal(authPage,'callback','new-request-token');await requestButton(authPage).click();
 await expect(authPage.getByLabel('Je eenmalige code')).toBeVisible();await rendered(authPage,3);
 await expect(authPage.getByRole('button',{name:/Opnieuw over/})).toBeDisabled();
 await signal(authPage,'callback','must-not-survive-change-email');await authPage.getByRole('button',{name:'E-mailadres wijzigen',exact:true}).click();
 await expect(authPage.getByLabel('E-mailadres',{exact:true})).toBeVisible();await rendered(authPage,4);await expect(requestButton(authPage)).toBeDisabled();
 await signal(authPage,'callback','old-code-step-token',2);await expect(requestButton(authPage)).toBeDisabled();
 await signal(authPage,'callback','fresh-email-token');await expect(requestButton(authPage)).toBeEnabled();
 assert.equal(auth.requests.length,3);assert.equal(auth.requests[1].body.captchaToken,'new-request-token');assert.equal(auth.requests[2].path,'/api/platform/auth/logout');
 report.checks.push('Real auth form blocks click/Enter until CAPTCHA, forwards only current token, resets after failed request and email change, and retains resend cooldown');await auth.context.close();

 const bilingual=await pageFor('auth');await rendered(bilingual.page,1);
 await signal(bilingual.page,'callback','old-language-token');
 await bilingual.page.getByLabel('Nederlands / English').selectOption('en');await rendered(bilingual.page,2);
 assert.equal(await bilingual.page.evaluate(()=>(window as any).__sdk.records[1].options.language),'en');
 await expect(bilingual.page.getByRole('button',{name:'Get your sign-in code',exact:true})).toBeDisabled();
 assert.equal(bilingual.requests.length,0,'Changing language resets the CAPTCHA without sending an OTP');
 await signal(bilingual.page,'callback','stale-language-token',0);await expect(bilingual.page.getByRole('button',{name:'Get your sign-in code',exact:true})).toBeDisabled();
 report.checks.push('Changing language chooses the English widget, clears the old token and does not request an OTP');await bilingual.context.close();

 const narrow=await pageFor('register',{width:320});await rendered(narrow.page,1);
 assert.equal(await narrow.page.evaluate(()=>(window as any).__sdk.records[0].options.size),'compact');
 const frame=await narrow.page.getByTitle('Simulated Turnstile').boundingBox();assert.ok(frame&&frame.x>=0&&frame.x+frame.width<=320,'Compact widget fits the narrow viewport');
 await expect(requestButton(narrow.page)).toBeDisabled();await signal(narrow.page,'callback','registration-token');await expect(requestButton(narrow.page)).toBeEnabled();
 await mkdir(directory,{recursive:true,mode:0o700});await narrow.page.screenshot({path:directory+'/registration-320.png',fullPage:true});
 report.checks.push('Registration uses the same CAPTCHA gate; compact widget fits a 320 px viewport');await narrow.context.close();
 assert.deepEqual(failures,[]);report.ok=true;
}finally{
 await browser.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/results.json',JSON.stringify({...report,failures},null,2),{mode:0o600});
}
console.log('Turnstile React/auth browser regression passed with a simulated SDK and local HTTP responses; no real provider or email used');
