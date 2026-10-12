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
 let latest:any;
 const pending=new Map<Room,{version:number;resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 const observe=(snapshot:any)=>{if(!latest||snapshot.stateVersion>=latest.stateVersion)latest=snapshot;};
 for(const room of rooms){
  room.onMessage('snapshot',observe);
  room.onMessage('receipt',(snapshot:any)=>{
   observe(snapshot);const command=pending.get(room);
   if(command&&snapshot.stateVersion>command.version){clearTimeout(command.timer);pending.delete(room);command.resolve(snapshot);}
  });
  room.onMessage('error',(error:any)=>{const command=pending.get(room);if(command){clearTimeout(command.timer);pending.delete(room);command.reject(new Error('Command rejected: '+error.code));}});
 }
 async function send(room:Room,state:any,type:string,commandId=randomUUID()){
  const payload={protocolVersion:1,matchId:id,expectedStateVersion:state.stateVersion,type,phaseToken:state.state.phaseToken,commandId};
  const next=await new Promise<any>((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(room);reject(new Error('Command receipt not received'));},10000);
   pending.set(room,{version:state.stateVersion,resolve,reject,timer});room.send('command',payload);
  });
  return {next,payload};
 }
 async function stopAt(room:Room,state:any,axis:'horizontal'|'vertical',coordinate:number){
  const period=axis==='horizontal'?2200:2500,p=(coordinate+1.14)/2.28;
  const phases=[p/2,1-p/2].map(v=>(v-.25+1)%1);
  const now=Date.now(),start=state.state.phaseStartedAt,cycle=Math.floor((now-start)/period);
  const times=[cycle,cycle+1,cycle+2].flatMap(c=>phases.map(p=>start+(c+p)*period)).filter(t=>t-now>=35+arrivalLag).sort((x,y)=>x-y);
  const scheduled=Math.round(times[0]-arrivalLag);
  await pause(scheduled-Date.now());const result=await send(room,state,'dart.stop_'+axis);
  // The real receipt gives the server's input timestamp. Compensate the bot's
  // timer/transport/database delay rather than assuming a zero-latency command.
  arrivalSamples.push(Math.max(0,result.next.state.phaseStartedAt-scheduled));
  if(arrivalSamples.length>7)arrivalSamples.shift();
  const ordered=[...arrivalSamples].sort((a,b)=>a-b);arrivalLag=ordered[Math.floor(ordered.length/2)];
  return result;
 }
 let arrivalLag=10;const arrivalSamples:number[]=[];
 function point(label:string){if(label==='MIS')return [1.1,1.1];if(label==='BULL')return [0,0];if(label==='25')return [.06,0];const n=Number(label.replace(/^[DT]/,'')),angle=DART_NUMBERS.indexOf(n as any)*Math.PI/10,r=label.startsWith('D')?166/170:label.startsWith('T')?103/170:.8;return [Math.sin(angle)*r,-Math.cos(angle)*r];}
 let darts=0;
 try{
  while(darts<120){
   const state=latest??await get(a.page,'match/'+id);if(state.lifecycle==='completed')break;if(state.state.pendingDart){await pause(100);continue;}
   const seat=state.state.turn,remaining=state.state.scores[seat],left=state.state.dartsLeft;
   const label=seat===1?'MIS':!state.state.opened[seat]?'D20':remaining>60?'20':remaining>40?String(remaining-40):getCheckoutRoutes(remaining,left)[0]?.[0]??(remaining%2?'1':`D${remaining/2}`);
   const [x,y]=point(label),horizontal=await stopAt(rooms[seat],state,'horizontal',x),vertical=await stopAt(rooms[seat],horizontal.next,'vertical',y);
   assert.deepEqual(vertical.next.state.scores,horizontal.next.state.scores,'Score changes at durable impact only');
   // Retransmission of the same UUID/payload cannot book another dart.
   rooms[seat].send('command',vertical.payload);darts++;await pause(650);
  }
  const final=await get(a.page,'match/'+id);assert.equal(final.lifecycle,'completed',JSON.stringify({scores:final.state.scores,opened:final.state.opened,darts:final.state.events.length,arrivalLagMs:arrivalLag}));assert.equal(final.state.winner,0);assert.equal(final.state.legs[0],1);assert.ok(final.state.events.length>1);
  let bootstrap=await get(a.page,'bootstrap');for(let i=0;i<30&&!bootstrap.records.find((r:any)=>r.id===id);i++){await pause(100);bootstrap=await get(a.page,'bootstrap');}
  const record=bootstrap.records.find((r:any)=>r.id===id);assert.equal(record.kind,'played');assert.equal(record.ledger.length,2);const ledgers=record.ledger.map((l:any)=>Number(l.delta));assert.equal(ledgers.reduce((x:number,y:number)=>x+y,0),0);assert.deepEqual(ledgers.sort((a:number,b:number)=>a-b),[-16,16]);
  await pause(1000);const again=(await get(a.page,'bootstrap')).records.find((r:any)=>r.id===id);assert.deepEqual(again.ledger,record.ledger);return {darts:final.state.events.length,completeMatch:true,eloZeroSum:true,eloExactlyOnce:true};
 }finally{for(const command of pending.values())clearTimeout(command.timer);for(const room of rooms)await room.leave();}
}
