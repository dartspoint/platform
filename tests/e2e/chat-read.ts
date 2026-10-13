import assert from 'node:assert/strict';import {chromium,type Page} from '@playwright/test';import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';import {login,get,post,origin} from './helpers';
import {forfeitGame} from './game-command';
const browser=await chromium.launch(),pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let fixtureMatch:{id:string;pages:Page[]}|undefined,failed=false;
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
 for(let i=0;i<15;i++)await send(b,roomChannel,'Lang bericht '+i+' '+('tekst '.repeat(50)));await pause(600);await a.page.locator('.chat-messages').evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});await pause(150);const before=await count();await send(b,roomChannel,'Nieuw bericht buiten de oudere scrollpositie');await pause(600);assert.equal(await count(),before+1,'Older-history scrolling does not consume new room messages');
 await forfeitGame(a.page,match,[a.page,b.page]);fixtureMatch=undefined;
 await writeFile('artifacts/chat-read-result.json',JSON.stringify({ok:true,sixThenFour:true,quietOwnLaterNoSkip:true,closedDmDraftAndUnread:true,otherChannelsUnchanged:true,olderScrollNoRead:true,fixtureReservationReleased:true},null,2));console.log('Actual browser quiet-turn read cursors, closed DMs, six to four, and older scroll passed');
}catch(error){failed=true;throw error;}finally{
 try{if(fixtureMatch)await forfeitGame(fixtureMatch.pages[0],fixtureMatch.id,fixtureMatch.pages);}
 catch(error){if(!failed)throw error;console.error('Chat-read fixture match cleanup failed after the original test failure');}
 finally{await browser.close();}
}
