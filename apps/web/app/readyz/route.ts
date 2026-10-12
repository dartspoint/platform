import {readiness} from '../../../../packages/data/src/health';
export const dynamic='force-dynamic';
export async function GET(){try{const response=await fetch((process.env.REALTIME_HEALTH_URL??'http://127.0.0.1:42567')+'/readyz',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error('realtime_unavailable');const data=await response.json();if(data.release!==(process.env.RELEASE_SHA??'local-development'))throw new Error('release_mismatch');return Response.json(await readiness());}catch{return Response.json({ok:false},{status:503});}}
