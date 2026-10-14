import assert from 'node:assert/strict';import {chromium,expect,type Page} from '@playwright/test';import {writeFile} from 'node:fs/promises';import {login,origin,get,post} from './helpers';
import {forfeitGame} from './game-command';
import {Room} from '@colyseus/sdk';
import type {Pool} from 'pg';
import {meterPosition} from '../../packages/game-core/src/timing';
import {startThrowPerformanceProfile,type ThrowPerformanceProfile} from './throw-performance-profile';
import {startThrowPresentationProfile} from './throw-presentation-profile';
const browser=await chromium.launch({headless:true}),pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const browserEnvironment={engine:'chromium-headless-shell',channel:'default',headless:true,version:browser.version(),executablePathReportedByPlaywright:chromium.executablePath(),executablePathIsLaunchedBinary:false,physicalHardwareTested:false};
let delay=0,jitter=0,dropReceipt=false;let debugPage:any,cleanupMatch:string|undefined,testFailed=false;const cleanupParticipants:Page[]=[];const result:any={physicalDevices:false,browserEnvironment,transport:'real Colyseus; deterministic outgoing stop and incoming receipt/snapshot delay, old receipt replay and one socket loss',samples:[]};
let ingressPool:Pool|undefined;
let chromeProfile:ThrowPerformanceProfile|undefined;
function retainProfileCleanupFailure(scope:string,error:unknown){
 const category=error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'profile_cleanup_failed';
 (result.profileCleanupFailures??=[]).push({scope,category});
}
const wireCommands=new Map<string,any>(),wireOutcomes=new Map<string,any>();
function trackGameWire(page:Page,actorId:string){
 page.on('websocket',socket=>{
  const sent=new Room('qa-wire-command'),received=new Room('qa-wire-outcome');
  sent.onMessage('*',(type,payload:any)=>{if(type==='command'&&payload?.type?.startsWith('dart.stop_'))wireCommands.set(payload.commandId,{actorId,payload});});
  received.onMessage('*',(type,payload:any)=>{if(['receipt','error'].includes(String(type))&&payload?.commandId)wireOutcomes.set(payload.commandId,{type,at:performance.now(),payload});});
  const decode=(room:Room,frame:{payload:string|Buffer})=>{if(typeof frame.payload==='string'||(frame.payload[0]&31)!==13)return;(room as any).onMessageCallback({data:frame.payload});};
  socket.on('framesent',frame=>decode(sent,frame));socket.on('framereceived',frame=>decode(received,frame));
 });
}
async function ingressDiagnostic(local:any){
 const command=wireCommands.get(local.commandId),outcome=wireOutcomes.get(local.commandId);
 const diagnostic:any={commandId:local.commandId,phase:local.phase,phaseToken:local.phaseToken,phaseStartedAt:local.phaseStartedAt,sampleAt:local.rendered.sampleAt,localSampleAgeMs:local.at-local.rendered.renderedAt,wireOutcome:outcome?.type,code:outcome?.payload.code};
 if(command&&process.env.APP_ENV==='development'&&new URL(origin).hostname==='127.0.0.1'&&new URL(process.env.DATABASE_URL!).hostname==='127.0.0.1'){
  if(!ingressPool){const {db}=await import('../../packages/data/src/db');ingressPool=db();}
  const row=(await ingressPool.query("select received_at,latency_ms,admission_window_ms,timing_version,connection_id from private.command_ingress where scope='match' and actor_id=$1 and command_id=$2",[command.actorId,local.commandId])).rows[0];
  if(row){Object.assign(diagnostic,{receivedAt:new Date(row.received_at).getTime(),windowMs:Number(row.admission_window_ms),latencyMs:Number(row.latency_ms),timingVersion:row.timing_version,connectionMatches:row.connection_id===command.payload.renderSample.connectionId});diagnostic.sampleAgeAtIngressMs=diagnostic.receivedAt-diagnostic.sampleAt;diagnostic.violations=[diagnostic.sampleAt>diagnostic.receivedAt?'future':null,diagnostic.sampleAgeAtIngressMs>diagnostic.windowMs?'old':null,diagnostic.sampleAt<diagnostic.phaseStartedAt?'before-phase':null].filter(Boolean);}
 }else if(outcome?.type==='receipt'){const timing=outcome.payload.timing;Object.assign(diagnostic,{receivedAt:timing.receivedAt,windowMs:timing.admissionWindowMs,latencyMs:timing.latencyMs,sampleAgeAtIngressMs:timing.receivedAt-diagnostic.sampleAt});}
 return diagnostic;
}
type Axis='horizontal'|'vertical';
const selector=(axis:Axis)=>axis==='horizontal'?'.dp-meter-row .dp-meter-indicator':'.dp-meter-track-vertical .dp-meter-indicator';
async function readyGameStop(page:Page,axis:Axis){
 await page.bringToFront();assert.equal(await page.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),true,'Every live-game stop requires foreground focus');
 const button=page.getByRole('button',{name:axis==='horizontal'?'Stop horizontale indicator':'Stop verticale indicator en gooi',exact:true});await expect(button).toBeEnabled({timeout:15000});
 const property=axis==='horizontal'?'left':'top',before=await page.locator(selector(axis)).evaluate((element,property)=>(element as HTMLElement).style.getPropertyValue(property),property);
 // Enabled controls can precede the first draw of a new authoritative phase.
 await page.waitForFunction(({selector,property,before})=>(document.querySelector(selector) as HTMLElement)?.style.getPropertyValue(property)!==before,{selector:selector(axis),property,before},{polling:'raf'});return button;
}
async function installInputCapture(page:Page){
 await page.evaluate(()=>{
  const capture=(event:Event)=>{
   const button=(event.target as Element).closest?.('.dp-throw-button');if(!button)return;
   if(event instanceof KeyboardEvent&&(!['Enter',' '].includes(event.key)||event.repeat||event.isComposing))return;
   if(event instanceof PointerEvent&&(!event.isPrimary||event.button!==0))return;
   const captureStartedAt=performance.now(),w=window as any;w.__dpInput=event.timeStamp;w.__dpNativeInput={eventTimeStamp:event.timeStamp,captureStartedAt,isTrusted:event.isTrusted,type:event.type};
   const horizontal=button.getAttribute('aria-label')!.includes('horizontale'),meter=document.querySelector(horizontal?'.dp-meter-row .dp-meter-indicator':'.dp-meter-track-vertical .dp-meter-indicator')!;
   const rect=meter.getBoundingClientRect();w.__dpBefore=horizontal?rect.left+rect.width/2:rect.top+rect.height/2;w.__dpFrame=undefined;w.__dpFirstFrozen=undefined;
   requestAnimationFrame(()=>{const first=meter.getBoundingClientRect();w.__dpFirstFrozen=horizontal?first.left+first.width/2:first.top+first.height/2;w.__dpFrame=performance.now()-w.__dpInput;});
  };window.addEventListener('pointerdown',capture,true);window.addEventListener('keydown',capture,true);
 });
}
async function captureStop(page:Page,axis:Axis,options:any,afterInput?:()=>Promise<unknown>){
 const button=await readyGameStop(page,axis),baseline=await get(page,'match/'+cleanupMatch);assert.equal(baseline.lifecycle,'playing');assert.equal(baseline.state.phase,axis);assert.equal(baseline.seat,baseline.state.turn);
 const cohort=options.cohort==='delayed-receipt'?0:options.cohort==='lost-receipt'?1:2;
 const presentation=await startThrowPresentationProfile(page,`artifacts/game-timing-profile/presentation-${result.samples.length}-${axis==='horizontal'?0:1}-${cohort}`);
 let captureFailed=false;
 try{
 await page.evaluate(()=>performance.clearMarks('dp-local-stop'));if(options.input==='keyboard'){await button.focus();await button.press('Enter');}else if(page.viewportSize()!.width<1024)await button.tap();else await button.click();
 const concurrent=afterInput?.();await pause(20);const first=await page.locator(selector(axis)).evaluate(element=>{const rect=element.getBoundingClientRect();return {style:(element as HTMLElement).style.cssText,indicator:rect.left+rect.width/2,vertical:rect.top+rect.height/2};});
 await pause(25);const during=await page.locator(selector(axis)).evaluate(element=>{const rect=element.getBoundingClientRect();return {style:(element as HTMLElement).style.cssText,indicator:rect.left+rect.width/2,vertical:rect.top+rect.height/2};});
 await page.waitForFunction(()=>Number.isFinite((window as any).__dpFrame),{},{timeout:1500});
 const observed=await page.evaluate(()=>{const w=window as any,mark=performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark;return {input:w.__dpNativeInput,handlerMs:mark?.detail?.handlerCompletedAt-w.__dpInput,stopMs:mark?.detail?.stopAppliedAt-w.__dpInput,frameMs:w.__dpFrame,before:w.__dpBefore,first:w.__dpFirstFrozen,local:mark?.detail};});
 const sample:any={...options,axis,viewport:page.viewportSize(),input:observed.input,preInputIndicator:observed.before,handlerMs:observed.handlerMs,stopMs:observed.stopMs,frameMs:observed.frameMs,trace:observed.local,freezeJumpPx:Math.abs(observed.first-observed.before),freezeJumpFraction:Math.abs(observed.first-observed.before)/(observed.local?.geometry.trackSize??NaN),pendingFirst:axis==='horizontal'?first.indicator:first.vertical,pendingDuring:axis==='horizontal'?during.indicator:during.vertical,pendingStable:first.style===during.style,baselineVersion:baseline.stateVersion};
 // Every input stays in the result and percentile, including explicit errors.
 result.samples.push(sample);assert.ok(observed.local,'A genuine input captured its actual rendered sample');assert.equal(observed.local.phase,axis);
 assert.equal(observed.input?.isTrusted,true,'Game stops use genuine native browser input');assert.ok(Number.isFinite(observed.input.eventTimeStamp)&&observed.input.eventTimeStamp>=0&&observed.input.eventTimeStamp<=observed.input.captureStartedAt,'Native event time precedes capture on the same monotone clock');
 assert.ok(observed.local.stopAppliedAt<=observed.local.sendAt&&observed.local.sendAt<=observed.local.sendReturnedAt&&observed.local.sendReturnedAt<=observed.local.handlerCompletedAt,'Freeze precedes dispatch and handler completion');
 assert.ok(sample.handlerMs>=0&&sample.handlerMs<=50,'Every live-game handler freeze <=50ms');assert.ok(Number.isFinite(sample.frameMs)&&sample.frameMs>=0&&sample.frameMs<=50,'Every native attempt first frozen geometry <=50ms, including rejected claims');
 await concurrent;return {sample,baseline};
 }catch(error){captureFailed=true;throw error;}finally{try{await presentation.stop();}catch(error){retainProfileCleanupFailure('presentation',error);if(!captureFailed)throw error;}}
}
async function classifyStop(local:any,baseline:any,actorId:string,outcome:any){
 const observed=wireCommands.get(local.commandId);assert.ok(observed,'Actual stop bytes contain the measured command UUID');assert.equal(observed.actorId,actorId);
 const request=observed.payload,claim=request.renderSample;assert.equal(request.matchId,baseline.matchId);assert.equal(request.expectedStateVersion,baseline.stateVersion);assert.equal(request.phaseToken,baseline.state.phaseToken);assert.equal(local.phaseToken,baseline.state.phaseToken);assert.equal(local.phaseStartedAt,baseline.state.phaseStartedAt);assert.equal(request.type,'dart.stop_'+local.phase);assert.equal(local.timingVersion,'render-sample-v3');assert.equal(claim.sampleAt,local.rendered.sampleAt);assert.equal(claim.dartNumber,baseline.state.dartCount[0]+baseline.state.dartCount[1]+1);
 let metadata:any;
 if(process.env.APP_ENV==='development'&&new URL(origin).hostname==='127.0.0.1'){
  // The actual pool uses DATABASE_URL. Refuse all non-disposable DB hosts.
  assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
  if(!ingressPool){const {db}=await import('../../packages/data/src/db');ingressPool=db();}
  const row=(await ingressPool.query("select received_at,latency_ms,admission_window_ms,timing_version,connection_id from private.command_ingress where scope='match' and actor_id=$1 and command_id=$2",[actorId,local.commandId])).rows[0];assert.ok(row,'Each attempted stop has its immutable original ingress');
  metadata={receivedAt:new Date(row.received_at).getTime(),latencyMs:Number(row.latency_ms),windowMs:Number(row.admission_window_ms),timingVersion:row.timing_version,connectionId:row.connection_id,source:'immutable-disposable-local-ingress'};
 }else{
  assert.equal(outcome.type,'receipt','A staging rejection needs trusted original ingress metadata; browser response arrival cannot establish its boundaries');
  const timing=outcome.payload.timing;metadata={receivedAt:timing.receivedAt,latencyMs:timing.latencyMs,windowMs:timing.admissionWindowMs,timingVersion:timing.timingVersion,connectionId:timing.connectionId,source:'authoritative-receipt'};
 }
 assert.equal(metadata.connectionId,claim.connectionId);assert.equal(metadata.timingVersion,'render-sample-v3');assert.ok(Number.isInteger(metadata.receivedAt));assert.ok(Number.isFinite(claim.sampleAt));assert.ok(metadata.latencyMs>=0&&metadata.latencyMs<=90);assert.equal(metadata.windowMs,Math.min(90,Math.max(20,metadata.latencyMs*3))+34,'The original measured network allowance and render age stay separate');
 const violations=[claim.sampleAt>metadata.receivedAt?'future':null,claim.sampleAt<metadata.receivedAt-metadata.windowMs?'old':null,claim.sampleAt<baseline.state.phaseStartedAt?'before-phase':null,claim.sampleAt<(baseline.state.lastAcceptedAt??0)?'before-last-accepted':null].filter(Boolean);
 return {...metadata,sampleAt:claim.sampleAt,sampleAgeAtIngressMs:metadata.receivedAt-claim.sampleAt,phaseStartedAt:baseline.state.phaseStartedAt,lastAcceptedAt:baseline.state.lastAcceptedAt??0,admissible:violations.length===0,violations};
}
async function finishStop(page:Page,actorId:string,captured:any){
 const {sample,baseline}=captured,local=sample.trace;await page.waitForFunction(commandId=>((window as any).__dpTimingTraces??[]).some((event:any)=>['receipt','rejected'].includes(event.event)&&event.commandId===commandId),local.commandId);
 const ui=await page.evaluate(commandId=>((window as any).__dpTimingTraces??[]).find((event:any)=>['receipt','rejected'].includes(event.event)&&event.commandId===commandId),local.commandId),outcome=wireOutcomes.get(local.commandId);assert.ok(outcome,'An actual WS outcome was observed');assert.ok(Number.isFinite(ui.monotonicAt)&&ui.monotonicAt>=local.sendReturnedAt,'Actual outcome callback has its browser-local timestamp');sample.actualOutcome={type:outcome.type,code:outcome.payload.code};sample.ingress=await classifyStop(local,baseline,actorId,outcome);
 if(!sample.ingress.admissible){
  assert.equal(outcome.type,'error');assert.equal(outcome.payload.code,'invalid_render_sample');assert.equal(ui.event,'rejected');assert.equal(ui.code,'invalid_render_sample');await expect(page.locator('.dp-connection-note').filter({hasText:'timingmeting'})).toBeVisible();
  const unchanged=await get(page,'match/'+baseline.matchId);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.equal(unchanged.lifecycle,baseline.lifecycle);assert.deepEqual(unchanged.state,baseline.state,'Invalid sample preserves every authoritative phase, lock, score, result and dart');
  await readyGameStop(page,sample.axis);Object.assign(sample,{outcome:'explicit-invalid-render-sample',authoritativeStateUnchanged:true,visibleError:true,controlledRestore:true});console.log(JSON.stringify({event:'game_sample_rejected',commandId:local.commandId,axis:sample.axis,...sample.ingress,authoritativeStateUnchanged:true,visibleError:true,controlledRestore:true}));return null;
 }
 assert.equal(outcome.type,'receipt','A claim inside every original boundary must be accepted');assert.equal(ui.event,'receipt');const receipt=outcome.payload;assert.equal(receipt.commandId,local.commandId);assert.equal(receipt.matchId,baseline.matchId);assert.equal(receipt.stateVersion,baseline.stateVersion+1);assert.equal(receipt.state.phase,sample.axis==='horizontal'?'vertical':'flight');assert.notEqual(receipt.state.phaseToken,baseline.state.phaseToken);assert.deepEqual(receipt.state.dartCount,baseline.state.dartCount,'A stop cannot score before its authoritative impact');assert.deepEqual(receipt.state.events,baseline.state.events,'A stop cannot add a landed dart before its authoritative impact');assert.equal(receipt.timing.receivedAt,sample.ingress.receivedAt);assert.equal(receipt.timing.admissionWindowMs,sample.ingress.windowMs);assert.equal(receipt.timing.admittedAt,local.rendered.sampleAt,'Accepted WS stop preserves its exact last drawn sample');
 assert.equal(sample.pendingStable,true,'An accepted stop stays fixed while its receipt waits');assert.ok(Math.abs(sample.pendingDuring-sample.pendingFirst)<=1,'Accepted pending game geometry <=1CSSpx');assert.ok(Math.abs(sample.pendingFirst-sample.preInputIndicator)<=1,'Accepted pending frame preserves the pre-stop geometry');assert.ok(sample.freezeJumpPx<=1,'Accepted first frozen game frame <=1CSSpx');assert.ok(sample.frameMs>=0&&sample.frameMs<=50,'Accepted first frozen RAF <=50ms');
 const position=await page.locator(selector(sample.axis)).evaluate((element,axis)=>{const rect=element.getBoundingClientRect();return axis==='horizontal'?rect.left+rect.width/2:rect.top+rect.height/2;},sample.axis),expected=meterPosition(local.rendered.sampleAt,local.phaseStartedAt,sample.axis,receipt.state.meterSpeedVersion),locked=sample.axis==='horizontal'?receipt.state.lockedX:receipt.state.lockedY;
 sample.ackJumpPx=Math.abs(position-sample.preInputIndicator);sample.ackJumpFraction=sample.ackJumpPx/local.geometry.trackSize;sample.correctionNormalized=Math.abs(locked-expected);sample.receipt=ui;sample.outcome='accepted-exact-sample';assert.ok(sample.ackJumpPx<=1,'Accepted authoritative game geometry <=1CSSpx');assert.ok(sample.correctionNormalized*local.geometry.trackSize/2.28<=1,'Accepted authoritative lock <=1CSSpx');assert.equal(locked,expected);
 console.log('Foreground live-game stop: '+JSON.stringify({axis:sample.axis,receiptDelay:sample.receiptDelay,jitter:sample.jitter,handlerMs:sample.handlerMs,frameMs:sample.frameMs,outcome:sample.outcome,ingress:sample.ingress}));return receipt;
}
async function proveGroundedImpact(page:Page,receipt:any,sample:any){
 const hit=receipt.state.pendingDart.hit;assert.equal(hit.x,receipt.state.lockedX);assert.equal(hit.y,receipt.state.lockedY);
 const locked=await page.locator('.dp-meter-track .dp-meter-indicator').evaluateAll(elements=>elements.map(e=>[getComputedStyle(e).left,getComputedStyle(e).top]));await pause(120);assert.deepEqual(await page.locator('.dp-meter-track .dp-meter-indicator').evaluateAll(elements=>elements.map(e=>[getComputedStyle(e).left,getComputedStyle(e).top])),locked,'Game axes remain fixed during sealed flight');
 await page.waitForFunction(()=>!!(window as any).__qaGrounded,{},{timeout:3000});const grounded=await page.evaluate(()=>(window as any).__qaGrounded),matrix=grounded.svgMatrix,tipX=220+hit.x*170,tipY=220+hit.y*170,expected={x:matrix.a*tipX+matrix.c*tipY+matrix.e,y:matrix.b*tipX+matrix.d*tipY+matrix.f};
 sample.impact={...grounded,expected,hit,errorPx:Math.hypot(grounded.actual.x-expected.x,grounded.actual.y-expected.y),serverImpactAt:receipt.state.impactAt,elapsedSinceVerticalInputMs:grounded.at-sample.trace.inputAt,firstGroundedFrame:true};assert.ok(Number.isFinite(grounded.flightReplayAt),'An actual flight snapshot was replayed');assert.ok(grounded.flightReplayAt<grounded.at,'Duplicate actual snapshot arrived during flight');assert.ok(sample.impact.errorPx<=1,'First grounded game tip matches server hit <=1CSSpx: '+JSON.stringify(sample.impact));
 const frames=await page.evaluate(async()=>{const tip=Array.from(document.querySelectorAll<SVGGElement>('.dp-flying-dart')).at(-1)!;const frames=[];for(let i=0;i<3;i++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const matrix=tip.getScreenCTM()!;frames.push({at:performance.now(),transform:tip.getAttribute('transform'),actual:{x:matrix.e,y:matrix.f}});}return frames;});sample.impact.groundedFrames=frames.map(frame=>({...frame,errorPx:Math.hypot(frame.actual.x-expected.x,frame.actual.y-expected.y)}));assert.ok(frames.every(frame=>frame.transform===grounded.transform),'An authoritative landed dart cannot restart its SVG flight: '+JSON.stringify(sample.impact.groundedFrames));assert.ok(sample.impact.groundedFrames.every((frame:any)=>frame.errorPx<=1));sample.impact.stableGroundedTransform=true;
}
async function receiptTrace(page:Page,local:any){await page.waitForFunction(commandId=>((window as any).__dpTimingTraces??[]).some((event:any)=>event.event==='receipt'&&event.commandId===commandId),local.commandId);const receipt=await page.evaluate(commandId=>((window as any).__dpTimingTraces??[]).find((event:any)=>event.event==='receipt'&&event.commandId===commandId),local.commandId);assert.equal(receipt.timing.admittedAt,local.rendered.sampleAt,'Real WebSocket receipt uses the exact last drawn sample');return receipt;}
async function captureFirstGroundedTip(page:Page){
 await page.evaluate(`
 window.__qaGrounded=undefined;window.__qaFlightReplayAt=undefined;window.__qaReplayFlight=true;
 const board=document.querySelector('.dp-dartboard');let sawFlight=!board.querySelector(':scope > g[aria-hidden="true"]');
 const observer=new MutationObserver(function(){
  const chip=board.querySelector(':scope > g[aria-hidden="true"]');if(!chip){sawFlight=true;return;}if(!sawFlight)return;
  observer.disconnect();requestAnimationFrame(function(){
   const tip=Array.from(board.querySelectorAll('.dp-flying-dart')).at(-1),actual=tip.getScreenCTM(),svg=board.getScreenCTM();
   window.__qaGrounded={at:performance.now(),actual:{x:actual.e,y:actual.f},svgMatrix:{a:svg.a,b:svg.b,c:svg.c,d:svg.d,e:svg.e,f:svg.f},transform:tip.getAttribute('transform'),landedLabel:chip.textContent,flightReplayAt:window.__qaFlightReplayAt};
  });
 });observer.observe(board,{subtree:true,childList:true});
 `);
}
try{
 const a=await login(browser,'TimingA',{hasTouch:true}),b=await login(browser,'TimingB',{hasTouch:true});const page=a.page;debugPage=page;for(const actor of [a,b])trackGameWire(actor.page,actor.id);page.on('pageerror',e=>console.log(e.message));page.setDefaultTimeout(20000);const room=(await get(page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');for(const actor of [a,b])await post(actor.page,'room',{roomId:room.id});const chatChannel=(await get(page,'bootstrap')).chatChannels.find((channel:any)=>channel.kind==='community'&&channel.roomId===room.id);
 const invitation=await post(page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});const id=(await post(b.page,'invite/respond',{inviteId:invitation.id,action:'accept'})).matchId;cleanupMatch=id;cleanupParticipants.push(page,b.page);
 for(const actor of [a,b])await actor.page.addInitScript(`
 const descriptor=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage');
 Object.defineProperty(WebSocket.prototype,'onmessage',{configurable:true,get:descriptor.get,set:function(handler){const socket=this;socket.__qaHandler=handler;descriptor.set.call(this,function(event){const text=event.data instanceof ArrayBuffer?new TextDecoder().decode(event.data):'';if(window.__qaDrop&&text.includes('receipt')){window.__qaDrop=false;socket.close(4000,'QA lost acknowledgement');return;}if(text.includes('receipt'))socket.__qaReceipt=event;if(text.includes('receipt')||text.includes('snapshot'))setTimeout(function(){handler.call(socket,event);if(window.__qaReplayFlight&&text.includes('snapshot')&&text.includes('flight')){window.__qaReplayFlight=false;setTimeout(function(){handler.call(socket,event);window.__qaFlightReplayAt=performance.now();},100);}},window.__qaDelay||0);else handler.call(socket,event);});}});
 const nativeSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const socket=this,text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);if(text.includes('command')||text.includes('clock.ping'))window.__qaGameSocket=socket;if(text.includes('dart.stop_')){if(window.__qaReplayReceipt&&socket.__qaReceipt){window.__qaReplayReceipt=false;setTimeout(()=>socket.__qaHandler.call(socket,socket.__qaReceipt),5);}setTimeout(()=>nativeSend.call(socket,data),window.__qaUplink||0);}else nativeSend.call(socket,data);};
 `);
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/spelen?match='+id);await b.page.goto(origin+'/spelen?match='+id);await page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await page.getByRole('button',{name:'Stop horizontale indicator',exact:true}).waitFor();await page.bringToFront();
 for(const actor of [a,b])await installInputCapture(actor.page);
 result.cohorts=[];
 chromeProfile=await startThrowPerformanceProfile(browser,'artifacts/game-timing-profile');
 for(const [i,receiptDelay] of [100,300,1000].entries()){
  delay=receiptDelay;jitter=i*25;await page.setViewportSize(i===0?{width:1366,height:768}:{width:390,height:844});
  await page.evaluate(({down,up,replay})=>{(window as any).__qaDelay=down;(window as any).__qaUplink=up;(window as any).__qaReplayReceipt=replay;},{down:receiptDelay+jitter,up:i*10,replay:i===1});
  await page.evaluate(()=>(window as any).__qaMeterNode=document.querySelector('.dp-meter-row .dp-meter-indicator'));
  let horizontal:any;
  for(let attempt=0;attempt<5&&!horizontal;attempt++){
   const captured=await captureStop(page,'horizontal',{receiptDelay,jitter,uplink:i*10,input:i===1?'keyboard':'pointer',attempt,cohort:'delayed-receipt'},attempt===0?()=>post(b.page,'chat/send',{channelId:chatChannel.id,clientMessageId:crypto.randomUUID(),body:'Timingchat '+i}):undefined);
   horizontal=await finishStop(page,a.id,captured);
   assert.equal(await page.evaluate(()=>(window as any).__qaMeterNode===document.querySelector('.dp-meter-row .dp-meter-indicator')),true,'Concurrent chat must not remount the real indicator');
  }
  const horizontalAttempts=result.samples.filter((sample:any)=>sample.cohort==='delayed-receipt'&&sample.receiptDelay===receiptDelay&&sample.axis==='horizontal');result.cohorts.push({axis:'horizontal',receiptDelay,attempted:horizontalAttempts.length,accepted:horizontalAttempts.filter((sample:any)=>sample.outcome==='accepted-exact-sample').length,rejected:horizontalAttempts.filter((sample:any)=>sample.outcome==='explicit-invalid-render-sample').length});assert.ok(horizontal,'Every horizontal delay cohort includes an actual exact accepted stop');
  await captureFirstGroundedTip(page);let vertical:any,verticalSample:any;
  for(let attempt=0;attempt<5&&!vertical;attempt++){
   const captured=await captureStop(page,'vertical',{receiptDelay,jitter,uplink:i*10,input:i===1?'keyboard':'pointer',attempt,cohort:'delayed-receipt'});vertical=await finishStop(page,a.id,captured);if(vertical)verticalSample=captured.sample;
  }
  const verticalAttempts=result.samples.filter((sample:any)=>sample.cohort==='delayed-receipt'&&sample.receiptDelay===receiptDelay&&sample.axis==='vertical');result.cohorts.push({axis:'vertical',receiptDelay,attempted:verticalAttempts.length,accepted:verticalAttempts.filter((sample:any)=>sample.outcome==='accepted-exact-sample').length,rejected:verticalAttempts.filter((sample:any)=>sample.outcome==='explicit-invalid-render-sample').length});assert.ok(vertical,'Every vertical delay cohort includes an actual exact accepted stop');
  await proveGroundedImpact(page,vertical,verticalSample);
 }
 // Lose an actual accepted stop receipt after its durable write. An explicitly
 // rejected claim is retained and restored before another native user action.
 delay=0;jitter=0;await page.evaluate(()=>(window as any).__qaDelay=0);await b.page.evaluate(()=>{(window as any).__qaDelay=0;(window as any).__qaUplink=0;});
 const before=(await get(page,'match/'+id)).state.events.length;assert.equal((await get(page,'match/'+id)).state.turn,1);let lostReceipt:any;
 for(let attempt=0;attempt<5&&!lostReceipt;attempt++){
  await readyGameStop(b.page,'horizontal');await b.page.evaluate(()=>(window as any).__qaDrop=true);
  const captured=await captureStop(b.page,'horizontal',{receiptDelay:0,jitter:0,uplink:0,input:'pointer',attempt,cohort:'lost-receipt'});
  for(let n=0;n<100&&!wireOutcomes.has(captured.sample.trace.commandId);n++)await pause(20);const actual=wireOutcomes.get(captured.sample.trace.commandId);assert.ok(actual,'The lost-ack scenario observes its actual server outcome');
  if(actual.type==='error'){await finishStop(b.page,b.id,captured);continue;}
  assert.equal(await b.page.evaluate(()=>(window as any).__qaDrop),false,'An actual receipt was consumed by the socket-loss fixture');await pause(1400);
  for(let n=0;n<100;n++){const snapshot=await get(page,'match/'+id);if(snapshot.lifecycle==='paused'){for(const [seat,actor] of [a,b].entries()){const ready=actor.page.getByRole('button',{name:'Begin de wedstrijd',exact:true});if(!snapshot.state.ready[seat]&&await ready.isVisible()&&await ready.isEnabled())await ready.click();}}if((await get(page,'match/'+id)).lifecycle==='playing')break;await pause(100);}
  const recovered=await get(page,'match/'+id);assert.equal(recovered.lifecycle,'playing');assert.equal(recovered.state.events.length,before,'Lost stop ACK cannot create an extra dart');assert.equal(recovered.state.phase,'vertical','The admitted horizontal stop survives reconnect');
  lostReceipt=await finishStop(b.page,b.id,captured);assert.ok(lostReceipt);result.lostReceipt={trace:captured.sample.trace,receipt:captured.sample.receipt,ingress:captured.sample.ingress};
 }
 assert.ok(lostReceipt,'The loss scenario includes an actual durably accepted original command');await captureFirstGroundedTip(b.page);let recoveredVertical:any,recoveredVerticalSample:any;
 for(let attempt=0;attempt<5&&!recoveredVertical;attempt++){const captured=await captureStop(b.page,'vertical',{receiptDelay:0,jitter:0,uplink:0,input:'pointer',attempt,cohort:'after-reconnect'});recoveredVertical=await finishStop(b.page,b.id,captured);if(recoveredVertical)recoveredVerticalSample=captured.sample;}
 assert.ok(recoveredVertical,'The recovered match completes one actual vertical stop');await proveGroundedImpact(b.page,recoveredVertical,recoveredVerticalSample);assert.equal((await get(page,'match/'+id)).state.events.length,before+1);result.reconnectNoExtraDart=true;result.originalStopRecovered=true;
 const frames=result.samples.map((sample:any)=>sample.frameMs).sort((a:number,b:number)=>a-b);result.frameOpportunity={attempts:frames.length,p95Ms:frames[Math.ceil(frames.length*.95)-1],maxMs:frames.at(-1),foreground:true,excludedAttempts:0};assert.ok(result.frameOpportunity.p95Ms<=50,'First frozen frame p95 <=50ms over every actual native attempt');console.log('All-attempt live-game timing '+JSON.stringify({frameOpportunity:result.frameOpportunity,cohorts:result.cohorts}));
 await forfeitGame(b.page,id,cleanupParticipants);result.fixtureMatchEnded=true;await writeFile('artifacts/game-timing-result.json',JSON.stringify(result,null,2));console.log('Real game pointer/keyboard freeze, delayed receipts, jitter, fixed flight and reconnect passed');
}catch(error){testFailed=true;if(debugPage){const local=await debugPage.evaluate(()=>(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark|undefined)?.detail);if(local){result.failureDiagnostic=await ingressDiagnostic(local);console.log(JSON.stringify({event:'game_timing_failed_stop',...result.failureDiagnostic}));}await debugPage.screenshot({path:'artifacts/game-timing-debug.png'});await writeFile('artifacts/game-timing-debug-private.txt',await debugPage.locator('body').innerText());}throw error;}finally{
 let profileStopError:unknown;
 try{await chromeProfile?.stop();}catch(error){retainProfileCleanupFailure('chrome-trace',error);profileStopError=error;}
 await writeFile('artifacts/game-timing-progress.json',JSON.stringify(result,null,2));
 try{try{if(cleanupMatch)await forfeitGame(cleanupParticipants[0],cleanupMatch,cleanupParticipants);}catch(error){if(!testFailed)throw error;console.error('Fixture cleanup requires operator review after failed test');}if(profileStopError&&!testFailed)throw profileStopError;}
 finally{await browser.close();await ingressPool?.end();}
}
