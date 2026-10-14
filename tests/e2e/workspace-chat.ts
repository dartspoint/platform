import assert from 'node:assert/strict';
import {chromium,expect,type Page} from '@playwright/test';
import {Client} from '@colyseus/sdk';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {login,get,post,origin} from './helpers';
import {forfeitGame} from './game-command';
import {meterPosition} from '../../packages/game-core/src/timing';
import {startThrowPerformanceProfile} from './throw-performance-profile';
import {startThrowPresentationProfile} from './throw-presentation-profile';
const browser=await chromium.launch({headless:true}),pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const browserEnvironment={engine:'chromium-headless-shell',channel:'default',headless:true,version:browser.version(),executablePathReportedByPlaywright:chromium.executablePath(),executablePathIsLaunchedBinary:false,physicalHardwareTested:false};
const runId=randomUUID().slice(0,6),oldFetchBody='Nieuwe regel tijdens oude fetch '+runId;
const dir='artifacts/workspace-chat';await mkdir(dir,{recursive:true});
let cleanupMatch:string|undefined,cleanupPage:Page|undefined,cleanupPages:Page[]=[],cleanupPersonal:{leave:()=>Promise<unknown>}|undefined;
let ingressPool:import('pg').Pool|undefined;
const report:any={physicalDevices:false,browserEnvironment,desktop:[],mobile:[],chat:[],checks:{},floodTimingAcceptance:{nativeToLocalFreezeLimitMs:50,nativeHandlerLimitMs:50,firstFrozenRAFTargetMs:50,firstFrozenRAFGate:'reported-only-user-request-2026-10-14'}};
function p95(values:number[]){return values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];}
const epochNow=()=>performance.timeOrigin+performance.now();
const pageState=(page:Page)=>page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState}));
async function writeLatencyProof(){
 if(!report.chat.length)return;
 const locals=report.chat.map((r:any)=>r.localMs),recipients=report.chat.map((r:any)=>r.recipientMs),allLocal=locals.every(Number.isFinite),allRecipient=recipients.every(Number.isFinite);
 report.latency={samples:report.chat.length,completedSamples:recipients.reduce((count:number,value:unknown)=>count+(typeof value==='number'&&Number.isFinite(value)?1:0),0),localP95Ms:locals.length&&allLocal?p95(locals):null,recipientP95Ms:recipients.length&&allRecipient?p95(recipients):null,targets:{localMs:50,recipientMs:250},localGate:'reported-only-user-priority-2026-10-13',recipientGate:'reported-only-user-priority-2026-10-13',localTargetMet:locals.length===15&&allLocal?p95(locals)<=50:null,recipientTargetMet:recipients.length===15&&allRecipient?p95(recipients)<=250:null,environment:'Native built web, local PostgreSQL/Redis/Colyseus, Chromium two authenticated users, no added network delay; actual page focus and visibility recorded per sample'};
 const proof={browserEnvironment,measurement:report.measurement,latency:report.latency,samples:report.chat};
 await writeFile(dir+'/latency.json',JSON.stringify(proof,null,2));await writeFile(dir+'/results.json',JSON.stringify(report,null,2));
 console.log('Workspace/chat raw latency proof '+JSON.stringify(proof));
}
async function desktopGeometry(page:Page,screen:string){await pause(100);const g=await page.evaluate(()=>{const box=(selector:string)=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {viewport:{width:innerWidth,height:innerHeight},left:box('.dp-workspace>main'),right:box('.dp-desktop-community'),top:box('.dp-desktop-community-top'),members:box('.dp-desktop-players'),friends:box('.dp-desktop-friends'),chat:box('.dp-desktop-chat'),composer:box('.dp-desktop-chat .chat-compose'),chatPanels:document.querySelectorAll('.chat-panel').length,scrollWidth:document.documentElement.scrollWidth};});assert.equal(g.chatPanels,1,screen+' uses one mounted chat');assert.ok(Math.abs(g.left!.width-g.right!.width)<2,screen+' equal workspace halves');assert.ok(Math.abs(g.members!.width-g.friends!.width)<2,screen+' equal top columns');assert.ok(Math.abs(g.top!.height-g.chat!.height)<2,screen+' equal right halves');if(g.composer)assert.ok(g.composer.bottom<=g.viewport.height+1&&g.composer.y>=g.chat!.y,screen+' composer reachable');else assert.equal(screen,'lobby','Only an unopened lobby conversation has no composer');assert.ok(g.scrollWidth<=g.viewport.width+1,screen+' no horizontal overflow');report.desktop.push({screen,...g});await page.screenshot({path:`${dir}/${screen}-${g.viewport.width}x${g.viewport.height}.png`});}
async function readyFloodStop(page:Page,axis:'horizontal'|'vertical'){
 const button=page.getByRole('button',{name:axis==='horizontal'?'Stop horizontale indicator':'Stop verticale indicator en gooi',exact:true});
 await expect(button).toBeEnabled();
 const selector=axis==='horizontal'?'.dp-meter-row .dp-meter-indicator':'.dp-meter-track-vertical .dp-meter-indicator',property=axis==='horizontal'?'left':'top',before=await page.locator(selector).evaluate((element,property)=>(element as HTMLElement).style.getPropertyValue(property),property);
 await page.waitForFunction(({selector,property,before})=>(document.querySelector(selector) as HTMLElement)?.style.getPropertyValue(property)!==before,{selector,property,before},{polling:'raf'});
 return button;
}
async function stopDuringFlood(page:Page,channelId:string,axis:'horizontal'|'vertical',matchId:string,actorId:string){
 await page.bringToFront();const button=await readyFloodStop(page,axis);if(axis==='vertical')await button.focus();
 assert.equal(await page.evaluate(()=>document.hasFocus()&&document.visibilityState==='visible'),true,'Flood timing has document focus and visible state');
 const baseline=await get(page,'match/'+matchId);assert.equal(baseline.lifecycle,'playing');assert.equal(baseline.state.phase,axis);assert.equal(baseline.seat,baseline.state.turn);
 const attemptIndex=report.floodTiming.length,clientMessageId=randomUUID(),attempt:any={axis,input:axis==='horizontal'?'pointer':'keyboard',clientMessageId,httpStatus:null,httpCode:null,seeds:[],focusEvidence:report.floodFocusEvidence,baseline:{stateVersion:baseline.stateVersion,lifecycle:baseline.lifecycle,phase:baseline.state.phase,phaseToken:baseline.state.phaseToken,phaseStartedAt:baseline.state.phaseStartedAt,lastAcceptedAt:baseline.state.lastAcceptedAt??0,seat:baseline.seat,turn:baseline.state.turn}};report.floodTiming.push(attempt);
 // Read the authoritative baseline before filling the real 3/2s budget. The
 // fourth request starts inside this same actor's actual native input capture.
 await pause(2100);await Promise.all([0,1,2].map(async i=>{const clientMessageId=randomUUID(),body='Game chat '+runId+' '+(attemptIndex?attemptIndex+' ':'')+i;await post(page,'chat/send',{channelId,clientMessageId,body});attempt.seeds.push({clientMessageId,completedAt:epochNow()});}));
 await readyFloodStop(page,axis);
 await page.evaluate(input=>{const w=window as any;performance.clearMarks('dp-local-stop');w.__floodFirst=undefined;w.__floodInput=undefined;w.__floodRequest=undefined;w.__floodRequestPromise=undefined;w.__floodPrepared={clientMessageId:input.clientMessageId,body:JSON.stringify(input)};},{channelId,clientMessageId,body:'Flood during '+axis+' '+runId});
 // Both profilers are inert in normal acceptance. Separate opt-in recording
 // preserves this exact workload, native input and every hard assertion.
 const presentation=await startThrowPresentationProfile(page,dir+'/throw-performance-profile/presentation-'+attemptIndex+'-'+axis);
 let inputFailed=false;
 try{
 // Native dispatch captures geometry before the normal stop handler.
 if(axis==='horizontal')await button.click();else await button.press('Enter');
 await page.waitForFunction(()=>!!(window as any).__floodFirst);
 const local=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,input:(window as any).__floodInput,first:(window as any).__floodFirst,flood:(window as any).__floodRequest,mark:performance.getEntriesByName('dp-local-stop').at(-1)?.toJSON(),trace:(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark)?.detail}));
 Object.assign(attempt,{browserTimeOrigin:local.timeOrigin,captureEpoch:local.input?.epoch,inputEpoch:local.trace?local.timeOrigin+local.trace.inputAt:undefined,floodStartedAt:local.flood?.floodStartedAt,captureState:local.input?.state,preInput:local.input?.geometry,firstFrozen:local.first,trace:local.trace});
 attempt.nativeInput=local.input;
 assert.ok(local.trace,'A genuine flood stop captures its rendered v3 sample');
 assert.ok(local.input&&local.first,'Flood stop retains its native capture and first frozen RAF');assert.equal(local.input.isTrusted,true,'Flood stop uses genuine native browser input');assert.ok(Number.isFinite(local.input.eventTimeStamp)&&local.input.eventTimeStamp>=0&&Number.isFinite(local.input.captureStartedAt)&&local.input.eventTimeStamp<=local.input.captureStartedAt&&local.input.at===local.input.eventTimeStamp,'Native event time precedes capture on the same monotone clock');
 assert.ok(local.trace.stopAppliedAt<=local.trace.sendAt&&local.trace.sendAt<=local.trace.sendReturnedAt&&local.trace.sendReturnedAt<=local.trace.handlerCompletedAt,'Freeze precedes dispatch and handler completion');
 Object.assign(attempt,{handlerMs:local.trace.handlerCompletedAt-local.input.at,stopMs:local.trace.stopAppliedAt-local.input.at,nativeToLocalFreezeMs:local.trace.stopAppliedAt-local.input.eventTimeStamp,firstFrameMs:local.first.at-local.input.at,rafEntryMs:local.first.rafEntryAt-local.input.at,rafGeometryMs:local.first.geometryCompletedAt-local.first.geometryStartedAt,freezeJumpPx:Math.abs(local.first.indicator-local.input.geometry.indicator),freezeJumpFraction:Math.abs(local.first.indicator-local.input.geometry.indicator)/local.input.geometry.trackSize});
 console.log(JSON.stringify({event:'workspace_flood_stop_attempt',axis,clientMessageId,commandId:local.trace.commandId,captureEpoch:attempt.captureEpoch,inputEpoch:attempt.inputEpoch,floodStartedAt:attempt.floodStartedAt,handlerMs:attempt.handlerMs,firstFrameMs:attempt.firstFrameMs}));
 await page.waitForFunction(commandId=>((window as any).__dpTimingTraces??[]).some((event:any)=>['receipt','rejected'].includes(event.event)&&event.commandId===commandId),local.trace.commandId);
 const observed=await page.evaluate(commandId=>({receipt:((window as any).__dpTimingTraces??[]).find((event:any)=>['receipt','rejected'].includes(event.event)&&event.commandId===commandId),at:performance.now(),state:{focused:document.hasFocus(),visibility:document.visibilityState}}),local.trace.commandId),receipt=observed.receipt;
 Object.assign(attempt,{receipt,receiptObservedAt:observed.at,receiptObservedState:observed.state});
 assert.ok(Number.isFinite(receipt.monotonicAt)&&receipt.monotonicAt>=local.trace.sendReturnedAt,'Actual outcome callback has its browser-local timestamp');
 const acknowledged=await page.evaluate(axis=>{const w=window as any,element=document.querySelector(axis==='horizontal'?'.dp-meter-row .dp-meter-indicator':'.dp-meter-track-vertical .dp-meter-indicator')!,r=element.getBoundingClientRect();return {indicator:axis==='horizontal'?r.left+r.width/2:r.top+r.height/2,sameNode:element===w.__floodMeters[axis],sameBoard:document.querySelector('.dp-board-stage')===w.__boardBefore,state:{focused:document.hasFocus(),visibility:document.visibilityState}};},axis);
 Object.assign(attempt,{acknowledged,ackJumpPx:Math.abs(acknowledged.indicator-local.input.geometry.indicator),ackJumpFraction:Math.abs(acknowledged.indicator-local.input.geometry.indicator)/local.input.geometry.trackSize});
 const flood=await page.evaluate(async()=>{const w=window as any;await w.__floodRequestPromise;return w.__floodRequest;});assert.ok(flood,'The native input started its genuine browser request');Object.assign(attempt,flood);assert.equal(attempt.floodError,undefined,'The real concurrent browser request completes');
 console.log(JSON.stringify({event:'workspace_flood_http_complete',axis,clientMessageId,commandId:local.trace.commandId,floodStartedAt:attempt.floodStartedAt,inputEpoch:attempt.inputEpoch,floodCompletedAt:attempt.floodCompletedAt,httpStatus:attempt.httpStatus,httpCode:attempt.httpCode}));
 assert.equal(attempt.httpStatus,429,'Concurrent new-message flood is actually refused');assert.equal(attempt.httpCode,'chat_burst_limited');
 assert.ok(attempt.inputEpoch>=attempt.floodStartedAt&&attempt.inputEpoch<=attempt.floodCompletedAt,'Actual stop handler overlaps the still-pending real browser flood request');
 // Classify against the immutable original database ingress, after the actual
 // frame/ACK measurement. Local/CI only; no staging database introspection.
 assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(origin).hostname,'127.0.0.1');
 assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1','Ingress diagnostics use only the disposable local PostgreSQL');
 if(!ingressPool){const {db}=await import('../../packages/data/src/db');ingressPool=db();}
 const row=(await ingressPool.query("select received_at,latency_ms,admission_window_ms,timing_version from private.command_ingress where scope='match' and actor_id=$1 and command_id=$2",[actorId,local.trace.commandId])).rows[0];assert.ok(row,'Every actual stop retains its original server ingress');
 const receivedAt=new Date(row.received_at).getTime(),windowMs=Number(row.admission_window_ms),sampleAt=local.trace.rendered.sampleAt;
 assert.equal(row.timing_version,'render-sample-v3');assert.equal(local.trace.timingVersion,'render-sample-v3');assert.equal(local.trace.phaseToken,baseline.state.phaseToken);assert.equal(local.trace.phaseStartedAt,baseline.state.phaseStartedAt);assert.ok(windowMs>=54&&windowMs<=124);assert.ok(Number(row.latency_ms)>=0&&Number(row.latency_ms)<=90);
 const violations=[sampleAt>receivedAt?'future':null,sampleAt<receivedAt-windowMs?'old':null,sampleAt<baseline.state.phaseStartedAt?'before-phase':null,sampleAt<(baseline.state.lastAcceptedAt??0)?'before-last-accepted':null].filter(Boolean);
 attempt.ingress={receivedAt,windowMs,sampleAt,sampleAgeMs:receivedAt-sampleAt,admissible:violations.length===0,violations};
 attempt.performance=await page.evaluate(inputAt=>{
  const w=window as any;w.__floodDrainPerformance?.();const data=w.__floodDiagnostics,observedAt=performance.now();
  const overlaps=(entry:any)=>entry.startTime+entry.duration>=inputAt-1000&&entry.startTime<=observedAt;
  return {startedAt:data.startedAt,observedAt,capacityPerType:data.capacityPerType,supported:data.supported,dropped:data.dropped,longTasks:data.longTasks.filter(overlaps),longAnimationFrames:data.longAnimationFrames.filter(overlaps),events:data.events.filter((entry:any)=>entry.startTime>=inputAt-1000&&entry.startTime<=inputAt+1000),stateEvents:data.stateEvents.filter((entry:any)=>entry.at>=inputAt-1000&&entry.at<=observedAt),timerHeartbeatIntervalMs:data.timerHeartbeatIntervalMs,timerHeartbeats:data.timerHeartbeats.filter((at:number)=>at>=inputAt-1000&&at<=observedAt),rafHeartbeats:data.rafHeartbeats.filter((entry:any)=>entry.at>=inputAt-1000&&entry.at<=observedAt)};
 },local.input.at);
 // Keep the complete metadata-only attempt in hosted stdout before a hard
 // gate can fail. The runner's private report may not otherwise survive.
 attempt.frameTiming={targetMs:50,gate:'reported-only-user-request-2026-10-14',targetMet:Number.isFinite(attempt.firstFrameMs)&&attempt.firstFrameMs>=0?attempt.firstFrameMs<=50:null};
 console.log(JSON.stringify({event:'workspace_flood_complete_attempt',...attempt}));
 if(attempt.frameTiming.targetMet===false)console.warn('Flood '+axis+' native-to-first-frozen-RAF '+attempt.firstFrameMs+' ms exceeds the advisory 50 ms target; native-to-local-freeze remains a hard gate.');
 assert.ok(Number.isFinite(local.trace.stopAppliedAt)&&Number.isFinite(attempt.nativeToLocalFreezeMs)&&attempt.nativeToLocalFreezeMs>=0&&attempt.nativeToLocalFreezeMs<=50,'Flood native event to local freeze <=50ms');
 assert.ok(Number.isFinite(attempt.handlerMs)&&attempt.handlerMs>=0&&attempt.handlerMs<=50,'Flood handler freeze <=50ms');
 for(const duration of [attempt.firstFrameMs,attempt.rafEntryMs,attempt.rafGeometryMs])assert.ok(Number.isFinite(duration)&&duration>=0,'Flood frame durations are finite and nonnegative');
 assert.equal(acknowledged.sameNode,true);assert.equal(acknowledged.sameBoard,true);
 if(violations.length){
  assert.equal(receipt.event,'rejected');assert.equal(receipt.code,'invalid_render_sample');await expect(page.locator('.dp-connection-note').filter({hasText:'timingmeting'})).toBeVisible();
  const unchanged=await get(page,'match/'+matchId);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.deepEqual(unchanged.state,baseline.state,'Invalid flood sample preserves all authoritative phase/locks/score/darts');await readyFloodStop(page,axis);
  attempt.outcome='rejected-invalid-unchanged';attempt.visibleError=true;attempt.controlledRestore=true;return null;
 }
 assert.equal(receipt.event,'receipt','An admissible sample must be accepted exactly');assert.equal(receipt.timing.receivedAt,receivedAt);assert.equal(receipt.timing.admissionWindowMs,windowMs);assert.equal(receipt.timing.admittedAt,sampleAt,'Receipt preserves the exact drawn sample');
 assert.equal(axis==='horizontal'?receipt.lockedX:receipt.lockedY,meterPosition(sampleAt,local.trace.phaseStartedAt,axis,baseline.state.meterSpeedVersion));assert.ok(attempt.freezeJumpPx<=1,'Flood first freeze <=1CSSpx');assert.ok(attempt.ackJumpPx<=1,'Flood authoritative ACK <=1CSSpx');attempt.outcome='accepted-exact-sample';
 return receipt;
 }catch(error){inputFailed=true;throw error;}finally{try{await presentation.stop();}catch(error){if(!inputFailed)throw error;attempt.profileCleanupFailed=true;}}
}
try{
 const a=await login(browser,'LayoutA'),b=await login(browser,'LayoutB');cleanupPage=a.page;cleanupPages=[a.page,b.page];await a.context.addInitScript('globalThis.__name = (fn) => fn;');await b.context.addInitScript('globalThis.__name = (fn) => fn;');for(const page of cleanupPages)await page.addInitScript(()=>{const nativeSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);if(text.includes('command')||text.includes('clock.ping'))(window as any).__qaGameSocket=this;return nativeSend.call(this,data);};});a.page.setDefaultTimeout(15000);b.page.setDefaultTimeout(15000);
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[1024,768]]){await a.page.setViewportSize({width,height});await a.page.goto(origin+'/lobby');await a.page.locator('.dp-desktop-community').waitFor();await desktopGeometry(a.page,'lobby');assert.ok(await a.page.getByText('Kies een kamer',{exact:true}).count());}
 const room=(await get(a.page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');for(const actor of [a,b])await post(actor.page,'room',{roomId:room.id});
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){await a.page.setViewportSize({width,height});await a.page.goto(origin+'/spelen');await a.page.locator('.dp-room-community').waitFor();await desktopGeometry(a.page,'room');assert.equal(await a.page.getByRole('tab',{name:/Spelchat/}).count(),0);}
 await a.page.setViewportSize({width:1023,height:768});await a.page.goto(origin+'/spelen');await a.page.locator('.dp-room-home .chat-panel').waitFor();assert.equal(await a.page.locator('.dp-desktop-community').count(),0);report.checks.breakpoint1024=true;
 for(const [width,height] of [[320,568],[390,844]]){await a.page.setViewportSize({width,height});await a.page.goto(origin+'/spelen');await a.page.getByLabel('Chatbericht',{exact:true}).waitFor();const box=await a.page.locator('.chat-compose').boundingBox();assert.ok(box&&box.y+box.height<=height+1);await a.page.locator('.dp-play-nav').getByRole('button',{name:/^Chat/}).click();assert.equal(await a.page.locator('.chat-panel').count(),1,'Room chatnav preserves one mounted mobilechat');report.mobile.push({width,height,composer:box});}
 await a.page.setViewportSize({width:1366,height:768});await b.page.setViewportSize({width:1366,height:768});await a.page.goto(origin+'/spelen');await b.page.goto(origin+'/spelen');await a.page.getByLabel('Chatbericht',{exact:true}).waitFor();await b.page.getByLabel('Chatbericht',{exact:true}).waitFor();
 const roomChannel=(await post(a.page,'chat/resolve',{kind:'room',target:room.id})).channelId;
 // Same real membership survives refresh and a second browser tab without an extra system event.
 const history=await get(a.page,'chat/'+roomChannel);const joins=history.filter((m:any)=>m.kind==='room.member_joined'&&m.actor_id===a.id);assert.equal(joins.length,1);await post(a.page,'room',{roomId:room.id});await a.page.reload();await a.page.getByLabel('Chatbericht',{exact:true}).waitFor();const second=await a.context.newPage();await second.goto(origin+'/spelen');await post(second,'heartbeat',{});assert.equal((await get(a.page,'chat/'+roomChannel)).filter((m:any)=>m.kind==='room.member_joined'&&m.actor_id===a.id).length,1);await second.close();report.checks.joinOnce=true;
 const text='DubbelEnter '+randomUUID().slice(0,6);await a.page.getByLabel('Chatbericht',{exact:true}).fill(text);let sendRequests=0;a.page.on('request',r=>{if(r.url().endsWith('/chat/send'))sendRequests++;});
 await a.page.evaluate(()=>{const input=document.querySelector('.chat-compose input')!;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector<HTMLButtonElement>('.chat-send')!.click();});
 await a.page.waitForFunction(text=>[...document.querySelectorAll('.chat-message p')].some(e=>e.textContent===text),text);await pause(300);assert.equal(sendRequests,1,'two Enters + click produce one network send');assert.equal((await get(a.page,'chat/'+roomChannel)).filter((m:any)=>m.body===text).length,1);report.checks.duplicateEnterClick=true;
 await a.page.getByLabel('Chatbericht',{exact:true}).fill('IME concept');await a.page.evaluate(()=>{const input=document.querySelector('.chat-compose input')!;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,repeat:true}));});await pause(120);assert.equal(sendRequests,1);assert.equal(await a.page.getByLabel('Chatbericht',{exact:true}).inputValue(),'IME concept');report.checks.imeRepeat=true;
 await pause(2100);
 // An HTTP acknowledgement arriving after typing another concept cannot erase that concept.
 let sentPayload:any;
 await a.page.route('**/api/platform/chat/send',async route=>{sentPayload=route.request().postDataJSON();const response=await route.fetch();await pause(400);await route.fulfill({response});});
 await a.page.getByLabel('Chatbericht',{exact:true}).fill('Vertraagde bevestiging');await a.page.getByLabel('Chatbericht',{exact:true}).press('Enter');await a.page.getByLabel('Chatbericht',{exact:true}).fill('Nieuw concept blijft');await pause(550);assert.equal(await a.page.getByLabel('Chatbericht',{exact:true}).inputValue(),'Nieuw concept blijft');await a.page.unrouteAll({behavior:'wait'});report.checks.newDraftSurvives=true;
 // Lost HTTP acknowledgement: stored server echo merges the optimistic row on the original ID.
 await pause(2100);let lost:any;
 await a.page.route('**/api/platform/chat/send',async route=>{lost=route.request().postDataJSON();await route.fetch();await route.abort('failed');});await a.page.getByLabel('Chatbericht',{exact:true}).fill('Echo na verloren antwoord');await a.page.getByLabel('Chatbericht',{exact:true}).press('Enter');await pause(450);await a.page.unrouteAll({behavior:'wait'});await post(a.page,'chat/send',lost);await pause(400);assert.equal((await get(a.page,'chat/'+roomChannel)).filter((m:any)=>m.client_message_id===lost.clientMessageId).length,1);assert.equal(await a.page.locator('[data-client-message-id="'+lost.clientMessageId+'"]').count(),1);report.checks.sameIdRetryEcho=true;
 // Disallowed text remains a failed editable intent and never becomes a public stored row.
 await a.page.getByLabel('Chatbericht',{exact:true}).fill('k@nker');await a.page.getByLabel('Chatbericht',{exact:true}).press('Enter');await a.page.getByText(/Niet verzonden/).first().waitFor();assert.equal(await a.page.getByLabel('Chatbericht',{exact:true}).inputValue(),'k@nker');assert.equal((await get(b.page,'chat/'+roomChannel)).filter((m:any)=>m.body==='k@nker').length,0);report.checks.filteredDraftPreserved=true;await a.page.getByLabel('Chatbericht',{exact:true}).fill('');
 await pause(2100);let releaseHistory!:()=>void;const historyGate=new Promise<void>(resolve=>{releaseHistory=resolve;});let historyHeld=false;
 await a.page.route('**/api/platform/chat/'+roomChannel+'?*',async route=>{const response=await route.fetch();historyHeld=true;await historyGate;await route.fulfill({response});});
 await a.page.evaluate(channelId=>window.dispatchEvent(new CustomEvent('dartspoint:chat-changed',{detail:{channelId}})),roomChannel);for(let i=0;i<100&&!historyHeld;i++)await pause(10);assert.ok(historyHeld,'A genuine incremental history response is held');
 const missedPeer='Peer vóór eigen bevestiging '+randomUUID().slice(0,6);await post(b.page,'chat/send',{channelId:roomChannel,clientMessageId:randomUUID(),body:missedPeer});
 await a.page.getByLabel('Chatbericht',{exact:true}).fill(oldFetchBody);await a.page.getByLabel('Chatbericht',{exact:true}).press('Enter');await a.page.getByText(oldFetchBody,{exact:true}).waitFor();releaseHistory();await a.page.unrouteAll({behavior:'wait'});await pause(200);assert.equal(await a.page.getByText(oldFetchBody,{exact:true}).count(),1);await a.page.getByText(missedPeer,{exact:true}).waitFor();assert.equal(await a.page.getByText(missedPeer,{exact:true}).count(),1,'An own ACK cannot skip the earlier peer sequence');report.checks.oldFetchDoesNotOverwrite=true;report.checks.peerSequenceGapRecovered=true;
 // Fresh profile and avatar menus use the same real user and scoped actions.
 const incoming='Naam avatar menu '+runId;await pause(2100);await post(b.page,'chat/send',{channelId:roomChannel,clientMessageId:randomUUID(),body:incoming});await a.page.getByText(incoming,{exact:true}).waitFor();const row=a.page.locator('.chat-message').filter({has:a.page.getByText(incoming,{exact:true})});for(const selector of ['.chat-avatar-menu','.chat-name-menu']){await row.locator(selector).click();await a.page.getByRole('menuitem',{name:'Profiel bekijken',exact:true}).waitFor();assert.equal(await a.page.getByRole('menuitem',{name:'Modereren in deze kamer',exact:true}).count(),0);await a.page.keyboard.press('Escape');await a.page.waitForFunction(({body,selector})=>{const row=[...document.querySelectorAll('.chat-message')].find(e=>e.querySelector('p')?.textContent===body);return document.activeElement===row?.querySelector(selector);},{body:incoming,selector});}report.checks.bothMenuTriggers=true;
 // A DM remains addressed to its peer UUID when a different person reuses the former name.
 const privateChannel=(await post(a.page,'private-channel',{targetId:b.id})).channelId;const privateMarker='Privé-identiteit '+randomUUID().slice(0,6);await pause(2100);await post(b.page,'chat/send',{channelId:privateChannel,clientMessageId:randomUUID(),body:privateMarker});
 await row.locator('.chat-name-menu').click();await a.page.getByRole('menuitem',{name:'Privébericht',exact:true}).click();await a.page.getByRole('tab',{name:new RegExp(b.name)}).waitFor();await a.page.getByLabel('Privébericht aan '+b.name,{exact:true}).fill('Concept hoort bij dezelfde persoon');const selectedBefore=await a.page.locator('[data-chat-tab][data-state="active"]').getAttribute('data-chat-tab');assert.equal(selectedBefore,'private:'+privateChannel);await a.page.getByText(privateMarker,{exact:true}).waitFor();
 const c=await login(browser,'LayoutC'),newName='Hernoemd'+randomUUID().replaceAll('-','').slice(0,6);await post(b.page,'profile/rename',{username:newName});await post(c.page,'profile/rename',{username:b.name});await a.page.getByRole('tab',{name:new RegExp(newName)}).waitFor();assert.equal(await a.page.locator('[data-chat-tab][data-state="active"]').getAttribute('data-chat-tab'),selectedBefore);assert.equal(await a.page.getByLabel('Privébericht aan '+newName,{exact:true}).inputValue(),'Concept hoort bij dezelfde persoon');assert.equal(await a.page.getByText(privateMarker,{exact:true}).count(),1,'History follows the peer UUID after a rename');
 await a.page.locator('.chat-contact-menu').click();await a.page.getByRole('menuitem',{name:'Profiel bekijken',exact:true}).click();await a.page.locator('.profile-view h2').getByText(newName,{exact:true}).waitFor();await a.page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await a.page.getByRole('dialog').waitFor({state:'hidden'});await a.page.waitForFunction(()=>document.body.style.pointerEvents!=='none');report.checks.profileCloseReleasesPointerLock=true;const dmAck=a.page.waitForResponse(r=>r.url().endsWith('/chat/send'));await a.page.getByLabel('Privébericht aan '+newName,{exact:true}).press('Enter');await dmAck;assert.equal((await get(b.page,'chat/'+privateChannel)).filter((m:any)=>m.body==='Concept hoort bij dezelfde persoon').length,1);assert.equal((await get(a.page,'bootstrap')).channels.find((channel:any)=>channel.id===privateChannel).userId,b.id);assert.equal((await get(c.page,'bootstrap')).channels.some((channel:any)=>channel.id===privateChannel),false);
 const historical=a.page.locator('.chat-message').filter({has:a.page.getByText(privateMarker,{exact:true})});await historical.locator('.chat-name-menu').click();await a.page.getByRole('menuitem',{name:'Speler melden',exact:true}).click();const reportRequest=a.page.waitForRequest(r=>r.url().endsWith('/report'));await a.page.getByRole('button',{name:'Melding opslaan',exact:true}).click();assert.equal((await reportRequest).postDataJSON().targetId,b.id,'Reporting historical messages uses sender UUID, even after name reuse');await a.page.getByRole('dialog').waitFor({state:'hidden'});
 // Restore an older hidden peer sequence after a later visible own message advanced history.
 await a.page.locator('.chat-contact-menu').click();await a.page.getByRole('menuitem',{name:'Mute voor mij',exact:true}).click();await a.page.getByText(privateMarker,{exact:true}).waitFor({state:'hidden'});const hiddenPeer='Herstel na mute '+runId,visibleOwn='Eigen regel voorbij verborgen peer '+runId;await pause(2100);await post(b.page,'chat/send',{channelId:privateChannel,clientMessageId:randomUUID(),body:hiddenPeer});await post(a.page,'chat/send',{channelId:privateChannel,clientMessageId:randomUUID(),body:visibleOwn});await a.page.getByText(visibleOwn,{exact:true}).waitFor();assert.equal(await a.page.getByText(hiddenPeer,{exact:true}).count(),0);await a.page.locator('.chat-contact-menu').click();await a.page.getByRole('menuitem',{name:'Mute opheffen',exact:true}).click();await a.page.getByText(hiddenPeer,{exact:true}).waitFor();report.checks.unmuteRestoresOlderHiddenSequence=true;
 await a.page.getByRole('tab',{name:/Kamerchat/}).click();await b.page.reload();await b.page.getByLabel('Chatbericht',{exact:true}).waitFor();await c.context.close();report.checks.privateRenameReuseStableIdentity=true;
 for(const actor of [a,b])await actor.page.evaluate(()=>{(window as any).__chatSeen={};new MutationObserver(()=>{for(const e of document.querySelectorAll('.chat-message p')){const text=e.textContent??'';if(text.startsWith('Latency ')&&!(window as any).__chatSeen[text])(window as any).__chatSeen[text]=performance.timeOrigin+performance.now();}}).observe(document.querySelector('.chat-messages')!,{subtree:true,childList:true,characterData:true});});
 const client=new Client('ws://127.0.0.1:42567'),personal=await client.joinOrCreate('personal',{userId:b.id,token:b.token});cleanupPersonal=personal;const pushes=new Map<string,number>(),pushRows=new Map<string,any>();personal.onMessage('chat.changed',(event:any)=>{if(event.messageId){pushes.set(event.messageId,epochNow());pushRows.set(event.messageId,event.message);}});
 // Login contexts do not start tracing; screenshots run outside this section.
 await a.page.bringToFront();await a.page.getByLabel('Chatbericht',{exact:true}).focus();
 const senderState=await pageState(a.page),receiverState=await pageState(b.page);
 report.measurement={sender:senderState,receiver:receiverState,receiverUnfocused:!receiverState.focused,tracing:false,screenshotsDuringMeasurement:false,warmupSamplesExcluded:0};
 assert.equal(senderState.focused,true,'Measured sender has document focus');assert.equal(senderState.visibility,'visible','Measured sender is visible');
 for(let i=0;i<15;i++){
  if(i%3===0)await pause(2200);const body='Latency '+i+' '+randomUUID().slice(0,4);await a.page.getByLabel('Chatbericht',{exact:true}).fill(body);
  const sample:any={index:i,senderBefore:await pageState(a.page),receiverBefore:await pageState(b.page),httpStatus:null,httpCode:null,responseHeadersMs:null,httpReceiptMs:null,localMs:null,pushMs:null,recipientMs:null,canonicalPush:null};report.chat.push(sample);
  assert.equal(sample.senderBefore.focused,true,'Every measured sender attempt remains focused');assert.equal(sample.senderBefore.visibility,'visible','Every measured sender attempt remains visible');
  let headersAt:number|undefined;const ack=a.page.waitForResponse(r=>r.url().endsWith('/chat/send')).then(response=>{headersAt=epochNow();sample.httpStatus=response.status();return response;});
  const started=await a.page.evaluate(()=>{if(!document.hasFocus()||document.visibilityState!=='visible')throw new Error('Measured sender lost foreground focus');const at=performance.timeOrigin+performance.now();document.querySelector('.chat-compose input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return at;});
  const response=await ack,saved=await response.json();sample.responseHeadersMs=headersAt!-started;sample.httpReceiptMs=epochNow()-started;sample.httpCode=typeof saved.code==='string'&&/^[A-Z0-9_-]+$/i.test(saved.code)?saved.code:null;
  sample.clientMessageId=saved.client_message_id;
  // This is receipt of a committed response, not a measurement of DB commit time.
  sample.commitResponseMs=sample.httpReceiptMs;
  const local=await a.page.evaluate(body=>(window as any).__chatSeen[body]??null,body);sample.localMs=local===null?null:local-started;
  assert.equal(response.status(),200,'Measured send commits successfully');
  await b.page.waitForFunction(body=>(window as any).__chatSeen[body],body);
  const pushed=pushRows.get(saved.id),pushAt=pushes.get(saved.id);
  sample.recipientMs=(await b.page.evaluate(body=>(window as any).__chatSeen[body],body))-started;sample.pushMs=pushAt===undefined?null:pushAt-started;
  sample.canonicalPush={observed:pushAt!==undefined,bodyMatches:pushed?.body===body,clientMessageIdMatches:pushed?.client_message_id===saved.client_message_id,senderMatches:pushed?.sender_id===a.id,channelMatches:pushed?.channel_id===roomChannel};
  sample.senderAfter=await pageState(a.page);sample.receiverAfter=await pageState(b.page);
 }
 // Persist every raw sample before any canonical-row or percentile assertion.
 await writeLatencyProof();assert.equal(report.chat.length,15);assert.equal(report.latency.completedSamples,15);
 for(const sample of report.chat){assert.ok(Number.isFinite(sample.localMs),'Every local optimistic row is observed');assert.ok(Object.values(sample.canonicalPush).every(Boolean),'Eligible authenticated recipients receive the actual canonical stored row');}
 report.checks.authorizedRealtimeStoredRow=true;await personal.leave();cleanupPersonal=undefined;
 if(!report.latency.localTargetMet)console.warn('Workspace/chat local p95 '+report.latency.localP95Ms+' ms exceeds the informational 50 ms target; reported only at the user\'s request.');if(!report.latency.recipientTargetMet)console.warn('Workspace/chat recipient p95 '+report.latency.recipientP95Ms+' ms exceeds the informational 250 ms target; reported only at the user\'s request.');
 // The same fixed surface survives practice and gameplay without a duplicate chat.
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){await a.page.setViewportSize({width,height});await a.page.goto(origin+'/oefenen');await a.page.getByRole('button',{name:'Stop de richting',exact:true}).waitFor();await desktopGeometry(a.page,'practice');}
 // Keep the real dialog open while only its recipient becomes reserved in
 // another authenticated player's match. This runs after the 15 latency samples.
 const viewer=await login(browser,'LayoutView');await post(viewer.page,'room',{roomId:room.id});await viewer.page.addInitScript(()=>{const nativeSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);if(text.includes('command')||text.includes('clock.ping'))(window as any).__qaGameSocket=this;return nativeSend.call(this,data);};});
 await a.page.bringToFront();await a.page.locator('.dp-desktop-players').getByRole('button',{name:'Acties voor '+newName,exact:true}).first().click();await a.page.getByRole('menuitem',{name:'Uitnodigen voor een wedstrijd',exact:true}).click();
 const staleDialog=a.page.getByRole('dialog',{name:'Klaar voor een partij?',exact:true}),inviteButton=staleDialog.getByRole('button',{name:'Uitnodigen & spelen',exact:true});await expect(inviteButton).toBeEnabled();
 let dialogInviteRequests=0;const observeDialogInvite=(request:any)=>{if(request.url().endsWith('/api/platform/invite'))dialogInviteRequests++;};a.page.on('request',observeDialogInvite);
 const occupiedInvite=await post(viewer.page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false}),occupiedMatch=(await post(b.page,'invite/respond',{inviteId:occupiedInvite.id,action:'accept'})).matchId;
 cleanupMatch=occupiedMatch;cleanupPage=b.page;cleanupPages=[b.page,viewer.page];
 await expect(staleDialog.getByRole('status')).toHaveText('Deze speler zit al in een wedstrijd');await expect(inviteButton).toBeDisabled();
 const busyState=await get(a.page,'bootstrap');assert.equal(busyState.players.find((p:any)=>p.id===a.id).playing,false);assert.equal(busyState.players.find((p:any)=>p.id===b.id).playing,true);
 await inviteButton.evaluate((button:HTMLButtonElement)=>button.click());await pause(150);assert.equal(dialogInviteRequests,0,'Disabled stale dialog creates no invite request');
 const denied=await a.page.request.post(origin+'/api/platform/invite',{data:{targetId:b.id,roomId:room.id,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false}});assert.equal(denied.status(),409);assert.equal((await denied.json()).code,'target_already_playing');
 const afterDenied=await get(b.page,'bootstrap');assert.deepEqual(afterDenied.matches.filter((m:any)=>m.players.some((p:any)=>p.id===b.id)).map((m:any)=>m.id),[occupiedMatch]);assert.equal(afterDenied.invites.some((i:any)=>i.state==='pending'&&i.inviter_id===a.id),false);assert.equal(afterDenied.notifications.some((n:any)=>n.kind==='game-invite'&&n.payload?.name===a.name),false);
 await forfeitGame(b.page,occupiedMatch,cleanupPages);cleanupMatch=undefined;cleanupPage=a.page;cleanupPages=[a.page,b.page];await expect(staleDialog.getByRole('status')).toHaveCount(0);await expect(inviteButton).toBeEnabled();await staleDialog.getByRole('button',{name:'Close',exact:true}).click();await expect(staleDialog).toHaveCount(0);a.page.off('request',observeDialogInvite);report.checks.openInviteRecipientBecomesBusy=true;
 const invited=await post(a.page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});const match=(await post(b.page,'invite/respond',{inviteId:invited.id,action:'accept'})).matchId;cleanupMatch=match;
 await a.page.goto(origin+'/spelen?match='+match);await b.page.goto(origin+'/spelen?match='+match);await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await a.page.getByRole('tab',{name:/Spelchat/}).waitFor();const order=await a.page.locator('[data-chat-tab]').evaluateAll(elements=>elements.map(e=>(e as HTMLElement).dataset.chatTab));assert.deepEqual(order.slice(0,2),['match','room']);await a.page.getByRole('tab',{name:/Kamerchat/}).click();await a.page.waitForTimeout(350);assert.equal(await a.page.getByRole('tab',{name:/Kamerchat/}).getAttribute('data-state'),'active');report.checks.tabOrderAndSelection=true;
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){await a.page.setViewportSize({width,height});await desktopGeometry(a.page,'game');}
 const own=await get(a.page,'bootstrap');assert.equal(own.players.find((p:any)=>p.id===a.id).playing,true);report.checks.authoritativeBusy=true;
 // Chat updates and a refused flood cannot remount the running game surface.
 report.floodTiming=[];
 report.floodFocusEvidence={documentFocusEmulatedByPlaywright:true,physicalOsFocusVerified:false};
 await a.page.evaluate(()=>{
  const w=window as any;w.__boardBefore=document.querySelector('.dp-board-stage');w.__floodMeters={horizontal:document.querySelector('.dp-meter-row .dp-meter-indicator'),vertical:document.querySelector('.dp-meter-track-vertical .dp-meter-indicator')};
  // Observe only bounded numeric scheduling metadata. Attribution, scripts,
  // URLs, request payloads and credentials are never read or retained.
  const capacity=64,diagnostics={startedAt:performance.now(),capacityPerType:capacity,supported:{longtask:false,'long-animation-frame':false,event:false},dropped:{longtask:0,'long-animation-frame':0,event:0,state:0,timerHeartbeat:0,rafHeartbeat:0},longTasks:[] as any[],longAnimationFrames:[] as any[],events:[] as any[],stateEvents:[] as any[],timerHeartbeatIntervalMs:10,timerHeartbeats:[] as number[],rafHeartbeats:[] as {at:number;timestamp:number}[]};w.__floodDiagnostics=diagnostics;
  const observers=new Map<string,PerformanceObserver>();
  const append=(type:'longtask'|'long-animation-frame'|'event',entries:PerformanceEntry[])=>{
   const target=type==='longtask'?diagnostics.longTasks:type==='event'?diagnostics.events:diagnostics.longAnimationFrames;
   for(const entry of entries){const metadata:Record<string,number|string>={startTime:entry.startTime,duration:entry.duration};
    if(type==='long-animation-frame')for(const key of ['renderStart','styleAndLayoutStart','blockingDuration','firstUIEventTimestamp']){const value=(entry as any)[key];if(typeof value==='number'&&Number.isFinite(value))metadata[key]=value;}
    if(type==='event'){metadata.name=entry.name;for(const key of ['processingStart','processingEnd','interactionId']){const value=(entry as any)[key];if(typeof value==='number'&&Number.isFinite(value))metadata[key]=value;}}
    target.push(metadata);if(target.length>capacity){target.shift();diagnostics.dropped[type]++;}
   }
  };
  if(typeof PerformanceObserver!=='undefined')for(const type of ['longtask','long-animation-frame','event'] as const){
   if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
   try{const observer=new PerformanceObserver(list=>append(type,list.getEntries())),options:PerformanceObserverInit&{durationThreshold?:number}=type==='event'?{type,durationThreshold:16,buffered:false}:{type};observer.observe(options);observers.set(type,observer);diagnostics.supported[type]=true;}catch{/* Unsupported metadata is explicitly reported as unavailable. */}
  }
  w.__floodDrainPerformance=()=>{for(const [type,observer] of observers)append(type as 'longtask'|'long-animation-frame'|'event',observer.takeRecords());};
  const stateEvent=(event:Event)=>{diagnostics.stateEvents.push({at:performance.now(),event:event.type,focused:document.hasFocus(),visibility:document.visibilityState});if(diagnostics.stateEvents.length>capacity){diagnostics.stateEvents.shift();diagnostics.dropped.state++;}};
  window.addEventListener('focus',stateEvent);window.addEventListener('blur',stateEvent);document.addEventListener('visibilitychange',stateEvent);
  // Distinguish an event-loop stall from a delayed rendering opportunity.
  // Both rings contain only numeric timestamps, with a fixed storage bound.
  const timerHeartbeat=setInterval(()=>{diagnostics.timerHeartbeats.push(performance.now());if(diagnostics.timerHeartbeats.length>capacity){diagnostics.timerHeartbeats.shift();diagnostics.dropped.timerHeartbeat++;}},diagnostics.timerHeartbeatIntervalMs);
  let heartbeatFrame:number;
  const heartbeat=(timestamp:number)=>{diagnostics.rafHeartbeats.push({at:performance.now(),timestamp});if(diagnostics.rafHeartbeats.length>capacity){diagnostics.rafHeartbeats.shift();diagnostics.dropped.rafHeartbeat++;}heartbeatFrame=requestAnimationFrame(heartbeat);};
  heartbeatFrame=requestAnimationFrame(heartbeat);
  w.__floodStopPerformance=()=>{clearInterval(timerHeartbeat);cancelAnimationFrame(heartbeatFrame);w.__floodDrainPerformance();for(const observer of observers.values())observer.disconnect();window.removeEventListener('focus',stateEvent);window.removeEventListener('blur',stateEvent);document.removeEventListener('visibilitychange',stateEvent);};
  const capture=(event:Event)=>{
   const button=(event.target as Element).closest?.('.dp-throw-button');if(!button)return;if(event instanceof KeyboardEvent&&(!['Enter',' '].includes(event.key)||event.repeat||event.isComposing))return;
   if(event instanceof PointerEvent&&(!event.isPrimary||event.button!==0))return;
   const captureStartedAt=performance.now(),at=event.timeStamp,prepared=w.__floodPrepared;if(!prepared)return;w.__floodPrepared=undefined;const state={focused:document.hasFocus(),visibility:document.visibilityState};
   // Start real fetch in this input's capture phase, before the actual React
   // stop handler. No route hold, delayed response or cross-process clock.
   const request={clientMessageId:prepared.clientMessageId,floodStartedAt:performance.timeOrigin+performance.now(),httpStatus:null,httpCode:null} as any;w.__floodRequest=request;
   w.__floodRequestPromise=fetch('/api/platform/chat/send',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:prepared.body}).then(async response=>{const data=await response.json();Object.assign(request,{floodCompletedAt:performance.timeOrigin+performance.now(),httpStatus:response.status,httpCode:data.code});},error=>{Object.assign(request,{floodCompletedAt:performance.timeOrigin+performance.now(),floodError:error instanceof Error?error.name:'request-error'});});
   const horizontal=button.getAttribute('aria-label')!.includes('horizontale'),element=w.__floodMeters[horizontal?'horizontal':'vertical'],indicator=element.getBoundingClientRect(),track=element.parentElement.getBoundingClientRect();w.__floodInput={at,eventTimeStamp:event.timeStamp,captureStartedAt,isTrusted:event.isTrusted,type:event.type,epoch:performance.timeOrigin+at,state,geometry:{indicator:horizontal?indicator.left+indicator.width/2:indicator.top+indicator.height/2,trackSize:horizontal?track.width:track.height}};
   requestAnimationFrame(rafTimestamp=>{const rafEntryAt=performance.now(),state={focused:document.hasFocus(),visibility:document.visibilityState},geometryStartedAt=performance.now(),r=element.getBoundingClientRect(),geometryCompletedAt=performance.now();w.__floodFirst={at:geometryCompletedAt,rafEntryAt,rafTimestamp,geometryStartedAt,geometryCompletedAt,state,indicator:horizontal?r.left+r.width/2:r.top+r.height/2};});
  };w.__floodCapture=capture;window.addEventListener('pointerdown',capture,true);window.addEventListener('keydown',capture,true);
 });
 const floodReceipts=[],profile=await startThrowPerformanceProfile(browser,dir+'/throw-performance-profile');
 let floodFailed=false;
 try{
  for(const axis of ['horizontal','vertical'] as const){let receipt:any;
   // One explicitly rejected, unchanged stop may be followed by one new
   // controlled action. Every attempt remains in the report; no luck reruns.
   for(let action=0;action<2;action++){
    receipt=await stopDuringFlood(a.page,roomChannel,axis,match,a.id);if(receipt)break;
   }
   assert.ok(receipt,'Each flood axis requires an actual accepted exact-sample stop');floodReceipts.push(receipt);
  }
  assert.equal(floodReceipts[1].hit.x,floodReceipts[0].lockedX);assert.equal(floodReceipts[1].hit.y,floodReceipts[1].lockedY);
 }catch(error){floodFailed=true;throw error;}finally{try{await a.page.evaluate(()=>{const w=window as any;window.removeEventListener('pointerdown',w.__floodCapture,true);window.removeEventListener('keydown',w.__floodCapture,true);w.__floodStopPerformance?.();});}catch(error){if(!floodFailed)throw error;report.floodObserverCleanupFailed=true;}finally{try{await profile.stop();}catch(error){if(!floodFailed)throw error;report.performanceProfileCleanupFailed=true;}}}
 await a.page.getByText('Game chat '+runId+' 2',{exact:true}).waitFor();assert.equal(await a.page.evaluate(()=>(window as any).__boardBefore===document.querySelector('.dp-board-stage')),true);report.checks.chatFloodNoBoardRemount=true;report.checks.chatFloodExactStopAndInput=true;
 // A practice menu hands off the selected user's UUID to the actual spectator view.
 try{await viewer.page.goto(origin+'/oefenen');await viewer.page.getByRole('button',{name:'Stop de richting',exact:true}).waitFor();const watched=viewer.page.waitForResponse(response=>response.url().endsWith('/match/'+match)&&response.ok());await viewer.page.getByRole('button',{name:'Kijk mee bij '+newName,exact:true}).click();await viewer.page.waitForURL(origin+'/spelen');await viewer.page.getByRole('heading',{name:'Langs de oche',exact:true}).waitFor();await viewer.page.locator('.spectator-live-game .dp-match-score-table').getByText(newName,{exact:true}).waitFor();const watchedState=await(await watched).json();assert.equal(watchedState.matchId,match);assert.equal(watchedState.seat,null);report.checks.practiceSpectatorStableTarget=true;}finally{await viewer.context.close();}
 await forfeitGame(a.page,match,cleanupPages);cleanupMatch=undefined;report.checks.matchReservationReleased=true;
 console.log('Workspace/chat acceptance '+JSON.stringify(report.latency));
}catch(error){report.failure={message:error instanceof Error?error.message:String(error),pointerEvents:cleanupPage?await cleanupPage.evaluate(()=>({body:document.body.style.pointerEvents,dialogs:document.querySelectorAll('[role=dialog]').length,menus:document.querySelectorAll('[role=menu]').length})).catch(()=>null):null};if(cleanupPage)await cleanupPage.screenshot({path:dir+'/failure.png'}).catch(()=>{});throw error;}finally{try{try{if(cleanupPersonal)await cleanupPersonal.leave();}finally{if(cleanupMatch&&cleanupPage)await forfeitGame(cleanupPage,cleanupMatch,cleanupPages);}}finally{await writeLatencyProof();await writeFile(dir+'/results.json',JSON.stringify(report,null,2));try{await browser.close();}finally{await ingressPool?.end();}}}
