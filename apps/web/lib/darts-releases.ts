"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";


import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError,getPlatform,mutate,usePlatform} from './platform-client';
import type {PlayerReleaseIdea,PublicReleaseUpdate,ReleaseBoardState,ReleaseCategory,ReleaseItem,ReleaseItemPatch,ReleasePriority,ReleaseStatus} from '../../../packages/contracts/src/releases';
export {RELEASE_CATEGORIES,RELEASE_PRIORITIES,RELEASE_STATUSES} from '../../../packages/contracts/src/releases';
export type {PlayerReleaseIdea,PublicReleaseUpdate,ReleaseBoardState,ReleaseCategory,ReleaseHistoryEntry,ReleaseItem,ReleaseItemPatch,ReleasePriority,ReleaseStatus} from '../../../packages/contracts/src/releases';

const CHANGED='dartspoint:releases-changed';
const EMPTY_BOARD:ReleaseBoardState={items:[],revision:0,audit:[]};
const EMPTY_IDEAS:{ideas:PlayerReleaseIdea[]}={ideas:[]};
const EMPTY_UPDATES:{updates:PublicReleaseUpdate[]}={updates:[]};
let cachedBoard:{key:string;data:ReleaseBoardState}|null=null;
function identity(){const actor=getPlatform().actor;return actor?.id?`${actor.id}:${actor.role}`:'';}
function canManage(){return ['owner','admin'].includes(getPlatform().actor?.role);}
export function getReleaseBoard():ReleaseBoardState{
  if(!canManage()||cachedBoard?.key!==identity()){cachedBoard=null;return EMPTY_BOARD;}
  return cachedBoard.data;
}

/** Fetches belong to one current player; late responses never cross accounts. */
function useReleaseCollection<T>(path:string,empty:T,enabled:boolean,admin=false){
  const platform=usePlatform();
  const key=enabled&&platform.actor?.id?`${platform.actor.id}:${platform.actor.role}`:'';
  const [state,setState]=useState<{key:string;data:T;loaded:boolean;loading:boolean;error:string}>(()=>({key:'',data:empty,loaded:false,loading:false,error:''}));
  const active=useRef(key);active.current=key;
  const mounted=useRef(false),sequence=useRef(0);
  const reload=useCallback(async():Promise<T>=>{
    if(!key)return empty;
    if(identity()!==key)throw new Error(runtimeFeedback("feedback.je_sessie_is_gewijzigd_open_dit_overzicht_opnieuw"));
    const ticket=++sequence.current;
    setState(previous=>({key,data:previous.key===key?previous.data:empty,loaded:previous.key===key&&previous.loaded,loading:previous.key!==key||!previous.loaded,error:''}));
    try{
      const data=await api<T>(path);
      if(identity()!==key||active.current!==key)throw new Error(runtimeFeedback("feedback.je_sessie_is_gewijzigd_open_dit_overzicht_opnieuw"));
      if(mounted.current&&ticket===sequence.current){
        if(admin)cachedBoard={key,data:data as ReleaseBoardState};
        setState({key,data,loaded:true,loading:false,error:''});
      }
      return data;
    }catch(cause){
      if(mounted.current&&active.current===key&&identity()===key&&ticket===sequence.current)setState(previous=>({key,data:previous.key===key?previous.data:empty,loaded:previous.key===key&&previous.loaded,loading:false,error:cause instanceof Error?cause.message:'Het overzicht kon niet worden geladen. Probeer het opnieuw.'}));
      throw cause;
    }
  },[key,path,empty,admin]);
  useEffect(()=>{
    mounted.current=true;
    if(!key){setState({key:'',data:empty,loaded:false,loading:false,error:''});return()=>{mounted.current=false;sequence.current++;};}
    const refresh=()=>{if(document.visibilityState==='visible')void reload().catch(()=>{});};
    void reload().catch(()=>{});
    const timer=setInterval(refresh,30000);
    window.addEventListener(CHANGED,refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{mounted.current=false;sequence.current++;clearInterval(timer);window.removeEventListener(CHANGED,refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);if(admin&&cachedBoard?.key===key)cachedBoard=null;};
  },[key,reload,empty,admin]);
  const current=state.key===key;
  return {data:current?state.data:empty,loading:!!key&&(!current||state.loading),error:current?state.error:'',reload};
}

export function useReleaseBoard(){
  const platform=usePlatform();
  const result=useReleaseCollection('releases/admin',EMPTY_BOARD,['owner','admin'].includes(platform.actor?.role),true);
  return {...result.data,loading:result.loading,error:result.error,reload:result.reload};
}
export function useMyReleaseIdeas(enabled=true){
  const result=useReleaseCollection('releases/mine',EMPTY_IDEAS,enabled);
  return {...result.data,loading:result.loading,error:result.error,reload:result.reload};
}
export function usePublicReleaseUpdates(enabled=true){
  const result=useReleaseCollection('releases/publications',EMPTY_UPDATES,enabled);
  return {...result.data,loading:result.loading,error:result.error,reload:result.reload};
}

async function change<T>(path:string,input:unknown,admin=false):Promise<T>{
  const key=identity();
  if(!key)throw new Error(runtimeFeedback("feedback.log_in_om_je_idee_te_bewaren"));
  if(admin&&!canManage())throw new Error(runtimeFeedback("feedback.releasebeheer_is_voor_platformbeheerders"));
  const value=await mutate<T>(path,input);
  if(identity()!==key)throw new Error(runtimeFeedback("feedback.je_sessie_is_gewijzigd_open_dit_overzicht_opnieuw"));
  if(admin&&cachedBoard?.key===key){
    const item=value as ReleaseItem;
    const exists=cachedBoard.data.items.some(old=>old.id===item.id);
    cachedBoard={key,data:{...cachedBoard.data,items:exists?cachedBoard.data.items.map(old=>old.id===item.id?item:old):[item,...cachedBoard.data.items]}};
  }
  window.dispatchEvent(new Event(CHANGED));
  return value;
}
export function submitReleaseIdea(input:{title:string;description:string;category:ReleaseCategory},requestId=crypto.randomUUID()){
  return change<PlayerReleaseIdea>('releases/submit',{...input,requestId});
}
export function createReleaseItem(input:{title:string;description:string;category:ReleaseCategory;priority?:ReleasePriority},requestId=crypto.randomUUID()){
  return change<ReleaseItem>('releases/admin',{action:'create',...input,requestId},true);
}
export function saveReleaseItem(id:string,patch:ReleaseItemPatch,expectedRevision:number,options:{confirmWithdraw?:boolean;requestId?:string}={}){
  return change<ReleaseItem>('releases/admin',{action:'update',id,patch,expectedRevision,confirmWithdraw:options.confirmWithdraw??false,requestId:options.requestId??crypto.randomUUID()},true);
}
export function moveReleaseItem(id:string,status:ReleaseStatus,expectedRevision:number,confirmWithdraw=false,requestId=crypto.randomUUID()){
  return change<ReleaseItem>('releases/admin',{action:'status',id,status,expectedRevision,confirmWithdraw,requestId},true);
}
export function publishReleaseItem(id:string,expectedRevision:number,requestId=crypto.randomUUID()){
  return change<ReleaseItem>('releases/admin',{action:'publish',id,expectedRevision,requestId},true);
}
export function unpublishReleaseItem(id:string,expectedRevision:number,requestId=crypto.randomUUID()){
  return change<ReleaseItem>('releases/admin',{action:'withdraw',id,expectedRevision,requestId},true);
}
export function isReleaseVersionConflict(cause:unknown){return cause instanceof ApiError&&(cause.code==='release_version_conflict'||cause.status===409);}
