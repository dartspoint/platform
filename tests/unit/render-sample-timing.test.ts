import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerClock,admittedSample,meterPosition,meterFraction,meterPeriod,sampleWindow,TIMING_VERSION,METER_SPEED_VERSION} from '../../packages/game-core/src/timing';
import {commandSchema} from '../../packages/contracts/src/index';
import {randomUUID} from 'node:crypto';
test('New games use versioned samples with no altered old compensation policy',()=>{
 assert.equal(TIMING_VERSION,'render-sample-v3');assert.equal(sampleWindow([40,40]),0);assert.equal(sampleWindow([40,40,40]),94);assert.equal(sampleWindow([350,350,350]),124);
 const payload={protocolVersion:1,commandId:randomUUID(),matchId:randomUUID(),expectedStateVersion:7,type:'dart.stop_horizontal',phaseToken:randomUUID(),renderSample:{sampleAt:1000123.456,connectionId:randomUUID(),dartNumber:2}};
 assert.ok(commandSchema.safeParse(payload).success);for(const renderSample of [{...payload.renderSample,score:180},{...payload.renderSample,sampleAt:NaN},{...payload.renderSample,dartNumber:0}])assert.equal(commandSchema.safeParse({...payload,renderSample}).success,false);
});
test('Speed markers preserve stored legacy curves and give new games approximately eight percent faster cycles',()=>{
 const start=1_000_000;
 for(const axis of ['horizontal','vertical'] as const){
  const legacy=axis==='horizontal'?2200:2500,faster=axis==='horizontal'?2037:2315;
  assert.equal(meterPeriod(axis),legacy);assert.equal(meterPeriod(axis,'standard-v1'),legacy);assert.equal(meterPeriod(axis,METER_SPEED_VERSION),faster);
  assert.ok(legacy/faster>1.079&&legacy/faster<1.081);
  assert.equal(meterPosition(start+legacy/4,start,axis),1.14);assert.equal(meterPosition(start+legacy*3/4,start,axis),-1.14);
  assert.equal(meterPosition(start+faster/4,start,axis,METER_SPEED_VERSION),1.14);assert.equal(meterPosition(start+faster*3/4,start,axis,METER_SPEED_VERSION),-1.14);
  for(const at of [start,start+17,start+549,start+1100,start+1875,start+10000]){
   assert.equal(meterPosition(at,start,axis),meterPosition(at,start,axis,'standard-v1'));
   const admitted=admittedSample(at,at+30,54,start,start,at+300);
   assert.equal(meterPosition(admitted,start,axis,METER_SPEED_VERSION),meterPosition(at,start,axis,METER_SPEED_VERSION));
   for(const width of [220,500,900])assert.equal((meterFraction(admitted,start,axis,METER_SPEED_VERSION)-meterFraction(at,start,axis,METER_SPEED_VERSION))*width,0);
  }
 }
});
test('Accepted sample stays exact across asymmetric jitter and DB queues, on both axes and directions',()=>{
 const phaseStart=1_000_000;
 for(const axis of ['horizontal','vertical'] as const)for(const elapsed of [10,549,550,551,1099,1100,1650,1875,2200,2500])for(const uplink of [1,20,40,60,90]){
  const sampleAt=phaseStart+elapsed,receivedAt=sampleAt+uplink+16,admitted=admittedSample(sampleAt,receivedAt,124,phaseStart,phaseStart,receivedAt+300);
  assert.equal(admitted,sampleAt);assert.equal(meterPosition(admitted,phaseStart,axis),meterPosition(sampleAt,phaseStart,axis));
  for(const width of [220,500,900])assert.equal((meterFraction(admitted,phaseStart,axis)-meterFraction(sampleAt,phaseStart,axis))*width,0);
 }
});
test('Invalid sample is rejected instead of clamped into a different score',()=>{
 assert.equal(admittedSample(1000,1094,94,950,980,1400),1000);
 for(const values of [[999,1094,94,950,980,1400],[1095,1094,94,950,980,1400],[949,1000,124,950,0,1400],[979,1000,124,950,980,1400],[1000,1094,0,950,980,1400],[1000,1094,125,950,980,1400],[1000,1094,94,950,980,1093],[NaN,1094,94,950,980,1400]])assert.throws(()=>admittedSample(...values as [number,number,number,number,number,number]));
});
test('A phase has a continuous fixed clock mapping even when a better ping replaces the offset',()=>{
 const clock=new ServerClock();clock.seed(100000,0);assert.equal(clock.ready,false);assert.throws(()=>clock.phaseNow('phase',0));
 clock.sample(100010,0,210);clock.sample(100310,300,510);clock.sample(100610,600,810);assert.equal(clock.ready,true);
 const before=clock.phaseNow('phase',920);clock.sample(100910,900,920);clock.sample(101010,1000,1020);clock.sample(101110,1100,1120);
 assert.equal(clock.phaseNow('phase',920),before);assert.equal(clock.phaseNow('phase',1120)-before,200,'No pause or catch-up plateau');assert.notEqual(clock.phaseNow('new-phase',1120),clock.phaseNow('phase',1120));clock.recoverPhase('phase');assert.equal(clock.phaseNow('phase',1120),clock.phaseNow('new-phase',1120),'Explicit rejected-input recovery can adopt the better mapping');clock.restartCalibration();assert.equal(clock.ready,false);assert.throws(()=>clock.phaseNow('phase',1200),'Reconnect requires three fresh samples');
});
test('HTTP clock subtracts authenticated processing before estimating transport offset',()=>{
 const clock=new ServerClock(),withoutProcessing=new ServerClock();for(let i=0;i<3;i++){clock.sample(100100+i*200,i*200,120+i*200,100020+i*200);withoutProcessing.sample(100020+i*200,i*200,40+i*200,100020+i*200);}
 // 20ms request + 80ms auth/Redis + 20ms return: server epoch is exactly 100000.
 assert.equal(clock.now(500),100500,'Legacy midpoint excludes auth/Redis processing');assert.equal(clock.phaseNow('phase',500),100480,'V3 uses the measured lower bound,20ms behind true time');assert.equal(clock.phaseNow('phase',500),withoutProcessing.phaseNow('phase',500),'Processing does not alter the conservative mapping');assert.equal(clock.ready,true);
});
test('Cold asymmetric uplink does not create a 13ms future render claim; legacy midpoint is preserved',()=>{
 const clock=new ServerClock();for(let i=0;i<3;i++){const sent=i*200;clock.sample(100111+sent,sent,116+sent,100031+sent);}
 // 31ms uplink +80ms server processing +5ms downlink makes midpoint13ms ahead.
 assert.equal(clock.phaseNow('legacy',600,'bounded-latency-v2'),100613);assert.throws(()=>admittedSample(clock.phaseNow('legacy',600,'bounded-latency-v2'),100600,54,100000,0,100700));
 const drawn=clock.phaseNow('v3',600);assert.equal(drawn,100595);assert.equal(clock.phaseOffset('v3'),99995);assert.equal(admittedSample(drawn,100600,54,100000,0,100700),drawn);
 const newPhaseStart=100600;assert.ok(clock.phaseNow('new-v3-phase',600)<newPhaseStart,'UI must wait for the phase start before drawing/accepting its sample');assert.equal(clock.phaseNow('new-v3-phase',605),newPhaseStart);
});
test('V3 drawing and admission agree when fractional browser time reaches integer ingress in under 1ms',()=>{
 const clock=new ServerClock();for(let i=0;i<3;i++)clock.sample(1_000_000+i*100,i*100,i*100+.1,1_000_000+i*100);
 // The mapped lower bound is physically conservative, but a later Date.now
 // capture independently floors 1000005.9 to 1000005. The old float was +.75ms.
 const at=5.85,receivedAt=Math.floor(1_000_005.9),drawn=clock.phaseNow('sub-ms-phase',at),oldFloat=clock.phaseOffset('sub-ms-phase')!+at;
 assert.equal(oldFloat-receivedAt,.75);assert.throws(()=>admittedSample(oldFloat,receivedAt,54,1_000_000,0,receivedAt+100));assert.equal(drawn,receivedAt);
 const admitted=admittedSample(drawn,receivedAt,54,1_000_000,0,receivedAt+100);assert.equal(admitted,drawn);
 for(const axis of ['horizontal','vertical'] as const){assert.equal(meterPosition(admitted,1_000_000,axis),meterPosition(drawn,1_000_000,axis));for(const width of [220,500,900])assert.equal((meterFraction(admitted,1_000_000,axis)-meterFraction(drawn,1_000_000,axis))*width,0);}
 assert.equal(clock.phaseNow('sub-ms-phase',at+.01),drawn);assert.equal(clock.phaseNow('sub-ms-phase',at+1),drawn+1,'The fixed phase mapping stays nondecreasing');assert.throws(()=>admittedSample(drawn+1,receivedAt,54,1_000_000,0,receivedAt+100),'A genuinely future claim still fails');
 for(const version of ['receive-v1','bounded-latency-v2'] as const){const legacy=clock.phaseNow(version,at,version);assert.equal(Number.isInteger(legacy),false);assert.ok(Math.abs(legacy-(clock.offset!+at))<1e-9,'Legacy versions preserve their floating midpoint mapping');}
});
test('New moving draws gradually adopt measured lower bounds after a same-phase server window shrinks',()=>{
 // Controlled equal-rate clocks: true server UTC is epoch + client monotone
 // time. These are simulated newly drawn samples, not browser paint evidence
 // or an attribution of the preserved live 97ms rejection.
 const epoch=1_000_000,clock=new ServerClock(),rtts:number[]=[];
 const exchange=(sent:number,up:number,down:number)=>{clock.sample(epoch+sent+up,sent,sent+up+down,epoch+sent+up);rtts.push(up+down);if(rtts.length>12)rtts.shift();};
 for(const sent of [0,200,400])exchange(sent,50,50);
 const token='moving-phase',phaseStart=epoch+1000,firstAt=2000;
 const frozen={sampleAt:clock.movingPhaseNow(token,firstAt),fraction:meterFraction(epoch+firstAt-50,phaseStart,'horizontal','faster-v2')};
 assert.equal(frozen.sampleAt,epoch+firstAt-50);assert.equal(sampleWindow(rtts),124);
 assert.equal(admittedSample(frozen.sampleAt,epoch+firstAt+21,124,phaseStart,0,epoch+firstAt+31),frozen.sampleAt);
 for(let i=0;i<12;i++)exchange(5000+i*20,1,1);
 const window=sampleWindow(rtts);assert.equal(window,54);
 assert.equal(clock.phaseOffset(token),epoch-50,'Pings alone cannot shift an active phase');
 const staleCurrentDraw=clock.phaseNow(token,7000);
 assert.equal(epoch+7021-staleCurrentDraw,71);assert.throws(()=>admittedSample(staleCurrentDraw,epoch+7021,window,phaseStart,0,epoch+7031));
 const observations:{age:number;accepted:boolean}[]=[];let previous=firstAt;
 for(let i=0;i<98;i++){
  const at=7000+i*16,offsetBefore=clock.phaseOffset(token)!,withoutCorrection=Math.floor(offsetBefore+at),sampleAt=clock.movingPhaseNow(token,at),offsetAfter=clock.phaseOffset(token)!;
  assert.ok(offsetAfter>=offsetBefore&&offsetAfter-offsetBefore<=.5,'A new draw cannot jump its epoch by more than0.5ms');
  assert.ok(offsetAfter-offsetBefore<=(at-previous)*.05,'Correction uses elapsed monotone draw time');
  assert.ok(offsetAfter<=epoch-1,'Correction never exceeds the actually measured conservative bound');
  assert.equal(sampleAt,Math.floor(offsetAfter+at),'Draw and trace use the same corrected phase mapping');
  assert.ok(sampleAt>=withoutCorrection&&sampleAt<=withoutCorrection+1,'Integer draw quantization is included in the extra movement bound');
  for(const axis of ['horizontal','vertical'] as const)assert.ok(Math.abs(meterFraction(sampleAt,phaseStart,axis,'faster-v2')-meterFraction(withoutCorrection,phaseStart,axis,'faster-v2'))*900<=1,'Extra clock correction stays below1CSSpx on the tested900px track');
  const receivedAt=epoch+at+21;let admitted:number|undefined;
  try{admitted=admittedSample(sampleAt,receivedAt,window,phaseStart,0,receivedAt+10);}catch(error){assert.equal((error as Error).message,'invalid_render_sample');}
  const accepted=admitted!==undefined;if(accepted)assert.equal(admitted,sampleAt);
  assert.equal(accepted,receivedAt-sampleAt<=window,'Every simulated new draw is classified by its unchanged actual ingress boundary');
  observations.push({age:receivedAt-sampleAt,accepted});previous=at;
 }
 assert.equal(observations.length,98);assert.ok(observations.some(row=>!row.accepted),'Early truly old draws still reject under the unchanged54ms window');
 assert.equal(observations.at(-1)!.age,22);assert.equal(observations.at(-1)!.accepted,true);assert.equal(clock.phaseOffset(token),epoch-1);
 assert.equal(frozen.sampleAt,epoch+firstAt-50,'A previously frozen claim is never refreshed by better measurements or later draws');
 assert.throws(()=>admittedSample(frozen.sampleAt,epoch+firstAt+21,window,phaseStart,0,epoch+firstAt+31),'The same old claim and original ingress remain rejected after recovery of new moving draws');
});
test('Moving clock correction has no ping step, reverse step, accumulated idle jump or catch-up plateau',()=>{
 const epoch=1_000_000,clock=new ServerClock();
 for(const sent of [0,200,400])clock.sample(epoch+sent+50,sent,sent+100,epoch+sent+50);
 const token='smooth',first=clock.movingPhaseNow(token,1000),initialOffset=clock.phaseOffset(token)!;
 for(const sent of [1200,1400,1600])clock.sample(epoch+sent+1,sent,sent+2,epoch+sent+1);
 assert.equal(clock.movingPhaseNow(token,1000),first,'The same draw timestamp cannot adopt a new ping epoch');
 assert.equal(clock.phaseOffset(token),initialOffset);
 const before=clock.phaseOffset(token)!;clock.movingPhaseNow(token,1005);assert.equal(clock.phaseOffset(token)!-before,.25,'Short draw intervals use the5% monotone slew rate');
 const beforeIdle=clock.phaseOffset(token)!;const afterIdle=clock.movingPhaseNow(token,10000);
 assert.equal(clock.phaseOffset(token)!-beforeIdle,.5,'A long suspension cannot accumulate a large offset jump');
 assert.ok(afterIdle>first,'The clock continues moving rather than waiting for an offset step to catch up');
 assert.throws(()=>clock.movingPhaseNow(token,9999));assert.throws(()=>clock.movingPhaseNow(token,NaN));
 const continuous=clock.phaseOffset(token)!;
 for(let i=0;i<12;i++)clock.sample(epoch+11000+i*100+1,11000+i*100,11000+i*100+101,epoch+11000+i*100+1);
 const later=clock.movingPhaseNow(token,13000);
 assert.equal(clock.phaseOffset(token),continuous,'A worse newer lower bound cannot send a phase backwards');
 assert.equal(later-afterIdle,3000,'There is no slowdown or plateau after a worse ping');
});
test('Moving draw history resets only at explicit recovery, eviction or reconnect and leaves legacy clocks exact',()=>{
 const epoch=1_000_000,clock=new ServerClock();
 for(const sent of [0,200,400])clock.sample(epoch+sent+50,sent,sent+100,epoch+sent+50);
 clock.movingPhaseNow('recover',1000);
 for(const sent of [1200,1400,1600])clock.sample(epoch+sent+1,sent,sent+2,epoch+sent+1);
 clock.movingPhaseNow('recover',1700);clock.recoverPhase('recover');
 assert.equal(clock.movingPhaseNow('recover',1700),epoch+1699,'Explicit rejected-input recovery adopts the new measured phase bound with fresh draw history');
 for(const version of ['receive-v1','bounded-latency-v2'] as const){
  const token='legacy-'+version,before=clock.movingPhaseNow(token,1800.25,version),offset=clock.phaseOffset(token)!;
  for(const sent of [1900,2000,2100])clock.sample(epoch+sent+31,sent,sent+36,epoch+sent+31);
  assert.equal(clock.movingPhaseNow(token,2200.25,version),before+400);assert.equal(clock.phaseOffset(token),offset,'Moving API never changes an already anchored legacy phase');
 }
 for(let i=0;i<9;i++)clock.movingPhaseNow('eviction-'+i,2400+i*16);
 assert.equal(clock.phaseOffset('recover'),undefined,'Evicted phases have no retained epoch');
 assert.doesNotThrow(()=>clock.movingPhaseNow('recover',2300),'An evicted draw has no stale monotone history');
 clock.restartCalibration();assert.throws(()=>clock.movingPhaseNow('after-reconnect',3000),'Reconnect still requires three genuine fresh samples');
 for(const sent of [3000,3100,3200])clock.sample(epoch+sent+1,sent,sent+2,epoch+sent+1);
 assert.equal(clock.movingPhaseNow('after-reconnect',3300),epoch+3299);
});
