import {db} from '../packages/data/src/db';
try{const r=await db().query("select 1 from private.worker_heartbeats where worker_id=$1 and release=$2 and at>now()-interval '60 seconds'",[process.env.WORKER_ID??'npc-worker',process.env.RELEASE_SHA??'local-development']);if(!r.rowCount)process.exitCode=1;}catch{process.exitCode=1;}finally{await db().end();}
