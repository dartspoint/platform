import {randomUUID} from 'node:crypto';
import {TIMING_VERSION} from '../../packages/game-core/src/timing';
// Direct domain tests stand in for the measured server transport. Browser and
// socket tests separately establish the real challenge/connection boundary.
export function domainTiming(state:any,type:string){
 const receivedAt=Date.now(),connectionId=randomUUID(),stop=type==='dart.stop_horizontal'||type==='dart.stop_vertical';
 return {ingress:{receivedAt,connectionId,latencyMs:0,admissionWindowMs:54},...(stop&&state.timingVersion===TIMING_VERSION?{renderSample:{sampleAt:Math.max(state.phaseStartedAt,receivedAt-1),connectionId,dartNumber:state.dartCount[0]+state.dartCount[1]+1}}:{})};
}
