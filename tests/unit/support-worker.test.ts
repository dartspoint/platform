import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runSupportTasks,supportFullScanInterval,type SupportTasks} from '../../apps/worker/src/support-tasks';
import {supportWorkBits,type SupportTask} from '../../packages/data/src/support-work';

function recordingTasks(calls:SupportTask[]):SupportTasks{
 return Object.fromEntries(Object.keys(supportWorkBits).map(task=>[task,async()=>{calls.push(task as SupportTask);}])) as SupportTasks;
}
test('idle support ticks make one compact readiness poll and run no claims',async()=>{
 const calls:SupportTask[]=[];let polls=0;
 const lastScan=await runSupportTasks(1000,recordingTasks(calls),async()=>{polls++;return 0;},2000);
 assert.equal(polls,1);assert.deepEqual(calls,[]);assert.equal(lastScan,1000);
});
test('only ready support tasks run, in their original delivery and processing order',async()=>{
 const calls:SupportTask[]=[];
 await runSupportTasks(1000,recordingTasks(calls),async()=>supportWorkBits.outbox|supportWorkBits.reminders|supportWorkBits.privacy,2000);
 assert.deepEqual(calls,['outbox','reminders','privacy']);
});
test('startup and periodic recovery sweeps run every support task without relying on readiness',async()=>{
 for(const [lastScan,now] of [[0,1000],[1000,1000+supportFullScanInterval]]){
  const calls:SupportTask[]=[];
  const result=await runSupportTasks(lastScan,recordingTasks(calls),async()=>{throw new Error('recovery_must_not_depend_on_hint');},now);
  assert.deepEqual(calls,Object.keys(supportWorkBits));assert.equal(result,now);
 }
});
test('readiness errors propagate without executing an arbitrary subset of support work',async()=>{
 const calls:SupportTask[]=[];
 await assert.rejects(runSupportTasks(1000,recordingTasks(calls),async()=>{throw new Error('database_unavailable');},2000),/database_unavailable/);
 assert.deepEqual(calls,[]);
});
test('a failed recovery sweep remains due and retries after restart or the next tick',async()=>{
 const calls:SupportTask[]=[];const tasks=recordingTasks(calls);let lastScan=1000;
 tasks.inbound=async()=>{throw new Error('transient_failure');};
 await assert.rejects(async()=>{lastScan=await runSupportTasks(lastScan,tasks,async()=>0,61000);},/transient_failure/);
 assert.equal(lastScan,1000);
 calls.length=0;await runSupportTasks(lastScan,recordingTasks(calls),async()=>0,62000);
 assert.deepEqual(calls,Object.keys(supportWorkBits));
});
