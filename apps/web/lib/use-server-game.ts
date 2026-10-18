"use client";
import {useI18n} from '@/lib/i18n/provider';
import {renderGameMessage} from '../../../packages/i18n/src/game-messages';
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";

import {errorText} from "../../../packages/i18n/src/errors";
import {startTransition,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ServerClock,TIMING_VERSION,type TimingVersion,type MeterSpeedVersion} from '../../../packages/game-core/src/timing';
import {drawMeter,lockMeter,meterGeometry,timingTrace,type DrawnMeterSample} from './drawn-meter';
import {useMotionValue} from 'motion/react';
import {Client,type Room} from '@colyseus/sdk';
import {browserAuth} from './supabase-client';
import {getPlatform,usePlatform,api,mutate,refreshPlatform,selfName,playerId,ApiError} from './platform-client';
import {getMatchRecords} from './darts-match-records';
import {initialGameState,type GameState} from './darts-game-state';
import {useDartsPreferences} from './darts-preferences';
import type {MatchMode,MatchRatingChange} from './darts-match-records';
import type {MatchSetup} from './darts-match-setup';
import type {TurnTimeoutWarning,TurnTimeoutDecision} from '../../../packages/game-core/src/turn-timeout';

type Snapshot={commandId?:string;timing?:Record<string,unknown>;matchId:string;roomId?:string;canRematch?:boolean;publicGameId?:number;state:GameState&{timingVersion?:TimingVersion;meterSpeedVersion?:MeterSpeedVersion;timeoutStrikes?:[number,number];timeoutWarning?:TurnTimeoutWarning|null;timeoutDecision?:TurnTimeoutDecision|null;phaseToken:string;phaseStartedAt:number;lockedX:number|null;lockedY?:number|null;impactAt:number|null;ready:[boolean,boolean];names:[string,string]};stateVersion:number;lifecycle:string;mode:string;ranked?:boolean;seat:number|null;gameNumber:number;serverAt:number;remainingReconnectMs?:number};
const empty=initialGameState(0,'',0) as GameState&{timeoutDecision?:TurnTimeoutDecision|null};
export function useServerGame(initialOpponentName='',explicitMatchId?:string,readOnly=false){
 const {locale:uiLocale}=useI18n();

 const platform=usePlatform(),preferences=useDartsPreferences();
 const dismissed=useRef(new Set<string>());
 const own=platform.matches.find(m=>!dismissed.current.has(m.id)&&m.players?.some((p:any)=>p.id===platform.actor?.id));
 const [selected,setSelected]=useState('');
 useEffect(()=>{setSelected(new URLSearchParams(window.location.search).get('match')??'');},[]);
 // Pin the accepted match until the player explicitly closes its result.
 // Bootstrap intentionally lists only active matches; completion must not
 // erase the final snapshot or unmount the summary.
 useEffect(()=>{if(!explicitMatchId&&own?.id&&own.id!==selected)setSelected(own.id);},[explicitMatchId,own?.id,selected]);
 const matchId=explicitMatchId??selected??own?.id;
 const actualId=matchId||own?.id;
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[sending,setSending]=useState(false),[connectionMessage,setConnectionMessage]=useState(''),[offlineUntil,setOfflineUntil]=useState<number|null>(null),[reconnected,setReconnected]=useState(false),[active,setActiveState]=useState(true);
 const current=useRef<Snapshot|null>(null),socket=useRef<Room|null>(null),pending=useRef<any>(null),readyRetries=useRef(0),clock=useRef(new ServerClock());
 const xIndicator=useRef<HTMLSpanElement|null>(null),yIndicator=useRef<HTMLSpanElement|null>(null),drawn=useRef<{horizontal:DrawnMeterSample|null;vertical:DrawnMeterSample|null}>({horizontal:null,vertical:null}),connectionId=useRef(''),generation=useRef(0),serverCalibrated=useRef(false);
 const [timingReady,setTimingReady]=useState(false);
 const xMeter=useMotionValue(.5),yMeter=useMotionValue(.5);
 const renderLive=useRef(false),frame=useRef<number|null>(null),renderControl=useRef({active:true,readOnly});
 const projected=useRef<{horizontal:{element:HTMLElement;fraction:number}|null;vertical:{element:HTMLElement;fraction:number}|null}>({horizontal:null,vertical:null});
 const horizontalReset=useRef<{phaseToken:string;element:HTMLElement}|null>(null),runFrame=useRef<()=>void>(()=>{});
 const cancelFrame=useCallback(()=>{if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}},[]);
 const paintLock=useCallback((axis:'horizontal'|'vertical',fraction:number)=>{
  const element=axis==='horizontal'?xIndicator.current:yIndicator.current;if(!element)return;
  const previous=projected.current[axis];if(previous?.element===element&&previous.fraction===fraction)return;
  (axis==='horizontal'?xMeter:yMeter).set(fraction);lockMeter(element,axis,fraction);projected.current[axis]={element,fraction};
 },[xMeter,yMeter]);
 const projectLocks=useCallback(()=>{const state=current.current?.state;if(!state)return;
  if(state.lockedX!==null)paintLock('horizontal',(state.lockedX+1.14)/2.28);
  if(state.lockedY!=null)paintLock('vertical',(state.lockedY+1.14)/2.28);
 },[paintLock]);
 const movingView=useCallback(()=>{const view=current.current;if(!renderLive.current||!view||!socket.current||renderControl.current.readOnly||!renderControl.current.active||view.seat===null||view.seat!==view.state.turn||view.lifecycle!=='playing'||!!view.state.timeoutDecision||!clock.current.ready||!serverCalibrated.current||pending.current?.phaseToken===view.state.phaseToken)return null;
  const axis=view.state.phase;if(axis!=='horizontal'&&axis!=='vertical')return null;
  // Preserve the original authoritative-lock priority over any moving draw.
  if(axis==='horizontal'?view.state.lockedX!==null:view.state.lockedY!=null)return null;
  const indicator=axis==='horizontal'?xIndicator.current:yIndicator.current;return indicator?.isConnected?{view,axis,indicator}:null;
 },[]);
 const wake=useCallback(()=>{if(!movingView()){cancelFrame();return;}if(frame.current===null)frame.current=requestAnimationFrame(runFrame.current);},[cancelFrame,movingView]);
 runFrame.current=()=>{frame.current=null;const moving=movingView();if(!moving)return;
  const {view,axis,indicator}=moving,state=view.state,drawAt=performance.now(),version=state.timingVersion??'receive-v1',now=clock.current.phaseNow(state.phaseToken,drawAt,version);
  // A calibrated future phase keeps waiting on RAF; no sample is fabricated.
  if(version!==TIMING_VERSION||now>=state.phaseStartedAt){
   const sample=drawMeter(indicator,axis,clock.current.movingPhaseNow(state.phaseToken,drawAt,version),state.phaseStartedAt,state.phaseToken,state.meterSpeedVersion);
   if(sample){projected.current[axis]=null;drawn.current[axis]=sample;(axis==='horizontal'?xMeter:yMeter).set(sample.fraction);
    if(axis==='horizontal'&&state.lockedY==null&&yIndicator.current){const prior=horizontalReset.current;if(prior?.phaseToken!==state.phaseToken||prior.element!==yIndicator.current){paintLock('vertical',.5);horizontalReset.current={phaseToken:state.phaseToken,element:yIndicator.current};}}
   }
  }
  wake();
 };
 const bindXIndicator=useCallback((element:HTMLSpanElement|null)=>{xIndicator.current=element;projected.current.horizontal=null;projectLocks();wake();},[projectLocks,wake]);
 const bindYIndicator=useCallback((element:HTMLSpanElement|null)=>{yIndicator.current=element;projected.current.vertical=null;horizontalReset.current=null;projectLocks();wake();},[projectLocks,wake]);
 const setActive=useCallback((value:boolean|((previous:boolean)=>boolean))=>{const next=typeof value==='function'?value(renderControl.current.active):value;renderControl.current.active=next;setActiveState(next);wake();},[wake]);
 useLayoutEffect(()=>{renderLive.current=true;projectLocks();wake();return()=>{renderLive.current=false;cancelFrame();};},[cancelFrame,projectLocks,wake]);
 // Snapshot projection is after DOM commit, including loading->panel mounts.
 useLayoutEffect(()=>{renderControl.current={active,readOnly};projectLocks();wake();},[active,readOnly,snapshot,projectLocks,wake]);
 const apply=useCallback((value:Snapshot)=>{const previous=current.current;if(previous&&previous.matchId===value.matchId&&previous.stateVersion>value.stateVersion)return;const next={...previous,...value};clock.current.seed(value.serverAt);current.current=next;projectLocks();wake();setSnapshot(next);if(previous&&((value.state.totalLegs[0]+value.state.totalLegs[1])>(previous.state.totalLegs[0]+previous.state.totalLegs[1])||value.lifecycle!==previous.lifecycle&&['completed','abandoned'].includes(value.lifecycle)))void refreshPlatform().catch(()=>{});},[projectLocks,wake]);
 useEffect(()=>{
  if(!actualId)return;let cancelled=false,retry:ReturnType<typeof setTimeout>|undefined,renew:ReturnType<typeof setInterval>|undefined,ping:ReturnType<typeof setInterval>|undefined;
  const connect=async()=>{
   try{
    const {data,error}=await browserAuth().auth.getSession();if(error||!data.session)throw new Error('Log opnieuw in om verder te spelen.');
    const client=new Client(process.env.NEXT_PUBLIC_REALTIME_URL!);const room=await client.joinOrCreate('match',{matchId:actualId,token:data.session.access_token});
    if(cancelled){await room.leave();return;}const socketGeneration=++generation.current;socket.current=room;clock.current.restartCalibration();serverCalibrated.current=false;wake();setTimingReady(false);setOfflineUntil(null);setConnectionMessage('');
    const currentSocket=()=>!cancelled&&socket.current===room&&generation.current===socketGeneration;
    const samples=new Map<string,number>();
    room.onMessage('clock.challenge',(value:any)=>{if(!cancelled)room.send('clock.echo',{nonce:value.nonce});});
    room.onMessage('clock.ready',(value:any)=>{if(!currentSocket())return;connectionId.current=value.connectionId;serverCalibrated.current=value.ready===true;wake();setTimingReady(clock.current.ready&&serverCalibrated.current);});
    room.onMessage('clock.sample',(value:any)=>{if(!currentSocket())return;const sent=samples.get(value.nonce);if(sent!==undefined){clock.current.sample(value.serverAt,sent,performance.now(),value.serverReceivedAt??value.serverAt);samples.delete(value.nonce);connectionId.current=value.connectionId;serverCalibrated.current=value.ready===true;wake();setTimingReady(clock.current.ready&&serverCalibrated.current);}});
    const sample=()=>{if(!currentSocket())return;const nonce=crypto.randomUUID();samples.set(nonce,performance.now());if(samples.size>8)samples.delete(samples.keys().next().value!);room.send('clock.ping',{nonce});};sample();if(ping)clearInterval(ping);let initialSamples=0;ping=setInterval(()=>{initialSamples++;if(initialSamples<=6||initialSamples%20===0)sample();},100);
    room.onMessage('snapshot',(value:Snapshot)=>{if(currentSocket())apply(value);});
    room.onMessage('receipt',(value:Snapshot)=>{if(!currentSocket()||!pending.current||value.commandId!==pending.current.commandId)return;timingTrace({event:'receipt',commandId:value.commandId,matchId:value.matchId,timing:value.timing,lockedX:value.state.lockedX,lockedY:value.state.lockedY,hit:value.state.pendingDart?.hit});apply(value);pending.current=null;wake();setSending(false);setConnectionMessage('');});
    room.onMessage('error',(value:any)=>{
     if(!currentSocket()||!pending.current||value.commandId!==pending.current.commandId)return;const failed=pending.current;timingTrace({event:'rejected',commandId:failed.commandId,code:value.code});setSending(false);pending.current=null;wake();setConnectionMessage(errorText(value.code,undefined,value.message));
     void api<Snapshot>('match/'+actualId).then(fresh=>{
      if(cancelled)return;if(['invalid_render_sample','timing_connection_mismatch'].includes(value.code))clock.current.recoverPhase(fresh.state.phaseToken);apply(fresh);
      // Readiness expresses a durable intention. Refresh and retry this alone
      // when another player's confirmation wins the version race.
      if(failed?.type==='match.ready'&&value.code==='stale_state'&&readyRetries.current<2&&fresh.seat!==null&&!fresh.state.ready[fresh.seat]&&['assigned','paused'].includes(fresh.lifecycle)&&socket.current===room&&!pending.current){
       readyRetries.current++;const retry={...failed,commandId:crypto.randomUUID(),expectedStateVersion:fresh.stateVersion,phaseToken:fresh.state.phaseToken};pending.current=retry;wake();setSending(true);setConnectionMessage('');room.send('command',retry);
      }
     }).catch(()=>{});
    });
    room.onLeave(()=>{if(!currentSocket())return;socket.current=null;wake();setTimingReady(false);setOfflineUntil(Date.now()+(current.current?.remainingReconnectMs??120000));if(readOnly){current.current=null;setSnapshot(null);}setConnectionMessage('De verbinding wordt hersteld.');retry=setTimeout(connect,1000);});
    const fresh=await api<Snapshot>('match/'+actualId);if(!currentSocket())return;apply(fresh);
    if(pending.current)room.send('command',pending.current);
    if(renew)clearInterval(renew);renew=setInterval(()=>{void browserAuth().auth.getSession().then(({data})=>{if(data.session)room.send('authenticate',{token:data.session.access_token});});},60000);
   }catch(e){if(cancelled)return;if(readOnly){current.current=null;setSnapshot(null);}setConnectionMessage(e instanceof Error?e.message:'We kunnen je wedstrijd niet openen. We proberen het opnieuw.');retry=setTimeout(connect,3000);}
  };
  void connect();return ()=>{cancelled=true;clearTimeout(retry);clearInterval(renew);clearInterval(ping);void socket.current?.leave();socket.current=null;current.current=null;pending.current=null;wake();readyRetries.current=0;setSnapshot(null);};
 },[actualId,apply,readOnly,wake]);

 const command=useCallback((type:string)=>{
  const s=current.current;if(readOnly||!s||s.seat===null||!socket.current||pending.current)return;
  // Gate RAF and freeze before network, React, haptics or audio.
  const stoppedAt=performance.now(),axis=type==='dart.stop_horizontal'?'horizontal':type==='dart.stop_vertical'?'vertical':null,sample=axis?drawn.current[axis]:null;
  if(axis&&(!sample||sample.phaseToken!==s.state.phaseToken||sample.meterSpeedVersion!==(s.state.meterSpeedVersion??'standard-v1')||s.state.timingVersion===TIMING_VERSION&&sample.sampleAt<s.state.phaseStartedAt||!serverCalibrated.current||!clock.current.ready))return;
  const payload={protocolVersion:1,commandId:crypto.randomUUID(),matchId:s.matchId,expectedStateVersion:s.stateVersion,type,phaseToken:s.state.phaseToken,...(axis&&sample&&s.state.timingVersion===TIMING_VERSION?{renderSample:{sampleAt:sample.sampleAt,connectionId:connectionId.current,dartNumber:s.state.dartCount[0]+s.state.dartCount[1]+1,meterSpeedVersion:sample.meterSpeedVersion}}:{})};pending.current=payload;
  const element=axis==='horizontal'?xIndicator.current:yIndicator.current;
  if(axis&&sample)lockMeter(element,axis,sample.fraction);
  cancelFrame();
  const stopAppliedAt=performance.now(),sendAt=performance.now();
  // Submit the frozen sample before geometry reads, diagnostics or React work.
  socket.current.send('command',payload);const sendReturnedAt=performance.now();
  readyRetries.current=0;
  // The pending ref already blocks duplicate input. This status update also
  // renders the surrounding player tables, so keep that work out of the
  // discrete stop event after the actual drawn sample is frozen and sent.
  if(type.startsWith('dart.stop_'))startTransition(()=>setSending(true));
  else setSending(true);
  if(axis&&sample){const geometry=element?meterGeometry(element,axis):undefined,trace={event:'local-stop',commandId:payload.commandId,matchId:s.matchId,dartNumber:s.state.dartCount[0]+s.state.dartCount[1]+1,phase:axis,phaseToken:s.state.phaseToken,phaseStartedAt:s.state.phaseStartedAt,timingVersion:s.state.timingVersion,rendered:sample,geometry,inputAt:stoppedAt,stopAppliedAt,sendAt,sendReturnedAt,clockOffset:clock.current.phaseOffset(s.state.phaseToken),localLock:sample.fraction};timingTrace(trace);performance.mark('dp-local-stop',{detail:{...trace,axis:type,at:stoppedAt,x:xMeter.get(),y:yMeter.get(),handlerCompletedAt:performance.now()}});}
 },[readOnly,xMeter,yMeter,cancelFrame]);
 const startOrStop=useCallback(()=>{const s=current.current;if(readOnly||!active||!s||s.seat!==s.state.turn||s.lifecycle!=='playing'||s.state.timeoutDecision||pending.current)return;if(s.state.phase==='horizontal')command('dart.stop_horizontal');else if(s.state.phase==='vertical')command('dart.stop_vertical');if(preferences.haptics)navigator.vibrate?.(12);},[readOnly,active,preferences.haptics,command]);
 const beginMatch=useCallback(async()=>command('match.ready'),[command]);
 const raw=snapshot?.state??empty,swap=snapshot?.seat===1;
 const pair=<T,>(value:[T,T]):[T,T]=>swap?[value[1],value[0]]:value;
 const turn=(swap?1-raw.turn:raw.turn) as 0|1,winner=raw.winner===null?null:(swap?1-raw.winner:raw.winner) as 0|1;
 const names=snapshot?pair(snapshot.state.names):[selfName(),initialOpponentName];
 const myTurn=!readOnly&&!raw.timeoutDecision&&snapshot?.seat!==null&&snapshot?.seat===raw.turn;
 const warning=snapshot?.state.timeoutWarning,decision=raw.timeoutDecision;
 const timeoutDecision=decision?{...decision,player:(swap?1-decision.player:decision.player) as 0|1}:null;
 const grantTimeoutMinute=useCallback(()=>command('match.timeout_wait'),[command]);
 const finishTimedOutMatch=useCallback(()=>command('match.timeout_finish'),[command]);
 const state={...raw,scores:pair(raw.scores),legs:pair(raw.legs),sets:pair(raw.sets),totalLegs:pair(raw.totalLegs),opened:pair(raw.opened),dartCount:pair(raw.dartCount),pointsScored:pair(raw.pointsScored),visitScores:pair(raw.visitScores),visitBusts:pair(raw.visitBusts),highestVisit:pair(raw.highestVisit),highestCheckout:pair(raw.highestCheckout),timeoutStrikes:pair(snapshot?.state.timeoutStrikes??[0,0]),timeoutWarning:warning?{...warning,player:(swap?1-warning.player:warning.player) as 0|1}:null,turn,winner,phase:raw.phase==='won'||raw.phase==='flight'?raw.phase:myTurn?raw.phase:'opponent' as const,events:raw.events.map(e=>({...e,player:(swap?1-e.player:e.player) as 0|1})),history:[]};
 const rematch=useCallback(async()=>{if(readOnly||!actualId)throw new Error(runtimeFeedback("feedback.open_eerst_je_eigen_wedstrijdoverzicht"));return mutate<{id:string}>('match/rematch',{matchId:actualId});},[readOnly,actualId]);
 const startNewMatch=useCallback(async(name:string,setup?:MatchSetup)=>{if(readOnly)return;const p=getPlatform();const room=p.rooms.find(r=>r.name===sessionStorage.getItem('dartspoint-room-v1'))??p.rooms[0];await mutate('invite',{targetId:playerId(name),roomId:room.id,rules:setup?.rules??empty.rules,ranked:setup?.ranked===true});setConnectionMessage('De uitnodiging is verstuurd.');},[readOnly]);
 const reset=useCallback(()=>command('match.forfeit'),[command]);
 const reconnect=useCallback(()=>{void api<Snapshot>('match/'+actualId).then(apply);setReconnected(true);},[actualId,apply]);
 const simulateDisconnect=useCallback(()=>{void socket.current?.connection.close();},[]);
 const clearMatchSelection=useCallback(()=>{if(actualId)dismissed.current.add(actualId);setSelected("");window.history.replaceState(null,"","/spelen");},[actualId]);
 const closeCompletedMatch=useCallback(async()=>{
  const view=current.current;if(readOnly||!view||!['completed','abandoned'].includes(view.lifecycle))return;
  // This is navigation after a settled result, never a forfeit/reset command.
  if(view.roomId){try{await mutate('room',{roomId:view.roomId});}catch(error){if(error instanceof ApiError&&['room_unavailable','room_private','room_removed','room_rating_restricted','room_full'].includes(error.code)){clearMatchSelection();window.location.assign('/lobby?room-unavailable=1');return;}throw error;}}
  clearMatchSelection();
 },[readOnly,clearMatchSelection]);
 const noOp=useCallback(()=>{},[]);
 const mode:MatchMode=snapshot?.ranked||snapshot?.mode==='ranked'?'ranked-demo':'casual';
 return {...state,timeoutDecision,grantTimeoutMinute,finishTimedOutMatch,lastResult:renderGameMessage(state.lastResult,uiLocale,names),bustReason:state.bustReason?renderGameMessage(state.bustReason,uiLocale):null,clearMatchSelection,closeCompletedMatch,canRematch:snapshot?.canRematch!==false&&snapshot?.lifecycle==='completed',id:actualId??'',publicGameId:snapshot?.publicGameId??snapshot?.gameNumber,isSpectator:readOnly||snapshot?.seat===null,xMeter,yMeter,xIndicator:bindXIndicator,yIndicator:bindYIndicator,timingReady,startOrStop,reset,startNewMatch,rematch,undo:noOp,canUndo:false,landDart:noOp,averages:state.dartCount.map((n,i)=>n?state.pointsScored[i]/n*3:0) as [number,number],playerName:names[0],opponentName:names[1],setActive,ready:!!snapshot&&['playing','completed','abandoned'].includes(snapshot.lifecycle),preparing:!!actualId&&!snapshot,beginMatch,mode,modeLabel:renderGameMessage(snapshot?.mode==='ranked'?'Gerankt':snapshot?.mode==='tournament'?'Toernooi':snapshot?.mode==='division'?'Divisie':'Vrij spelen',uiLocale),offlineUntil,remainingReconnect:offlineUntil?Math.max(0,Math.ceil((offlineUntil-Date.now())/1000)):Math.ceil((snapshot?.remainingReconnectMs??120000)/1000),reconnect,simulateDisconnect,reconnected,sending,verification:'server' as const,connectionMessage:renderGameMessage(connectionMessage,uiLocale),ratingChange:getMatchRecords().find(r=>r.id===actualId)?.ratingChange,preferences,matchId:actualId,gameNumber:snapshot?.gameNumber,seat:snapshot?.seat,waitingForOpponent:!readOnly&&!!snapshot&&snapshot.seat!==null&&snapshot.state.ready[snapshot.seat]&&snapshot.lifecycle==='assigned'};
}
