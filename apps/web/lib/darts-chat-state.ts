"use client";
import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {ApiError,api,mutate,getPlatform,usePlatform,playerId,selfName,subscribePlatform,schedulePlatformRefresh} from './platform-client';
export type ChatMessage={id:number;name:string;text:string;time:string;system?:boolean;messageId?:string;senderId?:string;clientMessageId?:string;status?:'pending'|'failed'|'sent';error?:string;queuedAt?:number;eventId?:string;roomId?:string};
export type PrivateChatPreview={channelId:string;userId:string;name:string;text:string;time:string;lastId:number;sender:string};
const EMPTY:ChatMessage[]=[];
const channels=new Map<string,ChatMessage[]>(),drafts=new Map<string,string>(),ids=new Map<string,string>(),tracked=new Map<string,number>(),scrollPositions=new Map<string,{top:number;bottom:boolean}>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
type ReadAcknowledgment={account:string;epoch:number;requested:number;committed:number;task?:Promise<void>};
const readAcknowledgments=new Map<string,ReadAcknowledgment>();
const fetchedCursors=new Map<string,number>(),tombstones=new Map<string,Map<string,number>>();
const loading=new Map<string,Promise<void>>(),reload=new Set<string>(),fullReload=new Set<string>(),intents=new Map<string,Promise<boolean>>(),recentIntents=new Map<string,{at:number;id:string}>();
let cacheActor:string|undefined,accountEpoch=0,hydrated=false,version=0,visibilitySignature='';
const listeners=new Set<()=>void>();
function resetAccount(){const id=getPlatform().actor?.id;if(id===cacheActor)return;cacheActor=id;accountEpoch++;for(const timer of timers.values())clearTimeout(timer);timers.clear();channels.clear();fetchedCursors.clear();tombstones.clear();drafts.clear();ids.clear();tracked.clear();readAcknowledgments.clear();scrollPositions.clear();loading.clear();reload.clear();fullReload.clear();intents.clear();recentIntents.clear();}
// Observe every account transition, including A -> B -> A while an ACK is pending.
subscribePlatform(resetAccount);
function emit(messageChange=true){resetAccount();if(messageChange)version++;listeners.forEach(fn=>fn());}
export function subscribeChat(fn:()=>void){listeners.add(fn);const stop=subscribePlatform(fn);return ()=>{listeners.delete(fn);stop();};}
function context(key:string){const parts=key.split(':');return {kind:parts[0],target:parts[0]==='match'?(parts.length===2?parts[1]:parts.at(-2)):parts.slice(1).join(':')};}
async function resolve(key:string){resetAccount();const account=cacheActor;if(ids.has(key))return ids.get(key)!;if(key.startsWith('private:')){const id=key.slice(8);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Ongeldig privégesprek');ids.set(key,id);return id;}const result=await api('chat/resolve',context(key));if(account!==getPlatform().actor?.id)throw new Error('Account gewijzigd');ids.set(key,result.channelId);return result.channelId as string;}
export function chatChannelId(key:string){return ids.get(key)??(key.startsWith('private:')?key.slice(8):undefined);}
function stored(m:any):ChatMessage{return {id:Number(m.seq),name:m.username??m.actor_name??'',senderId:m.sender_id??m.actor_id??undefined,text:m.body??'',messageId:m.id,clientMessageId:m.client_message_id??undefined,system:m.kind==='room.member_joined',eventId:m.event_id,roomId:m.room_id,status:'sent',time:new Date(m.created_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})};}
function merge(key:string,incoming:ChatMessage[]){
 const previous=channels.get(key)??EMPTY,next=[...previous];
 for(const message of incoming){const index=next.findIndex(m=>m.messageId&&m.messageId===message.messageId||m.clientMessageId&&m.clientMessageId===message.clientMessageId);if(index>=0)next[index]={...next[index],...message,error:undefined};else next.push(message);}
 next.sort((a,b)=>a.id>0&&b.id>0?a.id-b.id:a.id>0?-1:b.id>0?1:(a.queuedAt??0)-(b.queuedAt??0));
 if(JSON.stringify(previous)!==JSON.stringify(next)){channels.set(key,next);emit();}
}
/** Redaction is a durable change cursor, separate from the message sequence. */
function removeStored(key:string,messageId:string,cursor:number,clientMessageId?:string){
 const removed=tombstones.get(key)??new Map<string,number>();removed.set(messageId,Math.max(removed.get(messageId)??0,cursor));tombstones.set(key,removed);
 const previous=channels.get(key)??EMPTY,next=previous.filter(m=>m.messageId!==messageId&&(!clientMessageId||m.clientMessageId!==clientMessageId));if(next.length!==previous.length){channels.set(key,next);emit();}
}
function mergeStored(key:string,rows:any[]){
 for(const row of rows)if(row.redacted)removeStored(key,row.id,Number(row.cursor??row.seq),row.client_message_id);
 merge(key,rows.filter(row=>!row.redacted&&!tombstones.get(key)?.has(row.id)).map(stored));
}
async function load(key:string){
 if(!key||!getPlatform().actor)return;
 if(loading.has(key)){reload.add(key);return loading.get(key);}
 const account=getPlatform().actor.id;
 const task=(async()=>{try{const id=await resolve(key);let cursor=fullReload.delete(key)?0:fetchedCursors.get(key)??0;let more=true;while(more){const data=await api<any[]>('chat/'+id+(cursor?'?after='+cursor:''));if(account!==getPlatform().actor?.id)return;mergeStored(key,data);const next=data.reduce((n,m)=>Math.max(n,Number(m.cursor??m.seq)),cursor);fetchedCursors.set(key,next);more=cursor>0&&data.length===80&&next>cursor;cursor=next;}}
 catch(error){if(account!==getPlatform().actor?.id)return;if(error instanceof ApiError&&[401,403,404].includes(error.status)){ids.delete(key);tracked.delete(key);channels.delete(key);fetchedCursors.delete(key);tombstones.delete(key);emit();}}
 finally{loading.delete(key);if(reload.delete(key)&&account===getPlatform().actor?.id)void load(key);}})();
 loading.set(key,task);return task;
}
/** Only the visible-message path supplies cursors; never infer a newer one from history. */
export function markChatRead(key:string,cursor:number):Promise<void>{
 resetAccount();const account=cacheActor;if(!account||!key||!Number.isSafeInteger(cursor)||cursor<=0)return Promise.resolve();
 const alias='key:'+key,known=chatChannelId(key),canonical=known?'channel:'+known:undefined;
 let entry=(canonical?readAcknowledgments.get(canonical):undefined)??readAcknowledgments.get(alias);
 if(!entry){entry={account,epoch:accountEpoch,requested:0,committed:0};}
 readAcknowledgments.set(alias,entry);if(canonical)readAcknowledgments.set(canonical,entry);
 if(cursor<=entry.committed)return Promise.resolve();
 entry.requested=Math.max(entry.requested,cursor);
 if(entry.task)return entry.task;
 // Register the flight before the first await, including asynchronous resolution.
 const flight=entry,current=()=>flight.account===getPlatform().actor?.id&&flight.epoch===accountEpoch&&readAcknowledgments.get(alias)===flight;
 const task:Promise<void>=(async()=>{try{
  const channelId=await resolve(key);if(!current())return;
  const channelKey='channel:'+channelId,other=readAcknowledgments.get(channelKey);
  if(other&&other!==flight){readAcknowledgments.set(alias,other);return await markChatRead(key,flight.requested);}
  readAcknowledgments.set(channelKey,flight);
  while(current()&&flight.requested>flight.committed){
   const requested=flight.requested;
   await api('chat/preference',{channelId,readCursor:requested});
   if(!current())return;
   flight.committed=Math.max(flight.committed,requested);schedulePlatformRefresh();
  }
 }catch(error){
  // Failed ACKs consume no unread state and never start their own retry loop.
  if(current())flight.requested=flight.committed;
  throw error;
 }finally{if(current())flight.task=undefined;}})();
 flight.task=task;return task;
}
export function saveChatScroll(key:string,position:{top:number;bottom:boolean}){if(key)scrollPositions.set(key,position);}
export function getChatScroll(key:string){return scrollPositions.get(key)??{top:0,bottom:true};}
export function watchChatChannel(key:string){if(!key)return ()=>{};tracked.set(key,(tracked.get(key)??0)+1);void load(key);return ()=>{const n=(tracked.get(key)??1)-1;if(n>0)tracked.set(key,n);else tracked.delete(key);};}
export function getInitialChatChannel(_key:string){return EMPTY;}
export function getChatChannel(key:string){resetAccount();const p=context(key);if(p.kind==='match'&&!/^[0-9a-f-]{36}$/i.test(p.target??''))return EMPTY;return channels.get(key)??EMPTY;}
// A personal push is projected by the server for that current authenticated
// recipient. It never advances fetchedCursors: missed earlier messages and edits
// still recover through authoritative history on polling/reconnect.
export function hydrateChat(){if(hydrated)return;hydrated=true;emit();const visibility=()=>{const p=getPlatform();return JSON.stringify([p.actor?.id,[...p.social.muted].sort(),[...p.social.blocked].sort()]);};visibilitySignature=visibility();subscribePlatform(()=>{const next=visibility();if(next!==visibilitySignature){visibilitySignature=next;for(const key of tracked.keys()){fullReload.add(key);void load(key);}}});window.addEventListener('dartspoint:chat-changed',(event:any)=>{
 // Joining the personal room also emits a content-free notification. A
 // watched channel can still be resolving, so undefined IDs must never match.
 const detail=event.detail;
 if(!detail||typeof detail.channelId!=='string'||!detail.channelId)return;
 for(const key of tracked.keys())if(ids.get(key)===detail.channelId){
  if(detail.redacted)removeStored(key,detail.messageId,Number(detail.cursor??detail.seq??0),detail.message?.client_message_id);
  const message=detail.message;
  if(message&&message.channel_id===detail.channelId&&message.id===detail.messageId)mergeStored(key,[message]);
  else void load(key);
 }
});const catchup=()=>{for(const key of tracked.keys())void load(key);};window.addEventListener('focus',catchup);window.addEventListener('dartspoint:chat-reconnected',catchup);setInterval(()=>{if(getPlatform().actor&&document.visibilityState==='visible')catchup();},5000);}
/** Register intent and render before the first network await. Retrying keeps the original UUID. */
export function appendChatMessage(key:string,message:ChatMessage):Promise<boolean>{
 resetAccount();const text=message.text.trim().slice(0,500);if(!key||!text)return Promise.resolve(false);
 const concept=key+'\u0000'+text,now=performance.now(),previous=recentIntents.get(concept);
 const pending=(channels.get(key)??EMPTY).find(m=>m.text===text&&m.status==='pending');
 const clientMessageId=message.clientMessageId??pending?.clientMessageId??(previous&&now-previous.at<250?previous.id:crypto.randomUUID());
 if(intents.has(clientMessageId))return intents.get(clientMessageId)!;
 if(!message.clientMessageId&&previous&&now-previous.at<250&&!pending)return Promise.resolve(false);
 recentIntents.set(concept,{at:now,id:clientMessageId});
 const account=cacheActor,existing=(channels.get(key)??EMPTY).find(m=>m.clientMessageId===clientMessageId);
 merge(key,[{...existing,...message,id:existing?.id??0,name:selfName(),senderId:account,clientMessageId,text,status:'pending',queuedAt:existing?.queuedAt??Date.now()}]);
 if(getChatDraft(key).trim()===text)updateChatDraft(key,'');
 const task=(async()=>{try{const channelId=await resolve(key);const saved=await api<any>('chat/send',{channelId,clientMessageId,body:text});if(account!==getPlatform().actor?.id)return false;if(saved?.seq&&saved?.id)mergeStored(key,[saved]);else void load(key);return true;}
 catch(error){if(account!==getPlatform().actor?.id)return false;const items=channels.get(key)??EMPTY;if(items.some(m=>m.clientMessageId===clientMessageId&&m.status==='sent'))return true;const errorText=error instanceof Error?error.message:'Je bericht kon niet worden verstuurd.';channels.set(key,items.map(m=>m.clientMessageId===clientMessageId?{...m,status:'failed',error:errorText}:m));if(!getChatDraft(key))updateChatDraft(key,text);emit();throw error;}
 finally{intents.delete(clientMessageId);}})();intents.set(clientMessageId,task);return task;
}
export function retryChatMessage(key:string,message:ChatMessage){return appendChatMessage(key,message);}
export function getChatDraft(key:string){resetAccount();return drafts.get(key)??(key.startsWith('private:')?getPlatform().channels.find(c=>c.id===key.slice(8))?.draft??'':'');}
export function updateChatDraft(key:string,text:string){resetAccount();const account=cacheActor;drafts.set(key,text.slice(0,2000));emit(false);clearTimeout(timers.get(key));timers.set(key,setTimeout(()=>{if(account!==getPlatform().actor?.id)return;void resolve(key).then(channelId=>{if(account===getPlatform().actor?.id)return api('chat/preference',{channelId,draft:text.slice(0,2000)});}).catch(()=>{});},400));}
export function getOpenPrivateChatTabs():readonly string[]{return getPlatform().channels.filter(c=>!c.closed).map(c=>c.id);}
export function useChatHydrated(){useEffect(hydrateChat,[]);return useSyncExternalStore(subscribeChat,()=>hydrated,()=>false);}
export function useOpenPrivateChatTabs(){const p=usePlatform();return useMemo(()=>p.channels.filter(c=>!c.closed).map(c=>c.id),[p.channels]);}
export async function openPrivateChatTab(userIdOrName:string):Promise<string|false>{try{const result=await mutate('private-channel',{targetId:playerId(userIdOrName)});const channelId=result.channelId as string;void load('private:'+channelId);return channelId;}catch{return false;}}
export function resolveChatTab(requested:string,names:readonly string[],lobby=false){if(requested.startsWith('private:')&&names.includes(requested.slice(8)))return requested;if(!lobby&&['match','room'].includes(requested))return requested;return lobby?(names[0]?'private:'+names[0]:''):'room';}
export function nextChatTabAfterClose(name:string,activeTab:string,names:readonly string[],lobby=false){const index=names.indexOf(name),remaining=names.filter(n=>n!==name);if(activeTab!=='private:'+name)return resolveChatTab(activeTab,remaining,lobby);const next=remaining[Math.min(Math.max(index,0),remaining.length-1)];return next?'private:'+next:lobby?'':'room';}
export async function closePrivateChatTab(name:string,activeTab:string,lobby=false,visibleNames?:readonly string[]){const next=nextChatTabAfterClose(name,activeTab,visibleNames??getOpenPrivateChatTabs(),lobby);const channelId=await resolve('private:'+name);await mutate('chat/preference',{channelId,closed:true,draft:getChatDraft('private:'+name)});return next;}
export function usePrivateChatPreview(channelId:string){const v=useSyncExternalStore(subscribeChat,()=>version,()=>0);useEffect(hydrateChat,[]);return useMemo(()=>{const last=getChatChannel('private:'+channelId).at(-1);return {text:last?.text??'',time:last?.time??'',lastId:last?.id??0,sender:last?.name??''};},[channelId,v]);}
export function usePrivateChatInbox():PrivateChatPreview[]{const p=usePlatform(),v=useSyncExternalStore(subscribeChat,()=>version,()=>0);useEffect(hydrateChat,[]);return useMemo(()=>p.channels.map(c=>{const last=getChatChannel('private:'+c.id).at(-1);return {channelId:c.id,userId:c.userId,name:c.name,text:last?.text??c.preview?.text??'',time:last?.time??(c.preview?.at?new Date(c.preview.at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}):''),lastId:last?.id??Number(c.preview?.seq??0),sender:last?.name??c.preview?.sender??''};}),[p.channels,v]);}
export function receivePrivateMessage(_name:string,_text:string){throw new Error('Berichten komen uitsluitend van geverifieerde afzenders.');}
export async function sendQuickChat(text:string,{roomName='',opponentName='',gameId='',channel='match'}:{roomName?:string;opponentName?:string;gameId?:string;channel?:'match'|'room'}={}){return appendChatMessage(channel==='room'?'room:'+roomName:`match:${gameId}`,{id:0,name:selfName(),text,time:''});}
