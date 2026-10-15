import {reconcilePrivacyReceipts,remindPrivacyDeadlines} from '../../../packages/data/src/privacy-deadlines';
import {runRetentionSweep} from '../../../packages/data/src/retention';
import {processRetentionAccounts} from '../../../packages/data/src/retention-accounts';
import {db,redis} from '../../../packages/data/src/db';
import {deliverOutbox} from './delivery';
import {maintainSupportTickets,queueSupportDigests} from '../../../packages/data/src/support-mail';
import {scanSupportAttachments} from '../../../packages/data/src/support-attachments';
import {processSupportInbound} from '../../../packages/data/src/support-inbound';
import {processPrivacyJobs} from '../../../packages/data/src/privacy-jobs';
import {advanceQueues} from '../../../packages/data/src/queue';
import {scheduleCompetitions} from '../../../packages/data/src/competitions';
import {scheduleReminders} from '../../../packages/data/src/lifecycle';
const workerId=(process.env.WORKER_ID??'dartspoint')+'-support',release=process.env.RELEASE_SHA??'local-development';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});
let lastDaily=0,beating=false;
async function heartbeat(){if(beating||stopping)return;beating=true;try{await db().query('insert into private.worker_heartbeats(worker_id,release,at) values($1,$2,now()) on conflict(worker_id) do update set release=$2,at=now()',[workerId,release]);}catch{console.error(JSON.stringify({event:'support_worker_heartbeat_failed'}));}finally{beating=false;}}
await heartbeat();const heartbeatTimer=setInterval(()=>{void heartbeat();},15000);
while(!stopping){try{
 await deliverOutbox();await advanceQueues();await scheduleCompetitions();await scheduleReminders();
 await processSupportInbound(2);await processPrivacyJobs();await scanSupportAttachments(1);
 if(Date.now()-lastDaily>3600000){await reconcilePrivacyReceipts();await remindPrivacyDeadlines();await maintainSupportTickets();await queueSupportDigests();await runRetentionSweep(50,10);await db().query("delete from private.privacy_erasure_ledger where id in(select id from private.privacy_erasure_ledger where expires_at<=now() order by expires_at limit 100)");await processRetentionAccounts(5);lastDaily=Date.now();}
 }catch{console.error(JSON.stringify({event:'support_worker_tick_failed'}));}await new Promise(r=>setTimeout(r,1000));}
clearInterval(heartbeatTimer);while(beating)await new Promise(r=>setTimeout(r,10));
await db().query('delete from private.worker_heartbeats where worker_id=$1 and release=$2',[workerId,release]);await db().end();await(await redis()).quit();
