export const TIMING_VERSION='render-sample-v3' as const;
export type TimingVersion='receive-v1'|'bounded-latency-v2'|typeof TIMING_VERSION;
export const METER_SPEED_VERSION='faster-v2' as const;
export type MeterSpeedVersion='standard-v1'|typeof METER_SPEED_VERSION;
export const MAX_COMPENSATION_MS=90;
export const MAX_RENDER_AGE_MS=34;
export const MOVING_CLOCK_SLEW_RATE=.05;
export const MAX_MOVING_CLOCK_CORRECTION_MS=.5;
export type RenderSampleClaim={sampleAt:number;connectionId:string;dartNumber:number;meterSpeedVersion?:MeterSpeedVersion};
// Missing markers preserve the periods of already stored matches and practice.
export function meterPeriod(axis:'horizontal'|'vertical',version:MeterSpeedVersion='standard-v1'){
 return axis==='horizontal'?(version===METER_SPEED_VERSION?2037:2200):(version===METER_SPEED_VERSION?2315:2500);
}
export function meterPosition(at:number,startedAt:number,axis:'horizontal'|'vertical',speedVersion:MeterSpeedVersion='standard-v1'){
 const period=meterPeriod(axis,speedVersion);
 const phase=(((at-startedAt)/period+.25)%1+1)%1;
 return (1-Math.abs(phase*2-1))*2.28-1.14;
}
export function meterFraction(at:number,startedAt:number,axis:'horizontal'|'vertical',speedVersion:MeterSpeedVersion='standard-v1'){
 return (meterPosition(at,startedAt,axis,speedVersion)+1.14)/2.28;
}
export function admittedMoment(receivedAt:number,latencyMs:number,phaseStartedAt:number,lastAcceptedAt:number,processedAt:number){
 if(![receivedAt,latencyMs,phaseStartedAt,lastAcceptedAt,processedAt].every(Number.isFinite)||receivedAt<phaseStartedAt||receivedAt<lastAcceptedAt||receivedAt>processedAt||latencyMs<0||latencyMs>90)throw new Error('invalid_timing');
 return Math.max(phaseStartedAt,lastAcceptedAt,receivedAt-latencyMs);
}
export function trustedLatency(samples:readonly number[]){
 const valid=samples.filter(n=>Number.isFinite(n)&&n>=0&&n<=1000).sort((a,b)=>a-b);
 // At least three challenges; lower quartile resists transient queues and inflated echoes.
 return valid.length<3?0:Math.min(90,Math.floor(valid[Math.floor((valid.length-1)/4)]/2));
}
// A measured connection supplies a bounded allowance, not a client-chosen RTT.
// Frame age is separate from (and cannot increase) the 90ms network allowance.
export function sampleWindow(samples:readonly number[]){
 const valid=samples.filter(n=>Number.isFinite(n)&&n>=0&&n<=1000);
 if(valid.length<3)return 0;
 return Math.min(MAX_COMPENSATION_MS,Math.max(20,trustedLatency(valid)*3))+MAX_RENDER_AGE_MS;
}
export function admittedSample(sampleAt:number,receivedAt:number,windowMs:number,phaseStartedAt:number,lastAcceptedAt:number,processedAt:number){
 if(![sampleAt,receivedAt,windowMs,phaseStartedAt,lastAcceptedAt,processedAt].every(Number.isFinite)||windowMs<MAX_RENDER_AGE_MS||windowMs>MAX_COMPENSATION_MS+MAX_RENDER_AGE_MS||receivedAt>processedAt||sampleAt>receivedAt||sampleAt<receivedAt-windowMs||sampleAt<phaseStartedAt||sampleAt<lastAcceptedAt)throw new Error('invalid_render_sample');
 return sampleAt;
}
export class ServerClock {
 private epoch:number|null=null;private conservativeEpoch:number|null=null;private samples:{rtt:number;epoch:number;lowerEpoch:number}[]=[];private phases=new Map<string,number>();
 private movingDraws=new Map<string,number>();
 seed(serverAt:number,at=performance.now()){if(this.epoch===null)this.epoch=serverAt-at;}
 sample(serverAt:number,sentAt:number,receivedAt=performance.now(),serverReceivedAt=serverAt){
  const processing=serverAt-serverReceivedAt,rtt=receivedAt-sentAt-processing;if(!Number.isFinite(serverAt)||processing<0||rtt<0||rtt>5000)return;
  this.samples.push({rtt,epoch:serverAt-receivedAt+rtt/2,lowerEpoch:serverAt-receivedAt});this.samples=this.samples.slice(-12);
  const best=[...this.samples].sort((a,b)=>a.rtt-b.rtt).slice(0,3).sort((a,b)=>a.epoch-b.epoch);
  this.epoch=best.length<3?[...this.samples].sort((a,b)=>a.rtt-b.rtt)[0].epoch:best[Math.floor(best.length/2)].epoch;
  // Send minus receive is a lower bound regardless of uplink/downlink
  // asymmetry. Midpoint estimates can be in the future after a cold uplink
  // queue; a new sample policy never advances beyond its measured lower bound.
  this.conservativeEpoch=Math.max(...best.map(sample=>sample.lowerEpoch));
 }
 get ready(){return this.samples.length>=3;}
 restartCalibration(){this.samples=[];this.epoch=null;this.conservativeEpoch=null;this.movingDraws.clear();}
 get offset(){return this.epoch;}
 recoverPhase(phaseToken:string){this.phases.delete(phaseToken);this.movingDraws.delete(phaseToken);}
 phaseOffset(phaseToken:string){return this.phases.get(phaseToken);}
 phaseNow(phaseToken:string,at=performance.now(),version:TimingVersion=TIMING_VERSION){
  if(!this.ready)throw new Error('clock_not_calibrated');
  let epoch=this.phases.get(phaseToken);if(epoch===undefined){epoch=version===TIMING_VERSION?this.conservativeEpoch!:this.epoch!;this.phases.set(phaseToken,epoch);if(this.phases.size>8){const oldest=this.phases.keys().next().value!;this.phases.delete(oldest);this.movingDraws.delete(oldest);}}
  // Date.now ingress is integer milliseconds. Quantize the v3 render before
  // drawing so a sub-ms loopback cannot make its exact claim appear future.
  const mapped=epoch+at;return version===TIMING_VERSION?Math.floor(mapped):mapped;
 }
 // Call only when drawing a new moving frame, never for a pending stop, a
 // handler or a retry. Pings alone cannot change the phase mapping. A better
 // measured lower bound is approached without a backwards step or catch-up
 // plateau, at <=5% of monotone elapsed time and <=0.5ms per actual draw.
 movingPhaseNow(phaseToken:string,at=performance.now(),version:TimingVersion=TIMING_VERSION){
  if(version!==TIMING_VERSION)return this.phaseNow(phaseToken,at,version);
  if(!Number.isFinite(at))throw new Error('invalid_clock_sample');
  const previous=this.movingDraws.get(phaseToken);
  if(previous!==undefined&&at<previous)throw new Error('invalid_clock_sample');
  const mapped=this.phaseNow(phaseToken,at,version);
  if(previous===at)return mapped;
  this.movingDraws.set(phaseToken,at);
  if(previous===undefined)return mapped;
  const epoch=this.phases.get(phaseToken)!;
  const correction=Math.min(Math.max(0,this.conservativeEpoch!-epoch),(at-previous)*MOVING_CLOCK_SLEW_RATE,MAX_MOVING_CLOCK_CORRECTION_MS);
  if(correction===0)return mapped;
  const corrected=Math.min(this.conservativeEpoch!,epoch+correction);
  this.phases.set(phaseToken,corrected);
  return Math.floor(corrected+at);
 }
 now(at=performance.now()){return (this.epoch??Date.now()-at)+at;}
}
