"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {ServerClock,meterFraction} from '../../../packages/game-core/src/timing';
import {useMotionValue} from 'motion/react';
import {Client,type Room} from '@colyseus/sdk';
import {browserAuth} from './supabase-client';
import {getPlatform,usePlatform,api,mutate,refreshPlatform,selfName,playerId} from './platform-client';
import {getMatchRecords} from './darts-match-records';
import {initialGameState,type GameState} from './darts-game-state';
import {useDartsPreferences} from './darts-preferences';
import type {MatchMode,MatchRatingChange} from './darts-match-records';
import type {MatchSetup} from './darts-match-setup';

type Snapshot={matchId:string;state:GameState&{phaseToken:string;phaseStartedAt:number;lockedX:number|null;lockedY?:number|null;impactAt:number|null;ready:[boolean,boolean];names:[string,string]};stateVersion:number;lifecycle:string;mode:string;seat:number|null;gameNumber:number;serverAt:number;remainingReconnectMs?:number};
const empty=initialGameState(0,'',0);
export function useServerGame(initialOpponentName='',explicitMatchId?:string){
 const platform=usePlatform(),preferences=useDartsPreferences();
 const own=platform.matches.find(m=>m.players?.some((p:any)=>p.id===platform.actor?.id));
 const [selected,setSelected]=useState('');
 useEffect(()=>{setSelected(new URLSearchParams(window.location.search).get('match')??'');},[]);
 const matchId=explicitMatchId??selected??own?.id;
 const actualId=matchId||own?.id;
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[sending,setSending]=useState(false),[connectionMessage,setConnectionMessage]=useState(''),[offlineUntil,setOfflineUntil]=useState<number|null>(null),[reconnected,setReconnected]=useState(false),[active,setActive]=useState(true);
 const current=useRef<Snapshot|null>(null),socket=useRef<Room|null>(null),pending=useRef<any>(null),readyRetries=useRef(0),clock=useRef(new ServerClock());
 const xMeter=useMotionValue(.5),yMeter=useMotionValue(.5);
 const apply=useCallback((value:Snapshot)=>{const previous=current.current;if(previous&&previous.matchId===value.matchId&&previous.stateVersion>value.stateVersion)return;const next={...previous,...value};clock.current.seed(value.serverAt);current.current=next;setSnapshot(next);},[]);
 useEffect(()=>{
  if(!actualId)return;let cancelled=false,retry:ReturnType<typeof setTimeout>|undefined,renew:ReturnType<typeof setInterval>|undefined,ping:ReturnType<typeof setInterval>|undefined;
  const connect=async()=>{
   try{
    const {data,error}=await browserAuth().auth.getSession();if(error||!data.session)throw new Error('Log opnieuw in om verder te spelen.');
    const client=new Client(process.env.NEXT_PUBLIC_REALTIME_URL!);const room=await client.joinOrCreate('match',{matchId:actualId,token:data.session.access_token});
    if(cancelled){await room.leave();return;}socket.current=room;setOfflineUntil(null);setConnectionMessage('');
    const samples=new Map<string,number>();
    room.onMessage('clock.challenge',(value:any)=>{if(!cancelled)room.send('clock.echo',{nonce:value.nonce});});
    room.onMessage('clock.sample',(value:any)=>{const sent=samples.get(value.nonce);if(sent!==undefined){clock.current.sample(value.serverAt,sent);samples.delete(value.nonce);}});
    const sample=()=>{const nonce=crypto.randomUUID();samples.set(nonce,performance.now());if(samples.size>8)samples.delete(samples.keys().next().value!);room.send('clock.ping',{nonce});};sample();if(ping)clearInterval(ping);ping=setInterval(sample,2000);
    room.onMessage('snapshot',(value:Snapshot)=>{if(!cancelled)apply(value);});
    room.onMessage('receipt',(value:Snapshot)=>{if(cancelled)return;apply(value);pending.current=null;setSending(false);setConnectionMessage('');});
    room.onMessage('error',(value:any)=>{
     if(cancelled)return;const failed=pending.current;setSending(false);pending.current=null;setConnectionMessage(value.message);
     void api<Snapshot>('match/'+actualId).then(fresh=>{
      if(cancelled)return;apply(fresh);
      // Readiness expresses a durable intention. Refresh and retry this alone
      // when another player's confirmation wins the version race.
      if(failed?.type==='match.ready'&&value.code==='stale_state'&&readyRetries.current<2&&fresh.seat!==null&&!fresh.state.ready[fresh.seat]&&['assigned','paused'].includes(fresh.lifecycle)&&socket.current===room&&!pending.current){
       readyRetries.current++;const retry={...failed,commandId:crypto.randomUUID(),expectedStateVersion:fresh.stateVersion,phaseToken:fresh.state.phaseToken};pending.current=retry;setSending(true);setConnectionMessage('');room.send('command',retry);
      }
     }).catch(()=>{});
    });
    room.onLeave(()=>{if(cancelled)return;socket.current=null;setOfflineUntil(Date.now()+(current.current?.remainingReconnectMs??120000));setConnectionMessage('De verbinding wordt hersteld.');retry=setTimeout(connect,1000);});
    apply(await api<Snapshot>('match/'+actualId));
    if(pending.current)room.send('command',pending.current);
    if(renew)clearInterval(renew);renew=setInterval(()=>{void browserAuth().auth.getSession().then(({data})=>{if(data.session)room.send('authenticate',{token:data.session.access_token});});},60000);
   }catch(e){if(cancelled)return;setConnectionMessage(e instanceof Error?e.message:'Verbinding maken lukt niet.');retry=setTimeout(connect,3000);}
  };
  void connect();return ()=>{cancelled=true;clearTimeout(retry);clearInterval(renew);clearInterval(ping);void socket.current?.leave();socket.current=null;current.current=null;pending.current=null;readyRetries.current=0;setSnapshot(null);};
 },[actualId,apply]);
 useEffect(()=>{let frame:number;const tick=()=>{
  const state=current.current?.state;
  if(state){const frozen=pending.current?.phaseToken===state.phaseToken,now=clock.current.now();
   if(state.lockedX!==null)xMeter.set((state.lockedX+1.14)/2.28);
   else if(state.phase==='horizontal'&&!frozen)xMeter.set(meterFraction(now,state.phaseStartedAt,'horizontal'));
   if(state.lockedY!=null)yMeter.set((state.lockedY+1.14)/2.28);
   else if(state.phase==='vertical'&&!frozen)yMeter.set(meterFraction(now,state.phaseStartedAt,'vertical'));
   else if(state.phase==='horizontal')yMeter.set(.5);
  }
  frame=requestAnimationFrame(tick);
 };frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);},[xMeter,yMeter]);
 const command=useCallback((type:string)=>{
  const s=current.current;if(!s||!socket.current||pending.current)return;
  // Gate RAF and freeze before network, React, haptics or audio.
  const stoppedAt=performance.now();pending.current={type,phaseToken:s.state.phaseToken};
  if(type==='dart.stop_horizontal')xMeter.set(meterFraction(clock.current.now(stoppedAt),s.state.phaseStartedAt,'horizontal'));
  if(type==='dart.stop_vertical')yMeter.set(meterFraction(clock.current.now(stoppedAt),s.state.phaseStartedAt,'vertical'));
  performance.mark('dp-local-stop',{detail:{axis:type,at:stoppedAt,x:xMeter.get(),y:yMeter.get()}});
  readyRetries.current=0;const payload={protocolVersion:1,commandId:crypto.randomUUID(),matchId:s.matchId,expectedStateVersion:s.stateVersion,type,phaseToken:s.state.phaseToken};pending.current=payload;setSending(true);socket.current.send('command',payload);
 },[xMeter,yMeter]);
 const startOrStop=useCallback(()=>{const s=current.current;if(!active||!s||s.seat!==s.state.turn||s.lifecycle!=='playing'||pending.current)return;if(s.state.phase==='horizontal')command('dart.stop_horizontal');else if(s.state.phase==='vertical')command('dart.stop_vertical');if(preferences.haptics)navigator.vibrate?.(12);},[active,preferences.haptics,command]);
 const beginMatch=useCallback(async()=>command('match.ready'),[command]);
 const raw=snapshot?.state??empty,swap=snapshot?.seat===1;
 const pair=<T,>(value:[T,T]):[T,T]=>swap?[value[1],value[0]]:value;
 const turn=(swap?1-raw.turn:raw.turn) as 0|1,winner=raw.winner===null?null:(swap?1-raw.winner:raw.winner) as 0|1;
 const names=snapshot?pair(snapshot.state.names):[selfName(),initialOpponentName];
 const myTurn=snapshot?.seat!==null&&snapshot?.seat===raw.turn;
 const state={...raw,scores:pair(raw.scores),legs:pair(raw.legs),sets:pair(raw.sets),totalLegs:pair(raw.totalLegs),opened:pair(raw.opened),dartCount:pair(raw.dartCount),pointsScored:pair(raw.pointsScored),visitScores:pair(raw.visitScores),visitBusts:pair(raw.visitBusts),highestVisit:pair(raw.highestVisit),highestCheckout:pair(raw.highestCheckout),turn,winner,phase:raw.phase==='won'||raw.phase==='flight'?raw.phase:myTurn?raw.phase:'opponent' as const,events:raw.events.map(e=>({...e,player:(swap?1-e.player:e.player) as 0|1})),history:[]};
 const rematch=useCallback(async()=>{if(!actualId)return;try{const result=await mutate('match/rematch',{matchId:actualId});setConnectionMessage('Je uitnodiging voor een revanche is verstuurd.');return result;}catch{}},[actualId]);
 const startNewMatch=useCallback(async(name:string,setup?:MatchSetup)=>{const p=getPlatform();const room=p.rooms.find(r=>r.name===sessionStorage.getItem('dartspoint-room-v1'))??p.rooms[0];await mutate('invite',{targetId:playerId(name),roomId:room.id,rules:setup?.rules??empty.rules,ranked:setup?.ranked===true});setConnectionMessage('De uitnodiging is verstuurd.');},[]);
 const reset=useCallback(()=>command('match.forfeit'),[command]);
 const reconnect=useCallback(()=>{void api<Snapshot>('match/'+actualId).then(apply);setReconnected(true);},[actualId,apply]);
 const simulateDisconnect=useCallback(()=>{void socket.current?.connection.close();},[]);
 const clearMatchSelection=useCallback(()=>{setSelected("");window.history.replaceState(null,"","/spelen");},[]);
 const noOp=useCallback(()=>{},[]);
 const mode:MatchMode=snapshot?.mode==='ranked'?'ranked-demo':'casual';
 return {...state,clearMatchSelection,id:actualId??'',xMeter,yMeter,startOrStop,reset,startNewMatch,rematch,undo:noOp,canUndo:false,landDart:noOp,averages:state.dartCount.map((n,i)=>n?state.pointsScored[i]/n*3:0) as [number,number],playerName:names[0],opponentName:names[1],setActive,ready:!!snapshot&&['playing','completed','abandoned'].includes(snapshot.lifecycle),preparing:!!actualId&&!snapshot,beginMatch,mode,modeLabel:snapshot?.mode==='ranked'?'Gerankt':snapshot?.mode==='tournament'?'Toernooi':snapshot?.mode==='division'?'Divisie':'Vrij spelen',offlineUntil,remainingReconnect:offlineUntil?Math.max(0,Math.ceil((offlineUntil-Date.now())/1000)):Math.ceil((snapshot?.remainingReconnectMs??120000)/1000),reconnect,simulateDisconnect,reconnected,sending,verification:'server' as const,connectionMessage,ratingChange:getMatchRecords().find(r=>r.id===actualId)?.ratingChange,preferences,matchId:actualId,gameNumber:snapshot?.gameNumber,seat:snapshot?.seat,waitingForOpponent:!!snapshot&&snapshot.state.ready[snapshot.seat??0]&&snapshot.lifecycle==='assigned'};
}
