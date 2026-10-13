/** Reserved-address probe for staging/local acceptance; no mail or Auth user. */
import {db} from '../packages/data/src/db';
import {randomBytes} from 'node:crypto';
import {unsubscribeHash} from '../packages/data/src/launch';
const mode=process.argv[2],sha=process.env.RELEASE_SHA;
const localDevelopment=process.env.APP_ENV==='development'&&(()=>{try{return ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL??'').hostname);}catch{return false;}})();
if(!(process.env.APP_ENV==='staging'||localDevelopment)||!sha||!/^[a-f0-9]{40}$/.test(sha)||!['create','check','remove'].includes(mode))throw new Error('Staging/local release probe only');
const email=`deploy-${sha}@validation.invalid`;
async function publicRequest(path:string,body:unknown){
 const origin=process.env.LANDING_ORIGIN;if(!origin)throw new Error('Landing origin required');
 const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(response.status!==200||result.ok!==true)throw new Error('Public launch route failed');
}
try{
 if(mode==='remove'){
  const token=randomBytes(32).toString('base64url');
  const updated=await db().query('update private.launch_subscriptions set unsubscribe_hash=$2 where email=$1',[email,unsubscribeHash(token)]);
  if(updated.rowCount){await publicRequest('/api/launch-unsubscribe',{token});await publicRequest('/api/launch-unsubscribe',{token});}
  if((await db().query('select id from private.launch_subscriptions where email=$1',[email])).rowCount)throw new Error('Public unsubscribe did not remove probe');
  console.log(JSON.stringify({ok:true,probeRemoved:true}));
 }
 else {
  if(mode==='create'){await publicRequest('/api/launch-signups',{email,consent:true,website:''});await publicRequest('/api/launch-signups',{email:email.toUpperCase(),consent:true,website:''});}
  const rows=(await db().query('select id,subscribed_at,consent_version,source,unsubscribe_hash from private.launch_subscriptions where email=$1',[email])).rows;
  if(rows.length!==1||!/^[0-9a-f]{64}$/.test(rows[0].unsubscribe_hash)||rows[0].source!==process.env.LANDING_ORIGIN)throw new Error('Storage probe failed');
  console.log(JSON.stringify({ok:true,id:rows[0].id,subscribedAt:rows[0].subscribed_at,consentVersion:rows[0].consent_version}));
 }
}catch{
 // Do not leave a reserved fixture behind after a failed public route. The
 // failure still propagates so cleanup cannot turn a failed gate into success.
 if(mode!=='check')await db().query('delete from private.launch_subscriptions where email=$1',[email]);
 throw new Error('Launch storage/public route probe failed');
}finally{await db().end();}
