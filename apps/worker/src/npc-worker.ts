import {db,redis} from '../../../packages/data/src/db';
import {planNpcActions,claimNpcJob,runNpcJob,npcSocialTick} from '../../../packages/data/src/npc-runtime';
const id=process.env.WORKER_ID??'npc-worker',release=process.env.RELEASE_SHA??'local-development';let stop=false;
process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
while(!stop){try{
 await planNpcActions();await npcSocialTick();const job=await claimNpcJob();if(job)await runNpcJob(job);
 await db().query('insert into private.worker_heartbeats(worker_id,release,at) values($1,$2,now()) on conflict(worker_id) do update set release=$2,at=now()',[id,release]);
 }catch{console.error(JSON.stringify({event:'npc_tick_delayed'}));}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
await db().end();await (await redis()).quit();
