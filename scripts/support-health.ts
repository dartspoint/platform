import {db,redis} from '../packages/data/src/db';
const workerId=(process.env.WORKER_ID??'dartspoint')+'-support';
try{await(await redis()).ping();const row=await db().query("select 1 from private.worker_heartbeats where worker_id=$1 and release=$2 and at>now()-interval '180 seconds'",[workerId,process.env.RELEASE_SHA??'local-development']);if(!row.rowCount)throw new Error('support_worker_unavailable');await db().end();await(await redis()).quit();}catch{process.exit(1);}
