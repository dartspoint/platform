import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,type Page} from '@playwright/test';
import {Room} from '@colyseus/sdk';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {login,get,post,origin} from './helpers';
import {forfeitGame} from './game-command';

// Three real Auth sessions, native menu/chat/stop input, and only owned local
// fixture rows. This behavioral suite does not replace the 50 ms throw proofs.
assert.equal(process.env.APP_ENV,'development');assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(process.env.E2E_STAGING_FIXTURE,undefined);
for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
const browser=await chromium.launch({headless:true}),privileged=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const directory='artifacts/match-room-expansion-browser',room=randomUUID(),roomChannel=randomUUID(),label='QaView'+randomUUID().replaceAll('-','').slice(0,8);
const actors:Awaited<ReturnType<typeof login>>[]=[],owned:string[]=[];
let matchId:string|undefined,failed=false,originalError:unknown;
const checks:Record<string,boolean>={},attempts:any[]=[];
const proof:any={ok:false,localOnly:true,newRealAuthSessions:3,browserEnvironment:{engine:'chromium-headless-shell',channel:'default',headless:true,version:browser.version(),physicalHardwareTested:false},throwLatencyAcceptance:'independent normal timing fixtures remain unchanged',checks,attempts,cleanup:{forfeit:false,browser:false,ownedRows:false}};
const outcomes=new Map<string,{type:string;payload:any}>();
function wire(page:Page){
 page.on('websocket',socket=>{
  const received=new Room('qa-observer-outcomes');received.onMessage('*',(type,payload:any)=>{if(['error','receipt'].includes(String(type))&&payload?.commandId)outcomes.set(payload.commandId,{type:String(type),payload});});
  socket.on('framereceived',frame=>{if(Buffer.isBuffer(frame.payload)&&(frame.payload[0]&31)===13)(received as any).onMessageCallback({data:frame.payload});});
 });
}
function publicSnapshot(snapshot:any){return {matchId:snapshot.matchId,publicGameId:snapshot.publicGameId,stateVersion:snapshot.stateVersion,lifecycle:snapshot.lifecycle,seat:snapshot.seat,turn:snapshot.state.turn,phase:snapshot.state.phase,dartCount:snapshot.state.dartCount,scores:snapshot.state.scores,timeoutStrikes:snapshot.state.timeoutStrikes,timeoutWarning:snapshot.state.timeoutWarning??null};}
async function checkpoint(){await writeFile(directory+'/progress.json',JSON.stringify(proof,null,2),{mode:0o600});}
async function eventual<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,category:string,ms=15000){const until=performance.now()+ms;let value:T;do{value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}while(performance.now()<until);throw new Error(category);}
async function outcome(id:string){return eventual(async()=>outcomes.get(id),value=>!!value,'actual_socket_outcome_missing');}
async function meters(page:Page){return page.locator('.dp-fullscreen-stage .dp-game-panel').evaluate(root=>{
 const x=root.querySelector<HTMLElement>('.dp-meter-row .dp-meter-indicator')!,y=root.querySelector<HTMLElement>('.dp-meter-track-vertical .dp-meter-indicator')!,xr=x.getBoundingClientRect(),yr=y.getBoundingClientRect();
 return {horizontal:xr.left+xr.width/2,vertical:yr.top+yr.height/2,left:x.style.left,top:y.style.top};
});}
async function nativeStop(actor:Awaited<ReturnType<typeof login>>,axis:'horizontal'|'vertical'){
 const button=actor.page.getByRole('button',{name:axis==='horizontal'?'Stop horizontale indicator':'Stop verticale indicator en gooi',exact:true});await actor.page.bringToFront();await expect(button).toBeEnabled({timeout:15000});
 const selector=axis==='horizontal'?'.dp-fullscreen-stage .dp-meter-row .dp-meter-indicator':'.dp-fullscreen-stage .dp-meter-track-vertical .dp-meter-indicator',property=axis==='horizontal'?'left':'top';
 const previous=await actor.page.locator(selector).evaluate((element,property)=>(element as HTMLElement).style.getPropertyValue(property),property);
 await actor.page.waitForFunction(({selector,property,previous})=>{const element=document.querySelector(selector) as HTMLElement|null;return !!element&&element.style.getPropertyValue(property)!==previous;},{selector,property,previous},{polling:'raf',timeout:15000});
 await actor.page.evaluate(()=>{performance.clearMarks('dp-local-stop');});
 await button.click();
 const trace=await actor.page.evaluate(()=>{const detail=(performance.getEntriesByName('dp-local-stop').at(-1) as PerformanceMark|undefined)?.detail;return detail?{commandId:detail.commandId,phase:detail.phase,renderSampleAt:detail.rendered?.sampleAt,meterSpeedVersion:detail.rendered?.meterSpeedVersion}:null;});
 const attempt:any={axis,trace,actualOutcome:null};attempts.push(attempt);await checkpoint();assert.ok(trace?.commandId,'A native stop captured its real app command UUID');
 const value=await outcome(trace.commandId);assert.ok(value);attempt.actualOutcome={type:value.type,code:value.payload.code??null,snapshot:value.type==='receipt'?publicSnapshot(value.payload):null};await checkpoint();
 assert.equal(value.type,'receipt','The one normal input is accepted; no new UUID retry is generated');assert.equal(value.payload.commandId,trace.commandId);assert.equal(value.payload.timing.admittedAt,trace.renderSampleAt);assert.equal(value.payload.state.meterSpeedVersion,trace.meterSpeedVersion);
 return value.payload;
}
async function forgedSpectatorCommand(page:Page,snapshot:any,extra:Record<string,unknown>={}){
 const commandId=randomUUID(),encoder=new Room('match');let bytes:number[]=[];encoder.connection={isOpen:true,send:(data:Uint8Array)=>{bytes=[...data];}} as any;
 encoder.send('command',{protocolVersion:1,commandId,matchId:snapshot.matchId,expectedStateVersion:snapshot.stateVersion,type:'dart.stop_horizontal',phaseToken:snapshot.state.phaseToken,...extra});
 await page.evaluate(bytes=>{const socket=(window as any).__qaGameSocket;if(!socket||socket.readyState!==WebSocket.OPEN)throw new Error('owned_spectator_socket_missing');socket.send(new Uint8Array(bytes));},bytes);
 return {commandId,value:await outcome(commandId)};
}
try{
 await mkdir(directory,{recursive:true,mode:0o700});
 for(const suffix of ['ViewA','ViewB','ViewC']){const actor=await login(browser,suffix);actors.push(actor);owned.push(actor.id);assert.equal((await get(actor.page,'bootstrap')).actor.role,'player');actor.page.setDefaultTimeout(15000);wire(actor.page);
  await actor.page.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):String(data);if(text.includes('command')||text.includes('clock.ping'))(window as any).__qaGameSocket=this;return send.call(this,data);};});
 }
 const [a,b,viewer]=actors;assert.equal(new Set(owned).size,3);
 await privileged.query('insert into community_rooms(id,name,slug,capacity,min_rating,max_rating) values($1,$2,$2,50,0,5000)',[room,label]);await privileged.query("insert into channels(id,kind,room_id) values($1,'community',$2)",[roomChannel,room]);
 for(const actor of actors)await post(actor.page,'room',{roomId:room});
 const invited=await post(a.page,'invite',{targetId:b.id,roomId:room,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});
 const accepted=await post(b.page,'invite/respond',{inviteId:invited.id,action:'accept'});matchId=accepted.matchId;
 for(const actor of [a,b])await actor.page.goto(origin+'/spelen?match='+matchId);
 await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await eventual(()=>get(a.page,'match/'+matchId),value=>value.state.ready[0]===true,'first_native_ready_missing');
 await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 let state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.lifecycle==='playing','both_native_ready_missing');assert.equal(state.state.turn,0);assert.ok(Number.isSafeInteger(state.publicGameId)&&state.publicGameId>0);proof.publicGameId=state.publicGameId;
 await expect(a.page.getByText('Wedstrijd #'+state.publicGameId,{exact:true})).toBeVisible();await expect(b.page.getByText('Wedstrijd #'+state.publicGameId,{exact:true})).toBeVisible();checks.numericPublicGameIdBothPlayers=true;
 await viewer.page.goto(origin+'/spelen');
 await viewer.page.locator('.dp-desktop-players').getByRole('button',{name:'Acties voor '+a.name,exact:true}).click();
 const admissionResponse=viewer.page.waitForResponse(response=>response.url().endsWith('/api/platform/match/spectate')&&response.request().method()==='POST'&&response.request().postDataJSON().matchId===matchId);
 await viewer.page.getByRole('menuitem',{name:'Toeschouwen',exact:true}).click();
 const admission=await admissionResponse;assert.equal(admission.status(),200);const allowed=await admission.json();assert.equal(allowed.matchId,matchId);assert.equal(allowed.publicGameId,state.publicGameId);assert.equal(allowed.seat,null);
 const dialog=viewer.page.getByRole('dialog').filter({has:viewer.page.getByRole('heading',{name:'Langs de oche',exact:true})});await expect(dialog.locator('.spectator-live-game')).toBeVisible();await expect(dialog.locator('.spectator-live-game')).toHaveAttribute('data-spectator-match',matchId!);await expect(dialog.locator('.spectator-live-game')).toHaveAttribute('data-public-game-id',String(state.publicGameId));
 await expect(dialog.locator('.spectator-status')).toContainText('#'+state.publicGameId);await expect(dialog.locator('.dp-game-panel .dp-dartboard')).toBeVisible();checks.nativePlayerMenuOpensRealApprovedLiveMatch=true;
 assert.equal(await dialog.locator('.dp-throw-button').count(),0);assert.equal(await dialog.getByRole('button',{name:'Begin de wedstrijd',exact:true}).count(),0);assert.equal(await dialog.getByRole('button',{name:/^(Stop horizontale indicator|Stop verticale indicator en gooi|Geef op|Wedstrijd opgeven)$/}).count(),0);checks.spectatorHasNoReadyStopOrForfeitControls=true;
 const baseline=await get(viewer.page,'match/'+matchId),forbidden=await forgedSpectatorCommand(viewer.page,baseline);assert.equal(forbidden.value?.type,'error');assert.equal(forbidden.value?.payload.code,'spectator_read_only');
 const forged=await forgedSpectatorCommand(viewer.page,baseline,{score:180,winner:2});assert.equal(forged.value?.type,'error');assert.equal(forged.value?.payload.code,'invalid_command');
 const unchanged=await get(a.page,'match/'+matchId);assert.equal(unchanged.stateVersion,baseline.stateVersion);assert.deepEqual(unchanged.state,baseline.state);checks.actualSpectatorSocketCannotStopOrClaimScore=true;
 const message='Meekijken '+randomUUID(),send=viewer.page.waitForResponse(response=>response.url().endsWith('/api/platform/chat/send')&&response.request().postDataJSON().body===message);
 await dialog.getByLabel('Chatbericht',{exact:true}).fill(message);await dialog.getByLabel('Chatbericht',{exact:true}).press('Enter');const sent=await send;assert.equal(sent.status(),200);assert.equal(sent.request().postDataJSON().channelId,allowed.channelId);
 for(const actor of [a,b]){await actor.page.getByRole('tab',{name:/Spelchat/}).click();await expect(actor.page.getByText(message,{exact:true})).toBeVisible();assert.ok((await get(actor.page,'chat/'+allowed.channelId)).some((row:any)=>row.body===message));}
 checks.nativeSpectatorMatchChatDeliveredAndStoredForBothPlayers=true;
 // Only this owned match's turn clock is advanced. The real worker emits its
