import test from 'node:test';
import assert from 'node:assert/strict';
import {ImpactPolling} from '../../packages/data/src/impact-polling';

test('An idle worker performs one compact recovery scan per second and skips impact transactions',async()=>{
 let now=0,scans=0,polls=0;
 const worker=new ImpactPolling({now:()=>now,hasActivity:async()=>false,hasPending:async()=>{scans++;return false;}});
 for(;now<60000;now+=50)if(await worker.shouldPoll())polls++;
 assert.equal(scans,60);
 assert.equal(polls,0);
});

test('A launch hint wakes the next 50ms tick even during the idle recovery interval',async()=>{
 let now=0,active=false,scans=0;
 const worker=new ImpactPolling({now:()=>now,hasActivity:async()=>active,hasPending:async()=>{scans++;return false;}});
 assert.equal(await worker.shouldPoll(),false);
 // The hint can arrive before the launch commits and its 560ms flight completes.
 now=50;active=true;
 for(;now<=650;now+=50)assert.equal(await worker.shouldPoll(),true);
 assert.equal(scans,1,'Fast processing does not wait for the next SQL recovery scan');
 now=2050;active=false;
 assert.equal(await worker.shouldPoll(),false,'Expired activity returns to idle instead of polling forever');
});

test('A lost Redis hint or worker restart still discovers durable pending impacts',async()=>{
 let now=0,pending=false,scans=0;
 const worker=new ImpactPolling({now:()=>now,hasActivity:async()=>false,hasPending:async()=>{scans++;return pending;}});
 assert.equal(await worker.shouldPoll(),false);
 pending=true;
 for(now=50;now<1000;now+=50)assert.equal(await worker.shouldPoll(),false);
 assert.equal(await worker.shouldPoll(),true,'Recovery discovers committed work within one second');
 pending=false;
 for(now=1050;now<3000;now+=50)assert.equal(await worker.shouldPoll(),true,'Recovered work gets the same fast processing cadence');
 assert.equal(scans,2);
 assert.equal(await worker.shouldPoll(),false);
 const restarted=new ImpactPolling({now:()=>now,hasActivity:async()=>false,hasPending:async()=>true});
 assert.equal(await restarted.shouldPoll(),true,'Startup recovery runs immediately');
});

test('Redis failure preserves fast impact processing and recovery scans retry after SQL errors',async()=>{
 let now=0,redisDown=true,sqlDown=true,scans=0;
 const worker=new ImpactPolling({now:()=>now,hasActivity:async()=>{if(redisDown)throw new Error('redis unavailable');return false;},hasPending:async()=>{scans++;if(sqlDown)throw new Error('database unavailable');return true;}});
 assert.equal(await worker.shouldPoll(),true);
 now=50;assert.equal(await worker.shouldPoll(),true);
 assert.equal(scans,0);
 redisDown=false;
 now=1050;
 await assert.rejects(worker.shouldPoll(),/database unavailable/);
 now=1100;sqlDown=false;
 assert.equal(await worker.shouldPoll(),true,'A failed recovery scan does not suppress the retry');
});

test('A stalled Redis reconnect cannot stop the worker or accumulate queued reads',{timeout:1000},async()=>{
 let now=0,reads=0,scans=0;
 const worker=new ImpactPolling({now:()=>now,hasActivity:()=>{reads++;return new Promise<boolean>(()=>{});},hasPending:async()=>{scans++;return false;}});
 assert.equal(await worker.shouldPoll(),true,'A bounded wait falls back to fast database processing');
 now=50;assert.equal(await worker.shouldPoll(),true);
 now=1050;assert.equal(await worker.shouldPoll(),true);
 assert.equal(reads,1,'A single in-flight hint read is reused while Redis remains stalled');
 assert.equal(scans,0);
});
