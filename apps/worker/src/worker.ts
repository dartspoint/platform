import {db,redis,transaction} from '../../../packages/data/src/db';
import {authAdmin} from '../../../packages/data/src/auth';
import {maintainMatches,scheduleReminders} from '../../../packages/data/src/lifecycle';
import {settlePractice} from '../../../packages/data/src/practice';
import {settleImpacts,expireDisconnects} from '../../../packages/data/src/matches';
import {expireRoomMemberships} from '../../../packages/data/src/community';
import {renderDartsEmail,type DartsEmailInput} from '../../../packages/emails/src/templates';
import {readiness} from '../../../packages/data/src/health';
import {scheduleCompetitions,competitionResult} from '../../../packages/data/src/competitions';

import {advanceQueues} from '../../../packages/data/src/queue';
import {deliverGameInviteNotification} from '../../../packages/data/src/notifications';

const workerId=process.env.WORKER_ID??'dartspoint';
const release=process.env.RELEASE_SHA??'local-development';
const local=process.env.APP_ENV==='development'&&process.env.MAIL_PROVIDER==='local';
if(!local&&!process.env.RESEND_API_KEY)throw new Error('RESEND_API_KEY is required');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
await readiness(false);
console.log(JSON.stringify({event:'worker_started',release}));
let lastHeartbeat=0;
while(!stopping){
 try{
  await settleImpacts();await settlePractice();
  if(Date.now()-lastHeartbeat>5000){await maintainMatches();await expireDisconnects();await expireRoomMemberships();await db().query('insert into private.worker_heartbeats(worker_id,release,at) values($1,$2,now()) on conflict(worker_id) do update set release=$2,at=now()',[workerId,release]);lastHeartbeat=Date.now();}
 }catch{console.error(JSON.stringify({event:'worker_tick_failed'}));}
 await new Promise(resolve=>setTimeout(resolve,50));
}
await db().query('delete from private.worker_heartbeats where worker_id=$1 and release=$2',[workerId,release]);await db().end();await (await redis()).quit();
