import assert from 'node:assert/strict';
import {chromium,expect,type Page,type Response} from '@playwright/test';
import type {Pool} from 'pg';
import {writeFile} from 'node:fs/promises';
import {login,get,post,origin} from './helpers';
import {meterPosition} from '../../packages/game-core/src/timing';
const browser=await chromium.launch();
const result:any={ok:false,practiceAttempts:[],physicalDevicesNotClaimed:true};let ingressPool:Pool|undefined;
type Axis='horizontal'|'vertical';
function practiceResponse(response:Response,type:string){return response.url().endsWith('/api/platform/practice')&&response.request().method()==='POST'&&response.request().postDataJSON()?.type===type;}
async function readyPractice(page:Page,axis:Axis){
 await page.bringToFront();assert.equal(await page.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),true,'Keyboard input requires foreground focus');
 await expect(page.getByRole('button',{name:axis==='horizontal'?'Stop de richting':'Stop de hoogte en gooi',exact:true})).toBeEnabled({timeout:15000});
 const selector=axis==='horizontal'?'.practice-meter-x i':'.practice-meter-y i',property=axis==='horizontal'?'left':'top',before=await page.locator(selector).evaluate((e,p)=>(e as HTMLElement).style.getPropertyValue(p),property);
 await page.waitForFunction(({selector,property,before})=>(document.querySelector(selector) as HTMLElement)?.style.getPropertyValue(property)!==before,{selector,property,before},{polling:'raf'});
}
async function keyboardAttempt(page:Page,axis:Axis,baseline:any,actorId:string,forceExpired=false){
 await readyPractice(page,axis);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();performance.clearMarks('dp-local-stop');});
 const response=page.waitForResponse(async response=>{if(!practiceResponse(response,axis))return false;const id=await page.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark|undefined)?.detail?.commandId);return response.request().postDataJSON().commandId===id;});
 if(forceExpired)await page.evaluate(()=>{const started=performance.now();while(performance.now()-started<160){}document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));});
 else await page.keyboard.press('Space');
 const acknowledged=await response,receipt=await acknowledged.json(),request=acknowledged.request().postDataJSON(),local=await page.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark).detail);
 const attempt:any={axis,input:'keyboard',forcedMainThreadStallMs:forceExpired?160:0,commandId:request.commandId,status:acknowledged.status(),code:receipt.code,sampleAt:request.renderSample?.sampleAt,phaseStartedAt:baseline.state.phaseStartedAt,expectedStateVersion:request.expectedStateVersion};
 result.practiceAttempts.push(attempt);
 if(!acknowledged.ok())console.log(JSON.stringify({event:'interface_keyboard_http_error',...attempt}));
 assert.equal(request.commandId,local.commandId);assert.equal(request.sessionId,baseline.id);assert.equal(request.expectedStateVersion,baseline.stateVersion);assert.equal(request.phaseToken,baseline.state.phaseToken);assert.equal(request.renderSample.sampleAt,local.rendered.sampleAt);assert.equal(request.renderSample.dartNumber,baseline.state.count+1);
 // These functional keyboard checks use only the disposable local/CI DB and
 // the immutable original ingress. A scheduled browser can legitimately send
 // an old sample; that must produce an error, never a different server lock.
 assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(origin).hostname,'127.0.0.1');
 if(!ingressPool){const {db}=await import('../../packages/data/src/db');ingressPool=db();}
 const row=(await ingressPool.query("select received_at,admission_window_ms,latency_ms,connection_id,timing_version from private.command_ingress where scope='practice' and actor_id=$1 and command_id=$2",[actorId,request.commandId])).rows[0];
 assert.ok(row);assert.equal(row.connection_id,request.renderSample.connectionId);assert.equal(row.timing_version,'render-sample-v3');
 const receivedAt=new Date(row.received_at).getTime(),windowMs=Number(row.admission_window_ms),sampleAt=request.renderSample.sampleAt;
 assert.ok(windowMs>=54&&windowMs<=124);const violations=[sampleAt>receivedAt?'future':null,sampleAt<receivedAt-windowMs?'old':null,sampleAt<baseline.state.phaseStartedAt?'before-phase':null,sampleAt<(baseline.state.lastAcceptedAt??0)?'before-last-accepted':null].filter(Boolean);
 Object.assign(attempt,{receivedAt,windowMs,latencyMs:Number(row.latency_ms),sampleAgeAtIngressMs:receivedAt-sampleAt,violations});
 if(violations.length===0){
  assert.equal(acknowledged.status(),200,'An admissible keyboard stop must be accepted: '+receipt.code);assert.equal(receipt.commandId,request.commandId);assert.equal(receipt.timing.admittedAt,sampleAt);assert.equal(receipt.timing.receivedAt,receivedAt);
  assert.equal(axis==='horizontal'?receipt.state.lockedX:receipt.state.lockedY,meterPosition(sampleAt,baseline.state.phaseStartedAt,axis),'Keyboard stop uses the exact drawn sample');assert.equal(receipt.state.phase,axis==='horizontal'?'vertical':'flying');
  Object.assign(attempt,{outcome:'accepted-exact-sample',resultingPhase:receipt.state.phase});return receipt;
 }
 assert.equal(acknowledged.status(),409);assert.equal(receipt.code,'invalid_render_sample');await expect(page.getByRole('alert').filter({hasText:'timingmeting'})).toBeVisible();
 const unchanged=await get(page,'practice/'+baseline.id);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.deepEqual(unchanged.state,baseline.state,'Rejected keyboard stop cannot alter phase, locks, dart count or score');
 await readyPractice(page,axis);Object.assign(attempt,{outcome:'explicit-invalid-render-sample',authoritativeStateUnchanged:true,visibleError:true,controlledRestore:true,resultingPhase:unchanged.state.phase});console.log(JSON.stringify({event:'interface_keyboard_sample_rejected',...attempt}));return null;
}
async function stopWithKeyboard(page:Page,axis:Axis,baseline:any,actorId:string){
 // A functional test needs an actual successful stop. Each new input after a
 // verified explicit rejection is retained; these are not timing/p95 samples.
 for(let attempt=0;attempt<6;attempt++){const receipt=await keyboardAttempt(page,axis,baseline,actorId);if(receipt)return receipt;}
 assert.fail('No valid '+axis+' keyboard stop within six recorded inputs');
}
try{
 const actor=await login(browser,'Interface');const page=actor.page;await post(page,'room',{roomId:(await get(page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1').id});
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/oefenen');await page.getByRole('button',{name:'Dubbels',exact:true}).click();await page.getByLabel('Jouw dubbel',{exact:true}).waitFor();
 const changed=page.waitForResponse(r=>r.url().endsWith('/api/platform/practice')&&r.request().method()==='POST');await page.getByLabel('Jouw dubbel',{exact:true}).selectOption('7');const prior=await(await changed).json();assert.equal(prior.state.configuration.chosenDouble,7);
 const checkoutReset=page.waitForResponse(response=>practiceResponse(response,'reset')&&response.request().postDataJSON().configuration.mode==='checkout');await page.getByRole('button',{name:'Finishes',exact:true}).click();const resetResponse=await checkoutReset,baseline=await resetResponse.json();assert.equal(resetResponse.status(),200);await page.getByLabel('Uitgooien vanaf',{exact:true}).waitFor();
 const stale=await page.request.post(origin+'/api/platform/practice',{data:{type:'horizontal',commandId:crypto.randomUUID(),sessionId:prior.id,expectedStateVersion:prior.stateVersion,phaseToken:prior.state.phaseToken}});assert.equal(stale.status(),409);assert.equal((await stale.json()).code,'practice_session_completed');
 // This context has no screenshot/snapshot tracing; capture screenshots only
 // after the functional native keyboard checks have completed.
 result.keyboardInstrumentation={screenshots:false,snapshots:false,foreground:true};
 let stopRequests=0;page.on('request',request=>{if(request.url().endsWith('/api/platform/practice')&&request.method()==='POST'&&['horizontal','vertical'].includes(request.postDataJSON()?.type))stopRequests++;});
 await readyPractice(page,'horizontal');await page.getByLabel('Uitgooien vanaf',{exact:true}).focus();await page.keyboard.press('Space');assert.equal(await page.getByRole('button',{name:'Stop de richting',exact:true}).count(),1,'Focused input cannot throw');assert.equal(stopRequests,0,'Space in an input cannot send a stop');assert.deepEqual((await get(page,'practice/'+baseline.id)).state,baseline.state);
 const horizontal=await stopWithKeyboard(page,'horizontal',baseline,actor.id);
 assert.equal(await keyboardAttempt(page,'vertical',horizontal,actor.id,true),null,'An intentionally expired vertical sample must be rejected');
 const vertical=await stopWithKeyboard(page,'vertical',horizontal,actor.id);assert.equal(vertical.state.phase,'flying');
 await expect(page.getByRole('button',{name:'Volgende pijl',exact:true})).toBeEnabled({timeout:15000});const landed=await get(page,'practice/'+baseline.id);assert.equal(landed.state.count,1);assert.equal(landed.state.visit.length,1,'All rejected keyboard attempts still produce only one scored dart');assert.equal(stopRequests,result.practiceAttempts.length,'Each keyboard input sends exactly one command');result.keyboardFlight={acceptedHorizontal:true,acceptedVertical:true,oneScoredDart:true,recordedInputs:result.practiceAttempts.length,stopRequests};
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(new URL(request.url).pathname);return urls;});
 assert.ok(cached.includes('/offline.html'));assert.equal(cached.some(path=>path.startsWith('/api/')||['/inloggen','/registreren','/lobby','/oefenen','/spelen','/clubhuis'].includes(path)),false,'No private HTML/API responses in cache');
 await actor.context.setOffline(true);await page.goto(origin+'/lobby');await page.getByRole('heading',{name:'Jouw volgende goede worp.'}).waitFor();
 await page.getByRole('button',{name:'Stop richting',exact:true}).click();await page.getByRole('button',{name:'Stop hoogte en gooi',exact:true}).click();await page.waitForFunction(()=>document.getElementById('hit')?.textContent!=='—');
 await page.screenshot({path:'artifacts/offline-practice.png',fullPage:true});await actor.context.setOffline(false);
 await page.setViewportSize({width:1366,height:768});await page.goto(origin);await page.evaluate(()=>{document.documentElement.style.zoom='2';});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Desktop CSS zoom overflow');
 Object.assign(result,{ok:true,practiceKeyboard:true,focusedInputNoThrow:true,reducedMotion:true,publicOnlyServiceWorkerCache:true,realOfflinePractice:true,desktopCssZoom200NoOverflow:true});console.log('Keyboard focus, reduced motion, public cache, offline practice and desktop CSS zoom passed');
}finally{await writeFile('artifacts/interface-result.json',JSON.stringify(result,null,2));await browser.close();await ingressPool?.end();}
