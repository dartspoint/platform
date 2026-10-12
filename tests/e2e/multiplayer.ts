import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {Client} from '@colyseus/sdk';
import {fullMatch} from './play-match';
import {login,get,post,origin} from './helpers';
const browser=await chromium.launch();

try{
 const a=await login(browser,'PlayerA'),b=await login(browser,'PlayerB'),viewer=await login(browser,'Viewer');
  const boot=await get(a.page,'bootstrap'),room=boot.rooms.find((r:any)=>r.name==='Nederland 1');
 for(const actor of [a,b,viewer])await post(actor.page,'room',{roomId:room.id});
 const invitation=await post(a.page,'invite',{targetId:b.id,roomId:room.id,rules:{startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:true});
 const accepted=await post(b.page,'invite/respond',{inviteId:invitation.id,action:'accept'});const id=accepted.matchId;
 let sawStaleReady=false;
 b.page.on('websocket',socket=>{if(new URL(socket.url()).port==='42567')socket.on('framereceived',frame=>{const bytes=Buffer.isBuffer(frame.payload)?frame.payload:Buffer.from(frame.payload);if(bytes.includes(Buffer.from('stale_state')))sawStaleReady=true;});});
 await b.page.addInitScript(()=>{
  const send=WebSocket.prototype.send,gate={hold:false,frames:[] as Array<()=>void>};
  (window as any).__readyGate=gate;
  WebSocket.prototype.send=function(this:WebSocket,data){
   const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):data instanceof ArrayBuffer?new Uint8Array(data):null;
   const text=typeof data==='string'?data:bytes?new TextDecoder().decode(bytes):'';
   if(gate.hold&&text.includes('match.ready'))gate.frames.push(()=>send.call(this,data));else send.call(this,data);
  };
 });
 await a.page.goto(origin+'/spelen?match='+id);await b.page.goto(origin+'/spelen?match='+id);
 // Delay the actual second player's command unchanged. The other player's
 // confirmation commits first, forcing a real version rejection and refresh.
 await b.page.evaluate(()=>{(window as any).__readyGate.hold=true;});
 await b.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 assert.equal(await b.page.evaluate(()=>(window as any).__readyGate.frames.length),1);
 await a.page.getByRole('button',{name:'Begin de wedstrijd',exact:true}).click();
 let state=await get(a.page,'match/'+id);for(let i=0;i<100&&!state.state.ready[0];i++){await new Promise(r=>setTimeout(r,100));state=await get(a.page,'match/'+id);}assert.equal(state.state.ready[0],true);
 await b.page.evaluate(()=>{const gate=(window as any).__readyGate;gate.hold=false;for(const frame of gate.frames.splice(0))frame();});
 for(let i=0;i<100&&state.lifecycle!=='playing';i++){await new Promise(r=>setTimeout(r,100));state=await get(a.page,'match/'+id);}assert.equal(state.lifecycle,'playing',JSON.stringify({lifecycle:state.lifecycle,ready:state.state.ready}));
 assert.equal(sawStaleReady,true,'The actual server must reject the old confirmation before the client refreshes it');
 const sdk=new Client('ws://127.0.0.1:42567');const spectator=await sdk.joinOrCreate('match',{matchId:id,token:viewer.token});
 let spectatorSnapshot:any,firstFlight:any;spectator.onMessage('snapshot',s=>{spectatorSnapshot=s;if(s.state.pendingDart&&!firstFlight)firstFlight=s;});
 const rejected=new Promise<any>(resolve=>spectator.onMessage('error',resolve));spectator.send('command',{protocolVersion:1,commandId:randomUUID(),matchId:id,expectedStateVersion:state.stateVersion,type:'dart.stop_horizontal',phaseToken:state.state.phaseToken});const error=await rejected;assert.equal(error.code,'spectator_read_only');
 await a.page.getByLabel('Chatbericht',{exact:true}).first().fill('Toetsenbordcontrole');await a.page.getByLabel('Chatbericht',{exact:true}).first().press('Space');assert.equal((await get(a.page,'match/'+id)).state.phase,'horizontal','Typing cannot throw a dart');
 await a.page.getByLabel('Chatbericht',{exact:true}).first().fill('Echte wedstrijdchat');
 const sent=a.page.waitForResponse(response=>response.url().endsWith('/api/platform/chat/send')&&response.request().method()==='POST',{timeout:30000});
 await a.page.getByRole('button',{name:'Verstuur bericht',exact:true}).first().click();
 const acknowledgement=await sent;assert.equal(acknowledgement.status(),200,'The real browser chat send must succeed');assert.equal(acknowledgement.request().postDataJSON().body,'Echte wedstrijdchat');
 const channel=await post(b.page,'chat/resolve',{kind:'match',target:id});
 assert.ok((await get(b.page,'chat/'+channel.channelId)).some((message:any)=>message.body==='Echte wedstrijdchat'),'The second authenticated player must read the committed match message');
 await b.page.getByText('Echte wedstrijdchat',{exact:true}).waitFor({timeout:30000});
 await a.page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await a.page.keyboard.press('Space');
 for(let i=0;i<40;i++){state=await get(a.page,'match/'+id);if(state.state.phase==='vertical')break;await new Promise(r=>setTimeout(r,50));}assert.equal(state.state.phase,'vertical');
 const scores=[...state.state.scores];await a.page.getByRole('button',{name:'Stop verticale indicator en gooi',exact:true}).click();
 // Capture the short flight in the live stream: an HTTP round trip can exceed
 // its 560 ms duration on a cold hosted runner without changing game behavior.
 for(let i=0;i<100&&!firstFlight;i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(firstFlight,'The spectator must receive the sealed flight before impact');
 assert.equal(firstFlight.state.phase,'flight');assert.deepEqual(firstFlight.state.scores,scores);const committedHit=firstFlight.state.pendingDart.hit;
 for(let i=0;i<100&&spectatorSnapshot?.state?.events.length!==1;i++)await new Promise(r=>setTimeout(r,100));
 state=await get(a.page,'match/'+id);assert.equal(state.state.pendingDart,null);assert.equal(state.state.events.length,1);assert.deepEqual(state.state.events[0].hit,committedHit);
 for(let i=0;i<20&&spectatorSnapshot?.state?.events.length!==1;i++)await new Promise(r=>setTimeout(r,100));assert.equal(spectatorSnapshot.state.events.length,1);
 await a.page.route('http://127.0.0.1:42567/matchmake/**',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.continue();},{times:1});
 await a.page.reload();let restored=await get(a.page,'match/'+id);
 const horizontalButton=a.page.getByRole('button',{name:'Stop horizontale indicator',exact:true});
 // A reload can close the old socket before the new one joins. Exercise the
 // actual paused-match confirmation flow instead of requiring a gapless reload.
 for(let attempt=0;attempt<100;attempt++){
  restored=await get(a.page,'match/'+id);
  if(restored.lifecycle==='paused')for(const [seat,actor] of [a,b].entries()){
   const ready=actor.page.getByRole('button',{name:'Begin de wedstrijd',exact:true});
   if(!restored.state.ready[seat]&&await ready.isVisible()&&await ready.isEnabled())await ready.click();
  }
  if(restored.lifecycle==='playing'&&await horizontalButton.isVisible()&&await horizontalButton.isEnabled())break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(restored.lifecycle,'playing','Both real players must reconfirm after a reconnect pause');assert.equal(await horizontalButton.isEnabled(),true);assert.deepEqual(restored.state.events,state.state.events);
 await a.page.screenshot({path:'artifacts/multiplayer-player-a.png',fullPage:true});await b.page.screenshot({path:'artifacts/multiplayer-player-b.png',fullPage:true});const result=await fullMatch(a,b,id);await spectator.leave();
 const totals=(await get(a.page,'bootstrap')).personalRecords;assert.ok(totals.highestCheckout>0);assert.ok(totals.fastestLeg>0);assert.equal(totals.wins,1);
 await writeFile('artifacts/multiplayer-result.json',JSON.stringify({ok:true,newOtpUsers:3,independentBrowsers:true,staleReadyRefreshesOnce:true,spectatorReadOnly:true,realMatchChatBetweenBrowsers:true,keyboardNoThrowWhileTyping:true,keyboardStopsMeter:true,accountRecordAggregates:true,authoritativeHit:true,scoreAtImpact:true,reconnectRestored:true,...result},null,2));
 console.log('Two browsers, spectator, authoritative impacts, reconnect, full match and Elo passed');
}finally{await browser.close();}
