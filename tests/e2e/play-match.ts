import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Room} from '@colyseus/sdk';
import {Client} from '@colyseus/sdk';
import {DART_NUMBERS} from '../../packages/game-core/src/darts-rules';
import {getCheckoutRoutes} from '../../packages/game-core/src/darts-checkouts';
import {meterPosition,meterPeriod,ServerClock,TIMING_VERSION,type RenderSampleClaim} from '../../packages/game-core/src/timing';
import {get} from './helpers';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
export async function fullMatch(a:any,b:any,id:string){
 const sdk=new Client('ws://127.0.0.1:42567');const rooms:Room[]=[];
 let latest:any;
 const pending=new Map<Room,{commandId:string;resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 const calibrations=new Map<Room,{clock:ServerClock;connectionId:string|null;ready:boolean;samples:Map<string,number>;timer:ReturnType<typeof setInterval>}>();
 const observe=(snapshot:any)=>{if(!latest||snapshot.stateVersion>=latest.stateVersion)latest=snapshot;};
 // Attach handlers to each joined socket before awaiting the other join.
 // Otherwise its real calibration traffic can arrive without any listener.
 for(const player of [a,b]){
  const room=await sdk.joinOrCreate('match',{matchId:id,token:player.token});rooms.push(room);
  const calibration={clock:new ServerClock(),connectionId:null as string|null,ready:false,samples:new Map<string,number>(),timer:undefined as unknown as ReturnType<typeof setInterval>};calibrations.set(room,calibration);
  room.onMessage('clock.challenge',(value:any)=>room.send('clock.echo',{nonce:value.nonce}));
  room.onMessage('clock.ready',(value:any)=>{calibration.connectionId=value.connectionId;calibration.ready=value.ready===true;});
  room.onMessage('clock.sample',(value:any)=>{const sent=calibration.samples.get(value.nonce);if(sent!==undefined){calibration.clock.sample(value.serverAt,sent,performance.now(),value.serverReceivedAt??value.serverAt);calibration.samples.delete(value.nonce);calibration.connectionId=value.connectionId;calibration.ready=value.ready===true;}});
  const ping=()=>{if(!room.connection.isOpen)return;const nonce=randomUUID();calibration.samples.set(nonce,performance.now());if(calibration.samples.size>8)calibration.samples.delete(calibration.samples.keys().next().value!);room.send('clock.ping',{nonce});};let ticks=0;ping();calibration.timer=setInterval(()=>{ticks++;if(ticks<=6||ticks%20===0)ping();},100);
  room.onMessage('snapshot',observe);
  room.onMessage('receipt',(snapshot:any)=>{
   observe(snapshot);const command=pending.get(room);
   if(command&&snapshot.commandId===command.commandId){clearTimeout(command.timer);pending.delete(room);command.resolve(snapshot);}
  });
  room.onMessage('error',(error:any)=>{const command=pending.get(room);if(command&&error.commandId===command.commandId){clearTimeout(command.timer);pending.delete(room);command.reject(new Error('Command rejected: '+error.code));}});
 }
 async function send(room:Room,state:any,type:string,commandId=randomUUID(),renderSample?:RenderSampleClaim){
  const payload={protocolVersion:1,matchId:id,expectedStateVersion:state.stateVersion,type,phaseToken:state.state.phaseToken,commandId,...(renderSample?{renderSample}:{})};
  const next=await new Promise<any>((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(room);reject(new Error('Command receipt not received'));},10000);
   pending.set(room,{commandId,resolve,reject,timer});room.send('command',payload);
  });
  return {next,payload};
 }
 async function stopAt(room:Room,state:any,axis:'horizontal'|'vertical',coordinate:number){
  const period=meterPeriod(axis,state.state.meterSpeedVersion),p=(coordinate+1.14)/2.28;
  const phases=[p/2,1-p/2].map(v=>(v-.25+1)%1);
  if(state.state.timingVersion===TIMING_VERSION){
   const calibration=calibrations.get(room)!;assert.ok(calibration.clock.ready&&calibration.ready&&calibration.connectionId,'The real socket must complete both clock calibrations');
   const now=calibration.clock.phaseNow(state.state.phaseToken),start=state.state.phaseStartedAt,cycle=Math.floor((now-start)/period);
   const target=[cycle,cycle+1,cycle+2].flatMap(c=>phases.map(p=>start+(c+p)*period)).filter(t=>t-now>=35).sort((a,b)=>a-b)[0];
   const botSampleAgeMs=2;
   await pause(target-now+botSampleAgeMs);
   // This is a socket bot fixture, not a DOM proof. Its sample uses the same
   // calibrated, fixed phase mapping; actual drawn samples have separate tests.
   // Node can send within one millisecond of receiving a sample; give this
   // synthetic bot frame an age of 2 ms to cover integer Date.now ingress granularity.
   const sampleAt=calibration.clock.phaseNow(state.state.phaseToken,performance.now()-botSampleAgeMs),renderSample={sampleAt,connectionId:calibration.connectionId!,dartNumber:state.state.dartCount[0]+state.state.dartCount[1]+1,meterSpeedVersion:state.state.meterSpeedVersion??'standard-v1'};
   const result=await send(room,state,'dart.stop_'+axis,randomUUID(),renderSample);
   assert.equal(result.next.timing.admittedAt,sampleAt,'The server admits the exact calibrated fixture sample');
   assert.equal(axis==='horizontal'?result.next.state.lockedX:result.next.state.lockedY,meterPosition(sampleAt,start,axis,state.state.meterSpeedVersion),'The full match uses the actual versioned meter function');
   return result;
  }
  const now=Date.now(),start=state.state.phaseStartedAt,cycle=Math.floor((now-start)/period);
  const times=[cycle,cycle+1,cycle+2].flatMap(c=>phases.map(p=>start+(c+p)*period)).filter(t=>t-now>=35+arrivalLag).sort((x,y)=>x-y);
  const scheduled=Math.round(times[0]-arrivalLag);
  await pause(scheduled-Date.now());const result=await send(room,state,'dart.stop_'+axis);
  // The real receipt gives the server's input timestamp. Compensate the bot's
  // transport delay at the admitted ingress moment; database processing is not input lag.
  arrivalSamples.push(Math.max(0,(result.next.timing?.admittedAt??result.next.state.phaseStartedAt)-scheduled));
  if(arrivalSamples.length>7)arrivalSamples.shift();
  const ordered=[...arrivalSamples].sort((a,b)=>a-b);arrivalLag=ordered[Math.floor(ordered.length/2)];
  return result;
 }
 let arrivalLag=10;const arrivalSamples:number[]=[];
 function point(label:string){if(label==='MIS')return [1.1,1.1];if(label==='BULL')return [0,0];if(label==='25')return [.06,0];const n=Number(label.replace(/^[DT]/,'')),angle=DART_NUMBERS.indexOf(n as any)*Math.PI/10,r=label.startsWith('D')?166/170:label.startsWith('T')?103/170:.8;return [Math.sin(angle)*r,-Math.cos(angle)*r];}
 let darts=0;
 try{
  for(let attempt=0;attempt<100&&rooms.some(room=>{const timing=calibrations.get(room)!;return !timing.ready||!timing.clock.ready;});attempt++)await pause(50);
  for(const room of rooms){const timing=calibrations.get(room)!;assert.ok(timing.ready&&timing.clock.ready&&timing.connectionId,'Both bot sockets use real measured server challenges: '+JSON.stringify({serverReady:timing.ready,clientReady:timing.clock.ready,pendingSamples:timing.samples.size,connectionKnown:!!timing.connectionId,isOpen:room.connection.isOpen}));}
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
 }catch(error){
  // Release this fixture's players after a failure through ordinary authorized
  // commands while both real sockets are still connected.
  try{let snapshot=await get(a.page,'match/'+id);
   if(['assigned','paused'].includes(snapshot.lifecycle))for(const [seat,room] of rooms.entries()){snapshot=await get(a.page,'match/'+id);if(!snapshot.state.ready[seat])await send(room,snapshot,'match.ready');}
   for(let n=0;n<50;n++){snapshot=await get(a.page,'match/'+id);if(!snapshot.state.pendingDart)break;await pause(100);}
   if(snapshot.lifecycle==='playing')await send(rooms[0],snapshot,'match.forfeit');
   assert.equal((await get(a.page,'match/'+id)).lifecycle,'completed','Failed full-match fixture must release its reservation');
  }catch{console.error('Full-match fixture cleanup requires operator review: '+id);}throw error;
 }finally{for(const command of pending.values())clearTimeout(command.timer);for(const timing of calibrations.values())clearInterval(timing.timer);for(const room of rooms)await room.leave();}
}
