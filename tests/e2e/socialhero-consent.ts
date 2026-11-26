/** Real browser/component consent behavior with a local mock pixel; no analytics traffic is sent. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {createAnalyticsConsent,SOCIALHERO_CONSENT_BOOTSTRAP,SOCIALHERO_CONSENT_KEY,SOCIALHERO_CONSENT_SESSION_DENIAL_KEY} from '../../apps/web/lib/socialhero-consent';

const temporary=await mkdtemp(join(tmpdir(),'dartspoint-consent-')),bundle=join(temporary,'ui.js');
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import {createRoot} from 'react-dom/client';import {SocialHeroConsent} from './apps/web/components/socialhero-consent';import {DartsMarketing} from './apps/web/components/darts-marketing';import {DartsAuthFlow} from './apps/web/components/darts-login';
 const auth=/\\/(?:inloggen|registreren)$/.test(location.pathname),game=location.pathname==='/spelen';
 createRoot(document.getElementById('root')).render(<>{game?<button id="game-control">Game</button>:auth?<DartsAuthFlow intent={location.pathname.endsWith('registreren')?'register':'login'}/>:<DartsMarketing/>}<SocialHeroConsent/></>);
 `},bundle:true,outfile:bundle,platform:'browser',jsx:'automatic',alias:{'@':resolve('apps/web')},define:{'process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY':'""'},plugins:[{name:'mock-server-navigation-and-provider-only',setup(builder){
  builder.onResolve({filter:/^@\/lib\/i18n\/provider$/},()=>({path:'locale',namespace:'consent-test'}));
  builder.onResolve({filter:/^next\/navigation$/},()=>({path:'pathname',namespace:'consent-test'}));
  builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'consent-test'}));
  builder.onResolve({filter:/^@\/lib\/platform-client$/},()=>({path:'platform',namespace:'consent-test'}));
  builder.onResolve({filter:/^@\/lib\/darts-public-data$/},()=>({path:'public',namespace:'consent-test'}));
  builder.onResolve({filter:/^@\/components\/(?:turnstile|design-studio|darts-game)$/},args=>({path:args.path.split('/').pop()!,namespace:'consent-test'}));
  builder.onLoad({filter:/.*/,namespace:'consent-test'},({path})=>({resolveDir:process.cwd(),loader:'tsx',contents:path==='locale'?`
   import * as common from './packages/i18n/src/catalogs/common';import loginNl from './packages/i18n/src/catalogs/login.nl.json';import loginEn from './packages/i18n/src/catalogs/login.en.json';import marketingNl from './packages/i18n/src/catalogs/marketing.nl.json';import marketingEn from './packages/i18n/src/catalogs/marketing.en.json';import feedbackNl from './packages/i18n/src/catalogs/feedback.nl.json';import feedbackEn from './packages/i18n/src/catalogs/feedback.en.json';import {message} from './packages/i18n/src/messages';
   export function useI18n(module='common'){const locale=document.documentElement.lang==='en'?'en':'nl',catalog=module==='login'?(locale==='en'?loginEn:loginNl):module==='marketing'?(locale==='en'?marketingEn:marketingNl):module==='feedback'?(locale==='en'?feedbackEn:feedbackNl):common[locale];return {locale,publicPage:true,setLocale:()=>{},href:path=>'/'+locale+path,t:(key,values)=>message(catalog,locale,key,values)};}
  `:path==='pathname'?`import {useEffect,useState} from 'react';export function usePathname(){const [path,set]=useState(location.pathname);useEffect(()=>{const update=()=>set(location.pathname);addEventListener('popstate',update);return()=>removeEventListener('popstate',update)},[]);return path;}`:path==='link'?'export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}':path==='platform'?'export const getPlatform=()=>({actor:null});export const selfName=()=>"Player";export const api=async()=>({onboarded:false});':path==='public'?'export const usePublicData=()=>({PUBLIC_EVENTS:[],PUBLIC_LADDER:[],PUBLIC_DIVISIONS:[],PUBLIC_ROOMS:[]});':path==='turnstile'?'export const Turnstile=()=>null;':path==='design-studio'?'export const Brand=()=> <span>DartsPoint</span>;':'export const Dartboard=()=> <div/>;'}));
 }}]});
