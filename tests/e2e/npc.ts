import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {Pool} from 'pg';
import {authAdmin} from '../../packages/data/src/auth';
import {postgresOptions} from '../../packages/data/src/postgres';
assert.equal(process.env.APP_ENV,'development');
const control=new Pool(postgresOptions(process.env.MIGRATION_DATABASE_URL!)),auth=authAdmin(),browser=await chromium.launch(),checks:Record<string,boolean>={};
const origin=process.env.E2E_ORIGIN??'http://127.0.0.1:4300';assert.equal(new URL(origin).hostname,'127.0.0.1');
const dir='artifacts/npc-browser';await mkdir(dir,{recursive:true});
async function fixture(role:'owner'|'admin'|'player'){
 const email='npc-ui-'+randomUUID()+'@dartspoint.local',password=randomUUID()+randomUUID();const created=await auth.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);const id=created.data.user!.id;
 const login=await authAdmin().auth.signInWithPassword({email,password});assert.equal(login.error,null);const session=login.data.session!,claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
 // An isolated application DB uses the same owned local Auth provider, with only these new fixtures mirrored.
 await control.query('insert into auth.users(id,email) values($1,$2) on conflict do nothing',[id,email]);await control.query('update profiles set username=$2,onboarded_at=now() where id=$1',[id,'NpcUI'+randomUUID().replaceAll('-','').slice(0,8)]);await control.query('insert into player_ratings(user_id) values($1) on conflict do nothing',[id]);await control.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict do nothing',[claims.session_id,id]);
 if(role!=='player')await control.query('insert into user_roles(user_id,role,granted_by) values($1,$2,$1)',[id,role]);
 const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addInitScript('globalThis.__name = (fn) => fn;');const cookieName='sb-'+new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]+'-auth-token',encoded='base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),pieces=encoded.match(/.{1,3180}/g)!;await context.addCookies(pieces.map((value,index)=>({name:cookieName+(pieces.length>1?'.'+index:''),value,url:origin,sameSite:'Lax' as const})));const page=await context.newPage();return {id,page,context,token:session.access_token};
}
try{
 const owner=await fixture('owner'),admin=await fixture('admin'),player=await fixture('player');
 for(const who of [admin,player])for(const path of ['admin/npc','admin/integrations/openai']){const result=await who.context.request.get(origin+'/api/platform/'+path,{headers:{Authorization:'Bearer '+who.token}});assert.equal(result.status(),403);}
 const anon=await browser.newContext();assert.equal((await anon.request.get(origin+'/api/platform/admin/npc')).status(),401);await anon.close();checks.directHttpReadRights=true;
 for(const who of [admin,player])for(const path of ['admin/npc',...['save','rotate','test','delete'].map(a=>'admin/integrations/openai/'+a)]){const result=await who.context.request.post(origin+'/api/platform/'+path,{headers:{Authorization:'Bearer '+who.token,Origin:origin},data:{}});assert.equal(result.status(),403);}
 checks.directHttpWriteRights=true;
 const errors:string[]=[];owner.page.on('pageerror',e=>errors.push(e.message));await owner.page.goto(origin+'/beheer?tab=npc');await expect(owner.page.getByRole('heading',{name:'AI-clubspelers',exact:true})).toBeVisible();await expect(owner.page.getByRole('heading',{name:'De clubregisseur'})).toBeVisible();
 await owner.page.getByRole('button',{name:'Karakters',exact:true}).click();await expect(owner.page.locator('.npc-roster button')).toHaveCount(25);await owner.page.getByRole('button',{name:/BoardwalkBas/}).click();await expect(owner.page.getByLabel('Gespreksstijl')).toBeVisible();const style=owner.page.getByLabel('Gespreksstijl');await style.fill('Mijn bewaarde conceptstijl');await owner.page.waitForTimeout(11000);await expect(style).toHaveValue('Mijn bewaarde conceptstijl');checks.charactersAndDirtyPolling=true;
 await owner.page.getByRole('button',{name:'Annuleren',exact:true}).click();await owner.page.goto(origin+'/beheer?tab=platform#openai');await expect(owner.page.getByRole('heading',{name:'OpenAI & AI-clubspelers'})).toBeVisible();const key=owner.page.getByLabel('Nieuwe API-sleutel');await expect(key).toHaveValue('');await key.fill('sk-fictitious-unsaved-browser-draft');await owner.page.waitForTimeout(4000);await expect(key).toHaveValue('sk-fictitious-unsaved-browser-draft');await key.fill('');checks.writeOnlyKeyDraft=true;
 await owner.page.screenshot({path:dir+'/openai-desktop.png',fullPage:true});await owner.page.goto(origin+'/beheer?tab=npc');await owner.page.setViewportSize({width:390,height:844});await expect(owner.page.getByRole('heading',{name:'De clubregisseur'})).toBeVisible();await owner.page.screenshot({path:dir+'/npc-mobile.png',fullPage:true});const overflow=await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);checks.mobileNoOverflow=true;assert.deepEqual(errors,[]);checks.noBrowserErrors=true;
 await writeFile(dir+'/result.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
}finally{await browser.close();await control.end();}
