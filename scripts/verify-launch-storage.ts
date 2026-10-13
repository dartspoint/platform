/** Staging-only reserved-address probe; never sends mail or creates an Auth user. */
import {db} from '../packages/data/src/db';
import {launchSignup} from '../packages/data/src/launch';
const mode=process.argv[2],sha=process.env.RELEASE_SHA;
if(process.env.APP_ENV!=='staging'||!sha||!/^[a-f0-9]{40}$/.test(sha)||!['create','check','remove'].includes(mode))throw new Error('Staging release probe only');
const email=`deploy-${sha}@validation.invalid`;
try{
 if(mode==='remove'){await db().query('delete from private.launch_subscriptions where email=$1',[email]);console.log(JSON.stringify({ok:true,probeRemoved:true}));}
 else {
  if(mode==='create'){if(!process.env.LANDING_ORIGIN)throw new Error('Landing origin required');await launchSignup({email,consent:true,website:''},process.env.LANDING_ORIGIN);await launchSignup({email:email.toUpperCase(),consent:true,website:''},process.env.LANDING_ORIGIN);}
  const rows=(await db().query('select id,subscribed_at,consent_version,source,unsubscribe_hash from private.launch_subscriptions where email=$1',[email])).rows;
  if(rows.length!==1||!/^[0-9a-f]{64}$/.test(rows[0].unsubscribe_hash)||rows[0].source!==process.env.LANDING_ORIGIN)throw new Error('Storage probe failed');
  console.log(JSON.stringify({ok:true,id:rows[0].id,subscribedAt:rows[0].subscribed_at,consentVersion:rows[0].consent_version}));
 }
}finally{await db().end();}
