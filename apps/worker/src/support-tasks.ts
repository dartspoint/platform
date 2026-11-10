import {allSupportWork,pendingSupportWork,supportWorkBits,type SupportTask} from '../../../packages/data/src/support-work';

export type SupportTasks=Record<SupportTask,()=>Promise<unknown>>;
export const supportFullScanInterval=60000;

export async function runSupportTasks(lastFullScan:number,tasks:SupportTasks,readiness=pendingSupportWork,now=Date.now()){
 // Keep an independent recovery sweep in case a readiness rule ever misses work.
 // Existing claim locks, retries and durable queues remain authoritative.
 const fullScan=!lastFullScan||now-lastFullScan>=supportFullScanInterval;
 const ready=fullScan?allSupportWork:await readiness();
 for(const task of Object.keys(supportWorkBits) as SupportTask[])if(ready&supportWorkBits[task])await tasks[task]();
 return fullScan?now:lastFullScan;
}
