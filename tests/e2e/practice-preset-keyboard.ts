import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium,expect} from '@playwright/test';
import {login,get,post,origin} from './helpers';

// This regression owns one disposable local actor. It must never use reserved
// staging sessions or delete any existing player/session during cleanup.
assert.equal(process.env.APP_ENV,'development');
for(const value of [origin,process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.DATABASE_URL!,process.env.MIGRATION_DATABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
const directory='artifacts/practice-preset-keyboard';
const report={ok:false,physicalHardwareTested:false,presetNativeSpaceTrusted:false,presetSpaceAlreadyHandled:false,presetStoredOnce:false,presetDoesNotThrow:false,sessionUnchanged:false,ordinaryNativeSpaceTrusted:false,ordinarySpaceAccepted:false,ownedFixtureRemoved:false,browserClosed:false,primaryFailure:false,cleanupFailure:false};
const browser=await chromium.launch({headless:true}),privileged=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
let actor:Awaited<ReturnType<typeof login>>|undefined,sessionId:string|undefined;
const practiceCommands:{type:string}[]=[],chatRequests:string[]=[],responses:Promise<void>[]=[];
try{
 actor=await login(browser,'PresetQA');const page=actor.page;page.setDefaultTimeout(15000);
 const room=(await get(page,'bootstrap')).rooms.find((value:any)=>value.name==='Nederland 1');assert.ok(room);await post(page,'room',{roomId:room.id});
 await page.addInitScript(()=>{
  (window as any).__practiceSpaceEvents=[];
  window.addEventListener('keydown',event=>{if(event.code==='Space')(window as any).__practiceSpaceEvents.push({trusted:event.isTrusted,defaultPrevented:event.defaultPrevented,targetRole:(event.target as Element)?.getAttribute('role')??null});});
 });
 page.on('request',request=>{
  if(request.method()!=='POST')return;const path=new URL(request.url()).pathname,input=request.postDataJSON();
  if(path==='/api/platform/practice'&&input.type!=='reset')practiceCommands.push({type:input.type});
  if(path==='/api/platform/chat/send')chatRequests.push(input.clientMessageId);
 });
 page.on('response',response=>{
  if(new URL(response.url()).pathname!=='/api/platform/practice'||response.request().method()!=='POST'||response.request().postDataJSON()?.type!=='reset')return;
  const completed=(async()=>{assert.equal(response.status(),200);sessionId=(await response.json()).id;})();responses.push(completed);void completed.catch(()=>{});
 });
 await page.goto(origin+'/oefenen?les=1');await page.bringToFront();
 await expect(page.getByRole('button',{name:'Stop de richting',exact:true})).toBeEnabled();await Promise.all(responses);assert.ok(sessionId);
 await page.waitForFunction(()=>{const meter=document.querySelector('.practice-meter-x i') as HTMLElement|null;return !!meter&&meter.style.left!=='50%';});
 const before=await get(page,'practice/'+sessionId);assert.equal(before.state.phase,'horizontal');assert.equal(before.state.count,0);
 const trigger=page.getByRole('button',{name:'Snelle chattekst kiezen',exact:true});await trigger.focus();await trigger.press('ArrowDown');
 const item=page.getByRole('menuitem',{name:'Succes! 🎯',exact:true});await expect(item).toBeFocused();
 const chatResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/platform/chat/send'&&response.request().method()==='POST');
 await item.press('Space');const sent=await chatResponse;assert.equal(sent.status(),200);const saved=await sent.json();assert.equal(saved.body,'Succes! 🎯');
 await expect(page.locator('.chat-presets-menu')).toBeHidden();
 const events=await page.evaluate(()=>(window as any).__practiceSpaceEvents);assert.equal(events.length,1);assert.equal(events[0].trusted,true);assert.equal(events[0].targetRole,'menuitem');assert.equal(events[0].defaultPrevented,true);report.presetNativeSpaceTrusted=true;report.presetSpaceAlreadyHandled=true;
 assert.equal(chatRequests.length,1);assert.equal(chatRequests[0],saved.client_message_id);report.presetStoredOnce=true;
 assert.equal(practiceCommands.length,0,'Selecting a preset with native Space sends no practice command');report.presetDoesNotThrow=true;
 const unchanged=await get(page,'practice/'+sessionId);assert.equal(unchanged.stateVersion,before.stateVersion);assert.deepEqual(unchanged.state,before.state);report.sessionUnchanged=true;
 // Restore ordinary play focus through a real non-interactive page click.
 // Existing render-sample timing tests separately retain the 50 ms/1 px gates.
 await page.locator('.practice-heading h1').click();assert.equal(await page.evaluate(()=>document.activeElement===document.body),true);
 await page.waitForFunction(()=>{const e=document.querySelector('.practice-meter-x i') as HTMLElement|null,w=window as any;if(!e)return false;const fraction=e.style.left,previous=w.__practicePreviousFraction;w.__practicePreviousFraction=fraction;return previous!==undefined&&fraction!==previous;},{},{polling:'raf'});
 const stopResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/platform/practice'&&response.request().method()==='POST'&&response.request().postDataJSON()?.type==='horizontal');
 await page.keyboard.press('Space');const stopped=await stopResponse;assert.equal(stopped.status(),200);const receipt=await stopped.json();
 assert.equal(receipt.id,sessionId);assert.equal(receipt.stateVersion,before.stateVersion+1);assert.equal(receipt.state.phase,'vertical');assert.equal(practiceCommands.length,1);assert.equal(practiceCommands[0].type,'horizontal');report.ordinarySpaceAccepted=true;
 const allEvents=await page.evaluate(()=>(window as any).__practiceSpaceEvents);assert.equal(allEvents.length,2);assert.equal(allEvents[1].trusted,true);report.ordinaryNativeSpaceTrusted=true;
 report.ok=true;
}catch(error){report.primaryFailure=true;throw error;}finally{
 let cleanupError:unknown;
 try{await browser.close();report.browserClosed=true;}catch(error){cleanupError=error;}
 try{
  if(actor){const client=await privileged.connect();try{
   await client.query('begin');const own=await client.query('select u.email,p.username from auth.users u join profiles p on p.id=u.id where u.id=$1 for update of p',[actor.id]);
   assert.equal(own.rowCount,1);assert.equal(own.rows[0].email,actor.email.toLowerCase());assert.equal(own.rows[0].username,actor.name);assert.ok(actor.email.endsWith('@dartspoint.local'));
   assert.equal((await client.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount,0);
   await client.query('delete from notifications where user_id=$1',[actor.id]);await client.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=$1)',[actor.id]);await client.query('delete from private.outbox_events where user_id=$1',[actor.id]);await client.query('delete from private.audit_events where actor_id=$1',[actor.id]);
   await client.query('delete from private.command_ingress where actor_id=$1',[actor.id]);await client.query('delete from private.practice_commands where user_id=$1',[actor.id]);await client.query('delete from practice_results where user_id=$1',[actor.id]);await client.query('delete from practice_sessions where user_id=$1',[actor.id]);await client.query('delete from practice_progress where user_id=$1',[actor.id]);await client.query('delete from user_badges where user_id=$1',[actor.id]);
   await client.query('delete from chat_messages where sender_id=$1 or actor_id=$1',[actor.id]);await client.query('delete from chat_preferences where user_id=$1',[actor.id]);await client.query('delete from channel_memberships where user_id=$1',[actor.id]);await client.query('delete from private.room_visits where user_id=$1',[actor.id]);await client.query('delete from room_memberships where user_id=$1',[actor.id]);
   await client.query('delete from private.profile_private where user_id=$1',[actor.id]);await client.query('delete from preferences where user_id=$1',[actor.id]);await client.query('delete from player_ratings where user_id=$1',[actor.id]);await client.query('delete from profiles where id=$1',[actor.id]);await client.query('delete from auth.users where id=$1',[actor.id]);await client.query('commit');
   assert.equal((await client.query('select count(*)::int n from profiles where id=$1',[actor.id])).rows[0].n,0);report.ownedFixtureRemoved=true;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}}
 }catch(error){cleanupError??=error;}
 if(cleanupError){report.ok=false;report.cleanupFailure=true;}
 await privileged.end();await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/results.json',JSON.stringify(report,null,2),{mode:0o600});
 if(cleanupError){if(report.primaryFailure)console.error(JSON.stringify({event:'practice_preset_cleanup_failed',primaryFailurePreserved:true}));else throw cleanupError;}
}
console.log('Native preset Space stores one chat without stopping practice; ordinary Space still stops once; owned fixture removed');
