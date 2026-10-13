export const TIMING_VERSION='bounded-latency-v2' as const;
export type TimingVersion='receive-v1'|typeof TIMING_VERSION;
export function meterPosition(at:number,startedAt:number,axis:'horizontal'|'vertical'){
 const period=axis==='horizontal'?2200:2500;
 const phase=(((at-startedAt)/period+.25)%1+1)%1;
 return (1-Math.abs(phase*2-1))*2.28-1.14;
}
export function meterFraction(at:number,startedAt:number,axis:'horizontal'|'vertical'){
 return (meterPosition(at,startedAt,axis)+1.14)/2.28;
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
export class ServerClock {
 private epoch:number|null=null;private samples:{rtt:number;epoch:number}[]=[];
 seed(serverAt:number,at=performance.now()){if(this.epoch===null)this.epoch=serverAt-at;}
 sample(serverAt:number,sentAt:number,receivedAt=performance.now()){
  const rtt=receivedAt-sentAt;if(!Number.isFinite(serverAt)||rtt<0||rtt>5000)return;
  this.samples.push({rtt,epoch:serverAt-(sentAt+receivedAt)/2});this.samples=this.samples.slice(-12);
  const best=[...this.samples].sort((a,b)=>a.rtt-b.rtt).slice(0,3).sort((a,b)=>a.epoch-b.epoch);
  this.epoch=best.length<3?[...this.samples].sort((a,b)=>a.rtt-b.rtt)[0].epoch:best[Math.floor(best.length/2)].epoch;
 }
 now(at=performance.now()){return (this.epoch??Date.now()-at)+at;}
}
