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
