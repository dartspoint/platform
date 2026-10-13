import test from 'node:test';
import assert from 'node:assert/strict';
import {IngressOrder} from '../../packages/data/src/ingress-order';

test('A later authenticated retry cannot overtake the first receive reservation',async()=>{
 const order=new IngressOrder(),first=order.reserve('session'),second=order.reserve('session'),events:string[]=[];
 let persisted:{receivedAt:number;connectionId:string}|undefined;
 const later=second.run(async()=>{events.push('second');persisted??={receivedAt:200,connectionId:'retry'};return persisted;});
 await Promise.resolve();assert.equal(events.length,0,'Fast retry authentication still waits for earlier receive');
 const original=await first.run(async()=>{events.push('first');persisted??={receivedAt:100,connectionId:'original'};return persisted;});
 assert.deepEqual(await later,original);assert.deepEqual(events,['first','second']);assert.equal(original.receivedAt,100);assert.equal(original.connectionId,'original');
});

test('Failed/cancelled capture releases its reservation without skipping earlier work',async()=>{
 const order=new IngressOrder(3),first=order.reserve('session'),cancelled=order.reserve('session'),third=order.reserve('session');
 cancelled.release();cancelled.release();let thirdRan=false;const thirdResult=third.run(async()=>{thirdRan=true;return 3;});
 await Promise.resolve();assert.equal(thirdRan,false);await assert.rejects(first.run(async()=>{throw new Error('auth/parse/Redis failure');}));assert.equal(await thirdResult,3);
 // Cleanup restores the limit after all promises have completed.
 await Promise.resolve();const next=order.reserve('session');next.release();
});

test('Ingress capture is bounded per session and globally; unrelated scopes proceed',async()=>{
 const order=new IngressOrder(1,2),a=order.reserve('a'),b=order.reserve('b');assert.throws(()=>order.reserve('a'),{code:'command_busy'});assert.throws(()=>order.reserve('c'),{code:'command_busy'});
 assert.equal(await b.run(async()=>2),2,'An unrelated scope does not wait for a');a.release();await Promise.resolve();await Promise.resolve();const c=order.reserve('c');c.release();
});
