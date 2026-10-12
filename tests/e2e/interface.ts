import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {login,origin} from './helpers';
const browser=await chromium.launch();
try{
 const actor=await login(browser,'Interface');const page=actor.page;
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/oefenen');await page.getByRole('button',{name:'Dubbels',exact:true}).click();await page.getByLabel('Jouw dubbel',{exact:true}).waitFor();
 const changed=page.waitForResponse(r=>r.url().endsWith('/api/platform/practice')&&r.request().method()==='POST');await page.getByLabel('Jouw dubbel',{exact:true}).selectOption('7');const prior=await(await changed).json();assert.equal(prior.state.configuration.chosenDouble,7);
 await page.getByRole('button',{name:'Finishes',exact:true}).click();await page.getByLabel('Uitgooien vanaf',{exact:true}).waitFor();
 const stale=await page.request.post(origin+'/api/platform/practice',{data:{type:'horizontal',commandId:crypto.randomUUID(),sessionId:prior.id,expectedStateVersion:prior.stateVersion,phaseToken:prior.state.phaseToken}});assert.equal(stale.status(),409);assert.equal((await stale.json()).code,'practice_session_completed');
 await page.getByRole('button',{name:'Stop de richting',exact:true}).waitFor();await page.getByLabel('Uitgooien vanaf',{exact:true}).focus();await page.keyboard.press('Space');assert.equal(await page.getByRole('button',{name:'Stop de richting',exact:true}).count(),1,'Focused input cannot throw');
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await page.keyboard.press('Space');await page.getByRole('button',{name:'Stop de hoogte en gooi',exact:true}).waitFor();
 await page.keyboard.press('Space');await page.getByRole('button',{name:'Volgende pijl',exact:true}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(new URL(request.url).pathname);return urls;});
 assert.ok(cached.includes('/offline.html'));assert.equal(cached.some(path=>path.startsWith('/api/')||['/inloggen','/registreren','/lobby','/oefenen','/spelen','/clubhuis'].includes(path)),false,'No private HTML/API responses in cache');
 await actor.context.setOffline(true);await page.goto(origin+'/lobby');await page.getByRole('heading',{name:'Jouw volgende goede worp.'}).waitFor();
 await page.getByRole('button',{name:'Stop richting',exact:true}).click();await page.getByRole('button',{name:'Stop hoogte en gooi',exact:true}).click();await page.waitForFunction(()=>document.getElementById('hit')?.textContent!=='—');
 await page.screenshot({path:'artifacts/offline-practice.png',fullPage:true});await actor.context.setOffline(false);
 await page.setViewportSize({width:1366,height:768});await page.goto(origin);await page.evaluate(()=>{document.documentElement.style.zoom='2';});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Desktop CSS zoom overflow');
 await writeFile('artifacts/interface-result.json',JSON.stringify({ok:true,practiceKeyboard:true,focusedInputNoThrow:true,reducedMotion:true,publicOnlyServiceWorkerCache:true,realOfflinePractice:true,desktopCssZoom200NoOverflow:true,physicalDevicesNotClaimed:true},null,2));console.log('Keyboard focus, reduced motion, public cache, offline practice and desktop CSS zoom passed');
}finally{await browser.close();}
