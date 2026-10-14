import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium,expect,type Route} from '@playwright/test';
import {login,get,post,origin} from './helpers';
const browser=await chromium.launch();
try{
 const guest=await browser.newPage();await guest.goto(origin+'/oefenen');assert.ok(guest.url().includes('/inloggen'));await guest.close();
 const actor=await login(browser,'Practice');await actor.page.goto(origin+'/oefenen');assert.ok(actor.page.url().includes('/lobby'),'Bare practice selects a room');await post(actor.page,'room',{roomId:(await get(actor.page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1').id});actor.page.on('response',async r=>{if(r.url().includes('/api/platform/practice')&&!r.ok())console.log('Practice API rejected',r.status(),(await r.json()).code);});
 const initialResets:Promise<{status:number;snapshot:any}>[]=[];let observeInitialResets=true;
 const startupRoute=async(route:Route)=>{
  const request=route.request();
  if(observeInitialResets&&request.method()==='POST'&&request.postDataJSON()?.type==='reset'){
   const completed=request.response().then(async response=>{assert.ok(response,'The actual initial reset returned a response');return{status:response.status(),snapshot:await response.json()};});void completed.catch(()=>{});initialResets.push(completed);
   // Startup transport only: make an obsolete mount's reset arrive late.
   // Normal clock calibration, native stops and timing gates are unchanged.
   if(initialResets.length===1)await new Promise(resolve=>setTimeout(resolve,400));
  }
  await route.continue();
 };
 await actor.page.route('**/api/platform/practice',startupRoute);
 await actor.page.goto(origin+'/oefenen?les=1');
 await expect(actor.page.locator('.dp-practice-workspace')).toBeVisible();
 await expect(actor.page.getByRole('button',{name:'Stop de richting',exact:true})).toBeEnabled();
 const initial=await Promise.all(initialResets);assert.equal(initial.length,1,'Desktop hydration creates exactly one owned practice session');assert.equal(initial[0].status,200);
 const current=initial[0].snapshot;assert.equal(current.state.count,0);assert.equal(current.state.phase,'horizontal');assert.equal(current.state.configuration.tutorial,true);
 await actor.page.evaluate(()=>{(window as any).__qaPracticeMeter=document.querySelector('.practice-meter-x i');});
 for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
  await actor.page.setViewportSize(viewport);
  if(viewport.width<1024)await expect(actor.page.locator('.practice-header')).toBeVisible();else await expect(actor.page.locator('.practice-is-embedded')).toBeVisible();
  assert.equal(await actor.page.evaluate(()=>(window as any).__qaPracticeMeter===document.querySelector('.practice-meter-x i')),true,'Responsive layout preserves the actual indicator node');
  const retained=await get(actor.page,'practice/'+current.id);assert.equal(retained.id,current.id);assert.equal(retained.stateVersion,current.stateVersion);assert.deepEqual(retained.state,current.state,'Responsive layout preserves the authoritative session, phase and progress');
  assert.equal(initialResets.length,1,'Resizing cannot reset the practice session');
 }
 const firstStop=actor.page.waitForResponse(response=>response.url().endsWith('/api/platform/practice')&&response.request().method()==='POST'&&response.request().postDataJSON().type==='horizontal');
 await actor.page.getByRole('button',{name:'Stop de richting',exact:true}).click();const firstResponse=await firstStop,firstReceipt=await firstResponse.json();assert.equal(firstResponse.status(),200,'The initial native stop belongs to the current open session');assert.equal(firstReceipt.id,current.id);assert.equal(firstReceipt.state.phase,'vertical');
 observeInitialResets=false;await actor.page.unroute('**/api/platform/practice',startupRoute);
 for(let dart=0;dart<5;dart++){
  if(dart>0)await actor.page.getByRole('button',{name:'Stop de richting',exact:true}).click();await actor.page.getByRole('button',{name:'Stop de hoogte en gooi',exact:true}).click();
  if(dart<4){await actor.page.getByRole('button',{name:'Volgende pijl',exact:true}).click();}else await actor.page.getByRole('heading',{name:'Jij hebt het ritme.'}).waitFor();
 }
 let boot=await get(actor.page,'bootstrap');assert.equal(boot.practice.dartsThrown,5);assert.equal(boot.practice.tutorialCompleted,true);assert.equal(boot.players.find((p:any)=>p.id===actor.id).rating,1500);assert.equal(boot.players.find((p:any)=>p.id===actor.id).rankedPlayed,0);
 await actor.page.reload();boot=await get(actor.page,'bootstrap');assert.equal(boot.practice.dartsThrown,5);assert.ok(boot.badges.find((b:any)=>b.badge==='practice:first-flight'));
 await actor.page.screenshot({path:'artifacts/practice-desktop.png',fullPage:true});await actor.page.setViewportSize({width:390,height:844});await actor.page.screenshot({path:'artifacts/practice-mobile.png',fullPage:true});
 const forged=await actor.page.request.post(origin+'/api/platform/practice',{data:{type:'vertical',commandId:crypto.randomUUID(),x:0,y:0,score:180}});assert.equal(forged.status(),400);
 await writeFile('artifacts/practice-result.json',JSON.stringify({ok:true,authenticated:true,serverFiveDarts:true,accountProgressAfterReload:true,earnedBadge:true,noElo:true,forgedScoreRejected:true,oneInitialReset:true,responsiveSessionRetained:true,responsiveIndicatorNodeRetained:true,initialNativeStopAccepted:true,initialResetTransportDelayMs:400},null,2));console.log('One practice mount across responsive layouts, five real server darts, persistent tutorial/badge and no Elo passed');
}finally{await browser.close();}
