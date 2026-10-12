import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Room} from '@colyseus/sdk';
import {Client} from '@colyseus/sdk';
import {DART_NUMBERS} from '../../packages/game-core/src/darts-rules';
import {getCheckoutRoutes} from '../../packages/game-core/src/darts-checkouts';
import {get} from './helpers';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
export async function fullMatch(a:any,b:any,id:string){
 const sdk=new Client('ws://127.0.0.1:42567');const rooms=await Promise.all([a,b].map(p=>sdk.joinOrCreate('match',{matchId:id,token:p.token})));
 const receipts=new Map<string,any>();for(const room of rooms){room.onMessage('snapshot',()=>{});room.onMessage('receipt',(r:any)=>{receipts.set(r.commandId,r);});room.onMessage('error',(e:any)=>{receipts.set('error',e);});}
 async function send(room:Room,state:any,type:string,commandId=randomUUID()){
  const payload={protocolVersion:1,matchId:id,expectedStateVersion:state.stateVersion,type,phaseToken:state.state.phaseToken,commandId};
  room.send('command',payload);
  // Receipts contain snapshot but no commandId; read authoritative committed state.
  for(let i=0;i<100;i++){const next=await get(a.page,'match/'+id);if(next.stateVersion>state.stateVersion)return {next,payload};if(receipts.has('error'))throw new Error('Command rejected: '+receipts.get('error').code);await pause(10);}throw new Error('Command not committed');
 }
 async function stopAt(room:Room,state:any,axis:'horizontal'|'vertical',coordinate:number){
  const period=axis==='horizontal'?2200:2500,p=(coordinate+1.14)/2.28;
  const phases=[p/2,1-p/2].map(v=>(v-.25+1)%1);
  const now=Date.now(),start=state.state.phaseStartedAt,cycle=Math.floor((now-start)/period);
  const times=[cycle,cycle+1,cycle+2].flatMap(c=>phases.map(p=>start+(c+p)*period)).filter(t=>t-now>=35).sort((x,y)=>x-y);
  await pause(times[0]-Date.now());return send(room,state,'dart.stop_'+axis);
 }
 function point(label:string){if(label==='MIS')return [1.1,1.1];if(label==='BULL')return [0,0];if(label==='25')return [.06,0];const n=Number(label.replace(/^[DT]/,'')),angle=DART_NUMBERS.indexOf(n as any)*Math.PI/10,r=label.startsWith('D')?166/170:label.startsWith('T')?103/170:.65;return [Math.sin(angle)*r,-Math.cos(angle)*r];}
 let darts=0;
 try{
  for(;darts<120;darts++){
   let state=await get(a.page,'match/'+id);if(state.lifecycle==='completed')break;if(state.state.pendingDart){await pause(600);continue;}
   const seat=state.state.turn,remaining=state.state.scores[seat],left=state.state.dartsLeft;
   const label=seat===1?'MIS':!state.state.opened[seat]?'D20':remaining<=170?(getCheckoutRoutes(remaining,left)[0]?.[0]??(remaining>60?'T20':remaining%2?'1':`D${remaining/2}`)):'T20';
   const [x,y]=point(label),horizontal=await stopAt(rooms[seat],state,'horizontal',x),vertical=await stopAt(rooms[seat],horizontal.next,'vertical',y);
   assert.deepEqual(vertical.next.state.scores,horizontal.next.state.scores,'Score changes at durable impact only');
   // Retransmission of the same UUID/payload cannot book another dart.
   rooms[seat].send('command',vertical.payload);await pause(650);
  }
  const final=await get(a.page,'match/'+id);assert.equal(final.lifecycle,'completed');assert.equal(final.state.winner,0);assert.equal(final.state.legs[0],1);assert.ok(final.state.events.length>1);
  let bootstrap=await get(a.page,'bootstrap');for(let i=0;i<30&&!bootstrap.records.find((r:any)=>r.id===id);i++){await pause(100);bootstrap=await get(a.page,'bootstrap');}
  const record=bootstrap.records.find((r:any)=>r.id===id);assert.equal(record.kind,'played');assert.equal(record.ledger.length,2);const ledgers=record.ledger.map((l:any)=>Number(l.delta));assert.equal(ledgers.reduce((x:number,y:number)=>x+y,0),0);assert.deepEqual(ledgers.sort((a:number,b:number)=>a-b),[-16,16]);
  await pause(1000);const again=(await get(a.page,'bootstrap')).records.find((r:any)=>r.id===id);assert.deepEqual(again.ledger,record.ledger);return {darts:final.state.events.length,completeMatch:true,eloZeroSum:true,eloExactlyOnce:true};
 }finally{for(const room of rooms)await room.leave();}
}
