import {db,redis} from './db';

const activityKey='dartspoint:impacts:active';
const activityMs=2000;
const recoveryMs=1000;
const hintTimeoutMs=25;
let pendingWake:Promise<unknown>|undefined;

async function boundedHint<T>(operation:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Impact activity hint unavailable')),hintTimeoutMs);})]);}
 finally{if(timer)clearTimeout(timer);}
}

/** Publish before the launch transaction commits; an aborted launch only adds a short idle wake. */
export async function wakeImpactWorker(){
 try{
  pendingWake??=redis().then(client=>client.set(activityKey,'1',{PX:activityMs})).finally(()=>{pendingWake=undefined;});
  await boundedHint(pendingWake);
 }
 catch{/* The database recovery scan remains authoritative if Redis loses the hint. */}
}
export async function hasImpactActivity(){return !!await(await redis()).exists(activityKey);}
export async function hasPendingImpacts(){
 const result=await db().query("select exists(select 1 from match_darts d join matches m on m.id=d.match_id where m.lifecycle='playing' and d.impacted_at is null) or exists(select 1 from practice_sessions where state->>'phase'='flying') pending");
 return result.rows[0].pending as boolean;
}

/** Fast local hints keep impact latency low; compact SQL scans recover missed hints after a restart. */
export class ImpactPolling{
 private nextRecoveryAt=0;
 private recoveredUntil=0;
 private retryActivityAt=0;
 private activityRead:Promise<boolean>|undefined;
 constructor(private readonly options:{hasActivity:()=>Promise<boolean>;hasPending:()=>Promise<boolean>;now?:()=>number}){}
 async shouldPoll(){
  const now=this.options.now??Date.now;
  if(now()<this.retryActivityAt)return true;
  try{
   // A stalled reconnect/offline queue must neither stop the worker nor accumulate new reads.
   this.activityRead??=this.options.hasActivity().finally(()=>{this.activityRead=undefined;});
   if(await boundedHint(this.activityRead))return true;
  }
  catch{this.retryActivityAt=now()+recoveryMs;return true;}// Keep processing while Redis is unavailable.
  if(now()<this.recoveredUntil)return true;
  if(now()<this.nextRecoveryAt)return false;
  const pending=await this.options.hasPending();
  this.nextRecoveryAt=now()+recoveryMs;
  if(pending)this.recoveredUntil=now()+activityMs;
  return pending;
 }
}