// warnings; no score, phase, sample, timeout-strike or browser state is forged.
 for(const strike of [1,2]){
  await privileged.query("update matches set state=jsonb_set(state,'{turnStartedAt}',to_jsonb($2::bigint)) where id=$1 and exists(select 1 from match_players where match_id=$1 and user_id=$3)",[matchId,Date.now()-31000,a.id]);
  await expect(a.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  await expect(b.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  await expect(dialog.locator('.dp-timeout-warning')).toHaveAttribute('data-timeout-strike',String(strike),{timeout:15000});
  state=await get(a.page,'match/'+matchId);assert.equal(state.state.turn,0);assert.equal(state.lifecycle,'playing');assert.deepEqual(state.state.dartCount,[0,0]);assert.deepEqual(state.state.scores,[501,501]);proof['warning'+strike]=publicSnapshot(state);await checkpoint();
 }
 checks.actualFirstSecondTimeoutWarningsVisibleToPlayersAndSpectator=true;
 // Use native player inputs for all three darts in this real 501 visit.
 let lastAxes:any;
 for(let dart=1;dart<=3;dart++){
  await nativeStop(a,'horizontal');await expect(a.page.locator('.dp-fullscreen-stage .dp-timeout-warning')).toHaveCount(0);await nativeStop(a,'vertical');
  if(dart===3)lastAxes=await meters(a.page);
  state=await eventual(()=>get(a.page,'match/'+matchId),value=>value.state.dartCount[0]===dart&&!value.state.pendingDart,'real_dart_impact_missing');
 }
 assert.equal(state.state.turn,1);assert.deepEqual(state.state.dartCount,[3,0]);assert.deepEqual(state.state.timeoutStrikes,[0,0]);checks.validNativeStopClearsWarnings=true;
 await expect(a.page.getByRole('button',{name:'Tegenstander aan de beurt',exact:true})).toBeDisabled();await expect(b.page.getByRole('button',{name:'Stop horizontale indicator',exact:true})).toBeEnabled({timeout:15000});
 const held=[];for(let index=0;index<4;index++){await a.page.waitForTimeout(100);held.push(await meters(a.page));}
 proof.lastStoppedAxes=lastAxes;proof.axesWhileOpponentTurn=held;await checkpoint();
 assert.ok(held.every(value=>Math.abs(value.horizontal-lastAxes.horizontal)<=1&&Math.abs(value.vertical-lastAxes.vertical)<=1),'Both last stopped axes stay fixed within 1CSSpx while B has the turn');checks.lastDartAxesRemainFixedDuringOpponentTurn=true;
 await expect(dialog.locator('.dp-flying-dart')).toHaveCount(3,{timeout:15000});checks.realSpectatorShowsThreeAuthoritativeLandedDarts=true;
 await dialog.getByRole('button',{name:'Terug naar jouw wedstrijd',exact:false}).click();await expect(viewer.page.locator('.spectator-live-game')).toHaveCount(0);checks.spectatorClosesWithoutChangingMatch=true;
 assert.equal((await get(a.page,'match/'+matchId)).state.turn,1);proof.ok=true;
}catch(error){failed=true;originalError=error;proof.failureCategory='browser_expansion_failed';await checkpoint();}
finally{
 try{if(matchId&&actors.length>=2){await forfeitGame(actors[0].page,matchId,actors.slice(0,2).map(actor=>actor.page));proof.cleanup.forfeit=true;}}catch{failed=true;proof.cleanup.forfeit=false;}
 try{await browser.close();proof.cleanup.browser=true;}catch{failed=true;}
 try{
  const c=await privileged.connect();try{await c.query('begin');await c.query('select id from profiles where id=any($1::uuid[]) order by id for update',[owned]);
   const identities=(await c.query('select u.id,u.email,exists(select 1 from user_roles role where role.user_id=u.id and role.revoked_at is null) staff from auth.users u where u.id=any($1::uuid[])',[owned])).rows;
   assert.equal(identities.length,actors.length,'Every cleanup identity is an owned login');
   for(const actor of actors){const identity=identities.find(value=>value.id===actor.id);assert.ok(identity&&identity.email.toLowerCase()===actor.email.toLowerCase()&&!identity.staff,'Owned normal-player cleanup identity guard');}
   const matches=(await c.query('select distinct match_id from match_players where user_id=any($1::uuid[])',[owned])).rows.map(row=>row.match_id),channels=(await c.query('select id from channels where room_id=$1 or match_id=any($2::uuid[])',[room,matches])).rows.map(row=>row.id);
   await c.query('delete from private.moderation_cases where target_id=any($1::uuid[]) or reporter_id=any($1::uuid[])',[owned]);await c.query('delete from sanctions where target_id=any($1::uuid[]) or actor_id=any($1::uuid[])',[owned]);
   await c.query('delete from chat_messages where channel_id=any($1::uuid[])',[channels]);await c.query('delete from chat_preferences where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channels where id=any($1::uuid[])',[channels]);
   await c.query('delete from private.email_deliveries where event_id in(select id from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[]))',[owned,matches]);await c.query('delete from notifications where user_id=any($1::uuid[]) or source_event in(select id from private.outbox_events where payload->>\'matchId\'=any($2::text[]))',[owned,matches]);await c.query('delete from private.outbox_events where user_id=any($1::uuid[]) or payload->>\'matchId\'=any($2::text[])',[owned,matches]);
   await c.query('delete from game_invites where inviter_id=any($1::uuid[]) or invitee_id=any($1::uuid[])',[owned]);
   for(const table of ['private.match_commands','match_darts','match_events','match_statistics','rating_ledger','user_badges','player_opponents','active_player_reservations','match_players','match_results'])await c.query(`delete from ${table} where ${table==='player_opponents'?'first_match_id':'match_id'}=any($1::uuid[])`,[matches]);
   await c.query('delete from private.command_ingress where actor_id=any($1::uuid[])',[owned]);await c.query('delete from private.audit_events where actor_id=any($1::uuid[]) or subject=any($2::text[])',[owned,[room,...matches,...owned]]);await c.query('delete from matches where id=any($1::uuid[])',[matches]);
   await c.query('delete from private.room_visits where user_id=any($1::uuid[])',[owned]);await c.query('delete from room_memberships where user_id=any($1::uuid[])',[owned]);await c.query('delete from room_access where room_id=$1',[room]);await c.query('delete from community_rooms where id=$1',[room]);
   await c.query('delete from user_badges where user_id=any($1::uuid[])',[owned]);await c.query('delete from preferences where user_id=any($1::uuid[])',[owned]);await c.query('delete from player_ratings where user_id=any($1::uuid[])',[owned]);await c.query('delete from profiles where id=any($1::uuid[])',[owned]);await c.query('delete from auth.users where id=any($1::uuid[])',[owned]);await c.query('commit');
   assert.equal((await c.query('select count(*)::int n from profiles where id=any($1::uuid[])',[owned])).rows[0].n,0);proof.cleanup.ownedRows=true;
  }catch(error){await c.query('rollback');throw error;}finally{c.release();}
 }catch{failed=true;proof.cleanup.ownedRows=false;}
 await privileged.end();proof.ok=proof.ok&&!failed;await checkpoint();await writeFile(directory+'/result.json',JSON.stringify(proof,null,2),{mode:0o600});
}
if(failed){if(originalError)throw originalError;throw new Error('owned_browser_fixture_cleanup_failed');}
console.log('Real spectator dropdown, live match chat, readonly commands, public numbers, warning UI and held opponent-turn axes passed');
