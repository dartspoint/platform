import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {MatchWriterLease} from '../../apps/realtime/src/match-writer-lease';

function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
async function bounded<T>(operation:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Lease operation did not finish')),1000);})]);}
 finally{if(timer)clearTimeout(timer);}
}

test('A healthy lease renews once at a time and does not close or release its room',async()=>{
 const pending=deferred<boolean>();let calls=0,disconnects=0,releases=0;
 const events:string[]=[];
 const lease=new MatchWriterLease({renew:()=>{calls++;return calls===1?pending.promise:Promise.resolve(true);},release:async()=>{releases++;},disconnect:async()=>{disconnects++;},report:event=>events.push(event)});
 const first=lease.renew();await Promise.resolve();
 await lease.renew();assert.equal(calls,1);assert.equal(lease.isClosing,false);
 pending.resolve(true);await first;await lease.renew();
 assert.equal(calls,2);assert.equal(disconnects,0);assert.equal(releases,0);assert.deepEqual(events,[]);
});

test('An uncertain or lost writer closes only its own room after DB renewal has settled',async t=>{
 for(const failure of ['rejected','not-owned'] as const)await t.test(failure,async()=>{
  const events:string[]=[];let lease!:MatchWriterLease,renewals=0;
  lease=new MatchWriterLease({
   renew:async()=>{renewals++;events.push('renew');if(failure==='rejected')throw new Error('private database detail');return false;},
   release:async()=>{events.push('release');},
   disconnect:async()=>{events.push('disconnect');await lease.dispose();},
   report:event=>events.push(event),
  });
  let otherRenewals=0;
  const other=new MatchWriterLease({renew:async()=>{otherRenewals++;return true;},release:async()=>assert.fail('Healthy room must retain its lease'),disconnect:async()=>assert.fail('Healthy room must stay connected'),report:()=>assert.fail('Healthy room must have no failure event')});
  await bounded(lease.renew());await Promise.all([lease.renew(),other.renew()]);
  assert.equal(lease.isClosing,true);assert.equal(renewals,1);assert.equal(other.isClosing,false);assert.equal(otherRenewals,1);
  assert.deepEqual(events,failure==='rejected'?['renew','match_lease_renewal_failed','disconnect','release']:['renew','disconnect','release']);
 });
});

test('Disposal waits for the pending renewal before release and forbids further renewals',async()=>{
 const pending=deferred<boolean>(),events:string[]=[];
 const lease=new MatchWriterLease({
  renew:async()=>{events.push('renew-start');const result=await pending.promise;events.push('renew-end');return result;},
  release:async()=>{events.push('release');},disconnect:async()=>assert.fail('Disposal already owns room shutdown'),report:()=>assert.fail('Successful disposal must have no failure event'),
 });
 const renewing=lease.renew();await Promise.resolve();
 const disposing=lease.dispose();assert.equal(lease.isClosing,true);assert.equal(lease.dispose(),disposing);
 await lease.renew();assert.deepEqual(events,['renew-start']);
 pending.resolve(true);await bounded(Promise.all([renewing,disposing]));
 await lease.renew();await lease.dispose();assert.deepEqual(events,['renew-start','renew-end','release']);
});

test('Disposal before the scheduled renewal starts releases without beginning DB renewal',async()=>{
 let releases=0;
 const lease=new MatchWriterLease({renew:async()=>assert.fail('A closing room cannot begin renewal'),release:async()=>{releases++;},disconnect:async()=>assert.fail('Disposal already owns room shutdown'),report:()=>assert.fail('Successful disposal must have no failure event')});
 const renewing=lease.renew(),disposing=lease.dispose();
 await bounded(Promise.all([renewing,disposing]));assert.equal(releases,1);assert.equal(lease.isClosing,true);
});

test('Failed in-flight renewal and fenced release during disposal are contained with sanitized events',async()=>{
 const pending=deferred<boolean>(),events:string[]=[];
 const lease=new MatchWriterLease({
  renew:()=>pending.promise,
  release:async()=>{events.push('release');throw Object.assign(new Error('private fenced release SQL detail'),{code:'08006'});},
  disconnect:async()=>assert.fail('Disposal already owns room shutdown'),report:event=>events.push(event),
 });
 const renewing=lease.renew();await Promise.resolve();const disposing=lease.dispose();
 assert.deepEqual(events,[]);pending.reject(new Error('private renewal SQL detail'));
 await bounded(Promise.all([renewing,disposing]));await lease.dispose();await lease.renew();
 assert.equal(lease.isClosing,true);assert.deepEqual(events,['match_lease_renewal_failed','release','match_lease_release_failed']);
});

test('A disconnect failure stays inside the closing room lease',async()=>{
 const events:string[]=[];
 const lease=new MatchWriterLease({renew:async()=>false,release:async()=>{},disconnect:async()=>{throw new Error('private room detail');},report:event=>events.push(event)});
 await lease.renew();await lease.renew();assert.equal(lease.isClosing,true);assert.deepEqual(events,['match_lease_disconnect_failed']);
});

test('The installed Colyseus timer survives lease Promise failures under strict Node rejection handling',()=>{
 const helper=new URL('../../apps/realtime/src/match-writer-lease.ts',import.meta.url).href;
 const script=`
  import assert from 'node:assert/strict';
  import {Room} from '@colyseus/core';
  import {MatchWriterLease} from ${JSON.stringify(helper)};
  const events=[],room=new Room();let lease;
  lease=new MatchWriterLease({renew:async()=>{throw new Error('private checkout detail');},release:async()=>{throw new Error('private release detail');},disconnect:async()=>{await lease.dispose();},report:event=>events.push(event)});
  room.clock.setInterval(()=>{void lease.renew();},1);
  room.clock.delayed[0].execute();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(lease.isClosing,true);
  assert.deepEqual(events,['match_lease_renewal_failed','match_lease_release_failed']);
  room.clock.clear();room.clock.stop();console.log('lease-timer-contained');
 `;
 const child=spawnSync(process.execPath,['--unhandled-rejections=strict','--import','tsx','--input-type=module','-e',script],{encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,'The timer must survive renewal/release failures and finish disposal without a deadlock');
 assert.equal(child.stdout.trim(),'lease-timer-contained');assert.equal(child.stderr,'');
});
