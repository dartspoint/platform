import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,type Page} from '@playwright/test';
import {Room} from '@colyseus/sdk';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {cleanupOwnedOnboarding,login,get,post,origin} from './helpers';
import {forfeitGame} from './game-command';
import {commandSchema} from '../../packages/contracts/src/index';

// Three real Auth sessions, native menu/chat/stop input, and only owned local
// fixture rows. Native event to local freeze is a hard 50 ms gate; first RAF
// timings are reported with an advisory 50 ms target alongside the throw proofs.
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
const browser=await chromium.launch({headless:true}),privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const directory='artifacts/match-room-expansion-browser',room=randomUUID(),roomChannel=randomUUID(),label='QaView'+randomUUID().replaceAll('-','').slice(0,8);
const actors:Awaited<ReturnType<typeof login>>[]=[],owned:string[]=[];
let matchId:string|undefined,failed=false,originalError:unknown;
const checks:Record<string,boolean>={},attempts:any[]=[];
const proof:any={ok:false,localOnly:true,newRealAuthSessions:3,browserEnvironment:{engine:'chromium-headless-shell',channel:'default',headless:true,version:browser.version(),physicalHardwareTested:false},throwLatencyAcceptance:{nativeToLocalFreezeLimitMs:50,nativeToFirstRAFTargetMs:50,nativeToFirstRAFGate:'reported-only-user-request-2026-10-14',independentNormalTimingWorkloads:'unchanged'},checks,attempts,cleanup:{forfeit:false,browser:false,ownedRows:false}};
const outcomes=new Map<string,{type:string;payload:any}>();
const sentCommands=new Map<string,{page:Page;payload:any}>(),connections=new Map<Page,any>();
function wire(page:Page){
 page.on('websocket',socket=>{
  const sent=new Room('qa-observer-commands'),received=new Room('qa-observer-outcomes');
  sent.onMessage('*',(type,payload:any)=>{if(type==='command'&&payload?.type?.startsWith('dart.stop_'))sentCommands.set(payload.commandId,{page,payload});});
  received.onMessage('*',(type,payload:any)=>{
   if(['error','receipt'].includes(String(type))&&payload?.commandId)outcomes.set(payload.commandId,{type:String(type),payload});
   if(['clock.ready','clock.sample'].includes(String(type))&&payload?.connectionId)connections.set(page,{connectionId:payload.connectionId,ready:payload.ready===true,messageType:String(type),serverAt:payload.serverAt??null,serverReceivedAt:payload.serverReceivedAt??null});
  });
  socket.on('framesent',frame=>{if(Buffer.isBuffer(frame.payload)&&(frame.payload[0]&31)===13)(sent as any).onMessageCallback({data:frame.payload});});
  socket.on('framereceived',frame=>{if(Buffer.isBuffer(frame.payload)&&(frame.payload[0]&31)===13)(received as any).onMessageCallback({data:frame.payload});});
 });
}
function publicSnapshot(snapshot:any){return {matchId:snapshot.matchId,publicGameId:snapshot.publicGameId,stateVersion:snapshot.stateVersion,lifecycle:snapshot.lifecycle,seat:snapshot.seat,turn:snapshot.state.turn,phase:snapshot.state.phase,dartCount:snapshot.state.dartCount,scores:snapshot.state.scores,timeoutStrikes:snapshot.state.timeoutStrikes,timeoutWarning:snapshot.state.timeoutWarning??null};}
async function checkpoint(){await writeFile(directory+'/progress.json',JSON.stringify(proof,null,2),{mode:0o600});}
async function eventual<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,category:string,ms=15000){const until=performance.now()+ms;let value:T;do{value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}while(performance.now()<until);throw new Error(category);}
async function outcome(id:string){return eventual(async()=>outcomes.get(id),value=>!!value,'actual_socket_outcome_missing');}
async function meters(page:Page){return page.locator('.dp-fullscreen-stage .dp-game-panel').evaluate(root=>{
 const x=root.querySelector<HTMLElement>('.dp-meter-row .dp-meter-indicator')!,y=root.querySelector<HTMLElement>('.dp-meter-track-vertical .dp-meter-indicator')!,xr=x.getBoundingClientRect(),yr=y.getBoundingClientRect();
 return {horizontal:xr.left+xr.width/2,vertical:yr.top+yr.height/2,left:x.style.left,top:y.style.top};
});}
async function installPassiveObserverTelemetry(page:Page,movingParticipant:boolean){
 await page.addInitScript(({movingParticipant})=>{
  const w=window as any,capacity=192,observerCapacity=64;
  const data:any={startedAt:performance.now(),capacity,observerCapacity,supported:{longtask:false,'long-animation-frame':false},dropped:{raf:0,style:0,longtask:0,'long-animation-frame':0},raf:[],style:[],longTasks:[],longAnimationFrames:[],inputs:[],lastInput:null};w.__qaObserverTelemetry=data;
  const keep=(key:string,value:any,limit:number,drop:string)=>{data[key].push(value);if(data[key].length>limit){data[key].shift();data.dropped[drop]++;}};
  const originalRAF=window.requestAnimationFrame,classified=new WeakMap<FrameRequestCallback,{applicationTick:boolean;functionIndex:number}>(),functionCapacity=16;
  const applicationRAF:any={classification:'function-source-has-movingPhaseNow-and-phaseStartedAt',callbackSourceStored:false,extraPollingLoop:false,functionCapacity,ringCapacity:capacity,functions:[],invocations:0,totalCallbackWallMs:0,maxCallbackWallMs:0,classifications:0,classificationWallMs:0,droppedFunctions:0,droppedRing:0,ring:[]};data.applicationRAF=applicationRAF;
  window.requestAnimationFrame=function(callback:FrameRequestCallback){
   if(typeof callback!=='function')return originalRAF.call(this,callback);
   let info=classified.get(callback);
   if(!info){
    const started=performance.now(),source=Function.prototype.toString.call(callback),applicationTick=source.includes('movingPhaseNow')&&source.includes('phaseStartedAt');
    info={applicationTick,functionIndex:-1};applicationRAF.classifications++;applicationRAF.classificationWallMs+=performance.now()-started;
    if(applicationTick){if(applicationRAF.functions.length<functionCapacity){info.functionIndex=applicationRAF.functions.length;applicationRAF.functions.push({index:info.functionIndex,invocations:0,totalCallbackWallMs:0,maxCallbackWallMs:0,firstAt:null,lastAt:null});}else applicationRAF.droppedFunctions++;}
    classified.set(callback,info);
   }
   if(!info.applicationTick)return originalRAF.call(this,callback);
   const functionIndex=info.functionIndex;
   return originalRAF.call(this,function(this:Window,timestamp:number){
    const at=performance.now();
    try{return callback.call(this,timestamp);}
    finally{
     const returnedAt=performance.now(),duration=returnedAt-at;applicationRAF.invocations++;applicationRAF.totalCallbackWallMs+=duration;applicationRAF.maxCallbackWallMs=Math.max(applicationRAF.maxCallbackWallMs,duration);
     const record=applicationRAF.functions[functionIndex];if(record){record.invocations++;record.totalCallbackWallMs+=duration;record.maxCallbackWallMs=Math.max(record.maxCallbackWallMs,duration);record.firstAt??=at;record.lastAt=at;}
     applicationRAF.ring.push({functionIndex,at,returnedAt,timestamp});if(applicationRAF.ring.length>capacity){applicationRAF.ring.shift();applicationRAF.droppedRing++;}
    }
   });
  };
  const performanceObservers:PerformanceObserver[]=[];
  for(const type of ['longtask','long-animation-frame']){
   if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
   const accept=(entries:PerformanceEntry[])=>{for(const entry of entries){const source=entry.toJSON(),value:any={startTime:entry.startTime,duration:entry.duration};for(const key of ['renderStart','styleAndLayoutStart','blockingDuration','firstUIEventTimestamp'])if(Number.isFinite(source[key]))value[key]=source[key];if(Array.isArray(source.scripts))value.scripts=source.scripts.map((script:any)=>Object.fromEntries(['startTime','duration','executionStart','forcedStyleAndLayoutDuration','pauseDuration'].filter(key=>Number.isFinite(script[key])).map(key=>[key,script[key]])));keep(type==='longtask'?'longTasks':'longAnimationFrames',value,observerCapacity,type);}};
   const observer=new PerformanceObserver(list=>accept(list.getEntries()));observer.observe({type,buffered:true});performanceObservers.push(observer);data.supported[type]=true;data['drain_'+type]=()=>accept(observer.takeRecords());
  }
  let horizontal:HTMLElement|null=null,vertical:HTMLElement|null=null,button:HTMLElement|null=null;
  const mutations=new MutationObserver(records=>{
   let horizontalWrites=0,verticalWrites=0,oldEqualsCurrentAtDelivery=0;
   for(const record of records){if(record.target===horizontal)horizontalWrites++;else if(record.target===vertical)verticalWrites++;if(record.oldValue===(record.target as HTMLElement).getAttribute('style'))oldEqualsCurrentAtDelivery++;}
   keep('style',{at:performance.now(),horizontalWrites,verticalWrites,oldEqualsCurrentAtDelivery,left:horizontal?.style.left??null,top:vertical?.style.top??null},capacity,'style');
  });
  const attachMeters=()=>{
   if(!horizontal?.isConnected||!vertical?.isConnected){mutations.disconnect();horizontal=document.querySelector('.spectator-live-game .dp-meter-row .dp-meter-indicator')??document.querySelector('.dp-fullscreen-stage .dp-meter-row .dp-meter-indicator');vertical=document.querySelector('.spectator-live-game .dp-meter-track-vertical .dp-meter-indicator')??document.querySelector('.dp-fullscreen-stage .dp-meter-track-vertical .dp-meter-indicator');if(horizontal)mutations.observe(horizontal,{attributes:true,attributeFilter:['style'],attributeOldValue:true});if(vertical)mutations.observe(vertical,{attributes:true,attributeFilter:['style'],attributeOldValue:true});}
   if(!button?.isConnected)button=horizontal?.closest('.dp-game-panel')?.querySelector('.dp-throw-button')??null;
  };
  const heartbeat=(timestamp:number)=>{
   attachMeters();
   // Style/attribute reads do not force geometry/layout or participate in draws.
   keep('raf',{at:performance.now(),timestamp,left:horizontal?.style.left??null,top:vertical?.style.top??null,scope:horizontal?.closest('.spectator-live-game')?'spectator':horizontal?'participant':null,controlLabel:button?.getAttribute('aria-label')??null,controlDisabled:button?.hasAttribute('disabled')??null},capacity,'raf');
   frame=requestAnimationFrame(heartbeat);
  };let frame=movingParticipant?requestAnimationFrame(heartbeat):0;
  const capture=(event:PointerEvent)=>{
   const captureAt=performance.now(),target=event.target instanceof Element?event.target.closest('.dp-throw-button'):null,label=target?.getAttribute('aria-label'),afterTargetAt=performance.now();
   if(!event.isPrimary||event.button!==0||!['Stop horizontale indicator','Stop verticale indicator en gooi'].includes(label??''))return;
   const beforeStateAt=performance.now(),visibility=document.visibilityState,afterVisibilityAt=performance.now(),focused=document.hasFocus(),afterFocusAt=performance.now();
   const input:any={index:data.inputs.length,eventTimeStamp:event.timeStamp,captureAt,isTrusted:event.isTrusted,type:event.type,pointerType:event.pointerType,axis:label==='Stop horizontale indicator'?'horizontal':'vertical',state:{visibility,focused},firstRAF:null,capturePhases:{afterTargetAt,beforeStateAt,afterVisibilityAt,afterFocusAt}};data.inputs.push(input);data.lastInput=input;
   input.capturePhases.afterInputStoredAt=performance.now();input.capturePhases.beforeRAFRegistrationAt=performance.now();
   requestAnimationFrame(timestamp=>{input.firstRAF={at:performance.now(),timestamp,left:horizontal?.style.left??null,top:vertical?.style.top??null,state:{visibility:document.visibilityState,focused:document.hasFocus()}};});
   input.capturePhases.afterRAFRegistrationAt=performance.now();input.capturePhases.beforeUserTimingMarkAt=performance.now();
   performance.mark('qa-observer-native-input',{startTime:input.capturePhases.beforeUserTimingMarkAt,detail:{timeOrigin:performance.timeOrigin,index:input.index,axis:input.axis,eventTimeStamp:input.eventTimeStamp,captureAt,isTrusted:input.isTrusted,pointerType:input.pointerType,capturePhases:{...input.capturePhases}}});
   input.capturePhases.afterUserTimingMarkAt=performance.now();input.captureEndAt=performance.now();
  };if(movingParticipant)window.addEventListener('pointerdown',capture,true);
  w.__qaObserverSnapshot=()=>{
   // Idle/spectator pages get only a passive style observer. Attaching at their
   // first existing outcome checkpoint adds no polling loop or readiness wait.
   if(!movingParticipant)attachMeters();
   for(const type of ['longtask','long-animation-frame'])data['drain_'+type]?.();
   const input=data.lastInput,from=(input?.eventTimeStamp??performance.now())-1000;
   return {timeOrigin:performance.timeOrigin,nativeInput:input,movingParticipant,styleObserverAttached:!!horizontal&&!!vertical,supported:data.supported,dropped:{...data.dropped},capacity,observerCapacity,observedAt:performance.now(),state:{visibility:document.visibilityState,focused:document.hasFocus()},currentStyles:{left:horizontal?.style.left??null,top:vertical?.style.top??null},applicationRAF:{...applicationRAF,functions:applicationRAF.functions.map((value:any)=>({...value})),ring:applicationRAF.ring.filter((entry:any)=>entry.at>=from)},raf:data.raf.filter((entry:any)=>entry.at>=from),style:data.style.filter((entry:any)=>entry.at>=from),longTasks:data.longTasks.filter((entry:any)=>entry.startTime+entry.duration>=from),longAnimationFrames:data.longAnimationFrames.filter((entry:any)=>entry.startTime+entry.duration>=from)};
  };
  // The existing browser.close() also owns these observer/listener lifetimes.
  w.__qaObserverStop=()=>{cancelAnimationFrame(frame);mutations.disconnect();performanceObservers.forEach(observer=>observer.disconnect());window.removeEventListener('pointerdown',capture,true);};
 },{movingParticipant});
}
async function nativeStop(actor:Awaited<ReturnType<typeof login>>,axis:'horizontal'|'vertical'){
 // This is a disposable, owned-state observation before the unchanged native
 // driver; no provider call, admission value, sample or command is injected.
 assert.ok(matchId&&owned.includes(actor.id)&&actors.some(value=>value.page===actor.page&&value.id===actor.id));
 const row=(await privileged.query('select m.state_version,m.lifecycle,m.state,mp.seat from matches m join match_players mp on mp.match_id=m.id and mp.user_id=$2 where m.id=$1',[matchId,actor.id])).rows[0];assert.ok(row,'Pre-input snapshot belongs to this owned match/player');
 const baseline={matchId,stateVersion:Number(row.state_version),lifecycle:row.lifecycle,seat:row.seat,turn:row.state.turn,phase:row.state.phase,phaseToken:row.state.phaseToken,phaseStartedAt:row.state.phaseStartedAt,lastAcceptedAt:row.state.lastAcceptedAt??0,meterSpeedVersion:row.state.meterSpeedVersion??'standard-v1',dartCount:row.state.dartCount,timeoutStrikes:row.state.timeoutStrikes,timeoutWarning:row.state.timeoutWarning??null};
 const button=actor.page.getByRole('button',{name:axis==='horizontal'?'Stop horizontale indicator':'Stop verticale indicator en gooi',exact:true});await actor.page.bringToFront();await expect(button).toBeEnabled({timeout:15000});
 const selector=axis==='horizontal'?'.dp-fullscreen-stage .dp-meter-row .dp-meter-indicator':'.dp-fullscreen-stage .dp-meter-track-vertical .dp-meter-indicator',property=axis==='horizontal'?'left':'top';
 const previous=await actor.page.locator(selector).evaluate((element,property)=>(element as HTMLElement).style.getPropertyValue(property),property);
 await actor.page.waitForFunction(({selector,property,previous})=>{const element=document.querySelector(selector) as HTMLElement|null;return !!element&&element.style.getPropertyValue(property)!==previous;},{selector,property,previous},{polling:'raf',timeout:15000});
 await actor.page.evaluate(()=>{performance.clearMarks('dp-local-stop');const data=(window as any).__qaObserverTelemetry;if(data)data.lastInput=null;});
 const connectionBefore=connections.get(actor.page)?{...connections.get(actor.page)}:null;
 await button.click();
 const observed=await actor.page.evaluate(()=>{const mark=performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark|undefined;return {timeOrigin:performance.timeOrigin,mark:mark?{name:mark.name,startTime:mark.startTime,duration:mark.duration}:null,trace:mark?.detail??null,passive:(window as any).__qaObserverSnapshot?.()??null};});
 const trace=observed.trace,attempt:any={axis,baseline,connectionBefore,performance:observed.mark,timeOrigin:observed.timeOrigin,trace,renderSampleAt:trace?.rendered?.sampleAt,meterSpeedVersion:trace?.rendered?.meterSpeedVersion,nativeEventTimestampAvailable:!!observed.passive?.nativeInput,nativeEventTimestampLimitation:'Native timestamps and passive RAF/style observers are browser diagnostics, not physical presentation proof',initialNativeInput:observed.passive?.nativeInput??null,passiveTelemetry:observed.passive,actualOutcome:null,ingress:{status:'not_checked'}};attempts.push(attempt);await checkpoint();assert.ok(trace?.commandId,'A native stop captured its real app command UUID');
 const value=await outcome(trace.commandId);assert.ok(value);attempt.actualOutcome={type:value.type,code:value.payload.code??null,snapshot:value.type==='receipt'?publicSnapshot(value.payload):null};
 await checkpoint();
 try{
  const sent=sentCommands.get(trace.commandId);
  if(!sent||sent.page!==actor.page||sent.payload.matchId!==matchId||trace.matchId!==matchId)attempt.ingress={status:'owned_wire_identity_unavailable'};
  else{
   const payload=commandSchema.parse(sent.payload),payloadHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');attempt.wireCommand=payload;
   const original=(await privileged.query("select ci.received_at,ci.latency_ms,ci.admission_window_ms,ci.timing_version,ci.connection_id,ci.payload_hash=$4 payload_matches from private.command_ingress ci where ci.scope='match' and ci.actor_id=$1 and ci.command_id=$2 and exists(select 1 from match_players own where own.match_id=$3 and own.user_id=ci.actor_id)",[actor.id,trace.commandId,matchId,payloadHash])).rows[0];
   if(!original)attempt.ingress={status:'original_ingress_unavailable'};
   else{
    const receivedAt=new Date(original.received_at).getTime(),sampleAt=payload.renderSample?.sampleAt,windowMs=Number(original.admission_window_ms),phaseStartedAt=Number(baseline.phaseStartedAt),lastAcceptedAt=Number(baseline.lastAcceptedAt);
    attempt.ingress={status:'found',source:'immutable-owned-local-ingress',receivedAt,latencyMs:Number(original.latency_ms),windowMs,timingVersion:original.timing_version,connectionId:original.connection_id,payloadMatches:original.payload_matches===true,connectionMatches:original.connection_id===payload.renderSample?.connectionId,connectionBeforeMatches:connectionBefore?.connectionId===payload.renderSample?.connectionId,sampleAt,sampleAgeAtIngressMs:Number.isFinite(sampleAt)?receivedAt-sampleAt!:null,phaseStartedAt,lastAcceptedAt,baselineVersionMatches:payload.expectedStateVersion===baseline.stateVersion,baselinePhaseMatches:payload.phaseToken===baseline.phaseToken,tracePhaseMatches:payload.phaseToken===trace.phaseToken,traceSampleMatches:sampleAt===trace.rendered?.sampleAt,violations:{future:Number.isFinite(sampleAt)?sampleAt!>receivedAt:null,old:Number.isFinite(sampleAt)?sampleAt!<receivedAt-windowMs:null,beforePhase:Number.isFinite(sampleAt)&&Number.isFinite(phaseStartedAt)?sampleAt!<phaseStartedAt:null,beforeLastAccepted:Number.isFinite(sampleAt)&&Number.isFinite(lastAcceptedAt)?sampleAt!<lastAcceptedAt:null}};
   }
  }
 }catch{attempt.ingress={status:'diagnostic_read_failed'};}
 // Receipt can precede this same native input's already registered first RAF.
 // Keep the initial observation, outcome and ingress before awaiting that real callback.
 const originalNative=attempt.initialNativeInput;
 attempt.firstRAFObservation={timeoutMs:1500,initiallyComplete:!!originalNative?.firstRAF,completed:false,inputIdentity:originalNative?{index:originalNative.index,eventTimeStamp:originalNative.eventTimeStamp,axis:originalNative.axis}:null};
 await checkpoint();
 if(originalNative)await actor.page.waitForFunction(({index,eventTimeStamp,axis})=>{const input=(window as any).__qaObserverTelemetry?.lastInput;return input?.index===index&&input?.eventTimeStamp===eventTimeStamp&&input?.axis===axis&&!!input.firstRAF;},attempt.firstRAFObservation.inputIdentity,{polling:'raf',timeout:1500});
 attempt.firstRAFObservation.completed=!!originalNative;
 // Persist outcome and original bounds before the unchanged acceptance assertion
 // and before forfeit/owned-row cleanup. Missing ingress never replaces its error.
 attempt.passiveContextTelemetry=await Promise.all(actors.map(async(value,index)=>{try{return {index,snapshot:await value.page.evaluate(()=>(window as any).__qaObserverSnapshot?.()??null),readFailed:false};}catch{return {index,snapshot:null,readFailed:true};}}));
 attempt.passiveTelemetry=attempt.passiveContextTelemetry.find((value:any)=>actors[value.index].id===actor.id)?.snapshot??observed.passive;
 const capturedNative=attempt.passiveTelemetry?.nativeInput;
 const native=originalNative&&capturedNative?.index===originalNative.index&&capturedNative?.eventTimeStamp===originalNative.eventTimeStamp&&capturedNative?.axis===originalNative.axis?capturedNative:null;
 attempt.nativeEventTimestampAvailable=!!native;
 attempt.nativeTiming=native?{nativeToCaptureMs:native.captureAt-native.eventTimeStamp,nativeToCaptureEndMs:native.captureEndAt-native.eventTimeStamp,captureOwnDurationMs:native.captureEndAt-native.captureAt,captureEndToHookMs:trace.inputAt-native.captureEndAt,nativeToHookMs:trace.inputAt-native.eventTimeStamp,hookOwnDurationMs:trace.handlerCompletedAt-trace.inputAt,nativeToHandlerCompletedMs:trace.handlerCompletedAt-native.eventTimeStamp,nativeToLocalFreezeMs:trace.stopAppliedAt-native.eventTimeStamp,nativeToFirstRAFMs:native.firstRAF?native.firstRAF.at-native.eventTimeStamp:null,latestChosenDrawAfterNativeMs:trace.rendered.renderedAt-native.eventTimeStamp}:null;
 attempt.frameTiming={targetMs:50,gate:'reported-only-user-request-2026-10-14',targetMet:Number.isFinite(attempt.nativeTiming?.nativeToFirstRAFMs)&&attempt.nativeTiming.nativeToFirstRAFMs>=0?attempt.nativeTiming.nativeToFirstRAFMs<=50:null};
 await checkpoint();
 if(attempt.frameTiming.targetMet===false)console.warn('Observer '+axis+' native-to-first-RAF '+attempt.nativeTiming.nativeToFirstRAFMs+' ms exceeds the advisory 50 ms target; native-to-local-freeze remains a hard gate.');
 assert.ok(native,'Every native stop retains its original input capture');assert.equal(native.isTrusted,true,'Observer stop uses genuine native browser input');assert.equal(native.axis,axis);
 assert.ok(Number.isFinite(native.eventTimeStamp)&&native.eventTimeStamp>=0&&Number.isFinite(native.captureAt)&&native.eventTimeStamp<=native.captureAt,'Observer native event time precedes capture on the same monotone clock');
 assert.ok(Number.isFinite(trace.stopAppliedAt)&&Number.isFinite(attempt.nativeTiming.nativeToLocalFreezeMs)&&attempt.nativeTiming.nativeToLocalFreezeMs>=0&&attempt.nativeTiming.nativeToLocalFreezeMs<=50,'Observer native event to local freeze <=50ms');
 assert.ok(Number.isFinite(trace.handlerCompletedAt)&&trace.stopAppliedAt<=trace.handlerCompletedAt&&Number.isFinite(attempt.nativeTiming.nativeToHandlerCompletedMs)&&attempt.nativeTiming.nativeToHandlerCompletedMs>=0,'Observer native-to-handler completion duration is valid');
 assert.ok(native.firstRAF&&Number.isFinite(native.firstRAF.at)&&Number.isFinite(attempt.nativeTiming.nativeToFirstRAFMs)&&attempt.nativeTiming.nativeToFirstRAFMs>=0,'Observer native-to-first-RAF duration is finite and nonnegative');
 assert.equal(value.type,'receipt','The one normal input is accepted; no new UUID retry is generated');assert.equal(value.payload.commandId,trace.commandId);assert.equal(value.payload.timing.admittedAt,trace.rendered.sampleAt);assert.equal(value.payload.state.meterSpeedVersion,trace.rendered.meterSpeedVersion);
 return value.payload;
}
async function forgedSpectatorCommand(page:Page,snapshot:any,extra:Record<string,unknown>={}){
 const commandId=randomUUID(),encoder=new Room('match');let bytes:number[]=[];encoder.connection={isOpen:true,send:(data:Uint8Array)=>{bytes=[...data];}} as any;
 encoder.send('command',{protocolVersion:1,commandId,matchId:snapshot.matchId,expectedStateVersion:snapshot.stateVersion,type:'dart.stop_horizontal',phaseToken:snapshot.state.phaseToken,...extra});
 await page.evaluate(bytes=>{const socket=(window as any).__qaGameSocket;if(!socket||socket.readyState!==WebSocket.OPEN)throw new Error('owned_spectator_socket_missing');socket.send(new Uint8Array(bytes));},bytes);
 return {commandId,value:await outcome(commandId)};
}
try{
 await mkdir(directory,{recursive:true,mode:0o700});
 for(const suffix of ['ViewA','ViewB','ViewC']){const actor=await login(browser,suffix);actors.push(actor);owned.push(actor.id);assert.equal((await get(actor.page,'bootstrap')).actor.role,'player');actor.page.setDefaultTimeout(15000);wire(actor.page);
 await actor.page.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);if(text.includes('command')||text.includes('clock.ping'))(window as any).__qaGameSocket=this;return send.call(this,data);};});
  await installPassiveObserverTelemetry(actor.page,suffix==='ViewA');
 }
 const [a,b,viewer]=actors;assert.equal(new Set(owned).size,3);
 await privileged.query('insert into community_rooms(id,name,slug,capacity,min_rating,max_rating) values($1,$2,$2,50,0,5000)',[room,label]);await privileged.query("insert into channels(id,kind,room_id) values($1,'community',$2)",[roomChannel,room]);
 for(const actor of actors)await post(actor.page,'room',{roomId:room});
 const invited=await post(a.page,'invite',{targetId:b.id,roomId:room,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});
 const accepted=await post(b.page,'invite/respond',{inviteId:invited.id,action:'accept'});matchId=accepted.matchId;
 for(const actor of [a,b])await actor.page.goto(origin+'/spelen?match='+matchId);
 await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await eventual(()=>get(a.page,'match/'+matchId),value=>value.state.ready[0]===true,'first_native_ready_missing');
 await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 let state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.lifecycle==='playing','both_native_ready_missing');assert.equal(state.state.turn,0);assert.ok(Number.isSafeInteger(state.publicGameId)&&state.publicGameId>0);proof.publicGameId=state.publicGameId;
 await expect(a.page.getByText('Wedstrijd #'+state.publicGameId,{exact:true})).toBeVisible();await expect(b.page.getByText('Wedstrijd #'+state.publicGameId,{exact:true})).toBeVisible();checks.numericPublicGameIdBothPlayers=true;
 await viewer.page.goto(origin+'/spelen');
 await viewer.page.locator('.dp-desktop-players').getByRole('button',{name:'Acties voor '+a.name,exact:true}).click();
 const admissionResponse=viewer.page.waitForResponse(response=>response.url().endsWith('/api/platform/match/spectate')&&response.request().method()==='POST'&&response.request().postDataJSON().matchId===matchId);
 await viewer.page.getByRole('menuitem',{name:'Toeschouwen',exact:true}).click();
 const admission=await admissionResponse;assert.equal(admission.status(),200);const allowed=await admission.json();assert.equal(allowed.matchId,matchId);assert.equal(allowed.publicGameId,state.publicGameId);assert.equal(allowed.seat,null);
 const dialog=viewer.page.getByRole('dialog').filter({has:viewer.page.getByRole('heading',{name:'Langs de oche',exact:true})});await expect(dialog.locator('.spectator-live-game')).toBeVisible();await expect(dialog.locator('.spectator-live-game')).toHaveAttribute('data-spectator-match',matchId!);await expect(dialog.locator('.spectator-live-game')).toHaveAttribute('data-public-game-id',String(state.publicGameId));
 await expect(dialog.locator('.spectator-status')).toContainText('#'+state.publicGameId);await expect(dialog.locator('.dp-game-panel .dp-dartboard')).toBeVisible();checks.nativePlayerMenuOpensRealApprovedLiveMatch=true;
 assert.equal(await dialog.locator('.dp-throw-button').count(),0);assert.equal(await dialog.getByRole('button',{name:'Begin de wedstrijd',exact:true}).count(),0);assert.equal(await dialog.getByRole('button',{name:/^(Stop horizontale indicator|Stop verticale indicator en gooi|Geef op|Wedstrijd opgeven)$/}).count(),0);checks.spectatorHasNoReadyStopOrForfeitControls=true;
 const baseline=await get(viewer.page,'match/'+matchId),forbidden=await forgedSpectatorCommand(viewer.page,baseline);assert.equal(forbidden.value?.type,'error');assert.equal(forbidden.value?.payload.code,'spectator_read_only');
 const forged=await forgedSpectatorCommand(viewer.page,baseline,{score:180,winner:2});assert.equal(forged.value?.type,'error');assert.equal(forged.value?.payload.code,'invalid_command');
 const unchanged=await get(a.page,'match/'+matchId);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.deepEqual(unchanged.state,baseline.state);checks.actualSpectatorSocketCannotStopOrClaimScore=true;
 const message='Meekijken '+randomUUID(),send=viewer.page.waitForResponse(response=>response.url().endsWith('/api/platform/chat/send')&&response.request().postDataJSON().body===message);
 await dialog.getByLabel('Chatbericht',{exact:true}).fill(message);await dialog.getByLabel('Chatbericht',{exact:true}).press('Enter');const sent=await send;assert.equal(sent.status(),200);assert.equal(sent.request().postDataJSON().channelId,allowed.channelId);
 for(const actor of [a,b]){await actor.page.getByRole('tab',{name:/Spelchat/}).click();await expect(actor.page.getByText(message,{exact:true})).toBeVisible();assert.ok((await get(actor.page,'chat/'+allowed.channelId)).some((row:any)=>row.body===message));}
 checks.nativeSpectatorMatchChatDeliveredAndStoredForBothPlayers=true;
 // Only this owned match's turn clock is advanced. The real worker emits its
