import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,redis,rateLimit} from './db';
import type {Actor} from './auth';
import {requireThat,uuid} from '../../contracts/src/index';
import {TIMING_VERSION,trustedLatency,type TimingVersion} from '../../game-core/src/timing';
export type TrustedIngress={receivedAt:number;latencyMs?:number};
export async function registerIngress(scope:'match'|'practice',actor:Actor,commandId:string,payload:unknown,ingress:TrustedIngress,version:TimingVersion=TIMING_VERSION){
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 requireThat(Number.isInteger(ingress.receivedAt)&&ingress.receivedAt<=Date.now(),'invalid_timing',409);
 const latency=version==='receive-v1'?0:Math.min(90,Math.max(0,Math.floor(ingress.latencyMs??0)));
 const inserted=await db().query('insert into private.command_ingress(scope,actor_id,command_id,payload_hash,received_at,latency_ms,timing_version) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning *',[scope,actor.id,commandId,hash,new Date(ingress.receivedAt),latency,version]);
 const prior=inserted.rows[0]??(await db().query('select * from private.command_ingress where scope=$1 and actor_id=$2 and command_id=$3',[scope,actor.id,commandId])).rows[0];
 requireThat(prior.payload_hash===hash,'idempotency_conflict',409);
 return {receivedAt:new Date(prior.received_at).getTime(),latencyMs:Number(prior.latency_ms),timingVersion:prior.timing_version as TimingVersion};
}
export async function timingPing(actor:Actor){
 await rateLimit('timing:'+actor.id,60,60);const nonce=randomUUID(),serverAt=Date.now();
 await(await redis()).set('dartspoint:timing:'+actor.id+':'+nonce,String(serverAt),{EX:10});return {nonce,serverAt};
}
export async function timingEcho(actor:Actor,input:unknown,receivedAt:number){
 const {nonce}=z.object({nonce:uuid}).strict().parse(input);const r=await redis();
 const sent=await r.getDel('dartspoint:timing:'+actor.id+':'+nonce);requireThat(sent,'clock_challenge_expired',409);
 const rtt=receivedAt-Number(sent);requireThat(rtt>=0&&rtt<=1000,'clock_sample_rejected',409);
 const key='dartspoint:timing-samples:'+actor.id;
 await r.lPush(key,String(rtt));await r.lTrim(key,0,11);await r.expire(key,30);return {ok:true};
}
export async function practiceIngress(actor:Actor,receivedAt:number){const samples=await(await redis()).lRange('dartspoint:timing-samples:'+actor.id,0,11);return {receivedAt,latencyMs:trustedLatency(samples.map(Number))};}
