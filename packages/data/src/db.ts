import {postgresOptions} from './postgres';
import { Pool, type PoolClient } from 'pg';
import { createClient } from 'redis';
import { DomainError } from '../../contracts/src/index';
let pool:Pool|undefined;
export function db():Pool {
 if(!pool) {
   const url=process.env.DATABASE_URL;
   if(!url) throw new DomainError('unavailable',503);
   pool=new Pool({...postgresOptions(url),max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
   pool.on('error',()=>console.error(JSON.stringify({event:'database_pool_error'})));
 }
 return pool;
}
let redisClient:ReturnType<typeof createClient>|undefined;
let connecting:Promise<unknown>|undefined;
export async function redis() {
 if(!redisClient) { redisClient=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:5000}}); redisClient.on('error',()=>{}); }
 if(!redisClient.isOpen) connecting??=redisClient.connect().finally(()=>{connecting=undefined;});
 if(connecting) await connecting;
 return redisClient;
}
export async function transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T> {
 for(let attempt=0;;attempt++) {
  const c=await db().connect();
  try { await c.query('begin'); const value=await fn(c); await c.query('commit'); return value; }
  catch(e) { await c.query('rollback'); if(attempt<2 && ['40001','40P01'].includes((e as {code:string}).code)) continue; throw e; }
  finally { c.release(); }
 }
}
export async function audit(c:PoolClient,actor:string|null,action:string,subject:string,data:unknown={},reason?:string) {
 await c.query('insert into private.audit_events(actor_id,action,subject,data,reason) values($1,$2,$3,$4,$5)',[actor,action,subject,JSON.stringify(data),reason??null]);
}
export async function outbox(c:PoolClient,key:string,kind:string,user:string|null,payload:unknown) {
 await c.query('insert into private.outbox_events(dedupe_key,kind,user_id,payload) values($1,$2,$3,$4) on conflict(dedupe_key) do nothing',[key,kind,user,JSON.stringify(payload)]);
}
export async function draining():Promise<boolean> { const r=await redis();return (await r.get('dartspoint:draining'))!=='0'||(await r.get('dartspoint:maintenance'))==='1'; }
export async function rateLimit(key:string,limit:number,seconds:number) {
 const r=await redis();
 const n=Number(await r.eval('local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("EXPIRE",KEYS[1],ARGV[1]); end; return n',{keys:['dartspoint:rate:'+key],arguments:[String(seconds)]}));
 if(n>limit) throw new DomainError('rate_limited',429,'Probeer het later opnieuw.');
}
