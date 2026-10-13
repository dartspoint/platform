import assert from 'node:assert/strict';
import {chromium,expect,type Page,type Response} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {Client} from '@colyseus/sdk';
import {login,origin,get,post} from './helpers';
import {forfeitGame} from './game-command';
const browser=await chromium.launch();const sizes=[[320,568],[360,800],[390,844],[768,1024],[844,390],[1366,768],[1920,1080]];
const directory='artifacts/update-2026-10-13/after';await mkdir(directory,{recursive:true});const result:any={physicalDevices:false,viewports:sizes,geometry:[],timing:[],latency:[]};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const practiceDiagnostics=new WeakMap<Page,any>();
let ingressPool:Pool|undefined;
function trackPractice(page:Page,label:string){const counts:any={label,ping:{},echo:{},reset:{},failures:[]};practiceDiagnostics.set(page,counts);page.on('response',async response=>{const path=new URL(response.url()).pathname,kind=path.endsWith('/timing/ping')?'ping':path.endsWith('/timing/echo')?'echo':practiceResponse(response,'reset')?'reset':null;if(!kind)return;const status=response.status();counts[kind][status]=(counts[kind][status]??0)+1;if(!response.ok()){let code:string|undefined;try{code=(await response.json()).code;}catch{}counts.failures.push({kind,status,code});}});return counts;}
function practiceResponse(response:Response,type:string){if(!response.url().endsWith('/api/platform/practice')||response.request().method()!=='POST')return false;return response.request().postDataJSON()?.type===type;}
function stopReceipt(page:Page,type:'horizontal'|'vertical'){return page.waitForResponse(async response=>{if(!practiceResponse(response,type))return false;const commandId=await page.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark|undefined)?.detail?.commandId);return response.request().postDataJSON().commandId===commandId;});}
async function readyPractice(page:Page,axis:'horizontal'|'vertical'){
 try{
 const button=page.getByRole('button',{name:axis==='horizontal'?'Stop de richting':'Stop de hoogte en gooi',exact:true});await expect(button).toBeEnabled({timeout:15000});
 const selector=axis==='horizontal'?'.practice-meter-x i':'.practice-meter-y i',property=axis==='horizontal'?'left':'top',before=await page.locator(selector).evaluate((element,property)=>(element as HTMLElement).style.getPropertyValue(property),property);
 // An enabled button can precede the first native frame of a freshly reset
 // phase. Wait for that moving DOM sample before dispatching keyboard input.
 await page.waitForFunction(({selector,property,before})=>(document.querySelector(selector) as HTMLElement)?.style.getPropertyValue(property)!==before,{selector,property,before},{polling:'raf'});
 }catch(error){const documentState=await page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState,buttonDisabled:(document.querySelector('.practice-throw') as HTMLButtonElement|null)?.disabled}));const diagnostic={event:'practice_readiness_failed',axis,...documentState,requests:practiceDiagnostics.get(page)};console.log(JSON.stringify(diagnostic));(result.readinessFailures??=[]).push(diagnostic);throw error;}
}
async function resetPractice(page:Page){const button=page.getByRole('button',{name:'Oefensessie opnieuw starten'});await expect(button).toBeEnabled({timeout:15000});const response=page.waitForResponse(response=>practiceResponse(response,'reset'));await button.click();const acknowledged=await response,receipt=await acknowledged.json();assert.equal(acknowledged.status(),200);assert.equal(receipt.commandId,acknowledged.request().postDataJSON().commandId);assert.equal(receipt.state.phase,'horizontal');await readyPractice(page,'horizontal');return receipt;}
async function classifyPracticeSample(response:Response,local:any,baseline:any,actorId:string){
 // This acceptance suite runs against disposable local/CI services. Read the
 // immutable original ingress, never estimate it from a delayed HTTP response.
 assert.equal(process.env.APP_ENV,'development','Ingress assertions require the disposable QA database');
 assert.equal(new URL(origin).hostname,'127.0.0.1','Ingress assertions never inspect staging or production');
 if(!ingressPool){const {db}=await import('../../packages/data/src/db');ingressPool=db();}
 const request=response.request().postDataJSON(),claim=request.renderSample;
 assert.equal(request.commandId,local.commandId);assert.equal(request.type,'horizontal');
 assert.equal(request.sessionId,baseline.id);assert.equal(request.expectedStateVersion,baseline.stateVersion);
 assert.equal(request.phaseToken,baseline.state.phaseToken);assert.equal(local.phaseToken,baseline.state.phaseToken);
 assert.equal(local.phaseStartedAt,baseline.state.phaseStartedAt);assert.equal(claim.dartNumber,baseline.state.count+1);
 assert.equal(claim.sampleAt,local.rendered.sampleAt);assert.equal(local.timingVersion,'render-sample-v3');
 const row=(await ingressPool.query("select received_at,latency_ms,admission_window_ms,timing_version,connection_id from private.command_ingress where scope='practice' and actor_id=$1 and command_id=$2",[actorId,request.commandId])).rows[0];
 assert.ok(row,'Every attempted stop has its original server ingress');
 assert.equal(row.connection_id,claim.connectionId);assert.equal(row.timing_version,'render-sample-v3');
 const receivedAt=new Date(row.received_at).getTime(),windowMs=Number(row.admission_window_ms),latencyMs=Number(row.latency_ms);
 assert.ok(Number.isInteger(receivedAt));assert.ok(windowMs>=54&&windowMs<=124,'20–90 ms server-derived network allowance plus 34 ms render age');
 assert.ok(latencyMs>=0&&latencyMs<=90);
 // Independent boundary checks: an old/future/previous-phase claim must be
 // rejected, while an in-window claim must keep the exact drawn sample.
 const violations=[claim.sampleAt>receivedAt?'future':null,claim.sampleAt<receivedAt-windowMs?'old':null,claim.sampleAt<baseline.state.phaseStartedAt?'before-phase':null,claim.sampleAt<(baseline.state.lastAcceptedAt??0)?'before-last-accepted':null].filter(Boolean);
 return {receivedAt,windowMs,latencyMs,sampleAt:claim.sampleAt,sampleAgeAtIngressMs:receivedAt-claim.sampleAt,phaseStartedAt:baseline.state.phaseStartedAt,lastAcceptedAt:baseline.state.lastAcceptedAt??0,admissible:violations.length===0,violations};
}
async function assertRejectedPracticeSample(page:Page,response:Response,receipt:any,local:any,baseline:any,ingress:any){
 assert.equal(ingress.admissible,false,'A claim inside all original ingress boundaries must not be rejected');
 assert.equal(response.status(),409);assert.equal(receipt.code,'invalid_render_sample');
 await expect(page.getByRole('alert').filter({hasText:'timingmeting'})).toBeVisible();
 const unchanged=await get(page,'practice/'+baseline.id);
 assert.equal(unchanged.stateVersion,baseline.stateVersion,'Rejected sample cannot advance the authoritative version');
 assert.deepEqual(unchanged.state,baseline.state,'Rejected sample cannot change phase, locks, dart count, score or result');
 assert.equal(unchanged.state.phase,'horizontal');assert.equal(unchanged.state.lockedX,null);assert.equal(unchanged.state.dart,null);assert.equal(unchanged.state.count,0);assert.equal(unchanged.state.sessionPoints,0);
 await readyPractice(page,'horizontal');
 const diagnostic={event:'practice_sample_rejected',status:response.status(),code:receipt.code,commandId:local.commandId,...ingress,sampleAgeMs:local.at-local.rendered.renderedAt,unchangedStateVersion:unchanged.stateVersion,authoritativeStateUnchanged:true,visibleError:true,controlledRestore:true};
 (result.rejections??=[]).push(diagnostic);console.log(JSON.stringify(diagnostic));await writeFile(directory+'/rejected-samples.json',JSON.stringify(result.rejections,null,2));return diagnostic;
}
try{
 const landing=await browser.newPage();landing.setDefaultTimeout(15000);await landing.goto(origin+'/landing/index.html');await landing.emulateMedia({reducedMotion:'reduce'});
 for(const [width,height] of sizes){await landing.setViewportSize({width,height});await wait(60);const geometry=await landing.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.logo,h1,.input-row,.consent-note,.socials,.footer-actions')].map(e=>{const r=e.getBoundingClientRect();return {name:e.className||e.tagName,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};})}));result.geometry.push({screen:'landing',...geometry});assert.ok(geometry.scrollWidth<=width+1,'Landing horizontal overflow');for(const c of geometry.controls)assert.ok(c.x>=-1&&c.right<=width+1&&c.y>=-1&&c.bottom<=height+1,'Landing essential visible: '+JSON.stringify(c)+' at '+width+'x'+height);await landing.screenshot({path:`${directory}/landing-${width}x${height}.png`});}
 for(const [social,url] of [['facebook','https://www.facebook.com/share/19GY886bNL/'],['instagram','https://www.instagram.com/dartspointnl/'],['tiktok','https://www.tiktok.com/@dartspoint']])assert.equal(await landing.getByRole('link',{name:social==='facebook'?'Facebook':social==='instagram'?'Instagram':'TikTok',exact:true}).getAttribute('href'),url);
 await landing.setViewportSize({width:390,height:844});const email=`browser-${randomUUID()}@validation.invalid`;await landing.getByPlaceholder('Jouw e-mailadres').fill(email);await landing.locator('button.submit').click();await landing.locator('#signup.complete').waitFor();
 await landing.goto(origin+'/landing/index.html?afmelden='+'a'.repeat(43));await landing.locator('#unsubscribe-dialog[open]').waitFor();const unsub=landing.waitForResponse(r=>r.url().endsWith('/api/launch-unsubscribe'));await landing.locator('#unsubscribe-submit').click();assert.equal((await unsub).status(),200);
 const a=await login(browser,'UpdateA'),b=await login(browser,'UpdateB'),c=await login(browser,'UpdateC');const page=a.page;page.setDefaultTimeout(15000);
 await a.context.tracing.start({screenshots:true,snapshots:true});
 for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.goto(origin+'/lobby');for(const label of ['Vrienden','Berichten','Profiel']){const nav=page.locator(await page.locator('.lobby-mobile-nav').isVisible()?'.lobby-mobile-nav':'.lobby-desktop-nav');if(label==='Profiel'&&!await nav.getByRole('button',{name:label,exact:true}).count())await page.locator('.lobby-header-profile').click();else await nav.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow');await page.screenshot({path:`${directory}/${label}-${width}x${height}.png`});}}
 const room=(await get(page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');for(const actor of [a,b,c])await post(actor.page,'room',{roomId:room.id});
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/spelen');await page.getByRole('tab',{name:/Kamerchat/}).waitFor();assert.equal(await page.getByRole('tab',{name:/Spelchat/}).count(),0);
 for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.screenshot({path:`${directory}/room-chat-${width}x${height}.png`});if(width<1024){await page.getByRole('button',{name:'Meer',exact:true}).click();await page.screenshot({path:`${directory}/Meer-${width}x${height}.png`});await page.keyboard.press('Escape');}}
 await page.setViewportSize({width:390,height:400});await page.getByLabel('Chatbericht',{exact:true}).first().focus();const composer=await page.getByLabel('Chatbericht',{exact:true}).first().boundingBox();assert.ok(composer&&composer.y>=0&&composer.y+composer.height<=400,'Composer reachable in keyboard-sized viewport');await page.screenshot({path:directory+'/keyboard-room-chat.png'});
 // Dedicated authenticated notification channel: other user's channel cannot be joined.
 const client=new Client('ws://127.0.0.1:42567');await assert.rejects(client.joinOrCreate('personal',{userId:b.id,token:a.token}));const personal=await client.joinOrCreate('personal',{userId:a.id,token:a.token});await wait(300);
 const dm=await post(b.page,'private-channel',{targetId:a.id});let notified=0;const received=new Promise<void>(resolve=>personal.onMessage('chat.changed',(e:any)=>{if(e.channelId===dm.channelId){notified=performance.now();resolve();}}));const sentAt=performance.now();await post(b.page,'chat/send',{channelId:dm.channelId,clientMessageId:randomUUID(),body:'Realtime tellercontrole'});await Promise.race([received,wait(5000).then(()=>{throw new Error('Notification timeout');})]);result.notificationMs=notified-sentAt;assert.ok(result.notificationMs<3000);await personal.leave();
 // Screenshot/snapshot tracing can enqueue unrelated browser work between a
 // native stop and ingress. Preserve the UI trace separately from timing.
 await a.context.tracing.stop({path:directory+'/ui-before-timing.trace.zip'});
 result.timingInstrumentation={screenshots:false,snapshots:false,nativeDomPerformanceMarks:true,requests:'native',delays:'CDP response stage only'};
 await page.setViewportSize({width:390,height:844});result.practiceReadiness=trackPractice(page,'foreground-30');
 const responseDelay=await page.context().newCDPSession(page);let holdResponseMs=0;const interceptionErrors:Error[]=[];result.responseDelays=[];
 responseDelay.on('Fetch.requestPaused',async event=>{try{const body=event.request.postData?JSON.parse(event.request.postData):null,delay=event.request.method==='POST'&&body?.type==='horizontal'?holdResponseMs:0,started=performance.now();if(delay)await wait(delay);await responseDelay.send('Fetch.continueResponse',{requestId:event.requestId});if(delay)result.responseDelays.push({commandId:body.commandId,responseStatus:event.responseStatusCode,requestedDelayMs:delay,heldMs:performance.now()-started});}catch(error){interceptionErrors.push(error as Error);}});
 // Hold headers only after the native request reached the server and its
 // response arrived. Neither uplink nor clock calibration is proxied or delayed.
 await responseDelay.send('Fetch.enable',{patterns:[{urlPattern:origin+'/api/platform/practice',requestStage:'Response'}]});
 await page.goto(origin+'/oefenen');await page.bringToFront();await readyPractice(page,'horizontal');assert.equal(await page.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),true,'Timing requires a focused foreground page');await page.evaluate(`const capture=function(){window.__dpInput=performance.now();window.__dpFrame=undefined;window.__dpFirstFrozen=undefined;requestAnimationFrame(function(){window.__dpFrame=performance.now()-window.__dpInput;const rect=document.querySelector('.practice-meter-x i').getBoundingClientRect();window.__dpFirstFrozen=rect.left+rect.width/2;});};window.addEventListener('pointerdown',capture,{capture:true});window.addEventListener('keydown',capture,{capture:true});`);
 let baseline=await resetPractice(page);
 for(const delay of [100,300,1000])for(let i=0;i<10;i++){
  holdResponseMs=delay;
  await page.bringToFront();assert.equal(await page.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),true,'Timing sample remains foreground');await readyPractice(page,'horizontal');await page.evaluate(()=>performance.clearMarks('dp-local-stop'));
  const ack=stopReceipt(page,'horizontal');const start=performance.now();const button=page.getByRole('button',{name:'Stop de richting',exact:true});if(i%2){await button.focus();await page.keyboard.press('Space');}else await button.click();
  await wait(30);const first=await page.locator('.practice-meter-x i').evaluate(e=>getComputedStyle(e).left);await wait(35);const pending=await page.locator('.practice-meter-x i').evaluate(e=>getComputedStyle(e).left);
  await page.waitForFunction(()=>Number.isFinite((window as any).__dpFrame),{},{timeout:1500});
  const local=await page.evaluate(()=>{const mark=performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark;return {handlerMs:mark.startTime-(window as any).__dpInput,frameMs:(window as any).__dpFrame,firstFrozen:(window as any).__dpFirstFrozen,detail:mark.detail};});
  assert.equal(first,pending,'Frozen horizontal indicator must not advance while receipt is delayed');
  assert.ok(local.handlerMs>=0&&local.handlerMs<=50,'Local input handler freeze <=50ms');
  const freezeJumpPx=Math.abs(local.firstFrozen-local.detail.geometry.indicator);
  assert.ok(freezeJumpPx<=1,'First frozen practice frame <=1 CSS pixel');assert.ok(Number.isFinite(local.frameMs),'Every stop records its next frame opportunity');
  const acknowledged=await ack,receipt=await acknowledged.json(),ingress=await classifyPracticeSample(acknowledged,local.detail,baseline,a.id);
  const sample:any={commandId:local.detail.commandId,status:acknowledged.status(),freezeJumpPx,trace:local.detail,delayMs:delay,input:i%2?'keyboard':'mouse',handlerMs:local.handlerMs,frameMs:local.frameMs,confirmationMs:performance.now()-start,pendingStable:first===pending,ingress};
  // Keep every attempt, including a rejected old sample, in the distribution.
  result.timing.push(sample);
  if(ingress.admissible){
   assert.equal(acknowledged.status(),200,'An in-window foreground sample must be accepted: '+receipt.code);
   assert.equal(receipt.commandId,local.detail.commandId);assert.equal(receipt.timing.admittedAt,local.detail.rendered.sampleAt,'Accepted practice stop must keep its drawn sample');
   assert.equal(receipt.timing.receivedAt,ingress.receivedAt);assert.equal(receipt.timing.admissionWindowMs,ingress.windowMs);
   const correctionNormalized=Math.abs(receipt.state.lockedX-(local.detail.x*2.28-1.14));assert.ok(correctionNormalized*local.detail.geometry.trackSize/2.28<=1,'Practice correction must be <=1 CSS pixel');
   await wait(30);const ackPosition=await page.locator('.practice-meter-x i').evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left+rect.width/2;});
   const ackJumpPx=Math.abs(ackPosition-local.detail.geometry.indicator);assert.ok(ackJumpPx<=1,'Acknowledged valid practice DOM geometry <=1 CSS pixel');
   Object.assign(sample,{outcome:'accepted-exact-sample',ackJumpPx,correctionNormalized,server:receipt.timing});
  }else{
   const rejection=await assertRejectedPracticeSample(page,acknowledged,receipt,local.detail,baseline,ingress);
   Object.assign(sample,{outcome:'explicit-invalid-render-sample',code:receipt.code,rejection});
  }
  baseline=await resetPractice(page);
 }
 // The requirement is p95 over all 30 foreground stops, including slow samples.
 // Record the full distribution; do not retry/discard an individual late repaint.
 const frames=result.timing.map((sample:any)=>sample.frameMs).sort((a:number,b:number)=>a-b);
 result.frameOpportunity={samples:frames.length,p95Ms:frames[Math.ceil(frames.length*.95)-1],maxMs:frames.at(-1),foreground:true};
 console.log('Foreground stop frame opportunities: '+JSON.stringify(result.frameOpportunity));
 assert.equal(frames.length,30);assert.ok(result.frameOpportunity.p95Ms<=50,'Next frame opportunity p95 <=50ms across all 30 foreground attempts');
 result.acceptanceCoverage=[];
 for(const delayMs of [100,300,1000])for(const input of ['mouse','keyboard']){
  const cohort=result.timing.filter((sample:any)=>sample.delayMs===delayMs&&sample.input===input),accepted=cohort.filter((sample:any)=>sample.outcome==='accepted-exact-sample').length;
  result.acceptanceCoverage.push({delayMs,input,attempted:cohort.length,accepted,rejected:cohort.length-accepted});
  assert.equal(cohort.length,5);assert.ok(accepted>=1,'Every delay/input combination must include a real exact-sample acceptance');
 }
 console.log('All-attempt protocol outcomes: '+JSON.stringify(result.acceptanceCoverage));
 assert.equal(interceptionErrors.length,0,'Response-stage interception must complete without protocol errors');assert.equal(result.responseDelays.length,30,'All 30 native stop responses received the intended delay');
 for(const response of result.responseDelays){const sample=result.timing.find((sample:any)=>sample.commandId===response.commandId);assert.ok(sample);assert.equal(response.responseStatus,sample.status);assert.ok(response.heldMs>=response.requestedDelayMs-1,'Native response delay was actually applied');}
 await responseDelay.send('Fetch.disable');await responseDelay.detach();
 // Prove the rejection assertions even when all 30 native attempts happen to
 // be valid. This separate injected stall never enters their p95 distribution.
 await page.evaluate(()=>performance.clearMarks('dp-local-stop'));
 const expired=stopReceipt(page,'horizontal');
 await page.evaluate(()=>{const started=performance.now();while(performance.now()-started<160){}document.querySelector('.practice-throw')!.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,bubbles:true}));});
 const expiredResponse=await expired,expiredReceipt=await expiredResponse.json(),expiredLocal=await page.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark).detail);
 const expiredIngress=await classifyPracticeSample(expiredResponse,expiredLocal,baseline,a.id);
 result.explicitExpiredSample={injectedMainThreadStallMs:160,...await assertRejectedPracticeSample(page,expiredResponse,expiredReceipt,expiredLocal,baseline,expiredIngress)};
 baseline=await resetPractice(page);
 // Native Chromium throttling applies a minimum request-to-response latency.
 // It keeps polling/auth requests out of competing Playwright route handlers.
 const network=await page.context().newCDPSession(page);await network.send('Network.enable');
 try{for(const rtt of [20,80,180,350]){
  await network.send('Network.emulateNetworkConditions',{offline:false,latency:rtt,downloadThroughput:-1,uploadThroughput:-1});await wait(6500);
  await readyPractice(page,'horizontal');await page.evaluate(()=>performance.clearMarks('dp-local-stop'));const ack=stopReceipt(page,'horizontal');await page.getByRole('button',{name:'Stop de richting',exact:true}).click();
  const response=await ack,receipt=await response.json(),request=response.request().postDataJSON(),timing=response.request().timing(),httpRttMs=timing.responseEnd-timing.requestStart;assert.ok(httpRttMs>=rtt*.75,'Native HTTP latency was actually applied');
  const local=await page.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark).detail);assert.equal(request.commandId,local.commandId);assert.equal(request.type,'horizontal');
  if(response.ok()){
   assert.equal(receipt.commandId,local.commandId);assert.equal(receipt.timing.admittedAt,local.rendered.sampleAt);const correctionNormalized=Math.abs(receipt.state.lockedX-(local.x*2.28-1.14));assert.ok(correctionNormalized*local.geometry.trackSize/2.28<=1,'Throttled practice correction must be <=1 CSS pixel');
   await wait(30);const ackPosition=await page.locator('.practice-meter-x i').evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left+rect.width/2;});assert.ok(Math.abs(ackPosition-local.geometry.indicator)<=1,'Throttled acknowledged practice DOM geometry <=1 CSS pixel');
   result.latency.push({commandId:local.commandId,emulatedRtt:rtt,networkModel:'Chromium minimum HTTP response latency, not symmetric link delay',measuredHttpRttMs:httpRttMs,outcome:'accepted-exact-sample',ackJumpPx:Math.abs(ackPosition-local.geometry.indicator),correctionNormalized,trace:local,server:receipt.timing});
  }else{
   assert.equal(response.status(),409);assert.equal(receipt.code,'invalid_render_sample','A claim outside the measured window is explicitly rejected');await expect(page.getByRole('alert').filter({hasText:'timingmeting'})).toBeVisible();
   const unchanged=await get(page,'practice/'+request.sessionId);assert.equal(unchanged.stateVersion,request.expectedStateVersion);assert.equal(unchanged.state.phase,'horizontal');assert.equal(unchanged.state.lockedX,null,'Rejected sample cannot change the game position');
   result.latency.push({commandId:local.commandId,emulatedRtt:rtt,networkModel:'Chromium minimum HTTP response latency, not symmetric link delay',measuredHttpRttMs:httpRttMs,outcome:'explicit-invalid-render-sample',code:receipt.code,unchangedStateVersion:unchanged.stateVersion,trace:local});
  }
  await network.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await resetPractice(page);
 }}finally{await network.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await network.detach();}

 const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await a.context.storageState()});await touchContext.addInitScript('globalThis.__name = (fn) => fn;');const touch=await touchContext.newPage();touch.setDefaultTimeout(15000);result.touchReadiness=trackPractice(touch,'touch');await touch.goto(origin+'/oefenen');await touch.bringToFront();assert.equal(await touch.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),true,'Touch timing requires foreground focus');await readyPractice(touch,'horizontal');await resetPractice(touch);
 let stopRequests=0;touch.on('request',r=>{if(r.url().endsWith('/api/platform/practice')&&r.method()==='POST'&&['horizontal','vertical'].includes(r.postDataJSON()?.type))stopRequests++;});await touch.getByRole('button',{name:'Stop de richting',exact:true}).dispatchEvent('pointerdown',{isPrimary:false,button:0,pointerType:'touch'});await wait(50);assert.equal(stopRequests,0);
 await touch.getByRole('button',{name:'Stop de richting',exact:true}).tap();await readyPractice(touch,'vertical');const vertical=stopReceipt(touch,'vertical');await touch.getByRole('button',{name:'Stop de hoogte en gooi',exact:true}).tap();const sealed=await(await vertical).json();assert.equal(sealed.state.phase,'flying');
 const positions=()=>touch.evaluate(()=>[...document.querySelectorAll('.practice-meter-x i,.practice-meter-y i')].map(e=>[getComputedStyle(e).left,getComputedStyle(e).top]));await wait(20);const firstAxes=await positions();await wait(100);assert.deepEqual(await positions(),firstAxes,'Both axes stay fixed during flight');assert.equal(stopRequests,2,'Touch compatibility clicks cannot create another stop');await touchContext.close();result.touch={primaryOnly:true,oneStopPerTap:true,bothAxesFixedFlight:true};
 await a.context.tracing.start({screenshots:true,snapshots:true});
 // Retain the normal authenticated socket for ordinary fixture cleanup.
 await page.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=typeof data==='string'?data:data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):'';if(text.includes('clock.ping'))(window as any).__qaGameSocket=this;return send.call(this,data);};});
 const invitation=await post(page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});const match=(await post(b.page,'invite/respond',{inviteId:invitation.id,action:'accept'})).matchId;await page.goto(origin+'/spelen?match='+match);await b.page.goto(origin+'/spelen?match='+match);await page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await page.locator('.dp-play-nav').waitFor();
 for(const [width,height] of sizes){await page.setViewportSize({width,height});if(width<1024)await page.getByRole('button',{name:/^Chat/}).click();await page.screenshot({path:`${directory}/game-chat-${width}x${height}.png`});if(width>=1024){await page.getByRole('button',{name:'Spelersmenu openen',exact:true}).click();await page.screenshot({path:`${directory}/Meer-${width}x${height}.png`});await page.keyboard.press('Escape');}}
 // Isolated practice did not write any official account ranking/results.
 const final=await get(page,'bootstrap');assert.equal(final.players.find((p:any)=>p.id===a.id).rating,1500);assert.equal(final.players.find((p:any)=>p.id===a.id).rankedPlayed,0);
 await forfeitGame(page,match,[page,b.page]);result.fixtureReservationReleased=true;
 await a.context.tracing.stop({path:directory+'/trace.zip'});await writeFile(directory+'/results.json',JSON.stringify(result,null,2));console.log('Update landing, responsive chat, notification and delayed timing acceptance passed');
}finally{for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'wait'}).catch(()=>{});await writeFile(directory+'/progress.json',JSON.stringify(result,null,2));await browser.close();await ingressPool?.end();}
