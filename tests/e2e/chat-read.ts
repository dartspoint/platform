import assert from 'node:assert/strict';import {chromium,type Page,type Route} from '@playwright/test';import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';import {login,get,post,origin} from './helpers';
import {forfeitGame} from './game-command';
const browser=await chromium.launch(),pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let fixtureMatch:{id:string;pages:Page[]}|undefined,failed=false;const releaseReadResponses=new Set<()=>void>();
try{
 const a=await login(browser,'ReadA'),b=await login(browser,'ReadB'),c=await login(browser,'ReadC');const room=(await get(a.page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');for(const actor of [a,b,c])await post(actor.page,'room',{roomId:room.id});await post(a.page,'preferences',{quietTurn:true});
 const roomChannel=(await post(a.page,'chat/resolve',{kind:'room',target:room.name})).channelId;
 const dmB=(await post(a.page,'private-channel',{targetId:b.id})).channelId,dmC=(await post(a.page,'private-channel',{targetId:c.id})).channelId;await post(a.page,'chat/preference',{channelId:dmB,closed:true,draft:'Mijn concept blijft'});
 const invited=await post(a.page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});const match=(await post(b.page,'invite/respond',{inviteId:invited.id,action:'accept'})).matchId;
 fixtureMatch={id:match,pages:[a.page,b.page]};
 for(const page of fixtureMatch.pages)await page.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){const text=typeof data==='string'?data:data instanceof ArrayBuffer?new TextDecoder().decode(data):ArrayBuffer.isView(data)?new TextDecoder().decode(data):'';if(text.includes('clock.ping')||text.includes('command'))(window as any).__qaGameSocket=this;return send.call(this,data);};});
 await a.page.setViewportSize({width:390,height:844});await a.page.goto(origin+'/spelen?match='+match);await b.page.goto(origin+'/spelen?match='+match);await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();await a.page.locator('.dp-play-nav').waitFor();await a.page.bringToFront();await a.page.getByRole('button',{name:/^Chat/}).click();await a.page.getByRole('tab',{name:/Kamerchat/}).click();await pause(500);
 // A successful response is an upper bound on the server's stored timestamp.
 // Request-start times can expire here before their later database writes do.
 const recentSends=new Map<string,number[]>();
 const send=async(actor:any,channelId:string,body:string)=>{
  let recent=(recentSends.get(actor.id)??[]).filter(t=>performance.now()-t<2100);
  while(recent.length>=3){await pause(Math.max(1,Math.ceil(2100-(performance.now()-recent[0]))));recent=recent.filter(t=>performance.now()-t<2100);}
  const saved=await post(actor.page,'chat/send',{channelId,clientMessageId:randomUUID(),body});
  const completedAt=performance.now();recent=recent.filter(t=>completedAt-t<2100);recent.push(completedAt);recentSends.set(actor.id,recent);return saved;
 };
 for(let i=0;i<3;i++)await send(b,roomChannel,'Rustige beurt '+i);for(let i=0;i<2;i++)await send(b,dmB,'Privé twee '+i);await send(c,dmC,'Privé één');await send(a,roomChannel,'Mijn eigen latere bericht');
 const count=async()=> (await get(a.page,'bootstrap')).chatChannels.reduce((n:number,x:any)=>n+x.unread,0);await pause(600);assert.equal(await count(),6,'Quiet room, closed DM and other DM total six');assert.equal(await a.page.getByText('Rustige beurt 0',{exact:true}).count(),0,'Quiet turn buffers incoming message');assert.ok(await a.page.getByText('Mijn eigen latere bericht',{exact:true}).count());assert.equal(await count(),6,'Own later visible message must not advance read past buffered incoming messages');
 const draft=(await get(a.page,'bootstrap')).channels.find((x:any)=>x.id===dmB).draft;assert.equal(draft,'Mijn concept blijft');await post(a.page,'private-channel',{targetId:b.id});await post(a.page,'preferences',{quietTurn:false});await pause(3500);await a.page.getByRole('tab',{name:new RegExp(b.name)}).click();
 for(let i=0;i<30&&await count()!==4;i++)await pause(100);assert.equal(await count(),4,'Reading two private messages leaves three room messages and one other private message');assert.equal((await get(a.page,'bootstrap')).chatChannels.find((x:any)=>x.id===roomChannel).unread,3);
 await a.page.getByRole('tab',{name:/Kamerchat/}).click();for(let i=0;i<30&&await count()!==1;i++)await pause(100);assert.equal(await count(),1);
 // Hold a real successful response after the server commits it. Repeated focus,
 // scroll and render events must share that flight, including newer visible rows.
 await pause(300);
 const readRequests:{cursor:number;status?:number}[]=[],readEvidence={maxInFlight:0,heldSuccessfulResponse:false,highestVisibleCoalesced:false,independentChannel:false,errorDoesNotRead:false,hiddenPanelDoesNotRead:false};
 let activeReads=0,nextRead:'success'|'hold-success'|'hold-error'='hold-success',heldReady=false,routeFailure:unknown;
 let releaseHeld=()=>{};
 const waitFor=async(check:()=>Promise<boolean>|boolean,label:string)=>{const until=Date.now()+6000;while(!await check()){if(routeFailure)throw routeFailure;if(Date.now()>until)throw new Error(label);await pause(50);}};
 const readRoute=async(route:Route)=>{
  const input=route.request().postDataJSON();
  if(input?.channelId!==roomChannel||typeof input?.readCursor!=='number'){await route.continue();return;}
  const record:{cursor:number;status?:number}={cursor:input.readCursor};readRequests.push(record);activeReads++;readEvidence.maxInFlight=Math.max(readEvidence.maxInFlight,activeReads);
  const mode=nextRead;nextRead='success';let released=false;
  const finish=()=>{if(!released){released=true;activeReads--;}};
  try{
   if(mode==='hold-success'||mode==='hold-error'){
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const timer=setTimeout(()=>release(),15000);
    releaseHeld=()=>{clearTimeout(timer);release();};releaseReadResponses.add(releaseHeld);
    const response=mode==='hold-success'?await route.fetch():undefined;
    heldReady=true;await gate;releaseReadResponses.delete(releaseHeld);clearTimeout(timer);finish();
    if(response){record.status=response.status();await route.fulfill({response});}
    else{record.status=503;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'qa_read_failure',error:'Leesbevestiging tijdelijk niet beschikbaar.'})});}
   }else{const response=await route.fetch();record.status=response.status();finish();await route.fulfill({response});}
  }catch(error){routeFailure=error;finish();await route.abort();}
 };
 const roomUnread=async()=>Number((await get(a.page,'bootstrap')).chatChannels.find((x:any)=>x.id===roomChannel).unread);
 const repeatVisibleEvents=async()=>{for(let i=0;i<8;i++){await a.page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));const log=document.querySelector('.chat-messages');log?.dispatchEvent(new Event('scroll'));});await pause(35);}};
 await a.page.route('**/api/platform/chat/preference',readRoute);
 try{
  const first=await send(b,roomChannel,'Leesflight eerste bericht');await a.page.getByText('Leesflight eerste bericht',{exact:true}).waitFor();await waitFor(()=>heldReady,'First real read response was not held');
  assert.equal(readRequests[0].cursor,Number(first.seq));readEvidence.heldSuccessfulResponse=true;
  let highest=first;
  for(let i=0;i<2;i++){highest=await send(b,roomChannel,'Leesflight nieuw zichtbaar '+i);await a.page.getByText('Leesflight nieuw zichtbaar '+i,{exact:true}).waitFor();await a.page.getByRole('textbox',{name:'Chatbericht',exact:true}).fill('Zichtbaar concept '+i);await repeatVisibleEvents();}
  assert.equal(readRequests.length,1,'Repeated eligible events and newer visible cursors share the held response');assert.equal(activeReads,1);assert.equal(await roomUnread(),2,'Queued visible rows stay unread until a successful follow-up ACK');
  // Another channel can acknowledge independently while this room is pending.
  await a.page.getByRole('tab',{name:new RegExp(c.name)}).click();await waitFor(async()=>Number((await get(a.page,'bootstrap')).chatChannels.find((x:any)=>x.id===dmC).unread)===0,'Independent private read was blocked by room flight');readEvidence.independentChannel=true;
  await a.page.getByRole('tab',{name:/Kamerchat/}).click();await repeatVisibleEvents();assert.equal(readRequests.length,1);
  releaseHeld();await waitFor(async()=>readRequests.length===2&&activeReads===0&&await roomUnread()===0,'Highest visible read cursor did not flush after ACK');
  assert.deepEqual(readRequests.map(x=>x.cursor),[Number(first.seq),Number(highest.seq)]);assert.ok(readRequests.every(x=>x.status===200));assert.equal(readEvidence.maxInFlight,1);readEvidence.highestVisibleCoalesced=true;
  await a.page.getByRole('textbox',{name:'Chatbericht',exact:true}).fill('');await pause(300);
  // A failed response is held before server execution, so unread remains real.
  const successfulReads=readRequests.length;nextRead='hold-error';heldReady=false;
  const failedMessage=await send(b,roomChannel,'Leesflight fout blijft ongelezen');await a.page.getByText('Leesflight fout blijft ongelezen',{exact:true}).waitFor();await waitFor(()=>heldReady,'Failing read response was not held');await repeatVisibleEvents();
  assert.equal(readRequests.length,successfulReads+1);releaseHeld();await waitFor(()=>activeReads===0,'Failed read response did not finish');await pause(350);
  assert.equal(readRequests.length,successfulReads+1,'A failure must not start its own retry loop');assert.equal(await roomUnread(),1,'Failed read ACK consumes no unread');assert.equal(readRequests.at(-1)?.status,503);
  await repeatVisibleEvents();await waitFor(async()=>readRequests.length===successfulReads+2&&activeReads===0&&await roomUnread()===0,'Later eligible visibility event did not retry the failed cursor');assert.equal(readRequests.at(-1)?.cursor,Number(failedMessage.seq));readEvidence.errorDoesNotRead=true;
  const beforeHidden=readRequests.length;await a.page.getByRole('button',{name:'Toon de wedstrijd',exact:true}).click();
  const hiddenMessage=await send(b,roomChannel,'Leesflight verborgen paneel');await repeatVisibleEvents();await pause(300);
  assert.equal(readRequests.length,beforeHidden,'Hidden chat panel emits no read ACK');assert.equal(await roomUnread(),1);
  await a.page.getByRole('button',{name:/^Chat/}).click();await a.page.getByRole('tab',{name:/Kamerchat/}).click();await waitFor(async()=>readRequests.length===beforeHidden+1&&activeReads===0&&await roomUnread()===0,'Showing chat did not acknowledge the newly visible message');assert.equal(readRequests.at(-1)?.cursor,Number(hiddenMessage.seq));readEvidence.hiddenPanelDoesNotRead=true;
  if(routeFailure)throw routeFailure;assert.equal(readEvidence.maxInFlight,1);
 }finally{for(const release of releaseReadResponses)release();releaseReadResponses.clear();await a.page.unroute('**/api/platform/chat/preference',readRoute);}
 for(let i=0;i<15;i++)await send(b,roomChannel,'Lang bericht '+i+' '+('tekst '.repeat(50)));await pause(600);await a.page.locator('.chat-messages').evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});await pause(150);const before=await count();await send(b,roomChannel,'Nieuw bericht buiten de oudere scrollpositie');await pause(600);assert.equal(await count(),before+1,'Older-history scrolling does not consume new room messages');
 await forfeitGame(a.page,match,[a.page,b.page]);fixtureMatch=undefined;
 await writeFile('artifacts/chat-read-result.json',JSON.stringify({ok:true,sixThenFour:true,quietOwnLaterNoSkip:true,closedDmDraftAndUnread:true,otherChannelsUnchanged:true,olderScrollNoRead:true,singleFlightRead:readEvidence,readRequests,fixtureReservationReleased:true},null,2));console.log('Actual browser quiet-turn read cursors, closed DMs, six to four, single-flight ACKs, failure retry, hidden panel and older scroll passed');
}catch(error){failed=true;throw error;}finally{
 for(const release of releaseReadResponses)release();releaseReadResponses.clear();
 try{if(fixtureMatch)await forfeitGame(fixtureMatch.pages[0],fixtureMatch.id,fixtureMatch.pages);}
 catch(error){if(!failed)throw error;console.error('Chat-read fixture match cleanup failed after the original test failure');}
 finally{await browser.close();}
}
