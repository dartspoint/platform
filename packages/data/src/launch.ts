import {createHash,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {db,transaction,rateLimit} from './db';
import {DomainError,requireThat,isValidationError} from '../../contracts/src/index';

export const LAUNCH_CONSENT_VERSION='2026-10-13-v1';
export const launchSignupSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),consent:z.literal(true),website:z.literal('')}).strict();
export const launchUnsubscribeSchema=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export function unsubscribeHash(token:string){return createHash('sha256').update(token).digest('hex');}
export async function launchSignup(input:unknown,source:string){
 const {email}=launchSignupSchema.parse(input);
 await db().query('insert into private.launch_subscriptions(email,source,consent_version,unsubscribe_hash) values($1,$2,$3,$4) on conflict(email) do nothing',[email,source,LAUNCH_CONSENT_VERSION,unsubscribeHash(randomBytes(32).toString('base64url'))]);
 return {ok:true};
}
export async function launchUnsubscribe(input:unknown){
 const {token}=launchUnsubscribeSchema.parse(input);
 await db().query('delete from private.launch_subscriptions where unsubscribe_hash=$1 or id in(select subscription_id from private.launch_unsubscribe_tokens where token_hash=$1)',[unsubscribeHash(token)]);
 return {ok:true};
}
/** Every privately issued link remains usable until deletion; never persist plaintext. */
export async function exportLaunchSubscriptions(withLinks=false){return transaction(async c=>{
 const result=await c.query('select id,email,subscribed_at,source,consent_version from private.launch_subscriptions order by subscribed_at'+(withLinks?' for update':''));
 for(const row of result.rows)if(withLinks){const token=randomBytes(32).toString('base64url');await c.query('insert into private.launch_unsubscribe_tokens(subscription_id,token_hash) select id,unsubscribe_hash from private.launch_subscriptions where id=$1 on conflict do nothing',[row.id]);await c.query('update private.launch_subscriptions set unsubscribe_hash=$2 where id=$1',[row.id,unsubscribeHash(token)]);row.unsubscribeUrl=process.env.LANDING_ORIGIN+'/?afmelden='+token;}
 return result.rows;
});}
async function boundedJson(request:Request){
 requireThat(request.headers.get('content-type')?.split(';')[0].trim()==='application/json','json_required',415);
 const length=request.headers.get('content-length');requireThat(!length||/^\d+$/.test(length)&&Number(length)<=4096,'request_too_large',413);
 const reader=request.body?.getReader();requireThat(reader,'invalid_json',400);
 const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>4096){await reader.cancel();throw new DomainError('request_too_large',413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new DomainError('invalid_input',400);}
}
export async function launchRequest(request:Request,kind:'signup'|'unsubscribe'){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 const response=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  const origin=process.env.LANDING_ORIGIN;requireThat(origin,'landing_unconfigured',503);
  requireThat(request.headers.get('origin')===origin,'origin',403);
  // Hosted app ports bind only to loopback; native Caddy replaces untrusted XFF.
  // Native development requests share a budget and cannot spoof forwarding headers.
  const forwarded=process.env.TRUST_PROXY==='caddy'?request.headers.get('x-forwarded-for')?.trim():undefined;
  const ip=forwarded&&isIP(forwarded)?forwarded:'direct';
  const key=createHash('sha256').update(Math.floor(Date.now()/86400000)+':'+ip).digest('hex');
  await rateLimit('launch:'+kind+':'+key,20,600);
  const input=await boundedJson(request);
  return response(kind==='signup'?await launchSignup(input,origin!):await launchUnsubscribe(input));
 }catch(error){
  if(error instanceof DomainError)return response({ok:false,code:error.code,message:error.status===429?'Even te veel verzoeken. Probeer het later opnieuw.':error.status===503?'Aanmelden is tijdelijk niet beschikbaar. Probeer het opnieuw.':'Controleer je verzoek.'},error.status);
  if(isValidationError(error)||error instanceof SyntaxError)return response({ok:false,code:'invalid_input',message:'Controleer de ingevulde gegevens.'},400);
  console.error(JSON.stringify({event:'launch_request_failed',operation:kind}));
  return response({ok:false,code:'unavailable',message:'Het opslaan lukt even niet. Probeer het opnieuw.'},503);
 }
}
