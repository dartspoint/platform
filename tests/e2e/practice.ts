import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {login,get,origin} from './helpers';
const browser=await chromium.launch();
try{
 const guest=await browser.newPage();await guest.goto(origin+'/oefenen');assert.ok(guest.url().includes('/inloggen'));await guest.close();
 const actor=await login(browser,'Practice');actor.page.on('response',async r=>{if(r.url().includes('/api/platform/practice')&&!r.ok())console.log('Practice API rejected',r.status(),(await r.json()).code);});await actor.page.goto(origin+'/oefenen?les=1');
 for(let dart=0;dart<5;dart++){
  await actor.page.getByRole('button',{name:'Stop de richting',exact:true}).click();await actor.page.getByRole('button',{name:'Stop de hoogte en gooi',exact:true}).click();
  if(dart<4){await actor.page.getByRole('button',{name:'Volgende pijl',exact:true}).click();}else await actor.page.getByRole('heading',{name:'Jij hebt het ritme.'}).waitFor();
 }
 let boot=await get(actor.page,'bootstrap');assert.equal(boot.practice.dartsThrown,5);assert.equal(boot.practice.tutorialCompleted,true);assert.equal(boot.players.find((p:any)=>p.id===actor.id).rating,1500);assert.equal(boot.players.find((p:any)=>p.id===actor.id).rankedPlayed,0);
 await actor.page.reload();boot=await get(actor.page,'bootstrap');assert.equal(boot.practice.dartsThrown,5);assert.ok(boot.badges.find((b:any)=>b.badge==='practice:first-flight'));
 await actor.page.screenshot({path:'artifacts/practice-desktop.png',fullPage:true});await actor.page.setViewportSize({width:390,height:844});await actor.page.screenshot({path:'artifacts/practice-mobile.png',fullPage:true});
 const forged=await actor.page.request.post(origin+'/api/platform/practice',{data:{type:'vertical',commandId:crypto.randomUUID(),x:0,y:0,score:180}});assert.equal(forged.status(),400);
 await writeFile('artifacts/practice-result.json',JSON.stringify({ok:true,authenticated:true,serverFiveDarts:true,accountProgressAfterReload:true,earnedBadge:true,noElo:true,forgedScoreRejected:true},null,2));console.log('Five real server practice darts, persistent tutorial/badge and no Elo passed');
}finally{await browser.close();}
