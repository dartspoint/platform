import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,redis,rateLimit} from './db';
import type {Actor} from './auth';
import {requireThat,uuid} from '../../contracts/src/index';
import {TIMING_VERSION,trustedLatency,sampleWindow,type TimingVersion} from '../../game-core/src/timing';
export type TrustedIngress={receivedAt:number;latencyMs?:number;connectionId?:string;admissionWindowMs?:number};
export async function registerIngress(scope:'match'|'practice',actor:Actor,commandId:string,payload:unknown,ingress:TrustedIngress,version:TimingVersion=TIMING_VERSION){
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 requireThat(Number.isInteger(ingress.receivedAt)&&ingress.receivedAt<=Date.now(),'invalid_timing',409);
 const latency=version==='receive-v1'?0:Math.min(90,Math.max(0,Math.floor(ingress.latencyMs??0)));
 const windowMs=version===TIMING_VERSION?Math.min(124,Math.max(0,Math.floor(ingress.admissionWindowMs??0))):0;
 const inserted=await db().query('insert into private.command_ingress(scope,actor_id,command_id,payload_hash,received_at,latency_ms,timing_version,connection_id,admission_window_ms) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning *',[scope,actor.id,commandId,hash,new Date(ingress.receivedAt),latency,version,ingress.connectionId??null,windowMs]);
 const prior=inserted.rows[0]??(await db().query('select * from private.command_ingress where scope=$1 and actor_id=$2 and command_id=$3',[scope,actor.id,commandId])).rows[0];
 requireThat(prior.payload_hash===hash,'idempotency_conflict',409);
 return {receivedAt:new Date(prior.received_at).getTime(),latencyMs:Number(prior.latency_ms),timingVersion:prior.timing_version as TimingVersion,connectionId:prior.connection_id as string|null,admissionWindowMs:Number(prior.admission_window_ms)};
}
function timingKey(actor:Actor,connectionId:string){return 'dartspoint:timing-samples:'+actor.id+':'+(actor.sessionId??'verified')+':'+connectionId;}
export async function timingPing(actor:Actor,receivedAt=Date.now(),input:unknown={}){
 const {connectionId:existing}=z.object({connectionId:uuid.optional()}).strict().parse(input);
 await rateLimit('timing:'+actor.id,60,60);const nonce=randomUUID(),connectionId=existing??randomUUID(),serverAt=Date.now();
 await(await redis()).set('dartspoint:timing:'+actor.id+':'+nonce,JSON.stringify({serverAt,connectionId}),{EX:10});return {nonce,connectionId,serverAt:Date.now(),serverReceivedAt:receivedAt};
}
export async function timingEcho(actor:Actor,input:unknown,receivedAt:number){
 const {nonce}=z.object({nonce:uuid}).strict().parse(input);const r=await redis();
 const sent=await r.getDel('dartspoint:timing:'+actor.id+':'+nonce);requireThat(sent,'clock_challenge_expired',409);
 const challenge=JSON.parse(sent),rtt=receivedAt-Number(challenge.serverAt);requireThat(rtt>=0&&rtt<=1000,'clock_sample_rejected',409);
 const key=timingKey(actor,challenge.connectionId);
 await r.lPush(key,String(rtt));await r.lTrim(key,0,11);await r.expire(key,30);const samples=(await r.lRange(key,0,11)).map(Number);return {ok:true,connectionId:challenge.connectionId,ready:samples.length>=3,admissionWindowMs:sampleWindow(samples)};
}
export async function practiceIngress(actor:Actor,receivedAt:number,connectionId?:unknown){if(!connectionId)return {receivedAt};const id=uuid.parse(connectionId),samples=(await(await redis()).lRange(timingKey(actor,id),0,11)).map(Number);return {receivedAt,connectionId:id,latencyMs:trustedLatency(samples),admissionWindowMs:sampleWindow(samples)};}
