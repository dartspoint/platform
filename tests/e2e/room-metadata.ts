import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {login,get,post,origin} from './helpers';
import {db,redis} from '../../packages/data/src/db';
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(origin).hostname,'127.0.0.1');
process.umask(0o077);
await mkdir('artifacts/i18n',{recursive:true});
const control=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),browser=await chromium.launch(),roomIds:string[]=[];let actorId:string|undefined;
try{
 const staff=await login(browser,'FlagUI');actorId=staff.id;await db().query("insert into user_roles(user_id,role,granted_by) values($1,'admin',$1)",[staff.id]);
 const suffix=randomUUID().slice(0,6),base={subtitle:'Owned local UI fixture',capacity:10,category:'social',status:'active',rules:'Owned local UI fixture',minRating:0,maxRating:5000,moderatorIds:[]};
 const name='Scotland UI '+suffix,world='World UI '+suffix;
 for(const value of [{...base,name,region:'GB-SCT',primaryLanguage:'nl'},{...base,name:world,region:'international',primaryLanguage:'multilingual'}]){const room=await post(staff.page,'admin',{action:'room-save',args:[value]});roomIds.push(room.id);}
 await post(staff.page,'preferences',{locale:'en'});await staff.page.goto(origin+'/lobby');
 const country=staff.page.getByRole('combobox',{name:'Country or region',exact:true}),language=staff.page.getByRole('combobox',{name:'Room language',exact:true});await country.waitFor();
 await expect(staff.page.getByRole('heading',{name,exact:true})).toBeVisible();assert.equal(await country.inputValue(),'');
 await country.selectOption('GB-SCT');await expect(staff.page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(staff.page.getByRole('heading',{name:world,exact:true})).toHaveCount(0);
 await expect(staff.page.getByRole('img',{name:'Scotland',exact:true})).toBeVisible();
 await language.selectOption('en');await expect(staff.page.getByRole('heading',{name,exact:true})).toHaveCount(0);
 await language.selectOption('nl');await expect(staff.page.getByRole('heading',{name,exact:true})).toBeVisible();
 await staff.page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await country.inputValue(),'');assert.equal(await language.inputValue(),'');await expect(staff.page.getByRole('heading',{name:world,exact:true})).toBeVisible();
 await country.selectOption('international');await language.selectOption('multilingual');await expect(staff.page.getByRole('heading',{name:world,exact:true})).toBeVisible();await expect(staff.page.getByRole('heading',{name,exact:true})).toHaveCount(0);
 await staff.page.setViewportSize({width:390,height:844});assert.equal(await staff.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await staff.page.screenshot({path:'artifacts/i18n/room-filter-mobile.png',fullPage:true});
 const state=await get(staff.page,'bootstrap');assert.equal(state.rooms.find((r:any)=>r.id===roomIds[0]).region,'GB-SCT');assert.equal(state.rooms.find((r:any)=>r.id===roomIds[0]).primaryLanguage,'nl');
 await writeFile('artifacts/i18n/room-ui-result.json',JSON.stringify({ok:true,actualPersistedMetadata:true,subdivisionFlag:true,independentLanguage:true,combinedFilters:true,reset:true,international:true,mobile390NoOverflow:true},null,2));console.log('Actual room flags, independent language, combined filters/reset and mobile rendering passed');
}finally{await browser.close();for(const id of roomIds){await control.query('delete from chat_preferences where channel_id in(select id from channels where room_id=$1)',[id]);await control.query('delete from channel_memberships where channel_id in(select id from channels where room_id=$1)',[id]);await control.query('delete from channels where room_id=$1',[id]);await control.query('delete from community_rooms where id=$1',[id]);}if(actorId){await control.query("update user_roles set revoked_at=now() where user_id=$1 and role='admin'",[actorId]);await control.query('delete from room_memberships where user_id=$1',[actorId]);}await db().end();await(await redis()).quit();await control.end();}
