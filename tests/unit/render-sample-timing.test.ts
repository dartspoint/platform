import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerClock,admittedSample,meterPosition,meterFraction,sampleWindow,TIMING_VERSION} from '../../packages/game-core/src/timing';
import {commandSchema} from '../../packages/contracts/src/index';
import {randomUUID} from 'node:crypto';
test('New games use versioned samples with no altered old compensation policy',()=>{
 assert.equal(TIMING_VERSION,'render-sample-v3');assert.equal(sampleWindow([40,40]),0);assert.equal(sampleWindow([40,40,40]),94);assert.equal(sampleWindow([350,350,350]),124);
 const payload={protocolVersion:1,commandId:randomUUID(),matchId:randomUUID(),expectedStateVersion:7,type:'dart.stop_horizontal',phaseToken:randomUUID(),renderSample:{sampleAt:1000123.456,connectionId:randomUUID(),dartNumber:2}};
 assert.ok(commandSchema.safeParse(payload).success);for(const renderSample of [{...payload.renderSample,score:180},{...payload.renderSample,sampleAt:NaN},{...payload.renderSample,dartNumber:0}])assert.equal(commandSchema.safeParse({...payload,renderSample}).success,false);
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
