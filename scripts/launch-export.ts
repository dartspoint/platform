/** Private operator CLI. No public export endpoint or automatic campaign. */
import {randomBytes} from 'node:crypto';
import {transaction,db} from '../packages/data/src/db';
import {unsubscribeHash} from '../packages/data/src/launch';
if(process.argv.slice(2).some(arg=>arg!=='--issue-unsubscribe-links'))throw new Error('Unknown export option');
const withLinks=process.argv.includes('--issue-unsubscribe-links');
if(withLinks&&!process.env.LANDING_ORIGIN)throw new Error('LANDING_ORIGIN is required');
try{
 const rows=await transaction(async c=>{
  const result=await c.query('select id,email,subscribed_at,source,consent_version from private.launch_subscriptions order by subscribed_at'+(withLinks?' for update':''));
  for(const row of result.rows)if(withLinks){const token=randomBytes(32).toString('base64url');await c.query('update private.launch_subscriptions set unsubscribe_hash=$2 where id=$1',[row.id,unsubscribeHash(token)]);row.unsubscribeUrl=process.env.LANDING_ORIGIN+'/?afmelden='+token;}
  return result.rows;
 });
 process.stdout.write(JSON.stringify(rows,null,2)+'\n');
}finally{await db().end();}
