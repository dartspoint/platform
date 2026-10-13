import {createServer} from 'node:http';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {Room,Server,matchMaker,type Client} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {db,redis,transaction} from '../../../packages/data/src/db';
import {verifyToken,assertSessionActive,actorById,type Actor} from '../../../packages/data/src/auth';
import {drainAdmissions} from '../../../packages/data/src/lifecycle';
import {readiness} from '../../../packages/data/src/health';
import {acquireMatch,renewMatch,matchAccess,matchAccessBatch,matchCommand,connection} from '../../../packages/data/src/matches';
import {trustedLatency} from '../../../packages/game-core/src/timing';
import {DomainError,requireThat,uuid} from '../../../packages/contracts/src/index';

const writerId=randomUUID();
const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
const inboxes=new Map<string,DartsPersonal>();
class DartsPersonal extends Room {
 maxClients=20;userId='';
 async onCreate(options:any){
  this.userId=uuid.parse(options.userId);await this.setMetadata({userId:this.userId});inboxes.set(this.userId,this);
  this.onMessage('authenticate',async(client:Client,input:any)=>{try{const actor=await verifyToken(input?.token);requireThat(actor.id===this.userId,'identity_mismatch',403);client.auth=actor;}catch{client.leave(4001);}});
  this.clock.setInterval(async()=>{for(const client of this.clients){try{await assertSessionActive(client.auth as Actor);await actorById(this.userId,(client.auth as Actor).expiresAt);}catch{client.leave(4001);}}},10000);
 }
 async onAuth(_client:Client,options:any){const actor=await verifyToken(options?.token);requireThat(actor.id===this.userId,'forbidden',403);return actor;}
 onJoin(client:Client){client.send('chat.changed',{});}
 onDispose(){if(inboxes.get(this.userId)===this)inboxes.delete(this.userId);}
}
class DartsMatch extends Room {
 maxClients=52;matchId='';fence=0;version=-1;queue:Promise<unknown>=Promise.resolve();pendingCommands=0;publishing=false;
 challenges=new WeakMap<Client,{nonce:string;at:number}>();samples=new WeakMap<Client,number[]>();
 async onCreate(options:any){
  this.matchId=uuid.parse(options.matchId);this.fence=await acquireMatch(this.matchId,writerId);await this.setMetadata({matchId:this.matchId});
  this.onMessage('command',(client:Client,input:unknown)=>{
   const receivedAt=Date.now(),actor=client.auth as Actor,latencyMs=trustedLatency(this.samples.get(client)??[]);
   if(this.pendingCommands>=16||actor.expiresAt<=receivedAt){client.send('error',{code:'command_busy',message:'Wacht op je vorige actie of herstel je verbinding.'});return;}
   this.pendingCommands++;
   this.queue=this.queue.then(async()=>{
    try{const result=await matchCommand(actor,input,writerId,this.fence,{receivedAt,latencyMs});client.send('receipt',result);void this.publish();}
    catch(e){client.send('error',{code:e instanceof DomainError?e.code:'invalid_command',message:e instanceof DomainError?e.message:'De actie kon niet worden uitgevoerd.'});}
    finally{this.pendingCommands--;}
   });
  });
  this.onMessage('clock.ping',(client:Client,input:any)=>{try{const nonce=uuid.parse(input?.nonce);client.send('clock.sample',{nonce,serverAt:Date.now()});}catch{}});
  this.onMessage('clock.echo',(client:Client,input:any)=>{const challenge=this.challenges.get(client);if(!challenge||input?.nonce!==challenge.nonce)return;this.challenges.delete(client);const rtt=performance.now()-challenge.at;if(rtt>=0&&rtt<=1000)this.samples.set(client,[...(this.samples.get(client)??[]),rtt].slice(-12));});
  this.clock.setInterval(()=>{for(const client of this.clients){const nonce=randomUUID();this.challenges.set(client,{nonce,at:performance.now()});client.send('clock.challenge',{nonce});}},2000);
  this.onMessage('authenticate',async(client:Client,input:any)=>{try{const actor=await verifyToken(input?.token);requireThat(actor.id===(client.auth as Actor).id,'identity_mismatch',403);client.auth=actor;}catch{client.leave(4001);}});
  // At most one publication; periodic reads never join the authoritative command queue.
  this.clock.setInterval(()=>{void this.publish();},100);
  this.clock.setInterval(async()=>{if(!await renewMatch(this.matchId,writerId,this.fence))await this.disconnect();},10000);
  this.clock.setInterval(async()=>{for(const client of this.clients){try{const actor=client.auth as Actor;requireThat(actor.expiresAt>Date.now(),'session_expired',401);await assertSessionActive(actor);const fresh=await actorById(actor.id,actor.expiresAt);requireThat(fresh.sessionVersion===actor.sessionVersion,'session_revoked',401);await matchAccess(fresh,this.matchId);}catch{client.leave(4001);}}},10000);
 }
 async onAuth(_client:Client,options:any){const actor=await verifyToken(options?.token);await matchAccess(actor,this.matchId);return actor;}
 async onJoin(client:Client){await connection(client.auth as Actor,this.matchId,true);client.send('snapshot',await matchAccess(client.auth as Actor,this.matchId));}
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
 async onDispose(){await db().query('update matches set lease_until=now() where id=$1 and writer_id=$2 and writer_fence=$3',[this.matchId,writerId,this.fence]);}
}
const http=createServer();
// Colyseus handles HTTP matchmaking before Express; configure its supported CORS hook.
matchMaker.controller.getCorsHeaders=()=>({'Access-Control-Allow-Origin':process.env.NEXT_PUBLIC_APP_URL??'',Vary:'Origin'});
const server=new Server({greet:false,gracefullyShutdown:false,transport:new WebSocketTransport({server:http,verifyClient:({origin},done)=>done(!origin||origin===process.env.NEXT_PUBLIC_APP_URL)}),express:app=>{
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
await notifications.subscribe('dartspoint:chat-events',data=>{
 try{const event=JSON.parse(data);for(const userId of new Set<string>(event.userIds))for(const client of inboxes.get(userId)?.clients??[]){if((client.auth as Actor).expiresAt>Date.now())client.send('chat.changed',{channelId:event.channelId,messageId:event.messageId});}}catch{console.error(JSON.stringify({event:'chat_notification_failed'}));}
});
await server.listen(Number(process.env.PORT??42567),process.env.BIND_HOST??'127.0.0.1');
console.log(JSON.stringify({event:'realtime_started',release:process.env.RELEASE_SHA??'local-development'}));
process.on('SIGTERM',()=>{void server.gracefullyShutdown(false).then(()=>notifications.quit()).then(()=>process.exit(0));});
