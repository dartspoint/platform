import {db,redis} from './db';
export async function readiness(worker=true){
 await db().query('select 1');await (await redis()).ping();
 if(worker){const r=await db().query("select 1 from private.worker_heartbeats where worker_id=$1 and release=$2 and at>now()-interval '30 seconds'",[process.env.WORKER_ID??'dartspoint',process.env.RELEASE_SHA??'local-development']);if(!r.rowCount)throw new Error('Worker is unavailable');}
 return {ok:true,release:process.env.RELEASE_SHA??'local-development'};
}