const mockPixel=`window.__events=[];window.__analytics=[];window.__starts=[];window.addEventListener('socialhero:consent',event=>window.__events.push(event.detail));window.__loadPixel=()=>{let enabled=window.socialheroConsent===true;window.__starts.push(enabled);window.addEventListener('socialhero:consent',event=>{enabled=event.detail===true;});document.addEventListener('click',event=>{if(enabled&&event.target.closest('[data-socialhero-cta]'))window.__analytics.push({kind:'cta'});});};document.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});`;
const server=createServer(async(request,response)=>{
 const url=new URL(request.url!,'http://127.0.0.1');
 if(url.pathname==='/ui.js'||url.pathname==='/ui.css'){response.writeHead(200,{'Content-Type':url.pathname.endsWith('css')?'text/css':'text/javascript'});response.end(await readFile(url.pathname.endsWith('css')?bundle.replace(/\.js$/,'.css'):bundle));return;}
 if(url.pathname==='/api/documents'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({current:{terms:{id:'local-terms',version:'1'},privacy:{id:'local-privacy',version:'1'}}}));return;}
 if(/\.(?:svg|webp|png)$/.test(url.pathname)){response.writeHead(204);response.end();return;}
 const locale=url.pathname.startsWith('/en')?'en':'nl';response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="'+locale+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><script>'+SOCIALHERO_CONSENT_BOOTSTRAP+mockPixel+(url.searchParams.has('late')?'':'window.__loadPixel();')+'</script></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');
});
await new Promise<void>(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const checks:string[]=[];
const consent=()=>page.evaluate(()=>window.socialheroConsent),cta=()=>page.locator('.mk-header-register');
try{
 await page.goto(origin+'/nl',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Analyses weigeren',exact:true}).waitFor();assert.equal(await consent(),false);await cta().click({force:true});assert.equal(await page.evaluate(()=>(window as any).__analytics.length),0);
 await page.getByRole('button',{name:'Analyses weigeren',exact:true}).click();assert.equal(await consent(),false);assert.equal(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),SOCIALHERO_CONSENT_KEY))!).choice,'denied');await page.reload();await page.getByRole('button',{name:'Privacy-instellingen',exact:true}).waitFor();await expect(page.locator('.dp-consent-panel')).toHaveCount(0);assert.equal(await consent(),false);
 await page.getByRole('button',{name:'Privacy-instellingen',exact:true}).click();await page.getByRole('button',{name:'Analyses toestaan',exact:true}).click();assert.equal(await consent(),true);assert.equal(await page.evaluate(()=>(window as any).__events.at(-1)),true);await cta().click();assert.equal(await page.evaluate(()=>(window as any).__analytics.length),1);
 await page.reload();await expect.poll(consent).toBe(true);assert.equal(await page.evaluate(()=>(window as any).__starts[0]),false);assert.ok((await page.evaluate(()=>(window as any).__events)).includes(true));await cta().click();assert.equal(await page.evaluate(()=>(window as any).__analytics.length),1);
 await page.getByRole('button',{name:'Privacy-instellingen',exact:true}).click();await page.getByRole('button',{name:'Toestemming voor analyses intrekken',exact:true}).click();assert.equal(await consent(),false);assert.equal(await page.evaluate(()=>(window as any).__events.at(-1)),false);await cta().click();assert.equal(await page.evaluate(()=>(window as any).__analytics.length),1);checks.push('unknown and denied stay false; explicit grant, persisted restoration and immediate withdrawal drive exact boolean events');

 await page.evaluate(()=>localStorage.clear());await page.goto(origin+'/nl?late=1');await page.getByRole('button',{name:'Analyses toestaan',exact:true}).click();await page.evaluate(()=>(window as any).__loadPixel());assert.equal(await page.evaluate(()=>(window as any).__starts[0]),true);await cta().click();assert.equal(await page.evaluate(()=>(window as any).__analytics.length),1);
 const game=await context.newPage();await game.goto(origin+'/spelen?late=1');await expect.poll(()=>game.evaluate(()=>window.socialheroConsent)).toBe(true);await expect(game.locator('.dp-consent-controls')).toHaveCount(0);
 await page.getByRole('button',{name:'Privacy-instellingen',exact:true}).click();await page.getByRole('button',{name:'Toestemming voor analyses intrekken',exact:true}).click();await expect.poll(()=>game.evaluate(()=>window.socialheroConsent)).toBe(false);assert.equal(await game.evaluate(()=>(window as any).__events.at(-1)),false);await game.close();
 await page.evaluate(()=>{history.pushState({},'', '/spelen');dispatchEvent(new PopStateEvent('popstate'));});await expect(page.locator('.dp-consent-controls')).toHaveCount(0);checks.push('late pixel reads current consent; another tab withdraws immediately; game routes and client navigation never show controls');

 for(const locale of ['nl','en']){
  await page.goto(origin+'/'+locale);await page.locator('.mk-header-register').waitFor();assert.ok(await page.locator('a[href*="registreren"],a[href*="inloggen"]').count()>5);assert.equal(await page.locator('a[href*="registreren"]:not([data-socialhero-cta]),a[href*="inloggen"]:not([data-socialhero-cta])').count(),0);
  await page.goto(origin+'/'+locale+'/registreren?onboarding=1');await page.locator('#dp-auth-username').waitFor();await page.locator('.dp-register-field-help input[type=checkbox]').first().check();await page.locator('.dp-register-field-help input[type=checkbox]').nth(1).check();assert.equal(await consent(),false);await expect(page.locator('button[type=submit]')).toHaveAttribute('data-socialhero-cta','');
  await page.goto(origin+'/'+locale+'/inloggen');await page.locator('#dp-auth-email').waitFor();await expect(page.locator('a[href^="/api/auth/google"]')).toHaveAttribute('data-socialhero-cta','');await expect(page.locator('button[type=submit]')).toHaveAttribute('data-socialhero-cta','');await expect(page.getByRole('button',{name:locale==='en'?'Privacy settings':'Privacy-instellingen',exact:true})).toBeVisible();assert.equal(await consent(),false);
 }
 checks.push('real NL/EN marketing, registration and login CTAs carry markers; account terms never enable analytics');
 const expired=createAnalyticsConsent('granted',Date.now()-181*24*60*60*1000);await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:SOCIALHERO_CONSENT_KEY,value:JSON.stringify(expired)});await page.reload();await page.getByRole('button',{name:'Allow analytics',exact:true}).waitFor();assert.equal(await consent(),false);assert.equal(errors.length,0,errors.join('\n'));checks.push('expired grant returns to unknown/off without browser errors');
 for(const failure of [
  {name:'session denial survives reload over a stale grant',removeBlocked:true,sessionBlocked:false,reload:true},
  {name:'removing the stale grant protects reload when session storage is blocked',removeBlocked:false,sessionBlocked:true,reload:true},
  {name:'memory denial survives refresh events when both stores reject changes',removeBlocked:true,sessionBlocked:true,reload:false},
 ]){
  const failedContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),failedPage=await failedContext.newPage();failedPage.on('pageerror',error=>errors.push(error.message));
  try{
   await failedPage.goto(origin+'/nl');await failedPage.getByRole('button',{name:'Analyses toestaan',exact:true}).click();await expect.poll(()=>failedPage.evaluate(()=>window.socialheroConsent)).toBe(true);
   const staleGrant=await failedPage.evaluate(key=>localStorage.getItem(key),SOCIALHERO_CONSENT_KEY);
   await failedContext.addInitScript(({key,denialKey,removeBlocked,sessionBlocked})=>{
    const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(storageKey,value){if((this===localStorage&&storageKey===key)||(sessionBlocked&&this===sessionStorage&&storageKey===denialKey))throw new DOMException('Storage unavailable','QuotaExceededError');return set.call(this,storageKey,value);};
    Storage.prototype.removeItem=function(storageKey){if((removeBlocked&&this===localStorage&&storageKey===key)||(sessionBlocked&&this===sessionStorage&&storageKey===denialKey))throw new DOMException('Storage unavailable','SecurityError');return remove.call(this,storageKey);};
    (window as any).__restoreConsentStorage=()=>{Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;};
   },{key:SOCIALHERO_CONSENT_KEY,denialKey:SOCIALHERO_CONSENT_SESSION_DENIAL_KEY,...failure});
   await failedPage.reload();await expect.poll(()=>failedPage.evaluate(()=>window.socialheroConsent)).toBe(true);
   await failedPage.getByRole('button',{name:'Privacy-instellingen',exact:true}).click();await failedPage.getByRole('button',{name:'Toestemming voor analyses intrekken',exact:true}).click();assert.equal(await failedPage.evaluate(()=>window.socialheroConsent),false);
   await expect(failedPage.getByRole('alert')).toContainText('Je keuze kon niet worden opgeslagen.');await expect(failedPage.getByRole('status')).toHaveText('Analyses staan uit.');
   await failedPage.evaluate(({key,staleGrant})=>{
    dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));
    dispatchEvent(new StorageEvent('storage',{key,newValue:staleGrant,storageArea:localStorage}));dispatchEvent(new StorageEvent('storage',{key:null,storageArea:localStorage}));
   },{key:SOCIALHERO_CONSENT_KEY,staleGrant});
   assert.equal(await failedPage.evaluate(()=>window.socialheroConsent),false);assert.equal(await failedPage.evaluate(()=>(window as any).__events.at(-1)),false);
   await failedPage.locator('.mk-header-register').click({force:true});assert.equal(await failedPage.evaluate(()=>(window as any).__analytics.length),0);
   assert.equal(await failedPage.evaluate(key=>localStorage.getItem(key),SOCIALHERO_CONSENT_KEY),failure.removeBlocked?staleGrant:null);
   if(failure.reload){
    await failedPage.reload();await failedPage.getByRole('button',{name:'Privacy-instellingen',exact:true}).waitFor();await failedPage.getByRole('button',{name:'Privacy-instellingen',exact:true}).click();
    assert.equal(await failedPage.evaluate(()=>window.socialheroConsent),false);assert.equal(await failedPage.evaluate(()=>(window as any).__events.includes(true)),false);
    await failedPage.locator('.mk-header-register').click({force:true});assert.equal(await failedPage.evaluate(()=>(window as any).__analytics.length),0);
   }
   // A failed attempt to grant also stays off; only an explicitly saved grant
   // clears the withdrawal override and its session marker.
   await failedPage.getByRole('button',{name:'Analyses toestaan',exact:true}).click();assert.equal(await failedPage.evaluate(()=>window.socialheroConsent),false);await expect(failedPage.getByRole('alert')).toBeVisible();
   await failedPage.evaluate(()=>(window as any).__restoreConsentStorage());await failedPage.getByRole('button',{name:'Analyses toestaan',exact:true}).click();assert.equal(await failedPage.evaluate(()=>window.socialheroConsent),true);
   assert.equal(await failedPage.evaluate(key=>sessionStorage.getItem(key),SOCIALHERO_CONSENT_SESSION_DENIAL_KEY),null);checks.push(failure.name+'; blocked grant stays off until an explicit saved grant');
  }finally{await failedContext.close();}
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({event:'socialhero_consent_browser_passed',checks,scope:'real consent/marketing/auth components, local mock pixel, no external analytics or account writes'}));
}finally{await context.close();await browser.close();await new Promise<void>(resolveClose=>server.close(()=>resolveClose()));await rm(temporary,{recursive:true,force:true});}
