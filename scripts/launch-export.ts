/** Private operator CLI. No public export endpoint or automatic campaign. */
import {db} from '../packages/data/src/db';
import {exportLaunchSubscriptions} from '../packages/data/src/launch';
if(process.argv.slice(2).some(arg=>arg!=='--issue-unsubscribe-links'))throw new Error('Unknown export option');
const withLinks=process.argv.includes('--issue-unsubscribe-links');
if(withLinks&&!process.env.LANDING_ORIGIN)throw new Error('LANDING_ORIGIN is required');
try{
 const rows=await exportLaunchSubscriptions(withLinks);
 process.stdout.write(JSON.stringify(rows,null,2)+'\n');
}finally{await db().end();}
