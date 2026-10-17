"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {errorText,browserLocale} from "../../../packages/i18n/src/errors";
import {useI18n} from './i18n/provider';
import {useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Client} from '@colyseus/sdk';
import {browserAuth} from './supabase-client';
import {toast} from 'sonner';
import {IncomingInvites} from '@/components/darts-incoming-invites';
import {RequiredRename} from '@/components/darts-required-rename';
export type PlatformSnapshot={personalRecords:any;practice:any;actor:any;players:any[];rooms:any[];preferences:any;social:any;channels:any[];chatChannels:any[];invites:any[];matches:any[];tournaments:any[];seasons:any[];notifications:any[];records:any[];badges:any[];admin:any;settings:any;audit:any[];draining:boolean};
export const EMPTY_PLATFORM:PlatformSnapshot={personalRecords:null,practice:null,actor:null,players:[],rooms:[],preferences:{},social:{friends:[],friendRequests:[],muted:[],blocked:[],moderation:[],reports:[],queues:{}},channels:[],chatChannels:[],invites:[],matches:[],tournaments:[],seasons:[],notifications:[],records:[],badges:[],admin:null,settings:null,audit:[],draining:true};
let snapshot=EMPTY_PLATFORM;const listeners=new Set<()=>void>();
export function getPlatform(){return snapshot;}
export function subscribePlatform(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}
export function usePlatform(){return useSyncExternalStore(subscribePlatform,getPlatform,()=>EMPTY_PLATFORM);}
export function selfName(){return snapshot.actor?.username??'';}
export function playerId(idOrName:string){return /^[0-9a-f-]{36}$/i.test(idOrName)?idOrName:snapshot.players.find(p=>p.name.toLowerCase()===idOrName.toLowerCase())?.id;}
export class ApiError extends Error{constructor(message:string,public code:string,public status:number,public retryAfter?:number){super(message);}}
export async function api<T=any>(path:string,input?:unknown):Promise<T>{
 if(path==='chat/send')lastChatActivity=Date.now();
 const response=await fetch('/api/platform/'+path,{method:input===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});
 const data=await response.json();if(!response.ok)throw new ApiError(errorText(data.code,browserLocale(),data.error),data.code,response.status,data.retryAfter);return data as T;
}
const olderRecords=new Map<string,any>();let historyActor:string|undefined;
export async function loadOlderRecords(){const actor=snapshot.actor.id;if(actor!==historyActor){olderRecords.clear();historyActor=actor;}const last=snapshot.records.at(-1);const records=await api<any[]>("history"+(last?"?before="+encodeURIComponent(last.ended_at)+"&id="+last.id:""));if(actor!==snapshot.actor?.id)return;for(const record of records)olderRecords.set(record.id,record);snapshot={...snapshot,records:[...snapshot.records,...records.filter(r=>!snapshot.records.some(p=>p.id===r.id))]};listeners.forEach(fn=>fn());return records.length;}
let refreshing:Promise<void>|undefined;
export function refreshPlatform(){return refreshing??=api<PlatformSnapshot>('bootstrap').then(data=>{if(historyActor!==data.actor.id){olderRecords.clear();historyActor=data.actor.id;}data.records=[...data.records,...[...olderRecords.values()].filter(r=>!data.records.some(p=>p.id===r.id))].sort((a,b)=>b.ended_at.localeCompare(a.ended_at)||b.id.localeCompare(a.id));snapshot=data;listeners.forEach(fn=>fn());}).finally(()=>{refreshing=undefined;});}
let deferredRefresh:ReturnType<typeof setTimeout>|undefined,deferredAt=0,lastChatActivity=0;
/** Coalesce inbox/read metadata refreshes; content arrives through its personal
 * projection. Keep a one-second bound even during continuous room activity. */
