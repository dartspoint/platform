import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium,type Route} from '@playwright/test';
import {cleanupOwnedOnboarding,login,get,post,origin} from './helpers';

// This fixture changes one newly-created actor's idle metadata. Never use a
// staging fixture, remote database or fake browser/server clock for it.
function checkedUrl(value:string|undefined,label:string){try{return new URL(value!);}catch{throw new Error(label+' must contain a valid local URL');}}
assert.equal(process.env.APP_ENV,'development');
assert.equal(checkedUrl(origin,'E2E_ORIGIN').protocol,'http:');
assert.equal(checkedUrl(origin,'E2E_ORIGIN').hostname,'127.0.0.1');
assert.equal(checkedUrl(process.env.DATABASE_URL,'DATABASE_URL').hostname,'127.0.0.1');
assert.equal(checkedUrl(process.env.MIGRATION_DATABASE_URL,'MIGRATION_DATABASE_URL').hostname,'127.0.0.1');
assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
const directory='artifacts/room-activity',report={ok:false,naturalQuietHeld:false,quietHeldDuringActive:false,untrustedEventIgnored:false,nativeInputTrusted:false,activeHTTPStatus:0,activeResponseOk:false,activeResponseWithinMs:0,initialIdleSeconds:0,renewedIdleSeconds:0,renewedLeaseSeconds:0,membershipStillActive:false,quietReleased:false,quietHTTPStatus:0,quietResponseOk:false,automaticQuietRelease:false,ownedFixtureRemoved:false,routeFailure:false,primaryFailure:false,cleanupFailure:false};
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function bounded<T>(value:Promise<T>,ms:number,message:string){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([value,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]);}finally{clearTimeout(timer);}}
const browser=await chromium.launch(),privileged=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
let actor:Awaited<ReturnType<typeof login>>|undefined,roomId:string|undefined,releaseQuiet:()=>void=()=>{},quietHeld=false,quietReleased=false,routeError:unknown;
const requests:{active:boolean;nodeStartedAt:number}[]=[];
try{
 actor=await login(browser,'IdleQA');assert.ok(actor.email.endsWith('@dartspoint.local'));
 const room=(await get(actor.page,'bootstrap')).rooms.find((value:any)=>value.name==='Nederland 1');assert.ok(room);roomId=room.id;
 await post(actor.page,'room',{roomId});
 // A fresh provider starts its ordinary twenty-second connectivity interval.
 // Preserve the actual native fetch; holding happens before route.continue.
 let resolveQuiet!:()=>void;const quietReady=new Promise<void>(resolve=>{resolveQuiet=resolve;});
 let resolveQuietResponse!:()=>void;const quietResponseReady=new Promise<void>(resolve=>{resolveQuietResponse=resolve;});
 const routeHeartbeat=async(route:Route)=>{
  const input=route.request().postDataJSON();assert.equal(typeof input?.active,'boolean');requests.push({active:input.active,nodeStartedAt:performance.now()});
  try{
   if(!input.active&&!quietHeld){
    quietHeld=true;report.naturalQuietHeld=true;
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const timer=setTimeout(()=>{report.automaticQuietRelease=true;release();},30000);
    releaseQuiet=()=>{quietReleased=true;clearTimeout(timer);release();};resolveQuiet();await gate;
    await route.continue();const response=await route.request().response();assert.ok(response);report.quietHTTPStatus=response.status();report.quietResponseOk=(await response.json()).ok===true;resolveQuietResponse();
   }else await route.continue();
  }catch(error){routeError=error;report.routeFailure=true;resolveQuietResponse();await route.abort().catch(()=>{});}
 };
 await actor.page.route('**/api/platform/heartbeat',routeHeartbeat);
 await actor.page.goto(origin+'/spelen');await actor.page.bringToFront();
 const composer=actor.page.getByRole('textbox',{name:'Chatbericht',exact:true});await composer.waitFor();await composer.focus();
 await actor.page.evaluate(()=>{(window as any).__roomActivityNative=null;window.addEventListener('keydown',event=>{if(event.isTrusted&&event.code==='ArrowLeft')(window as any).__roomActivityNative={trusted:event.isTrusted,at:performance.now(),nativeAt:event.timeStamp};},true);});
 await bounded(quietReady,30000,'The natural quiet heartbeat was not observed within thirty seconds');
 assert.ok(quietHeld&&!quietReleased);assert.equal(requests.filter(request=>request.active).length,0);
 // A synthetic DOM event traverses the same capture listeners, but cannot
 // claim genuine recent activity or silently renew the server-side lease.
 await composer.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true})));
 await pause(400);assert.equal(requests.filter(request=>request.active).length,0,'Untrusted DOM input cannot create an active heartbeat');report.untrustedEventIgnored=true;
 const ownership=await privileged.query("select u.email,p.username,not exists(select 1 from active_player_reservations where user_id=p.id) unreserved from auth.users u join profiles p on p.id=u.id where u.id=$1",[actor.id]);
 assert.ok(ownership.rows.length===1&&ownership.rows[0].email===actor.email.toLowerCase()&&ownership.rows[0].username===actor.name&&ownership.rows[0].unreserved,'Only this fresh idle fixture may be changed');
 const aged=await privileged.query("update room_memberships set last_activity_at=now()-interval '299 seconds',lease_until=now()+interval '1 second' where user_id=$1 and room_id=$2 and lease_until>now() returning extract(epoch from now()-last_activity_at)::float8 idle_seconds",[actor.id,roomId]);
 assert.equal(aged.rowCount,1);report.initialIdleSeconds=Number(aged.rows[0].idle_seconds);
 const activeResponse=actor.page.waitForResponse(response=>response.url().endsWith('/api/platform/heartbeat')&&response.request().method()==='POST'&&response.request().postDataJSON().active===true,{timeout:1000});
 const nativeStartedAt=performance.now();await actor.page.keyboard.press('ArrowLeft');
 const response=await activeResponse;report.activeResponseWithinMs=performance.now()-nativeStartedAt;report.activeHTTPStatus=response.status();report.activeResponseOk=(await response.json()).ok===true;
 report.nativeInputTrusted=await actor.page.evaluate(()=>(window as any).__roomActivityNative?.trusted===true);
 report.quietHeldDuringActive=quietHeld&&!quietReleased;
 assert.equal(report.nativeInputTrusted,true);assert.equal(report.quietHeldDuringActive,true,'Recent native input must bypass the still-held quiet request');assert.equal(report.activeHTTPStatus,200);assert.equal(report.activeResponseOk,true);assert.ok(report.activeResponseWithinMs<=1000);
 releaseQuiet();await bounded(quietResponseReady,6000,'The released quiet heartbeat did not finish');
 if(routeError)throw routeError;
 report.quietReleased=quietReleased;assert.equal(report.automaticQuietRelease,false);assert.equal(report.quietHTTPStatus,200);assert.equal(report.quietResponseOk,true,'The older quiet heartbeat must preserve acknowledged recent activity');
 const retained=await privileged.query("select lease_until>now() valid,extract(epoch from now()-last_activity_at)::float8 idle_seconds,extract(epoch from lease_until-now())::float8 lease_seconds from room_memberships where user_id=$1 and room_id=$2",[actor.id,roomId]);
 assert.equal(retained.rowCount,1);report.membershipStillActive=retained.rows[0].valid;report.renewedIdleSeconds=Number(retained.rows[0].idle_seconds);report.renewedLeaseSeconds=Number(retained.rows[0].lease_seconds);
 assert.equal(report.membershipStillActive,true);assert.ok(report.renewedIdleSeconds<10);assert.ok(report.renewedLeaseSeconds>290&&report.renewedLeaseSeconds<=300);
 report.ok=true;
}catch(error){report.primaryFailure=true;throw error;}finally{
 let cleanupError:unknown;
 try{
  releaseQuiet();await browser.close();
  if(actor){const client=await privileged.connect();try{
   await client.query('begin');
   const owned=await client.query('select u.email,p.username from auth.users u join profiles p on p.id=u.id where u.id=$1 for update of p',[actor.id]);
   assert.ok(owned.rows.length===1&&owned.rows[0].email===actor.email.toLowerCase()&&owned.rows[0].username===actor.name&&actor.email.toLowerCase().endsWith('@dartspoint.local'),'Cleanup is restricted to this exact fixture UUID');
   await client.query('delete from notifications where user_id=$1',[actor.id]);
   await client.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=$1)',[actor.id]);await client.query('delete from private.outbox_events where user_id=$1',[actor.id]);
   await client.query('delete from private.audit_events where actor_id=$1',[actor.id]);
   await client.query("delete from chat_messages where actor_id=$1 and kind='room.member_joined' and event_id in(select id from private.room_visits where user_id=$1)",[actor.id]);
   await client.query('delete from chat_preferences where user_id=$1',[actor.id]);await client.query('delete from channel_memberships where user_id=$1',[actor.id]);await client.query('delete from private.room_visits where user_id=$1',[actor.id]);await client.query('delete from room_memberships where user_id=$1',[actor.id]);
   await cleanupOwnedOnboarding(client,[actor]);await client.query('delete from private.profile_private where user_id=$1',[actor.id]);await client.query('delete from preferences where user_id=$1',[actor.id]);await client.query('delete from player_ratings where user_id=$1',[actor.id]);await client.query('delete from profiles where id=$1',[actor.id]);await client.query('delete from auth.users where id=$1',[actor.id]);
   await client.query('commit');report.ownedFixtureRemoved=true;
  }catch(error){report.ok=false;await client.query('rollback');throw error;}finally{client.release();}}
 }catch(error){cleanupError=error;report.ok=false;report.cleanupFailure=true;}
 try{await privileged.end();await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/results.json',JSON.stringify(report,null,2),{mode:0o600});}catch(error){cleanupError??=error;}
 if(cleanupError){if(report.primaryFailure)console.error(JSON.stringify({event:'room_activity_cleanup_failed',primaryFailurePreserved:true}));else throw cleanupError;}
}
console.log('Native room activity bypasses a held quiet heartbeat near the five-minute deadline; owned fixture removed');
