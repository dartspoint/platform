import {meterFraction,type MeterSpeedVersion} from '../../../packages/game-core/src/timing';
export type DrawnMeterSample={phaseToken:string;sampleAt:number;fraction:number;renderedAt:number;meterSpeedVersion:MeterSpeedVersion};
export type MeterGeometry={indicator:number;trackStart:number;trackSize:number;fraction:number};
export function meterGeometry(element:HTMLElement,axis:'horizontal'|'vertical'):MeterGeometry{
 const track=element.parentElement!.getBoundingClientRect(),indicator=element.getBoundingClientRect(),horizontal=axis==='horizontal';
 const position=horizontal?indicator.left+indicator.width/2:indicator.top+indicator.height/2,start=horizontal?track.left:track.top,size=horizontal?track.width:track.height;
 return {indicator:position,trackStart:start,trackSize:size,fraction:size?(position-start)/size:.5};
}
// Native RAF writes cannot get one frame ahead via Motion's separate renderer.
export function drawMeter(element:HTMLElement|null,axis:'horizontal'|'vertical',sampleAt:number,phaseStartedAt:number,phaseToken:string,meterSpeedVersion:MeterSpeedVersion='standard-v1'):DrawnMeterSample|null{
 if(!element)return null;const fraction=meterFraction(sampleAt,phaseStartedAt,axis,meterSpeedVersion);element.style[axis==='horizontal'?'left':'top']=`${fraction*100}%`;
 return {phaseToken,sampleAt,fraction,renderedAt:performance.now(),meterSpeedVersion};
}
export function lockMeter(element:HTMLElement|null,axis:'horizontal'|'vertical',fraction:number){if(element)element.style[axis==='horizontal'?'left':'top']=`${fraction*100}%`;}
export function timingTrace(value:Record<string,unknown>){
 const scope=window as typeof window&{__dpTimingTraces?:Record<string,unknown>[]};
 // One browser-local monotone clock, including the actual receipt callback.
 // These bounded diagnostics never participate in admission or score timing.
 scope.__dpTimingTraces=[...(scope.__dpTimingTraces??[]),{monotonicAt:performance.now(),...value}].slice(-80);
}
