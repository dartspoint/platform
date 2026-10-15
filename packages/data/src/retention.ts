import {db} from './db';
export type RetentionCounts=Record<string,number|boolean>;
/** Runs in the separate support worker lane. No caller supplies an age, SQL,
 * subject or arbitrary table; the database enforces every policy boundary. */
export async function runRetentionBatch(limit=50):Promise<RetentionCounts>{
 const bounded=Math.max(1,Math.min(Math.trunc(limit)||50,200));
 const id=(await db().query('insert into private.privacy_retention_runs default values returning id')).rows[0].id;
 try{const counts=(await db().query('select private.run_retention_batch($1) counts',[bounded])).rows[0].counts as RetentionCounts;await db().query('update private.privacy_retention_runs set completed_at=now(),counts=$2 where id=$1',[id,JSON.stringify(counts)]);return counts;}
 catch(error){await db().query("update private.privacy_retention_runs set completed_at=now(),error_code='retention_batch_failed' where id=$1",[id]);throw error;}
}
/** A finite sweep gives the scheduler a predictable budget. Remaining work is
 * measured, not hidden by claiming that a bounded batch emptied every table. */
export async function runRetentionSweep(batchSize=50,maxBatches=10){
 const totals:RetentionCounts={};let batches=0;
 for(;batches<Math.max(1,Math.min(Math.trunc(maxBatches)||10,20));batches++){
  const counts=await runRetentionBatch(batchSize);if(counts.busy)break;
  let changed=0;for(const[key,value]of Object.entries(counts)){if(typeof value!=='number')continue;if(key.startsWith('overdue'))totals[key]=value;else{totals[key]=Number(totals[key]??0)+value;changed+=value;}}
  if(!changed){batches++;break;}
 }
 return {batches,counts:totals};
}
