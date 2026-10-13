/** Operator acceptance only: two reserved players, TLS over a local Tailscale tunnel. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {connect,type Socket} from 'node:net';
import {resolve} from 'node:path';
import {chromium,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

const [mode='smoke',expectedRelease]=process.argv.slice(2);
if(!['smoke','practice','game','chat'].includes(mode)||!expectedRelease?.match(/^[a-f0-9]{40}$/))throw new Error('Usage: acceptance.ts smoke|practice|game|chat EXPECTED_STAGING_SHA');
const fixturePath=resolve(process.env.E2E_STAGING_FIXTURE??'artifacts/staging-browser-fixture.private.json');
if(statSync(fixturePath).mode&0o077)throw new Error('Staging fixture must be private');
const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
const origin='https://staging.dartspoint.nl';
assert.equal(fixture.origin,origin);assert.equal(fixture.fixtures.length,2);
const publishable=execFileSync('gh',['variable','get','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','--env','staging'],{encoding:'utf8'}).trim();
for(const player of fixture.fixtures){
 const client=createClient(fixture.supabaseUrl,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.refreshSession({refresh_token:player.session.refresh_token});
 if(error||!data.session||data.user?.id!==player.id)throw new Error('Reserved staging session could not be refreshed');
 player.session=data.session;
}
writeFileSync(fixturePath,JSON.stringify(fixture),{mode:0o600});

const privateHosts=new Set(['staging.dartspoint.nl','realtime.staging.dartspoint.nl']);
const allowedHosts=new Set([...privateHosts,new URL(fixture.supabaseUrl).hostname]);
const sockets=new Set<Socket>();
const proxy=createServer((_request,response)=>{response.writeHead(405);response.end();});
proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
proxy.on('connect',(request,client,head)=>{
 const match=/^([a-z0-9.-]+):443$/.exec(request.url??'');
 if(!match||!allowedHosts.has(match[1])){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 const upstream=connect({host:privateHosts.has(match[1])?'100.83.117.71':match[1],port:443});
 sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));
 upstream.on('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
 upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.on('close',()=>upstream.destroy());
});
await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const address=proxy.address();if(!address||typeof address==='string')throw new Error('Proxy did not bind');
process.env.E2E_ORIGIN=origin;process.env.E2E_STAGING_FIXTURE=fixturePath;process.env.E2E_STAGING_PROXY=`http://127.0.0.1:${address.port}`;
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let chatProof:any;
const epochNow=()=>performance.timeOrigin+performance.now();
const pageState=(page:Page)=>page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState}));
function writeChatProof(){
 if(!chatProof)return;
 const percentile=(field:string)=>{const values=chatProof.samples.map((r:any)=>r[field]).filter((v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)).sort((a:number,b:number)=>a-b);return values.length?values[Math.ceil(values.length*.95)-1]:null;};
 chatProof.completedSamples=chatProof.samples.filter((r:any)=>Number.isFinite(r.recipientMs)).length;
 chatProof.localP95Ms=percentile('localMs');chatProof.recipientP95Ms=percentile('recipientMs');
 writeFileSync('artifacts/staging-chat-latency.json',JSON.stringify(chatProof,null,2));
 console.log('Staging/chat raw latency proof '+JSON.stringify(chatProof));
}
try{
 const {login,get,post}=await import('../e2e/helpers');
 browser=await chromium.launch();const first=await login(browser,'ReservedA');
 const ready=await first.page.request.get(origin+'/readyz');assert.equal(ready.status(),200);
 assert.equal((await ready.json()).release,expectedRelease,'Browser acceptance must use the intended active release');
 const rt=await first.page.request.get('https://realtime.staging.dartspoint.nl/readyz');assert.equal(rt.status(),200);
 assert.equal((await rt.json()).release,expectedRelease,'Realtime acceptance must use the same intended release');
 if(mode==='smoke'){
  const second=await login(browser,'ReservedB');assert.notEqual(first.id,second.id);
  console.log('Verified two separate staging player sessions and intended web/realtime release over TLS');
 }else if(mode==='chat'){
  const second=await login(browser,'ReservedB'),room=(await get(first.page,'bootstrap')).rooms.find((r:any)=>r.name==='Nederland 1');
  for(const actor of [first,second]){await post(actor.page,'room',{roomId:room.id});await actor.page.goto(origin+'/spelen');}
  for(const actor of [first,second])await actor.page.getByLabel('Chatbericht',{exact:true}).waitFor();
  const geometry=await first.page.evaluate(()=>{const rect=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom};};return {left:rect('.dp-workspace>main'),right:rect('.dp-desktop-community'),top:rect('.dp-desktop-community-top'),members:rect('.dp-desktop-players'),friends:rect('.dp-desktop-friends'),chat:rect('.dp-desktop-chat'),composer:rect('.chat-compose'),chatPanels:document.querySelectorAll('.chat-panel').length,height:innerHeight};});
  assert.equal(geometry.chatPanels,1);assert.ok(Math.abs(geometry.left.width-geometry.right.width)<=1);assert.ok(Math.abs(geometry.members.width-geometry.friends.width)<=1);assert.ok(Math.abs(geometry.top.height-geometry.chat.height)<=1);assert.ok(geometry.composer.bottom<=geometry.height+1);
  writeFileSync('artifacts/staging-workspace-geometry.json',JSON.stringify({release:expectedRelease,geometry},null,2));
  const marker='Stagingcontrole '+Date.now();
  await first.page.getByLabel('Chatbericht',{exact:true}).fill(marker);
  await first.page.getByLabel('Chatbericht',{exact:true}).press('Enter');
  await second.page.getByText(marker,{exact:true}).waitFor();
  const channel=(await get(first.page,'bootstrap')).chatChannels.find((c:any)=>c.kind==='community'&&c.roomId===room.id);
  const messages=await get(first.page,'chat/'+channel.id);assert.equal(messages.filter((m:any)=>m.body===marker).length,1);
  const blocked=await first.page.request.post(origin+'/api/platform/chat/send',{data:{channelId:channel.id,clientMessageId:crypto.randomUUID(),body:'k.a.n.k.e.r'}});assert.equal(blocked.status(),400);
  assert.equal((await blocked.json()).code,'message_filtered');
  for(const actor of [first,second])await actor.page.evaluate(()=>{
   const w=window as any;w.__stagingChatSeen={};w.__stagingChatPush={};
   window.addEventListener('dartspoint:chat-changed',(event:any)=>{if(event.detail.messageId)w.__stagingChatPush[event.detail.messageId]={at:performance.timeOrigin+performance.now(),message:event.detail.message};});
   new MutationObserver(()=>{for(const e of document.querySelectorAll('.chat-message p')){const text=e.textContent??'';if(text.startsWith('Staginglatency ')&&!w.__stagingChatSeen[text])w.__stagingChatSeen[text]=performance.timeOrigin+performance.now();}}).observe(document.querySelector('.chat-messages')!,{subtree:true,childList:true,characterData:true});
  });
  // Login contexts never start tracing; screenshots run after the measured phase.
  await first.page.bringToFront();await first.page.getByLabel('Chatbericht',{exact:true}).focus();
  const senderState=await pageState(first.page),receiverState=await pageState(second.page),samples:any[]=[];
  chatProof={release:expectedRelease,samples,limits:{localMs:50,recipientMs:250},measurement:{sender:senderState,receiver:receiverState,receiverUnfocused:!receiverState.focused,tracing:false,screenshotsDuringMeasurement:false,warmupSamplesExcluded:0},environment:'Staging web/PostgreSQL/Redis/Colyseus over Tailscale; two Chromium sessions, actual focus and visibility recorded per sample; no injected delay'};
  assert.equal(senderState.focused,true,'Measured staging sender has document focus');assert.equal(senderState.visibility,'visible','Measured staging sender is visible');
  for(let n=0;n<15;n++){
   if(n%3===0)await first.page.waitForTimeout(2200);
   const text='Staginglatency '+Date.now()+' '+n;await first.page.getByLabel('Chatbericht',{exact:true}).fill(text);
   const sample:any={index:n,senderBefore:await pageState(first.page),receiverBefore:await pageState(second.page),httpStatus:null,httpCode:null,responseHeadersMs:null,httpReceiptMs:null,localMs:null,pushMs:null,recipientMs:null,canonicalPush:null};samples.push(sample);
   assert.equal(sample.senderBefore.focused,true,'Every measured staging send remains focused');assert.equal(sample.senderBefore.visibility,'visible','Every measured staging send remains visible');
   let headersAt:number|undefined;const acknowledgement=first.page.waitForResponse(r=>r.url().endsWith('/chat/send')).then(response=>{headersAt=epochNow();sample.httpStatus=response.status();return response;});
   const started=await first.page.evaluate(()=>{if(!document.hasFocus()||document.visibilityState!=='visible')throw new Error('Measured staging sender lost foreground focus');const at=performance.timeOrigin+performance.now();document.querySelector('.chat-compose input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return at;});
   const response=await acknowledgement,saved=await response.json();sample.responseHeadersMs=headersAt!-started;sample.httpReceiptMs=epochNow()-started;sample.httpCode=typeof saved.code==='string'&&/^[A-Z0-9_-]+$/i.test(saved.code)?saved.code:null;
   // HTTP receipt follows commit; it does not reveal the DB commit timestamp.
   sample.commitResponseMs=sample.httpReceiptMs;
   const local=await first.page.evaluate(text=>(window as any).__stagingChatSeen[text]??null,text);sample.localMs=local===null?null:local-started;
   assert.equal(response.status(),200,'Measured staging send commits successfully');
   await second.page.waitForFunction(text=>(window as any).__stagingChatSeen[text],text);
   const recipient=await second.page.evaluate(text=>(window as any).__stagingChatSeen[text],text);
   const push=await second.page.evaluate(({id,body,clientId,senderId,channelId})=>{const observed=(window as any).__stagingChatPush[id];return {at:observed?.at??null,canonical:{observed:Number.isFinite(observed?.at),bodyMatches:observed?.message?.body===body,clientMessageIdMatches:observed?.message?.client_message_id===clientId,senderMatches:observed?.message?.sender_id===senderId,channelMatches:observed?.message?.channel_id===channelId}};},{id:saved.id,body:text,clientId:saved.client_message_id,senderId:first.id,channelId:channel.id});
   sample.recipientMs=recipient-started;sample.pushMs=push.at===null?null:push.at-started;sample.canonicalPush=push.canonical;sample.senderAfter=await pageState(first.page);sample.receiverAfter=await pageState(second.page);
  }
  // Keep all fifteen raw observations before assertions, and again in finally.
  writeChatProof();assert.equal(samples.length,15);assert.equal(chatProof.completedSamples,15);
  for(const sample of samples){assert.ok(sample.localMs!==null,'Each staging optimistic row is observed');assert.ok(Object.values(sample.canonicalPush).every(Boolean),'Each staging recipient receives the actual canonical stored row');}
  assert.ok(chatProof.localP95Ms<=50,'Staging local chat p95 <=50ms');assert.ok(chatProof.recipientP95Ms<=250,'Staging recipient chat p95 <=250ms');
  await first.page.screenshot({path:'artifacts/staging-chat-desktop.png'});
  await first.page.setViewportSize({width:390,height:844});
  assert.equal(await first.page.locator('.chat-panel').count(),1,'Mobile room has exactly one mounted chat');
  await first.page.screenshot({path:'artifacts/staging-chat-mobile.png'});
  console.log('Live staging: both players received one stored room message; server filtering and mobile single chat verified');
 }
 await first.context.close();await browser.close();browser=undefined;
 if(mode==='practice'||mode==='game'){
  const test=mode==='practice'?'render-sample-timing':'game-timing';
  await new Promise<void>((resolve,reject)=>{
   const child=spawn(process.execPath,['--env-file=.env.local','node_modules/tsx/dist/cli.mjs',`tests/e2e/${test}.ts`],{env:process.env,stdio:'inherit'});
   child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Staging ${mode} failed (${code})`)));
  });
 }
 writeFileSync(`artifacts/staging-${mode}-acceptance.json`,JSON.stringify({ok:true,release:expectedRelease,origin,mode,verifiedAt:new Date().toISOString(),transport:'TLS via local CONNECT proxy and Tailscale',reservedPlayers:2},null,2));
}finally{
 try{writeChatProof();}finally{await browser?.close();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
}
