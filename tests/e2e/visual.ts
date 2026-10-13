import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServerClient} from '@supabase/ssr';
import {authAdmin} from '../../packages/data/src/auth';
import {db} from '../../packages/data/src/db';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {origin} from './helpers';
assert.equal(process.env.APP_ENV,'development');
const browser=await chromium.launch();const errors:string[]=[];const sizes=[[320,800],[360,800],[390,844],[768,1024],[844,390],[1099,800],[1100,800],[1366,768],[1920,1080]],adminCaptures:any[]=[];
try{
 await mkdir('artifacts/native',{recursive:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of sizes){await page.setViewportSize({width,height});for(const [label,path] of [['home','/'],['login','/inloggen']]){await page.goto(origin+path,{waitUntil:"domcontentloaded"});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.screenshot({path:`artifacts/native/${label}-${width}x${height}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label} overflow ${width}`);}}
 const owner=(await db().query("select user_id from user_roles where role='owner' and revoked_at is null limit 1")).rows[0];assert.ok(owner);const user=await authAdmin().auth.admin.getUserById(owner.user_id);const link=await authAdmin().auth.admin.generateLink({type:'magiclink',email:user.data.user!.email!});assert.equal(link.error,null);
 const context=await browser.newContext({viewport:{width:1366,height:768}});let cookies:any[]=[];
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>[],setAll:values=>{cookies=values;}}});const verified=await auth.auth.verifyOtp({type:'email',token_hash:link.data.properties!.hashed_token});assert.equal(verified.error,null);
 await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,expires:c.options.maxAge?Date.now()/1000+c.options.maxAge:undefined,httpOnly:c.options.httpOnly??false,secure:false,sameSite:'Lax'})));
 const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(origin+'/beheer');await admin.getByRole('heading',{name:'Overzicht',exact:true}).waitFor();
 for(const label of ['Overzicht','Toernooien','Seizoenen & divisies','Spelers & rollen','Kamers','Moderatie','Spel & deelname','DP & competitie','Platforminstellingen','Actielogboek']){
  // A real open-case count is part of the Moderatie button's accessible name.
  const button=admin.locator('.adm-sidebar').getByRole('button',{name:new RegExp('^'+label+'(?:\\s*\\d+)?$')});assert.equal(await button.count(),1,label);await button.click();assert.equal(await admin.locator('.adm-page-title h1').count(),1);assert.equal(await admin.locator('.adm-page-title h1').textContent(),label);
  const dimensions=await admin.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));assert.ok(dimensions.scrollWidth<=dimensions.width+1,'Admin overflow '+label);
  const path='artifacts/native/admin-'+label.replace(/[^a-zA-Z]/g,'');
  if(dimensions.scrollHeight<=8192){await admin.screenshot({path:path+'.png',fullPage:true});adminCaptures.push({label,...dimensions,mode:'fullPage'});}
  else{
   // Large QA player/audit lists can exceed 65k CSS pixels. A whole-document
   // bitmap crashes this Chromium build; capture actual reachable viewports.
   const samples=[];
   for(const [position,fraction] of [['top',0],['middle',.5],['bottom',1]] as const){
    await admin.evaluate(fraction=>window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*fraction,behavior:'instant'}),fraction);await admin.waitForTimeout(100);
    const visible=await admin.evaluate(()=>({scrollY,maxScroll:document.documentElement.scrollHeight-innerHeight,scrollWidth:document.documentElement.scrollWidth,footerVisible:(document.querySelector('.adm-page-footer')?.getBoundingClientRect().bottom??Infinity)<=innerHeight+1}));assert.ok(Math.abs(visible.scrollY-visible.maxScroll*fraction)<=2,label+' reaches '+position);assert.ok(visible.scrollWidth<=dimensions.width+1,'Admin overflow '+label+' '+position);if(position==='bottom')assert.ok(visible.footerVisible,label+' footer reachable');
    await admin.screenshot({path:path+(position==='top'?'':'-'+position)+'.png',fullPage:false});samples.push({position,...visible});
   }
   adminCaptures.push({label,...dimensions,mode:'viewportSamples',samples});await admin.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  }
 }
 for(const [width,height] of sizes){await admin.setViewportSize({width,height});await admin.goto(origin+'/lobby');await admin.getByRole('heading',{name:'Jouw avond begint hier.'}).waitFor({timeout:5000}).catch(()=>{});await admin.screenshot({path:`artifacts/native/lobby-${width}x${height}.png`,fullPage:true});assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Lobby overflow '+width);}
 assert.deepEqual(errors,[]);await writeFile('artifacts/visual-result.json',JSON.stringify({ok:true,viewports:sizes,desktopMobileTablet:true,noHorizontalOverflow:true,noRuntimeErrors:true,adminPages:10,adminCaptures,screenshots:'artifacts/native',cssAssetsRetained:true},null,2));console.log('Public/login/lobby viewports and administration rendered without runtime errors or overflow');
}finally{await browser.close();await db().end();}
