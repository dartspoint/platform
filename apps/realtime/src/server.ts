import {createServer} from 'node:http';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {Room,Server,type Client} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {db,redis,transaction} from '../../../packages/data/src/db';
import {verifyToken,assertSessionActive,actorById,type Actor} from '../../../packages/data/src/auth';
import {drainAdmissions} from '../../../packages/data/src/lifecycle';
import {readiness} from '../../../packages/data/src/health';
import {acquireMatch,renewMatch,matchAccess,matchCommand,connection} from '../../../packages/data/src/matches';
import {DomainError,requireThat,uuid} from '../../../packages/contracts/src/index';

const writerId=randomUUID();
const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
class DartsMatch extends Room {
 maxClients=52;matchId='';fence=0;version=-1;queue:Promise<unknown>=Promise.resolve();
 async onCreate(options:any){
  this.matchId=uuid.parse(options.matchId);this.fence=await acquireMatch(this.matchId,writerId);await this.setMetadata({matchId:this.matchId});
  this.onMessage('command',(client:Client,input:unknown)=>{
   this.queue=this.queue.then(async()=>{
    try{const result=await matchCommand(client.auth as Actor,input,writerId,this.fence);client.send('receipt',result);await this.publish();}
    catch(e){client.send('error',{code:e instanceof DomainError?e.code:'invalid_command',message:e instanceof DomainError?e.message:'De actie kon niet worden uitgevoerd.'});}
   });
  });
  this.onMessage('authenticate',async(client:Client,input:any)=>{try{const actor=await verifyToken(input?.token);requireThat(actor.id===(client.auth as Actor).id,'identity_mismatch',403);client.auth=actor;}catch{client.leave(4001);}});
  this.clock.setInterval(()=>{this.queue=this.queue.then(()=>this.publish()).catch(()=>{});},100);
  this.clock.setInterval(async()=>{if(!await renewMatch(this.matchId,writerId,this.fence))await this.disconnect();},10000);
  this.clock.setInterval(async()=>{for(const client of this.clients){try{const actor=client.auth as Actor;requireThat(actor.expiresAt>Date.now(),'session_expired',401);await assertSessionActive(actor);const fresh=await actorById(actor.id,actor.expiresAt);requireThat(fresh.sessionVersion===actor.sessionVersion,'session_revoked',401);await matchAccess(fresh,this.matchId);}catch{client.leave(4001);}}},10000);
 }
 async onAuth(_client:Client,options:any){const actor=await verifyToken(options?.token);await matchAccess(actor,this.matchId);return actor;}
 async onJoin(client:Client){await connection(client.auth as Actor,this.matchId,true);client.send('snapshot',await matchAccess(client.auth as Actor,this.matchId));}
 async publish(){
  const m=(await db().query('select state_version from matches where id=$1',[this.matchId])).rows[0];if(!m||Number(m.state_version)===this.version)return;this.version=Number(m.state_version);
  for(const client of this.clients){try{client.send('snapshot',await matchAccess(client.auth as Actor,this.matchId));}catch{client.leave(4001);}}
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
await server.listen(Number(process.env.PORT??42567),process.env.BIND_HOST??'127.0.0.1');
console.log(JSON.stringify({event:'realtime_started',release:process.env.RELEASE_SHA??'local-development'}));
process.on('SIGTERM',()=>{void server.gracefullyShutdown(false).then(()=>process.exit(0));});
