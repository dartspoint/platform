import {isTrustedOrigin} from '../../../packages/i18n/src/domains';
import {createServer} from 'node:http';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {timingSafeEqual,randomUUID,createHash} from 'node:crypto';
import {Room,Server,matchMaker,type Client} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {db,redis,transaction} from '../../../packages/data/src/db';
import {verifyToken,assertSessionActive,actorById,type Actor} from '../../../packages/data/src/auth';
import {drainAdmissions} from '../../../packages/data/src/lifecycle';
import {personalChatChange} from '../../../packages/data/src/community';
import {readiness} from '../../../packages/data/src/health';
import {acquireMatch,renewMatch,matchAccess,matchAccessBatch,captureMatchIngress,matchCommand,connection} from '../../../packages/data/src/matches';
import {trustedLatency,sampleWindow} from '../../../packages/game-core/src/timing';
import {IngressOrder} from '../../../packages/data/src/ingress-order';
import {DomainError,requireThat,uuid,commandSchema} from '../../../packages/contracts/src/index';
import {roomSubscription,removeRoomSubscription} from '../../../packages/data/src/npc-audience';
import {npcMatchTick} from '../../../packages/data/src/matches';
import {MatchWriterLease} from './match-writer-lease';

const writerId=randomUUID();
const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
const inboxes=new Map<string,DartsPersonal>();
class DartsPersonal extends Room {
 maxClients=20;userId='';subscriptions=new WeakMap<Client,string>();
 async onCreate(options:any){
  this.onMessage('room.subscription',async(client:Client,input:any)=>{try{const roomId=input?.roomId===null?null:uuid.parse(input?.roomId),id=this.subscriptions.get(client);if(id)await roomSubscription(client.auth as Actor,id,roomId);}catch{}});
  this.userId=uuid.parse(options.userId);await this.setMetadata({userId:this.userId});inboxes.set(this.userId,this);
  this.onMessage('authenticate',async(client:Client,input:any)=>{try{const actor=await verifyToken(input?.token);requireThat(actor.id===this.userId,'identity_mismatch',403);client.auth=actor;}catch{client.leave(4001);}});
  this.clock.setInterval(async()=>{for(const client of this.clients){try{await assertSessionActive(client.auth as Actor);await actorById(this.userId,(client.auth as Actor).expiresAt);}catch{client.leave(4001);}}},10000);
 }
 async onAuth(_client:Client,options:any){const actor=await verifyToken(options?.token);requireThat(actor.id===this.userId,'forbidden',403);return actor;}
 onJoin(client:Client){this.subscriptions.set(client,randomUUID());client.send('chat.changed',{});}
 async onLeave(client:Client){const id=this.subscriptions.get(client);if(id)await removeRoomSubscription(id);}
 onDispose(){if(inboxes.get(this.userId)===this)inboxes.delete(this.userId);}
}
class DartsMatch extends Room {
 maxClients=52;matchId='';fence=0;version=-1;queue:Promise<unknown>=Promise.resolve();pendingCommands=0;publishing=false;
 writerLease:MatchWriterLease|undefined;
 challenges=new WeakMap<Client,{nonce:string;at:number}>();samples=new WeakMap<Client,number[]>();
 connections=new WeakMap<Client,string>();
 ingressOrder=new IngressOrder(16,16);
 challenge(client:Client){if(this.challenges.has(client))return;const nonce=randomUUID();this.challenges.set(client,{nonce,at:performance.now()});client.send('clock.challenge',{nonce});}
 async onCreate(options:any){
  this.matchId=uuid.parse(options.matchId);this.fence=await acquireMatch(this.matchId,writerId);
  this.writerLease=new MatchWriterLease({
   renew:()=>renewMatch(this.matchId,writerId,this.fence),
   release:()=>db().query('update matches set lease_until=now() where id=$1 and writer_id=$2 and writer_fence=$3',[this.matchId,writerId,this.fence]),
   disconnect:()=>this.disconnect(),report:event=>console.error(JSON.stringify({event})),
  });
  await this.setMetadata({matchId:this.matchId});
  this.onMessage('command',(client:Client,input:unknown)=>{
   const receivedAt=Date.now(),actor=client.auth as Actor,samples=this.samples.get(client)??[],latencyMs=trustedLatency(samples),connectionId=this.connections.get(client),admissionWindowMs=sampleWindow(samples);
   const commandId=uuid.safeParse((input as any)?.commandId).success?(input as any).commandId:undefined;
   if(this.writerLease?.isClosing||this.pendingCommands>=16||actor.expiresAt<=receivedAt){client.send('error',{commandId,code:'command_busy',message:'Wacht op je vorige actie of herstel je verbinding.'});return;}
   this.pendingCommands++;
   // Reserve receive order before asynchronous policy/DB reads. Capture has its
   // own short queue; snapshots and clocks never enter either command queue.
   const captured=this.ingressOrder.reserve('commands').run(()=>captureMatchIngress(actor,input,{receivedAt,latencyMs,connectionId,admissionWindowMs})).then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
   this.queue=this.queue.then(async()=>{
    let original:Awaited<ReturnType<typeof captureMatchIngress>>|undefined;
    try{const capture=await captured;if(!capture.ok)throw capture.error;original=capture.value;requireThat(!this.writerLease?.isClosing,'stale_writer',409);const result=await matchCommand(actor,input,writerId,this.fence,{receivedAt,latencyMs,connectionId,admissionWindowMs});client.send('receipt',result);void this.publish();}
    catch(e){
     let ingress;
     // Only this authenticated player's invalid-sample rejection gets its
     // immutable capture. Successful registration already verified the prior
     // row's actor/UUID keys and this exact canonical payload hash. Never use a
     // retry's current receive time/window or label a rejection as a receipt.
     if(original&&e instanceof DomainError&&e.code==='invalid_render_sample'){
      const parsed=commandSchema.safeParse(input);
      if(parsed.success&&parsed.data.matchId===this.matchId&&parsed.data.type.startsWith('dart.stop_')){
       ingress={source:'server-original-command-ingress-v1',scope:'match',actorId:actor.id,commandId:parsed.data.commandId,matchId:parsed.data.matchId,payloadHash:createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),...original};
      }
     }
     client.send('error',{commandId,code:e instanceof DomainError?e.code:'invalid_command',message:e instanceof DomainError?e.message:'De actie kon niet worden uitgevoerd.',...(ingress?{ingress}:{})});
    }
    finally{this.pendingCommands--;}
   });
  });
  this.onMessage('clock.ping',(client:Client,input:any)=>{const serverReceivedAt=Date.now();try{const nonce=uuid.parse(input?.nonce);client.send('clock.sample',{nonce,serverAt:Date.now(),serverReceivedAt,connectionId:this.connections.get(client),ready:(this.samples.get(client)?.length??0)>=3});if((this.samples.get(client)?.length??0)<3)this.challenge(client);}catch{}});
  this.onMessage('clock.echo',(client:Client,input:any)=>{const challenge=this.challenges.get(client);if(!challenge||input?.nonce!==challenge.nonce)return;this.challenges.delete(client);const rtt=performance.now()-challenge.at;if(rtt>=0&&rtt<=1000){const samples=[...(this.samples.get(client)??[]),rtt].slice(-12);this.samples.set(client,samples);client.send('clock.ready',{connectionId:this.connections.get(client),ready:samples.length>=3});}});
  this.clock.setInterval(()=>{for(const client of this.clients)this.challenge(client);},2000);
  this.onMessage('authenticate',async(client:Client,input:any)=>{try{const actor=await verifyToken(input?.token);requireThat(actor.id===(client.auth as Actor).id,'identity_mismatch',403);client.auth=actor;}catch{client.leave(4001);}});
  // At most one publication; periodic reads never join the authoritative command queue.
  this.clock.setInterval(()=>{void this.publish();},100);
  const hasNpc=!!(await db().query("select 1 from match_players mp join profiles p on p.id=mp.user_id where mp.match_id=$1 and p.actor_kind='npc'",[this.matchId])).rowCount;this.autoDispose=!hasNpc;
  if(hasNpc)this.clock.setInterval(()=>{if(!this.writerLease?.isClosing)this.queue=this.queue.then(async()=>{await npcMatchTick(this.matchId,writerId,this.fence);const m=(await db().query('select lifecycle from matches where id=$1',[this.matchId])).rows[0];if(!['assigned','playing','paused'].includes(m?.lifecycle)&&!this.clients.length)void this.disconnect();}).catch(()=>{});},500);
  this.clock.setInterval(()=>{void this.writerLease?.renew();},10000);
  this.clock.setInterval(async()=>{for(const client of this.clients){try{const actor=client.auth as Actor;requireThat(actor.expiresAt>Date.now(),'session_expired',401);await assertSessionActive(actor);const fresh=await actorById(actor.id,actor.expiresAt);requireThat(fresh.sessionVersion===actor.sessionVersion,'session_revoked',401);await matchAccess(fresh,this.matchId);}catch{client.leave(4001);}}},10000);
 }
 async onAuth(_client:Client,options:any){const actor=await verifyToken(options?.token);await matchAccess(actor,this.matchId);return actor;}
 async onJoin(client:Client){this.connections.set(client,randomUUID());await connection(client.auth as Actor,this.matchId,true);client.send('snapshot',await matchAccess(client.auth as Actor,this.matchId));this.challenge(client);}
 async publish(){
  if(this.publishing||this.clients.length===0)return;this.publishing=true;
  try{
   const m=(await db().query('select state_version from matches where id=$1',[this.matchId])).rows[0];if(!m||Number(m.state_version)===this.version)return;
   const views=await matchAccessBatch(this.clients.map(c=>c.auth as Actor),this.matchId);
   for(const client of this.clients){const view=views.get((client.auth as Actor).id);if(view)client.send('snapshot',view);else client.leave(4001);}
   this.version=Math.min(...[...views.values()].map(v=>v.stateVersion));
  }catch{console.error(JSON.stringify({event:'match_publication_delayed'}));}
  finally{this.publishing=false;}
 }
 async onDrop(client:Client){
  if(!this.clients.some(c=>c!==client&&(c.auth as Actor)?.id===(client.auth as Actor).id))await connection(client.auth as Actor,this.matchId,false);
  try{await this.allowReconnection(client,120);}catch{}
 }
 async onReconnect(client:Client){await connection(client.auth as Actor,this.matchId,true);client.send('snapshot',await matchAccess(client.auth as Actor,this.matchId));}
 async onLeave(client:Client){if(!this.clients.some(c=>c!==client&&(c.auth as Actor)?.id===(client.auth as Actor).id))await connection(client.auth as Actor,this.matchId,false);}
 async onDispose(){await this.writerLease?.dispose();}
}
setInterval(()=>{void (async()=>{const matches=(await db().query("select distinct m.id from matches m join match_players mp on mp.match_id=m.id join profiles p on p.id=mp.user_id where p.actor_kind='npc' and m.lifecycle in('assigned','playing','paused') and (m.lease_until is null or m.lease_until<now()) limit 25")).rows;for(const match of matches){try{await matchMaker.createRoom('match',{matchId:match.id});}catch{}}})().catch(()=>{});},2000);
const http=createServer();
// Colyseus handles HTTP matchmaking before Express; configure its supported CORS hook.
matchMaker.controller.getCorsHeaders=headers=>({'Access-Control-Allow-Origin':isTrustedOrigin(headers.get('origin'))?headers.get('origin')!:'',Vary:'Origin'});
const server=new Server({greet:false,gracefullyShutdown:false,transport:new WebSocketTransport({server:http,verifyClient:({origin},done)=>done(!origin||isTrustedOrigin(origin))}),express:app=>{
 app.get('/healthz',(_req,res)=>res.json({ok:true,release:process.env.RELEASE_SHA??'local-development'}));
 app.get('/readyz',async(_req,res)=>{try{res.json(await readiness());}catch{res.status(503).json({ok:false});}});
 app.use('/internal',async(req,res,next)=>{
  const token=process.env.INTERNAL_DEPLOY_TOKEN??'',supplied=req.headers.authorization?.replace(/^Bearer /,'')??'';
  // Host port is loopback-only; forwarded/proxied requests are never accepted.
  const direct=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
  if(!direct||req.headers['x-forwarded-for']||req.headers['forwarded']||!token||token.length<43||supplied.length!==token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){res.status(404).end();return;}next();
 });
 app.get('/internal/deploy/status',async(_req,res)=>{try{res.json(await transaction(async c=>{await c.query('select * from private.admission_lock where id=1 for update');const r=await redis();const draining=(await r.get('dartspoint:draining'))!=='0';const q=(await c.query("select (select count(*) from matches where lifecycle in('playing','paused')) active,(select count(*) from match_darts where impacted_at is null) impacts,(select count(*) from private.outbox_events where kind='match-result' and delivered_at is null) writes")).rows[0];const activeMatches=Number(q.active),pendingImpacts=Number(q.impacts),pendingWrites=Number(q.writes);return {draining,activeMatches,pendingImpacts,pendingWrites,safeToStop:draining&&activeMatches===0&&pendingImpacts===0&&pendingWrites===0};}));}catch{res.status(503).json({ok:false});}});
 app.post('/internal/deploy/drain',async(_req,res)=>{try{await drainAdmissions();res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.get('/internal/deploy/metrics',(_req,res)=>res.json({rssBytes:process.memoryUsage().rss,eventLoopP95Ms:eventLoop.percentile(95)/1e6,eventLoopMaxMs:eventLoop.max/1e6}));
 app.post('/internal/deploy/resume',async(_req,res)=>{try{await readiness();await transaction(async c=>{await c.query('select * from private.admission_lock where id=1 for update');await (await redis()).set('dartspoint:draining','0');});res.json({ok:true});}catch{res.status(503).json({ok:false});}});
}});
server.define('match',DartsMatch).filterBy(['matchId']);
server.define('personal',DartsPersonal).filterBy(['userId']);
const notifications=(await redis()).duplicate();await notifications.connect();
await notifications.subscribe('dartspoint:chat-events',async data=>{
 try{const event=JSON.parse(data),clients=[...new Set<string>(event.userIds)].flatMap(userId=>inboxes.get(userId)?.clients??[]),messages=await personalChatChange(event.messageId,clients.map(client=>client.auth as Actor));
  for(const client of clients){const actor=client.auth as Actor,message=messages.get(actor.id+':'+actor.sessionId);if(message&&actor.expiresAt>Date.now())client.send('chat.changed',{channelId:message.channel_id,messageId:message.id,seq:Number(message.seq),cursor:Number(message.cursor),kind:message.kind,redacted:message.redacted===true,message});}
 }catch{console.error(JSON.stringify({event:'chat_notification_failed'}));}
});
await server.listen(Number(process.env.PORT??42567),process.env.BIND_HOST??'127.0.0.1');
console.log(JSON.stringify({event:'realtime_started',release:process.env.RELEASE_SHA??'local-development'}));
process.on('SIGTERM',()=>{void server.gracefullyShutdown(false).then(()=>notifications.quit()).then(()=>process.exit(0));});
