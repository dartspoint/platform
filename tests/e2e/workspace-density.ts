import assert from 'node:assert/strict';
import {chromium,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {authAdmin,actorById,type Actor} from '../../packages/data/src/auth';
import {db,redis} from '../../packages/data/src/db';
import {onboard,joinRoom,social,privateChannel,sendMessage} from '../../packages/data/src/community';
import {usernameSchema} from '../../packages/contracts/src/index';
import {login,post,get,origin} from './helpers';

// This creates actual owned Auth/DB fixtures, after the latency suite, locally only.
assert.equal(process.env.APP_ENV,'development');
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
const browser=await chromium.launch(),privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const prefix='Dense'+randomUUID().replaceAll('-','').slice(0,7),room=randomUUID(),channel=randomUUID(),owned:string[]=[],channelIds:string[]=[channel];
const peers:Array<{actor:Actor;name:string}>=[],directory='artifacts/workspace-density';
const report:{ok:boolean;physicalDevices:boolean;fixture:Record<string,unknown>;desktop:unknown[];mobile:unknown[];zoom:unknown[];menus:unknown[];checks:Record<string,boolean>}={ok:false,physicalDevices:false,fixture:{players:21,friends:20,privateTabs:8,maximumValidUsernameLength:20,source:'Real local Auth users, persisted profiles, domain joins/friendships/private channels and native built application',zoomMethod:'HTML CSS zoom=2; physical browser CtrlPlus and physical phones are unmeasured'},desktop:[],mobile:[],zoom:[],menus:[],checks:{}};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const layerState=(page:Page)=>page.evaluate(()=>({sheets:[...document.querySelectorAll('.dp-social-sheet')].map(e=>({state:e.getAttribute('data-state'),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})),menus:document.querySelectorAll('[role="menu"]').length,focus:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')??null,className:document.activeElement?.className??null,connected:document.activeElement?.isConnected??false}}));
async function friendMenu(page:Page,scope:string,name:string){
 const trigger=page.locator(scope).getByRole('button',{name:'Acties voor '+name,exact:true});await trigger.scrollIntoViewIfNeeded();await trigger.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('menuitem',{name:'Profiel bekijken',exact:true})).toBeVisible();
 const menu=await page.getByRole('menu').boundingBox(),viewport=page.viewportSize()!;
 const trace:{scope:string;name:string;menu:unknown;viewport:unknown;beforeEscape:unknown;lastAction?:unknown;afterEscape?:unknown;triggerPresentAfterEscape?:number}={scope,name,menu,viewport,beforeEscape:await layerState(page)};report.menus.push(trace);
 assert.ok(menu&&menu.x>=-1&&menu.y>=-1&&menu.x+menu.width<=viewport.width+1&&menu.y+menu.height<=viewport.height+1,'A maximum-length name menu fits the viewport: '+JSON.stringify(trace));
 const last=page.locator('[role="menuitem"]:not([data-disabled]):not([aria-disabled="true"])').last();
 const menuScroll=()=>page.getByRole('menu').evaluate(element=>({scrollTop:element.scrollTop,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,overflowY:getComputedStyle(element).overflowY,documentScroll:{x:scrollX,y:scrollY}}));
 const beforeEnd=await menuScroll();await page.keyboard.press('End');await pause(50);
 const afterEnd=await menuScroll(),lastBox=await last.boundingBox(),lastFocus=await last.evaluate(element=>({focused:document.activeElement===element,connected:element.isConnected,label:element.textContent?.trim()}));trace.lastAction={beforeEnd,afterEnd,box:lastBox,focus:lastFocus,layers:await layerState(page)};
 assert.ok(lastFocus.focused&&lastFocus.connected,'End focuses the actual last enabled menu action: '+JSON.stringify(trace.lastAction));
 assert.ok(lastBox&&lastBox.x>=-1&&lastBox.y>=-1&&lastBox.x+lastBox.width<=viewport.width+1&&lastBox.y+lastBox.height<=viewport.height+1,'The last enabled menu action remains reachable inside the viewport: '+JSON.stringify(trace.lastAction));
 if(afterEnd.scrollHeight>afterEnd.clientHeight+1){assert.ok(['auto','scroll'].includes(afterEnd.overflowY));assert.ok(afterEnd.scrollTop>beforeEnd.scrollTop,'Keyboard End scrolls overflowing actions inside their menu');}
 assert.deepEqual(afterEnd.documentScroll,beforeEnd.documentScroll,'Keyboard menu scrolling does not move the outer document');report.checks.lastEnabledMenuActionKeyboardReachable=true;
 await page.keyboard.press('Escape');await pause(50);trace.afterEscape=await layerState(page);trace.triggerPresentAfterEscape=await trigger.count();await expect(trigger).toBeFocused();report.checks.keyboardMenuFocusRestored=true;
}
async function composerReachable(page:Page,label:string){
 await expect(page.locator('.chat-panel')).toHaveCount(1);await expect(page.locator('.chat-compose')).toHaveCount(1);
 const geometry=await page.evaluate(()=>{const element=document.querySelector('.chat-compose')!,r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth};});
 if(label==='200% native workspace zoom')report.zoom.push({cssZoom:2,geometry});
 assert.ok(geometry.scrollWidth<=geometry.viewport.width+1,label+' has no document horizontal overflow: '+JSON.stringify(geometry));
 assert.ok(geometry.x>=-1&&geometry.right<=geometry.viewport.width+1&&geometry.y>=-1&&geometry.bottom<=geometry.viewport.height+1,label+' composer is visible and reachable: '+JSON.stringify(geometry));
 const input=page.locator('.chat-compose input');await expect(input).toBeEnabled();await input.focus();await expect(input).toBeFocused();return geometry;
}
async function internalScroll(page:Page,selector:string,label:string){
 const before=await page.evaluate(()=>({x:scrollX,y:scrollY}));
 const scroll=await page.locator(selector).evaluate(element=>{const e=element as HTMLElement;const initial=e.scrollTop;e.scrollTop=0;const top=e.scrollTop;e.scrollTop=e.scrollHeight;return {initial,top,end:e.scrollTop,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflowY:getComputedStyle(e).overflowY};});
 assert.ok(scroll.scrollHeight>scroll.clientHeight+1,label+' contains a genuinely scrollable dense list');assert.ok(scroll.end>scroll.top,label+' scrolls inside its own panel');assert.ok(['auto','scroll'].includes(scroll.overflowY));
 assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),before,label+' does not move the outer document');return scroll;
}
async function tabKeyboard(page:Page){
 const lastId=(await page.locator('.chat-private-tab').last().getAttribute('data-chat-tab'))!.slice('private:'.length),peer=peers[channelIds.indexOf(lastId)-1];assert.ok(peer);
 const tab=page.locator('[data-chat-tab="room"]');await tab.focus();await page.keyboard.press('End');
 const last=page.locator('[data-chat-tab="private:'+lastId+'"]');await expect(last).toBeFocused();await expect(last).toHaveAttribute('data-state','active');
 await expect(page.locator('.chat-compose input')).toHaveAttribute('aria-label','Privébericht aan '+peer.name);
 const tabs=await page.locator('.chat-tabs').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft,overflowX:getComputedStyle(e).overflowX}));
 assert.ok(tabs.scrollWidth>tabs.width,'Eight real maximum-name private tabs overflow inside the tab strip');assert.ok(tabs.scrollLeft>0,'Keyboard navigation scrolls the last private tab into view');assert.ok(['auto','scroll'].includes(tabs.overflowX));
 await last.press('Home');await expect(tab).toBeFocused();await expect(tab).toHaveAttribute('data-state','active');return tabs;
}
try{
 await mkdir(directory,{recursive:true});const main=await login(browser,'Density');owned.push(main.id);main.page.setDefaultTimeout(15000);
 const actor=await actorById(main.id,Date.now()+3600000);
 await db().query("insert into community_rooms(id,name,slug,description,capacity,min_rating,max_rating) values($1,$2,$2,'Owned dense workspace acceptance',50,0,4000)",[room,prefix]);await db().query("insert into channels(id,kind,room_id) values($1,'community',$2)",[channel,room]);
 for(let i=0;i<20;i++){
  const name=prefix+'_'+String(i).padStart(7,'0');assert.equal(name.length,20);assert.equal(usernameSchema.parse(name),name);assert.equal(usernameSchema.safeParse(name+'X').success,false);
  const user=await authAdmin().auth.admin.createUser({email:prefix+'-'+i+'@dartspoint.local',email_confirm:true});assert.equal(user.error,null);const id=user.data.user!.id;owned.push(id);
  await onboard(await actorById(id,Date.now()+3600000,false),{username:name});const peer=await actorById(id,Date.now()+3600000);peers.push({actor:peer,name});
  await joinRoom(peer,{roomId:room});await social(actor,{action:'request',targetId:id});await social(peer,{action:'accept',targetId:main.id});
 }
 await post(main.page,'room',{roomId:room});
 // Fixture-only long leases keep actual peer memberships current while this
 // non-performance geometry suite traverses several screens; the browser uses
 // the unmodified API, selectors, live store and all normal access checks.
 await privileged.query("update room_memberships set lease_until=now()+interval '15 minutes' where user_id=any($1::uuid[])",[owned]);
 for(let i=0;i<8;i++)channelIds.push((await privateChannel(actor,{targetId:peers[i].actor.id})).channelId);
 // A dense history uses real human rows; transient join notices do not fill it.
 for(let i=0;i<peers.length;i++)await sendMessage(peers[i].actor,{channelId:channel,clientMessageId:randomUUID(),body:'Dichte kamer, echt opgeslagen bericht '+i});
 const state=await get(main.page,'bootstrap');assert.equal(state.social.friends.length,20);assert.equal(state.players.filter((p:any)=>p.presence.roomId===room&&p.presence.online).length,21);assert.equal(state.channels.filter((c:any)=>c.kind==='private'&&!c.closed).length,8);report.checks.realServerFixtures=true;
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){
  await main.page.setViewportSize({width,height});await main.page.goto(origin+'/spelen');await main.page.locator('.dp-desktop-community').waitFor();
  await expect(main.page.locator('.dp-desktop-players tbody tr')).toHaveCount(21);await expect(main.page.locator('.dp-desktop-friends .friend-row')).toHaveCount(20);await expect(main.page.locator('.chat-private-tab-wrap')).toHaveCount(8);await main.page.getByText('Dichte kamer, echt opgeslagen bericht '+(peers.length-1),{exact:true}).waitFor();
  const geometry=await main.page.evaluate(()=>{const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {left:box('.dp-workspace>main'),right:box('.dp-desktop-community'),top:box('.dp-desktop-community-top'),players:box('.dp-desktop-players'),friends:box('.dp-desktop-friends'),chat:box('.dp-desktop-chat')};});
  assert.ok(Math.abs(geometry.left.width-geometry.right.width)<2,'Dense workspace preserves 50/50 columns');assert.ok(Math.abs(geometry.players.width-geometry.friends.width)<2,'Dense upper-right panels preserve 50/50 columns');assert.ok(Math.abs(geometry.top.height-geometry.chat.height)<2,'Dense right side preserves 50/50 rows');
  const composer=await composerReachable(main.page,width+' dense desktop');
  const players=await internalScroll(main.page,'.dp-desktop-players [data-slot="table-container"]','Room members'),friends=await internalScroll(main.page,'.dp-desktop-friends .friends-scroll','Friends'),chat=await internalScroll(main.page,'.chat-messages','Chat history');
  await friendMenu(main.page,'.dp-desktop-friends',peers[19].name);const tabs=await tabKeyboard(main.page);
  const names=await main.page.locator('.dp-desktop-friends .dp-player-name-text').allTextContents();assert.deepEqual(new Set(names),new Set(peers.map(peer=>peer.name)),'All twenty actual maximum-length names are displayed');
  const privateKeys=await main.page.locator('.chat-private-tab').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-chat-tab')!.slice('private:'.length)));assert.deepEqual(new Set(privateKeys),new Set(channelIds.slice(1)),'All eight actual canonical private channels appear exactly once');
  report.desktop.push({width,height,geometry,composer,scroll:{players,friends,chat},tabs});await main.page.screenshot({path:directory+'/desktop-'+width+'.png'});
 }
 report.checks.denseDesktopGeometryAndInternalScroll=true;report.checks.eightPrivateTabsKeyboardReachable=true;
 for(const [width,height] of [[320,568],[390,844],[390,400]]){
  await main.page.setViewportSize({width,height});await main.page.goto(origin+'/spelen');await main.page.getByLabel('Chatbericht',{exact:true}).waitFor();await expect(main.page.locator('.dp-desktop-community')).toHaveCount(0);await expect(main.page.locator('.chat-private-tab-wrap')).toHaveCount(8);
  const composer=await composerReachable(main.page,width+'×'+height+' dense mobile'),tabs=await tabKeyboard(main.page),mobile:{width:number;height:number;composer:unknown;tabs:unknown;friends?:unknown;secondEscape?:unknown;keyboardSizedViewport:boolean;completed:boolean}={width,height,composer,tabs,keyboardSizedViewport:height===400,completed:false};report.mobile.push(mobile);
  await main.page.locator('.dp-play-nav').getByRole('button',{name:'Meer',exact:true}).click();await main.page.locator('.dp-profile-menu').getByRole('button',{name:'Vrienden',exact:true}).click();await expect(main.page.locator('.dp-social-sheet .friend-row')).toHaveCount(20);
  mobile.friends=await internalScroll(main.page,'.dp-social-sheet .friends-scroll','Mobile friends');await friendMenu(main.page,'.dp-social-sheet',peers[19].name);
  if(width===320){
   const second:{before:unknown;afterKey?:unknown;afterDismiss?:Awaited<ReturnType<typeof layerState>>}={before:await layerState(main.page)};mobile.secondEscape=second;
   await main.page.keyboard.press('Escape');await pause(50);second.afterKey=await layerState(main.page);await expect(main.page.locator('.dp-social-sheet')).toHaveCount(0);second.afterDismiss=await layerState(main.page);
   assert.equal(second.afterDismiss.focus.connected,true);assert.notEqual(second.afterDismiss.focus.tag,'BODY','Second Escape leaves focus on a live navigation control');await expect(main.page.locator('.dp-play-nav button').first()).toBeFocused();report.checks.nestedMenuAndParentEscapeDistinct=true;
  }else await main.page.getByRole('button',{name:'Paneel sluiten',exact:true}).click();
  await composerReachable(main.page,'Mobile after keyboard menu close');mobile.completed=true;
  await main.page.screenshot({path:directory+'/mobile-'+width+'x'+height+'.png'});
 }
 report.checks.denseMobile320And390AndReducedHeight=true;
 // A genuine 200% CSS zoom on the native workspace, without patching product
 // dimensions or substituting a client store, must retain usable controls.
 await main.page.setViewportSize({width:1366,height:768});await main.page.goto(origin+'/spelen');await main.page.getByLabel('Chatbericht',{exact:true}).waitFor();
 await main.page.evaluate(()=>{document.documentElement.style.zoom='2';dispatchEvent(new Event('resize'));});await pause(100);
 await composerReachable(main.page,'200% native workspace zoom');await tabKeyboard(main.page);await friendMenu(main.page,'.dp-desktop-friends',peers[19].name);
 await main.page.screenshot({path:directory+'/native-workspace-zoom-200.png'});await main.page.evaluate(()=>{document.documentElement.style.removeProperty('zoom');dispatchEvent(new Event('resize'));});report.checks.nativeWorkspaceZoom200Reachable=true;
 report.checks.singleChatAndComposerNoDocumentOverflow=true;report.ok=true;
}finally{
 // Closing pages first stops polling, heartbeats and pending draft writes.
 await browser.close();const client=await privileged.connect();try{
  await client.query('begin');await client.query('delete from notifications where user_id=any($1::uuid[])',[owned]);
  await client.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=any($1::uuid[]))',[owned]);await client.query('delete from private.outbox_events where user_id=any($1::uuid[])',[owned]);
  await client.query('delete from private.audit_events where actor_id=any($1::uuid[])',[owned]);
  await client.query('delete from chat_messages where channel_id=any($1::uuid[])',[channelIds]);await client.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channelIds]);await client.query('delete from channel_memberships where user_id=any($1::uuid[]) or channel_id=any($2::uuid[])',[owned,channelIds]);await client.query('delete from channels where id=any($1::uuid[])',[channelIds]);
  await client.query('delete from private.room_visits where user_id=any($1::uuid[])',[owned]);await client.query('delete from room_memberships where user_id=any($1::uuid[])',[owned]);await client.query('delete from community_rooms where id=$1',[room]);
  await client.query('delete from friend_requests where sender_id=any($1::uuid[]) or recipient_id=any($1::uuid[])',[owned]);await client.query('delete from friendships where user_low=any($1::uuid[]) or user_high=any($1::uuid[])',[owned]);
  await client.query('delete from private.profile_private where user_id=any($1::uuid[])',[owned]);await client.query('delete from preferences where user_id=any($1::uuid[])',[owned]);await client.query('delete from player_ratings where user_id=any($1::uuid[])',[owned]);await client.query('delete from profiles where id=any($1::uuid[])',[owned]);await client.query('delete from auth.users where id=any($1::uuid[])',[owned]);await client.query('commit');
  assert.equal((await client.query('select count(*)::int n from profiles where id=any($1::uuid[])',[owned])).rows[0].n,0);report.checks.ownedAuthAndDatabaseFixturesRemoved=true;
 }catch(error){report.ok=false;await client.query('rollback');throw error;}finally{client.release();await privileged.end();await db().end();await(await redis()).quit();await mkdir(directory,{recursive:true});await writeFile(directory+'/results.json',JSON.stringify(report,null,2));}
}
console.log('Actual dense workspace: 21 room members, 20 maximum-name friends, eight private tabs, native 200% zoom and mobile reachability passed');
