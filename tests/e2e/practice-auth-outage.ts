import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium,expect,type Route} from '@playwright/test';
import {cleanupOwnedOnboarding,login,get,post,origin} from './helpers';

assert.equal(process.env.APP_ENV,'development');
for(const value of [origin,process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.DATABASE_URL!,process.env.MIGRATION_DATABASE_URL!])assert.equal(new URL(value).hostname,'127.0.0.1');
assert.equal(new URL(origin).protocol,'http:');assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
const directory='artifacts/practice-auth-outage';
const codes=['auth_provider_unavailable','auth_keys_unavailable','auth_storage_unavailable'] as const;
const message='Je sessie kan tijdelijk niet worden gecontroleerd. Probeer het later opnieuw.';
const report={ok:false,measurement:'functional-regression-not-throw-latency-proof',physicalHardwareTested:false,cases:[] as any[],realNativeAccepted:false,realVersionAdvancedOnce:false,allNativeInputsTrusted:false,ownedFixtureRemoved:false,browserClosed:false,primaryFailure:false,cleanupFailure:false};
const browser=await chromium.launch(),privileged=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1,connectionTimeoutMillis:5000,options:'-c statement_timeout=10000 -c lock_timeout=3000'});
let actor:Awaited<ReturnType<typeof login>>|undefined,sessionId:string|undefined;
const stops:any[]=[],resets:Promise<void>[]=[];
try{
 actor=await login(browser,'AuthOutageQA');const page=actor.page;page.setDefaultTimeout(15000);
 const room=(await get(page,'bootstrap')).rooms.find((value:any)=>value.name==='Nederland 1');assert.ok(room);await post(page,'room',{roomId:room.id});
 await page.addInitScript(()=>{
  (window as any).__practiceAuthNative=[];
  document.addEventListener('pointerdown',event=>{if((event.target as Element)?.closest('.practice-throw'))(window as any).__practiceAuthNative.push({trusted:event.isTrusted,nativeAt:event.timeStamp,at:performance.now()});},true);
 });
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/platform/practice'){const input=request.postDataJSON();if(input.type==='horizontal')stops.push(input);}});
 page.on('response',response=>{
  if(response.request().method()!=='POST'||new URL(response.url()).pathname!=='/api/platform/practice'||response.request().postDataJSON()?.type!=='reset')return;
  const pending=(async()=>{assert.equal(response.status(),200);sessionId=(await response.json()).id;})();resets.push(pending);void pending.catch(()=>{});
 });
 await page.goto(origin+'/oefenen?les=1');await page.bringToFront();const button=page.getByRole('button',{name:'Stop de richting',exact:true});
 await expect(button).toBeEnabled();await Promise.all(resets);assert.ok(sessionId);
 const baseline=await get(page,'practice/'+sessionId);assert.equal(baseline.state.phase,'horizontal');assert.equal(baseline.state.count,0);
 async function sessionToken(){
  const cookies=await actor!.context.cookies(),parts=cookies.filter(cookie=>/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a,b)=>Number(a.name.match(/\.(\d+)$/)?.[1]??0)-Number(b.name.match(/\.(\d+)$/)?.[1]??0)).map(cookie=>cookie.value).join('');
  return JSON.parse(Buffer.from(parts.replace(/^base64-/,''),'base64url').toString()).access_token;
 }
 assert.ok(await sessionToken()===actor.token,'The real login token is present before the mock');
 for(const code of codes){
  const item:any={code,requestCount:0,httpStatus:null,nativeTrusted:false,visibleError:false,sessionTokenPreserved:false,authoritativeUnchanged:false,noOriginalIngress:false,noCommittedCommand:false,resumedMeter:false};report.cases.push(item);
  let routeFailure:unknown;
  const mock=async(route:Route)=>{
   try{
    const request=route.request();if(request.method()!=='POST'||request.postDataJSON()?.type!=='horizontal'){await route.continue();return;}
    const input=request.postDataJSON();assert.equal(input.sessionId,sessionId);assert.equal(input.expectedStateVersion,baseline.stateVersion);item.requestCount++;
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code,error:message})});
   }catch(error){routeFailure=error;await route.abort().catch(()=>{});}
  };
  const before=stops.length;await page.route('**/api/platform/practice',mock);
  try{
   const responseReady=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/platform/practice'&&response.request().postDataJSON()?.type==='horizontal');
   // This recovery GET is the real client catch path. Observing its completion
   // and enabled input proves the action settled without a sleep/retry window.
   const recoveryReady=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/platform/practice/'+sessionId);
   await button.click();const response=await responseReady;item.httpStatus=response.status();assert.equal(item.httpStatus,503);assert.equal((await response.json()).code,code);
   const recovered=await recoveryReady;assert.equal(recovered.status(),200);await expect(page.getByRole('alert').filter({hasText:message})).toBeVisible();await expect(button).toBeEnabled();
   if(routeFailure)throw routeFailure;
   assert.equal(item.requestCount,1,'A known pre-admission auth outage must not automatically retransmit the captured stop');assert.equal(stops.length-before,1);
   const captured=stops[before];assert.equal(captured.sessionId,sessionId);assert.equal(captured.expectedStateVersion,baseline.stateVersion);
   const events=await page.evaluate(()=>(window as any).__practiceAuthNative);item.nativeTrusted=events.at(-1)?.trusted===true;assert.equal(item.nativeTrusted,true);
   item.visibleError=true;item.sessionTokenPreserved=await sessionToken()===actor.token;assert.equal(item.sessionTokenPreserved,true,'An auth dependency outage must not clear or replace the real session token');
   const current=await get(page,'practice/'+sessionId);assert.equal(current.id,baseline.id);assert.equal(current.stateVersion,baseline.stateVersion);assert.deepEqual(current.state,baseline.state);item.authoritativeUnchanged=true;
   const ingress=await privileged.query("select count(*)::int n from private.command_ingress where scope='practice' and actor_id=$1 and command_id=$2",[actor.id,captured.commandId]);item.noOriginalIngress=ingress.rows[0].n===0;assert.equal(item.noOriginalIngress,true);
   const committed=await privileged.query('select count(*)::int n from private.practice_commands where user_id=$1 and command_id=$2',[actor.id,captured.commandId]);item.noCommittedCommand=committed.rows[0].n===0;assert.equal(item.noCommittedCommand,true);
   const fraction=await page.locator('.practice-meter-x i').evaluate(element=>(element as HTMLElement).style.left);
   await page.waitForFunction(previous=>(document.querySelector('.practice-meter-x i') as HTMLElement)?.style.left!==previous,fraction,{polling:'raf'});item.resumedMeter=true;
   assert.equal((await get(page,'bootstrap')).actor.id,actor.id,'The same real actor remains authenticated');
  }finally{await page.unroute('**/api/platform/practice',mock);}
 }
 // One NEW native input after recovery uses the normal provider/database path.
 // The existing timing fixtures retain all 50ms/1px admission/pixel gates.
 const beforeReal=stops.length,responseReady=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/platform/practice'&&response.request().postDataJSON()?.type==='horizontal');
 await button.click();const response=await responseReady;assert.equal(response.status(),200);const receipt=await response.json(),captured=stops[beforeReal];
 assert.ok(captured);assert.equal(stops.length-beforeReal,1);assert.equal(receipt.commandId,captured.commandId);assert.equal(receipt.id,sessionId);assert.equal(receipt.state.phase,'vertical');assert.equal(receipt.stateVersion,baseline.stateVersion+1);assert.equal(receipt.state.count,0);report.realNativeAccepted=true;
 assert.equal(new Set(stops.map(input=>input.commandId)).size,4,'Each new native input has its own UUID; rejected commands are never silently refreshed');
 const final=await get(page,'practice/'+sessionId);assert.equal(final.stateVersion,baseline.stateVersion+1);assert.deepEqual(final.state,receipt.state);report.realVersionAdvancedOnce=true;
 const events=await page.evaluate(()=>(window as any).__practiceAuthNative);assert.equal(events.length,4);assert.ok(events.every((event:any)=>event.trusted));report.allNativeInputsTrusted=true;
 assert.ok(await sessionToken()===actor.token);report.ok=true;
}catch(error){report.primaryFailure=true;throw error;}finally{
 let cleanupError:unknown;
 try{await browser.close();report.browserClosed=true;}catch(error){cleanupError=error;}
 try{
  if(actor){const client=await privileged.connect();try{
   await client.query('begin');const own=await client.query('select u.email,p.username from auth.users u join profiles p on p.id=u.id where u.id=$1 for update of p',[actor.id]);
   assert.equal(own.rowCount,1);assert.equal(own.rows[0].email,actor.email.toLowerCase());assert.equal(own.rows[0].username,actor.name);assert.ok(actor.email.toLowerCase().endsWith('@dartspoint.local'));
   assert.equal((await client.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount,0);
   await client.query('delete from notifications where user_id=$1',[actor.id]);await client.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=$1)',[actor.id]);await client.query('delete from private.outbox_events where user_id=$1',[actor.id]);await client.query('delete from private.audit_events where actor_id=$1',[actor.id]);
   await client.query('delete from private.command_ingress where actor_id=$1',[actor.id]);await client.query('delete from private.practice_commands where user_id=$1',[actor.id]);await client.query('delete from practice_results where user_id=$1',[actor.id]);await client.query('delete from practice_sessions where user_id=$1',[actor.id]);await client.query('delete from practice_progress where user_id=$1',[actor.id]);await client.query('delete from user_badges where user_id=$1',[actor.id]);
   await client.query('delete from chat_messages where sender_id=$1 or actor_id=$1',[actor.id]);await client.query('delete from chat_preferences where user_id=$1',[actor.id]);await client.query('delete from channel_memberships where user_id=$1',[actor.id]);await client.query('delete from private.room_visits where user_id=$1',[actor.id]);await client.query('delete from room_memberships where user_id=$1',[actor.id]);
   await cleanupOwnedOnboarding(client,[actor]);await client.query('delete from private.profile_private where user_id=$1',[actor.id]);await client.query('delete from preferences where user_id=$1',[actor.id]);await client.query('delete from player_ratings where user_id=$1',[actor.id]);await client.query('delete from profiles where id=$1',[actor.id]);await client.query('delete from auth.users where id=$1',[actor.id]);await client.query('commit');
   assert.equal((await client.query('select count(*)::int n from profiles where id=$1',[actor.id])).rows[0].n,0);report.ownedFixtureRemoved=true;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}}
 }catch(error){cleanupError??=error;}
 if(cleanupError){report.ok=false;report.cleanupFailure=true;}
 try{await privileged.end();await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/results.json',JSON.stringify(report,null,2),{mode:0o600});}catch(error){cleanupError??=error;}
 if(cleanupError){if(report.primaryFailure)console.error(JSON.stringify({event:'practice_auth_outage_cleanup_failed',primaryFailurePreserved:true}));else throw cleanupError;}
}
console.log('Three auth dependency outages preserve the real session and state without retry; one later native stop commits once; owned fixture removed');