// warnings; no score, phase, sample, timeout-strike or browser state is forged.
 for(const strike of [1,2]){
  await privileged.query("update matches set state=jsonb_set(state,'{turnStartedAt}',to_jsonb($2::bigint)) where id=$1 and exists(select 1 from match_players where match_id=$1 and user_id=$3)",[matchId,Date.now()-31000,a.id]);
  await expect(a.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  await expect(b.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  await expect(dialog.locator('.dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  state=await get(a.page,'match/'+matchId);assert.equal(state.state.turn,0);assert.equal(state.lifecycle,'playing');assert.deepEqual(state.state.dartCount,[0,0]);assert.deepEqual(state.state.scores,[501,501]);proof['warning'+strike]=publicSnapshot(state);await checkpoint();
 }
 checks.actualFirstSecondTimeoutWarningsVisibleToPlayersAndSpectator=true;
 // Use native player inputs for all three darts in this real 501 visit.
 let lastAxes:any;
 for(let dart=1;dart<=3;dart++){
  await nativeStop(a,'horizontal');await expect(a.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveCount(0);await nativeStop(a,'vertical');
  if(dart===3)lastAxes=await meters(a.page);
  state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.state.dartCount[0]===dart&&!value.state.pendingDart,'real_dart_impact_missing');
 }
 assert.equal(state.state.turn,1);assert.deepEqual(state.state.dartCount,[3,0]);assert.deepEqual(state.state.timeoutStrikes,[0,0]);checks.validNativeStopClearsWarnings=true;
 await expect(a.page.getByRole('button',{name:'Tegenstander aan de beurt',exact:true})).toBeDisabled();await expect(b.page.getByRole('button',{name:'Stop horizontale indicator',exact:true})).toBeEnabled({timeout:15000});
 const held=[];for(let index=0;index<4;index++){await a.page.waitForTimeout(100);held.push(await meters(a.page));}
 proof.lastStoppedAxes=lastAxes;proof.axesWhileOpponentTurn=held;await checkpoint();
 assert.ok(held.every(value=>Math.abs(value.horizontal-lastAxes.horizontal)<=1&&Math.abs(value.vertical-lastAxes.vertical)<=1),'Both last stopped axes stay fixed within 1CSSpx while B has the turn');checks.lastDartAxesRemainFixedDuringOpponentTurn=true;
 await expect(dialog.locator('.dp-flying-dart')).toHaveCount(3,{timeout:15000});checks.realSpectatorShowsThreeAuthoritativeLandedDarts=true;
 await dialog.getByRole('button',{name:'Terug naar jouw wedstrijd',exact:false}).click();await expect(viewer.page.locator('.spectator-live-game')).toHaveCount(0);checks.spectatorClosesWithoutChangingMatch=true;
 assert.equal((await get(a.page,'match/'+matchId)).state.turn,1);
 // Expire only the owned turn's clock; the real worker and authenticated native
 // buttons must decide, grant a whole minute and finally settle exactly once.
 for(let strike=1;strike<=3;strike++){
  await privileged.query("update matches set state=jsonb_set(state,'{turnStartedAt}',to_jsonb($2::bigint)) where id=$1",[matchId,Date.now()-31000]);
  state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.state.timeoutStrikes[1]===strike,'timeout_strike_missing');
 }
 const choice=a.page.getByRole('dialog').filter({has:a.page.getByRole('heading',{name:'Beurttijd verstreken',exact:true})});
 await expect(choice).toBeVisible();await expect(b.page.getByText('Je beurttijd is verstreken. Je tegenstander kiest of je één minuut extra krijgt.',{exact:true})).toBeVisible();
 await choice.getByRole('button',{name:'1 minuut extra wachten',exact:true}).click();
 state=await eventual(()=>get(a.page,'match/'+matchId),value=>!value.state.timeoutDecision&&value.state.turnDeadlineAt,'timeout_minute_missing');
 assert.equal(state.state.turnDeadlineAt-state.state.turnStartedAt,60000);assert.deepEqual(state.state.dartCount,[3,0]);await expect(choice).toHaveCount(0);
 await privileged.query("update matches set state=jsonb_set(state,'{turnDeadlineAt}',to_jsonb($2::bigint)) where id=$1",[matchId,Date.now()-1]);
 await expect(choice).toBeVisible({timeout:15000});await choice.getByRole('button',{name:'Wedstrijd beëindigen',exact:true}).click();
 state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.lifecycle==='completed','timeout_match_not_finished');
 assert.equal(state.state.winner,0);assert.deepEqual(state.state.totalLegs,[1,0]);assert.deepEqual(state.state.dartCount,[3,0]);
 assert.equal((await privileged.query('select count(*)::int n from private.match_leg_settlements where match_id=$1',[matchId])).rows[0].n,1);
 checks.nativeOpponentTimeoutChoiceWholeMinuteAndFinish=true;proof.ok=true;
}catch(error){failed=true;originalError=error;proof.failureCategory='browser_expansion_failed';await checkpoint();}
finally{
 try{if(matchId&&actors.length>=2){await forfeitGame(actors[0].page,matchId,actors.slice(0,2).map(actor=>actor.page));proof.cleanup.forfeit=true;}}catch{failed=true;proof.cleanup.forfeit=false;}
 try{await browser.close();proof.cleanup.browser=true;}catch{failed=true;}
 try{
  const c=await privileged.connect();try{await c.query('begin');await c.query('select id from profiles where id=any($1::uuid[]) order by id for update',[owned]);
   const identities=(await c.query('select u.id,u.email,exists(select 1 from user_roles role where role.user_id=u.id and role.revoked_at is null) staff from auth.users u where u.id=any($1::uuid[])',[owned])).rows;
   assert.equal(identities.length,actors.length,'Every cleanup identity is an owned login');
   for(const actor of actors){const identity=identities.find(value=>value.id===actor.id);assert.ok(identity&&identity.email.toLowerCase()===actor.email.toLowerCase()&&!identity.staff,'Owned normal-player cleanup identity guard');}
   const matches=(await c.query('select distinct match_id from match_players where user_id=any($1::uuid[])',[owned])).rows.map(row=>row.match_id),channels=(await c.query('select id from channels where room_id=$1 or match_id=any($2::uuid[])',[room,matches])).rows.map(row=>row.id);
   await c.query('delete from private.moderation_cases where target_id=any($1::uuid[]) or reporter_id=any($1::uuid[])',[owned]);await c.query('delete from sanctions where target_id=any($1::uuid[]) or actor_id=any($1::uuid[])',[owned]);
   await c.query('delete from chat_messages where channel_id=any($1::uuid[])',[channels]);await c.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channels where id=any($1::uuid[])',[channels]);
   await c.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[]))',[owned,matches]);await c.query('delete from notifications where user_id=any($1::uuid[]) or source_event in(select id from private.outbox_events where payload->>\'matchId\'=any($2::text[]))',[owned,matches]);await c.query('delete from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[])',[owned,matches]);
   await c.query('delete from game_invites where inviter_id=any($1::uuid[]) or invitee_id=any($1::uuid[])',[owned]);
   for(const table of ['private.match_commands','match_darts','match_events','match_statistics','rating_ledger','user_badges','player_opponents','active_player_reservations','match_players','match_results'])await c.query(`delete from ${table} where ${table==='player_opponents'?'first_match_id':'match_id'}=any($1::uuid[])`,[matches]);
   await c.query('delete from private.command_ingress where actor_id=any($1::uuid[])',[owned]);await c.query('delete from private.audit_events where actor_id=any($1::uuid[]) or subject=any($2::text[])',[owned,[room,...matches,...owned]]);await c.query('delete from matches where id=any($1::uuid[])',[matches]);
   await c.query('delete from private.room_visits where user_id=any($1::uuid[])',[owned]);await c.query('delete from room_memberships where user_id=any($1::uuid[])',[owned]);await c.query('delete from room_access where room_id=$1',[room]);await c.query('delete from community_rooms where id=$1',[room]);
   await cleanupOwnedOnboarding(c,actors);await c.query('delete from user_badges where user_id=any($1::uuid[])',[owned]);await c.query('delete from preferences where user_id=any($1::uuid[])',[owned]);await c.query('delete from player_ratings where user_id=any($1::uuid[])',[owned]);await c.query('delete from profiles where id=any($1::uuid[])',[owned]);await c.query('delete from auth.users where id=any($1::uuid[])',[owned]);await c.query('commit');
   assert.equal((await c.query('select count(*)::int n from profiles where id=any($1::uuid[])',[owned])).rows[0].n,0);proof.cleanup.ownedRows=true;
  }catch(error){await c.query('rollback');throw error;}finally{c.release();}
 }catch{failed=true;proof.cleanup.ownedRows=false;}
 await privileged.end();proof.ok=proof.ok&&!failed;await checkpoint();await writeFile(directory+'/result.json',JSON.stringify(proof,null,2),{mode:0o600});
}
if(failed){if(originalError)throw originalError;throw new Error('owned_browser_fixture_cleanup_failed');}
console.log('Real spectator dropdown, live match chat, readonly commands, public numbers, warning UI and held opponent-turn axes passed');
