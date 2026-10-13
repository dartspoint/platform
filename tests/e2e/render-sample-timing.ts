import assert from 'node:assert/strict';
import {chromium,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {meterPosition} from '../../packages/game-core/src/timing';
import {login,get,post,origin} from './helpers';
const browser=await chromium.launch({headless:true}),results:any[]=[];let uplink=0,downlink=0,coldBeforeThree=false,oldSampleProof:any;
const browserEnvironment={engine:'chromium-headless-shell',channel:'default',headless:true,version:browser.version(),executablePathReportedByPlaywright:chromium.executablePath(),executablePathIsLaunchedBinary:false,physicalHardwareTested:false};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function geometry(page:Page,axis:string){return page.locator(`.practice-meter-${axis==='horizontal'?'x':'y'} i`).evaluate((element,horizontal)=>{const a=element.getBoundingClientRect(),b=element.parentElement!.getBoundingClientRect();return {position:horizontal?a.left+a.width/2:a.top+a.height/2,track:horizontal?b.width:b.height};},axis==='horizontal');}
async function stop(page:Page,axis:'horizontal'|'vertical',target:number,direction:number,keyboard:boolean){
 const selector=`.practice-meter-${axis==='horizontal'?'x':'y'} i`,button=page.getByRole('button',{name:axis==='horizontal'?'Stop de richting':'Stop de hoogte en gooi',exact:true});await button.waitFor();await page.waitForFunction(selector=>!(document.querySelector(selector) as HTMLButtonElement)?.disabled,'.practice-throw');
 await page.waitForFunction(({selector,target,direction})=>{const e=document.querySelector(selector) as HTMLElement,f=parseFloat(e.style[selector.includes('-x')?'left':'top'])/100,w=window as any,previous=w.__dpLastFraction;w.__dpLastFraction=f;return Number.isFinite(previous)&&Math.abs(f-target)<.018&&(direction===0||(f-previous)*direction>0);},{selector,target,direction},{polling:'raf',timeout:7000});
 await page.evaluate(()=>{performance.clearMarks('dp-local-stop');const w=window as any;w.__dpFirstFrozen=undefined;w.__dpPracticeInput=undefined;});
 const response=page.waitForResponse(r=>r.url().endsWith('/api/platform/practice')&&r.request().method()==='POST'&&r.request().postDataJSON().type===axis);
 const pre=await geometry(page,axis);
 // The stopwatch starts in native capture, before the normal React stop
 // handler. The RAF callback measures a geometry opportunity, not display scanout.
 await button.evaluate((element,{axis,keyboard})=>{
  const w=window as any,eventType=keyboard?'keydown':'pointerdown';
  const capture=(event:Event)=>{
   if(w.__dpPracticeInput)return;
   if(event instanceof KeyboardEvent&&(event.key!=='Enter'||event.repeat||event.isComposing))return;
   if(event instanceof PointerEvent&&(!event.isPrimary||event.button!==0))return;
   const captureStartedAt=performance.now(),at=event.timeStamp;w.__dpTimingInput=at;
   const element=document.querySelector(`.practice-meter-${axis==='horizontal'?'x':'y'} i`)!,indicator=element.getBoundingClientRect(),track=element.parentElement!.getBoundingClientRect(),horizontal=axis==='horizontal';
   w.__dpPracticeInput={at,eventTimeStamp:event.timeStamp,captureStartedAt,type:event.type,isTrusted:event.isTrusted,geometry:{indicator:horizontal?indicator.left+indicator.width/2:indicator.top+indicator.height/2,trackSize:horizontal?track.width:track.height}};
   requestAnimationFrame(()=>{const e=document.querySelector(`.practice-meter-${axis==='horizontal'?'x':'y'} i`)!,r=e.getBoundingClientRect();w.__dpFirstFrozen={position:axis==='horizontal'?r.left+r.width/2:r.top+r.height/2,at:performance.now()};});
  };
  w.__dpPracticeCapture={element,eventType,capture};element.addEventListener(eventType,capture,true);
 },{axis,keyboard});
 let frozen:any;
 try{
  if(keyboard)await button.press('Enter');else if(page.viewportSize()!.width<1024)await button.tap();else await button.click();
  await page.waitForFunction(()=>!!(window as any).__dpFirstFrozen);frozen=await page.evaluate(()=>({frame:(window as any).__dpFirstFrozen,inputAt:(window as any).__dpTimingInput,input:(window as any).__dpPracticeInput,mark:(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark)?.detail}));
 }finally{await page.evaluate(()=>{const w=window as any,capture=w.__dpPracticeCapture;if(capture){capture.element.removeEventListener(capture.eventType,capture.capture,true);delete w.__dpPracticeCapture;}});}
 const sample:any={viewport:page.viewportSize(),axis,target,direction,keyboard,input:frozen.input,uplink,downlink,preInput:pre,firstFrozen:frozen.frame,trace:frozen.mark};results.push(sample);
 assert.equal(frozen.input?.isTrusted,true,'Ordinary stops use genuine native browser input');assert.ok(Number.isFinite(frozen.input.eventTimeStamp)&&frozen.input.eventTimeStamp>=0&&frozen.input.eventTimeStamp<=frozen.input.captureStartedAt,'Native event time precedes capture on the same monotone clock');assert.ok(frozen.mark,'Input must capture one render sample');
 assert.ok(frozen.mark.stopAppliedAt<=frozen.mark.sendAt&&frozen.mark.sendAt<=frozen.mark.sendReturnedAt&&frozen.mark.sendReturnedAt<=frozen.mark.handlerCompletedAt,'Freeze precedes dispatch and handler completion');
 const pending=await geometry(page,axis),pendingAt=await page.evaluate(()=>performance.now()),serverResponse=await response,receipt=await serverResponse.json();
 const transport=await page.evaluate(commandId=>(window as any).__dpPracticeTransportAttempts.find((attempt:any)=>attempt.commandId===commandId),frozen.mark.commandId);
 Object.assign(sample,{pending,pendingAt,status:serverResponse.status(),code:receipt.code,nativeTransport:transport});
 if(!receipt.state)await writeFile('artifacts/render-sample-rejected.json',JSON.stringify({browserEnvironment,...sample,priorSamples:results.slice(0,-1)},null,2));
 assert.equal(serverResponse.request().postDataJSON().commandId,frozen.mark.commandId,'The actual native request carries this captured UUID');
 assert.equal(serverResponse.status(),200,`A bounded valid sample is accepted: ${receipt.code??serverResponse.status()}`);assert.ok(receipt.state);assert.equal(receipt.commandId,frozen.mark.commandId);
 // Native response headers precede the injected acknowledgement delivery.
 // Measure ACK geometry only after this exact command's real UI receipt.
 await page.waitForFunction(commandId=>((window as any).__dpTimingTraces??[]).some((event:any)=>event.event==='receipt'&&event.commandId===commandId),frozen.mark.commandId);
 sample.receiptTrace=await page.evaluate(commandId=>((window as any).__dpTimingTraces??[]).find((event:any)=>event.event==='receipt'&&event.commandId===commandId),frozen.mark.commandId);assert.ok(Number.isFinite(sample.receiptTrace.monotonicAt)&&sample.receiptTrace.monotonicAt>=frozen.mark.sendReturnedAt,'Actual receipt callback has its browser-local timestamp');
 sample.nativeTransport=await page.evaluate(commandId=>(window as any).__dpPracticeTransportAttempts.find((attempt:any)=>attempt.commandId===commandId),frozen.mark.commandId);
 assert.equal(await page.evaluate(commandId=>(window as any).__dpPracticeTransportAttempts.filter((attempt:any)=>attempt.commandId===commandId).length,frozen.mark.commandId),1,'Each attempted stop uses one actual native fetch');
 assert.ok(sample.nativeTransport.nativeSendAt>=frozen.inputAt);assert.ok(sample.nativeTransport.nativeHeadersAt>=sample.nativeTransport.nativeSendAt);assert.ok(sample.nativeTransport.appDeliveryAt>=sample.nativeTransport.nativeHeadersAt+downlink-2,'Requested response delay occurs after the real native response');assert.ok(pendingAt<sample.nativeTransport.appDeliveryAt,'Pending pixels are observed before acknowledgement delivery');
 const acknowledged=await geometry(page,axis);
 const before=frozen.input.geometry.indicator,freezeJumpPx=Math.abs(frozen.frame.position-before),pendingJumpPx=Math.abs(pending.position-before),ackJumpPx=Math.abs(acknowledged.position-before),localReactionMs=frozen.mark.handlerCompletedAt-frozen.inputAt;
 Object.assign(sample,{acknowledged,freezeJumpPx,pendingJumpPx,ackJumpPx,fractionJump:ackJumpPx/acknowledged.track,localReactionMs,stopMs:frozen.mark.stopAppliedAt-frozen.inputAt,firstFrameMs:frozen.frame.at-frozen.inputAt,server:receipt.timing});
 assert.ok(freezeJumpPx<=1,`Freeze jumped ${freezeJumpPx}px`);assert.ok(pendingJumpPx<=1,`Pending jumped ${pendingJumpPx}px`);assert.ok(ackJumpPx<=1,`Acknowledgement jumped ${ackJumpPx}px`);assert.ok(localReactionMs>=0&&localReactionMs<=50,`Local stop ${localReactionMs}ms`);assert.ok(sample.firstFrameMs>=0&&sample.firstFrameMs<=50,`First frozen frame ${sample.firstFrameMs}ms`);
 assert.equal(receipt.timing.admittedAt,frozen.mark.rendered.sampleAt);const lock=axis==='horizontal'?receipt.state.lockedX:receipt.state.lockedY;assert.equal(lock,meterPosition(frozen.mark.rendered.sampleAt,frozen.mark.phaseStartedAt,axis),'Shared function must produce the exact server lock');
 const expected=frozen.mark.rendered.fraction*2.28-1.14;assert.ok(Math.abs(lock-expected)<1e-12,'Server position follows the exact rendered sample');
 sample.lock=lock;return receipt;
}
try{
 const user=await login(browser,'Render',{hasTouch:true}),page=user.page;page.setDefaultTimeout(20000);const room=(await get(page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');await post(page,'room',{roomId:room.id});
 // Calibrate the same asymmetric outgoing link used by the valid40ms-stop
 // cases. A midpoint clock would be in the future even on the first0ms stop;
 // the measured conservative mapping must prevent that cold asymmetry.
 let clockRequests=0,thirdBlocked=false,releaseThird!:()=>void;const third=new Promise<void>(resolve=>releaseThird=resolve);await page.route('**/api/platform/timing/ping',async route=>{if(++clockRequests===3){thirdBlocked=true;await third;}await wait(40);await route.continue();});
 await page.route('**/api/platform/timing/echo',async route=>{await wait(40);await route.continue();});
 // Keep the browser's original connection/TLS/cookie transport for stops,
 // matching the native browser requests used by clock calibration. route.fetch
 // would reissue stops through Playwright's separate Node APIRequest transport.
 await page.addInitScript(`
 const nativeFetch=window.fetch.bind(window);
 window.__dpPracticeLink={uplink:0,downlink:0};window.__dpPracticeTransportAttempts=[];
 window.fetch=function(input,init){
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  let command;try{command=typeof init?.body==='string'?JSON.parse(init.body):null;}catch{}
  if(url.origin!==location.origin||url.pathname!=='/api/platform/practice'||init?.method!=='POST'||!['horizontal','vertical'].includes(command?.type))return nativeFetch(input,init);
  const link=window.__dpPracticeLink,attempt={commandId:command.commandId,type:command.type,uplink:link.uplink,downlink:link.downlink,queuedAt:performance.now()};window.__dpPracticeTransportAttempts.push(attempt);
  return (async function(){
   if(attempt.uplink)await new Promise(resolve=>setTimeout(resolve,attempt.uplink));
   attempt.nativeSendAt=performance.now();const response=await nativeFetch(input,init);attempt.nativeHeadersAt=performance.now();attempt.status=response.status;
   if(attempt.downlink)await new Promise(resolve=>setTimeout(resolve,attempt.downlink));
   attempt.appDeliveryAt=performance.now();return response;
  })();
 };
 `);
 for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(origin+'/oefenen');await page.bringToFront();assert.equal(await page.evaluate(()=>document.hasFocus()&&document.visibilityState==='visible'),true);
  if(!coldBeforeThree){for(let n=0;n<300&&!thirdBlocked;n++)await wait(50);assert.equal(thirdBlocked,true,'Third real calibration request was held');assert.equal(await page.getByRole('button',{name:'Stop de richting',exact:true}).isDisabled(),true,'Cold input must stay disabled before three samples');coldBeforeThree=true;releaseThird();}
  for(const [i,test] of [{target:.65,direction:1,up:0,down:100},{target:.85,direction:-1,up:40,down:300},{target:.99,direction:0,up:40,down:1000},{target:.01,direction:0,up:0,down:100}].entries()){
   uplink=test.up;downlink=test.down;await page.evaluate(link=>(window as any).__dpPracticeLink=link,{uplink,downlink});const horizontal=await stop(page,'horizontal',test.target,test.direction,i%2===1),vertical=await stop(page,'vertical',test.target,test.direction,i%2===0);assert.equal(vertical.state.dart.hit.x,horizontal.state.lockedX);assert.equal(vertical.state.dart.hit.y,vertical.state.lockedY);
   await page.getByRole('button',{name:'Volgende pijl',exact:true}).waitFor();await page.waitForFunction(()=>!(document.querySelector('.practice-throw') as HTMLButtonElement)?.disabled);await page.waitForTimeout(80);const impact=await page.locator('.practice-dart-tip').evaluate((element,hit)=>{const tip=element as SVGGElement,svg=tip.ownerSVGElement!,actual=new DOMPoint(0,0).matrixTransform(tip.getScreenCTM()!),expected=new DOMPoint(220+hit.x*170,220+hit.y*170).matrixTransform(svg.getScreenCTM()!);return {actual:{x:actual.x,y:actual.y},expected:{x:expected.x,y:expected.y},errorPx:Math.hypot(actual.x-expected.x,actual.y-expected.y)};},vertical.state.dart.hit);assert.ok(impact.errorPx<=1,`Practice rendered impact tip must match server hit <=1 CSS pixel: ${impact.errorPx}`);results.at(-1).impact=impact;
   await page.getByRole('button',{name:'Volgende pijl',exact:true}).click();
  }
 }
 // This separate adversarial case intentionally uses synthetic dispatch in
 // the same task as a 160ms stall; it is not one of the sixteen native stops.
 // The old claim must be rejected without altered scoring or a silent clamp.
 uplink=0;downlink=0;await page.evaluate(()=>(window as any).__dpPracticeLink={uplink:0,downlink:0});await page.waitForFunction(()=>!(document.querySelector('.practice-throw') as HTMLButtonElement)?.disabled);
 const selector='.practice-meter-x i',prior=await page.locator(selector).evaluate(element=>(element as HTMLElement).style.left);await page.waitForFunction(({selector,prior})=>(document.querySelector(selector) as HTMLElement)?.style.left!==prior,{selector,prior},{polling:'raf'});
 const baseline=await get(page,'practice/'+results.at(-1).trace.sessionId),rejected=page.waitForResponse(r=>r.url().endsWith('/api/platform/practice')&&r.request().postDataJSON()?.type==='horizontal');
 await page.evaluate(()=>{const at=performance.now();while(performance.now()-at<160){}document.querySelector('.practice-throw')!.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,bubbles:true}));});const rejection=await rejected,body=await rejection.json(),command=rejection.request().postDataJSON();oldSampleProof={inputMode:'synthetic-adversarial-stall',intentionalMainThreadStallMs:160,status:rejection.status(),code:body.code,commandId:command.commandId,baselineVersion:baseline.stateVersion};assert.equal(rejection.status(),409);assert.equal(body.code,'invalid_render_sample');await page.getByRole('alert').filter({hasText:'timingmeting'}).waitFor();
 const unchanged=await get(page,'practice/'+baseline.id);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.deepEqual(unchanged.state,baseline.state,'Rejected old sample preserves full authoritative phase, locks, dart count and score');
 await page.waitForFunction(()=>!(document.querySelector('.practice-throw') as HTMLButtonElement)?.disabled);const restored=await page.locator(selector).evaluate(element=>(element as HTMLElement).style.left);await page.waitForFunction(({selector,restored})=>(document.querySelector(selector) as HTMLElement)?.style.left!==restored,{selector,restored},{polling:'raf'});Object.assign(oldSampleProof,{authoritativeStateUnchanged:true,visibleError:true,controlledRestore:true,nativeTransport:await page.evaluate(commandId=>(window as any).__dpPracticeTransportAttempts.find((attempt:any)=>attempt.commandId===commandId),command.commandId)});
 assert.equal(results.length,16,'All sixteen requested native stops are retained');const sorted=results.map(x=>x.localReactionMs).sort((a,b)=>a-b);await writeFile('artifacts/render-sample-timing-result.json',JSON.stringify({ok:true,physicalDevices:false,browserEnvironment,network:'Native browser fetch with deterministic outgoing and app acknowledgement delay; real Supabase/API/DOM',calibrationLink:{uplink:40,downlink:0},samples:results,maxFreezePx:Math.max(...results.map(x=>x.freezeJumpPx)),maxAckPx:Math.max(...results.map(x=>x.ackJumpPx)),p95LocalMs:sorted[Math.ceil(sorted.length*.95)-1],coldBeforeThree,oldSampleExplicitlyRejected:true,oldSampleProof,physicalRefreshRatesTested:[],excludedAttempts:0},null,2));console.log('Actual DOM: desktop/mobile, both axes/directions/turnarounds, cold asymmetric calibration, bounded delay and stale main-thread sample passed');
}finally{await writeFile('artifacts/render-sample-timing-progress.json',JSON.stringify({physicalDevices:false,browserEnvironment,samples:results,coldBeforeThree,oldSampleProof,excludedAttempts:0},null,2));await browser.close();}
