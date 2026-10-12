"use client";
import {useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {toast} from 'sonner';
import {IncomingInvites} from '@/components/darts-incoming-invites';
export type PlatformSnapshot={personalRecords:any;practice:any;actor:any;players:any[];rooms:any[];preferences:any;social:any;channels:any[];invites:any[];matches:any[];tournaments:any[];seasons:any[];notifications:any[];records:any[];badges:any[];admin:any;settings:any;audit:any[];draining:boolean};
export const EMPTY_PLATFORM:PlatformSnapshot={personalRecords:null,practice:null,actor:null,players:[],rooms:[],preferences:{},social:{friends:[],friendRequests:[],muted:[],blocked:[],moderation:[],reports:[],queues:{}},channels:[],invites:[],matches:[],tournaments:[],seasons:[],notifications:[],records:[],badges:[],admin:null,settings:null,audit:[],draining:true};
let snapshot=EMPTY_PLATFORM;const listeners=new Set<()=>void>();
export function getPlatform(){return snapshot;}
export function subscribePlatform(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}
export function usePlatform(){return useSyncExternalStore(subscribePlatform,getPlatform,()=>EMPTY_PLATFORM);}
export function selfName(){return snapshot.actor?.username??'';}
export function playerId(name:string){return snapshot.players.find(p=>p.name.toLowerCase()===name.toLowerCase())?.id;}
export class ApiError extends Error{constructor(message:string,public code:string,public status:number){super(message);}}
export async function api<T=any>(path:string,input?:unknown):Promise<T>{
 const response=await fetch('/api/platform/'+path,{method:input===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});
 const data=await response.json();if(!response.ok)throw new ApiError(data.error??'De actie kon niet worden uitgevoerd.',data.code,response.status);return data as T;
}
const olderRecords=new Map<string,any>();let historyActor:string|undefined;
export async function loadOlderRecords(){const actor=snapshot.actor.id;if(actor!==historyActor){olderRecords.clear();historyActor=actor;}const last=snapshot.records.at(-1);const records=await api<any[]>("history"+(last?"?before="+encodeURIComponent(last.ended_at)+"&id="+last.id:""));if(actor!==snapshot.actor?.id)return;for(const record of records)olderRecords.set(record.id,record);snapshot={...snapshot,records:[...snapshot.records,...records.filter(r=>!snapshot.records.some(p=>p.id===r.id))]};listeners.forEach(fn=>fn());return records.length;}
let refreshing:Promise<void>|undefined;
export function refreshPlatform(){return refreshing??=api<PlatformSnapshot>('bootstrap').then(data=>{if(historyActor!==data.actor.id){olderRecords.clear();historyActor=data.actor.id;}data.records=[...data.records,...[...olderRecords.values()].filter(r=>!data.records.some(p=>p.id===r.id))].sort((a,b)=>b.ended_at.localeCompare(a.ended_at)||b.id.localeCompare(a.id));snapshot=data;listeners.forEach(fn=>fn());}).finally(()=>{refreshing=undefined;});}
export async function mutate<T=any>(path:string,input:unknown):Promise<T>{try{const data=await api<T>(path,input);await refreshPlatform();return data;}catch(e){toast.error(e instanceof Error?e.message:'De actie kon niet worden uitgevoerd.');throw e;}}
export function PlatformProvider({initial,children}:{initial:PlatformSnapshot;children:ReactNode}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{snapshot=initial;listeners.forEach(fn=>fn());setReady(true);const poll=setInterval(()=>{void refreshPlatform().catch(e=>{if(e instanceof ApiError&&[401,403].includes(e.status))window.location.assign('/inloggen');});},3000);const pulse=setInterval(()=>{void api('heartbeat',{}).catch(()=>{});},20000);return ()=>{clearInterval(poll);clearInterval(pulse);snapshot=EMPTY_PLATFORM;};},[initial]);
 return ready?<>{children}<IncomingInvites/></>:<main className="dp-entry-loading" role="status" style={{minHeight:'100dvh',display:'grid',placeItems:'center',color:'#9fbcaa'}}>DartsPoint wordt geopend…</main>;
}