export function schedulePlatformRefresh(){const now=Date.now();deferredAt||=now;clearTimeout(deferredRefresh);deferredRefresh=setTimeout(()=>{deferredAt=0;deferredRefresh=undefined;void refreshPlatform().catch(()=>{});},Math.min(500,Math.max(0,1000-(now-deferredAt))));}
export async function mutate<T=any>(path:string,input:unknown):Promise<T>{try{const data=await api<T>(path,input);await refreshPlatform();return data;}catch(e){toast.error(e instanceof Error?e.message:runtimeFeedback("feedback.dit_is_niet_gelukt_probeer_het_nog_eens"));throw e;}}
export function PlatformProvider({initial,children,accessFailure="login"}:{initial:PlatformSnapshot;children:ReactNode;accessFailure?:"login"|"support"}){
 const {syncAccount,t}=useI18n();
 const [ready,setReady]=useState(false);
 const platformLocale=usePlatform().preferences?.locale;
 useEffect(()=>{syncAccount(initial.preferences?.locale);},[initial.preferences?.locale,syncAccount]);
 useEffect(()=>{syncAccount(platformLocale);},[platformLocale,syncAccount]);
 useEffect(()=>{
  let disposed=false,room:any,retry:ReturnType<typeof setTimeout>,renew:ReturnType<typeof setInterval>;
  async function connect(){try{
   const {data}=await browserAuth().auth.getSession();if(disposed||!data.session)return;
   const next=await new Client(process.env.NEXT_PUBLIC_REALTIME_URL!).joinOrCreate('personal',{userId:initial.actor.id,token:data.session.access_token});
   if(disposed){void next.leave();return;}room=next;window.dispatchEvent(new Event('dartspoint:chat-reconnected'));
   next.onMessage('chat.changed',(event:any)=>{lastChatActivity=Date.now();window.dispatchEvent(new CustomEvent('dartspoint:chat-changed',{detail:event}));schedulePlatformRefresh();});
   next.onLeave(()=>{if(!disposed)retry=setTimeout(connect,2000);});
   clearInterval(renew);renew=setInterval(()=>{void browserAuth().auth.getSession().then(({data})=>{if(data.session)next.send('authenticate',{token:data.session.access_token});});},60000);
  }catch{if(!disposed)retry=setTimeout(connect,5000);}}
  void connect();return ()=>{disposed=true;clearTimeout(retry);clearInterval(renew);void room?.leave();};
 },[initial.actor.id]);
 useEffect(()=>{
  snapshot=initial;listeners.forEach(fn=>fn());setReady(true);
  let disposed=false,activityVersion=0,reportedActivityVersion=0,quietPulseInFlight=false,activePulseInFlight=false,lastActivePulse=-Infinity;
  let activityPulse:ReturnType<typeof setTimeout>|undefined;
  const scheduleActivityPulse=()=>{
   if(disposed||activityPulse)return;
   // Run after the throw's local frame budget, and coalesce ongoing typing.
   // A quiet heartbeat must not delay a new action near the idle deadline.
   activityPulse=setTimeout(()=>{activityPulse=undefined;void heartbeat();},Math.max(100,5000-(performance.now()-lastActivePulse)));
  };
  const activity=(event:Event)=>{if(event.isTrusted){activityVersion++;scheduleActivityPulse();}};
  for(const name of ['pointerdown','keydown','wheel'])window.addEventListener(name,activity,{capture:true,passive:true});
  const heartbeat=async()=>{
   if(disposed)return;
   const captured=activityVersion,active=captured>reportedActivityVersion;
   if(active){if(activePulseInFlight){scheduleActivityPulse();return;}activePulseInFlight=true;lastActivePulse=performance.now();}
   else{if(quietPulseInFlight||activePulseInFlight)return;quietPulseInFlight=true;}
   try{const result=await api('heartbeat',{active});if(!disposed&&result.ok===true){if(active)reportedActivityVersion=Math.max(reportedActivityVersion,captured);if(activityVersion>reportedActivityVersion)scheduleActivityPulse();}}
   catch{/* Keep unacknowledged user activity for the next heartbeat. */}
   finally{if(active)activePulseInFlight=false;else quietPulseInFlight=false;}
  };
  const poll=setInterval(()=>{if(Date.now()-lastChatActivity<500){schedulePlatformRefresh();return;}void refreshPlatform().catch(e=>{if(e instanceof ApiError&&[401,403].includes(e.status)){if(accessFailure==='support')window.location.reload();else window.location.assign('/inloggen');}});},3000);
  const pulse=setInterval(()=>{void heartbeat();},20000);
  return ()=>{disposed=true;for(const name of ['pointerdown','keydown','wheel'])window.removeEventListener(name,activity,true);clearTimeout(activityPulse);clearInterval(poll);clearInterval(pulse);clearTimeout(deferredRefresh);deferredAt=0;snapshot=EMPTY_PLATFORM;};
 },[initial,accessFailure]);
 return ready?<>{children}{accessFailure!=="support"&&<><IncomingInvites/><RequiredRename/></>}</>:<main className="dp-entry-loading" role="status" style={{minHeight:'100dvh',display:'grid',placeItems:'center',color:'#9fbcaa'}}>{t('common.loading')}</main>;
}
