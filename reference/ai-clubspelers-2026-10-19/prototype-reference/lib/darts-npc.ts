'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { npcProfiles, npcByName, type NpcProfile } from './darts-npc-profiles';
import { appendChatMessage, announceRoomEntry } from './darts-chat-state';
import { getAdminOperations, saveAdminRoom } from './darts-admin-operations';
import { completeRatedMatch, getRatingProfile } from './darts-ratings';
import { DART_NUMBERS, scoreDart, applyDart, type DartHit } from './darts-rules';
import { getCheckoutRoutes } from './darts-checkouts';
import { initializeNpcTextGuard, publishNpcText, type NpcTextCandidate } from './darts-npc-text';
import { npcConversationCandidates, npcConversationPlans, npcConversationReplyPlan, styleNpcConversationText, type NpcConversationPlan } from './darts-npc-conversation';
import { buildNpcReplyCandidates, npcAmbientCandidates, isNpcDialogueGrounded, npcCompletedMatchCandidate, type NpcDialogueContext, type NpcDialogueFact, type NpcDialogueCandidate } from './darts-npc-dialogue';

export type NpcStatus = 'offline' | 'available' | 'chatting' | 'playing' | 'watching';
export type NpcPresence = { id: string; online: boolean; room: string; status: NpcStatus; rating: number; wins: number; played: number; nextActionAt: number; leaveAt: number; };
export type NpcMatch = { id: string; room: string; players: [string,string]; names: [string,string]; scores: [number,number]; ranked: boolean; phase: 'playing' | 'finished'; turn: number; winner?: string; delta: number; at: number; finishedAt?: number; };
export type NpcEvent = { id: string; at: number; kind: 'presence' | 'chat' | 'invite' | 'match' | 'points' | 'director'; actor: string; text: string; room?: string; };
export type NpcInvitation = { id: string; npcId: string; name: string; room: string; ranked: boolean; status: 'pending' | 'accepted' | 'declined' | 'expired'; at: number; expiresAt: number; };
export type NpcChat = { id: string; at: number; room: string; name: string; text: string; human?: boolean; replyToId?: string; threadId?: string; topic?: string; };
export type NpcSettings = { hour: number; humans: number; maxOnline: number; chatIntensity: number; inviteCooldownMinutes: number; enableInvites: boolean; enableRanked: boolean; autoReduce: boolean; };
export type NpcSnapshot = { hydrated: boolean; running: boolean; speed: number; time: number; settings: NpcSettings; people: Record<string,NpcPresence>; matches: NpcMatch[]; invitations: NpcInvitation[]; events: NpcEvent[]; chat: NpcChat[]; humanRating: number; humanWins: number; humanPlayed: number; humanBusy: boolean; humanMatch?: {id:string;npcId:string;ranked:boolean;room?:string}; activeRoom: string; lastHumanInvite: number; suppressedUntil: number; disabled: string[]; runId: string; sequence: number; };

export const NPC_OPEN_ROOMS = ['Nederland 1','Nederland 2','Ranked','Beginners','Afterhours','International'];
/** Local demonstration only: the human visitor slider belongs to the selected
 * room. Seeded room counts and NPCs never count as a human audience. Production
 * must use authenticated server presence rather than this browser setting. */
export function npcRoomHasHumans(room:string,state:NpcSnapshot=snapshot){return state.settings.humans>0&&room===state.activeRoom;}
export const NPC_STATUS_LABELS: Record<NpcStatus,string> = { offline: 'Offline', available: 'Beschikbaar', chatting: 'In gesprek', playing: 'Speelt', watching: 'Kijkt mee' };
const START = Date.UTC(2026,9,18,19,15);
const STORAGE = 'dartspoint:npc-director:v1';
const seedPeople = Object.fromEntries(npcProfiles.map((p,i) => [p.id,{id:p.id,online:i<14,room:p.languages[0]==='en'?'International':NPC_OPEN_ROOMS[i%5],status:(i<14?'available':'offline') as NpcStatus,rating:1500,wins:0,played:0,nextActionAt:START+((i*13)%90+20)*1000,leaveAt:START+(p.typicalSessionMinutes[0]+i)*60000}]));
const INITIAL: NpcSnapshot = { hydrated:false,running:true,speed:10,time:START,settings:{hour:21,humans:3,maxOnline:25,chatIntensity:45,inviteCooldownMinutes:20,enableInvites:true,enableRanked:true,autoReduce:true},people:seedPeople,matches:[],invitations:[],events:[],chat:[],humanRating:1500,humanWins:0,humanPlayed:0,humanBusy:false,activeRoom:'Nederland 1',lastHumanInvite:START-30*60000,suppressedUntil:0,disabled:[],runId:'initial',sequence:0 };
let snapshot = INITIAL;
let interval: ReturnType<typeof setInterval> | undefined;
let randomSeed = 186723;
const listeners = new Set<()=>void>();
function rnd(){ randomSeed = (randomSeed*1664525+1013904223)>>>0; return randomSeed/4294967296; }
function range(a:number,b:number){return a+rnd()*(b-a);}
function pick<T>(list: readonly T[]):T {return list[Math.floor(rnd()*list.length)];}
function id(prefix:string){return `${prefix}-${snapshot.runId}-${snapshot.time}-${++snapshot.sequence}`;}
function cloneState(){ snapshot={...snapshot,people:Object.fromEntries(Object.entries(snapshot.people).map(([k,v])=>[k,{...v}])),matches:snapshot.matches.map(m=>({...m,scores:[...m.scores] as [number,number]})),invitations:snapshot.invitations.map(i=>({...i})),events:[...snapshot.events],chat:[...snapshot.chat]}; }
function emit(){ snapshot={...snapshot}; if(typeof window!=='undefined'){try{sessionStorage.setItem(STORAGE,JSON.stringify(snapshot));}catch{}} listeners.forEach(fn=>fn()); }
function event(kind:NpcEvent['kind'],actor:string,text:string,room?:string){snapshot.events=[{id:id('event'),at:snapshot.time,kind,actor,text,room},...snapshot.events].slice(0,160);}
const confirmedDialogueFacts=new Map<string,NpcDialogueFact>();
function recordCompletedMatch(matchId:string,room:string,participants:string[],winnerId:string){
  const fact:NpcDialogueFact={id:`completed:${snapshot.runId}:${matchId}`,kind:'match_completed',matchId,room,participants:[...participants],winnerId,at:Date.now()};
  confirmedDialogueFacts.set(fact.id,fact);return fact;
}
export function getNpcDialogueContext(npcId:string,room=snapshot.activeRoom):NpcDialogueContext{
  const now=Date.now();for(const [id,fact] of confirmedDialogueFacts)if(now-fact.at>120000)confirmedDialogueFacts.delete(id);
  const v=snapshot.people[npcId];
  return {npcId,room,humanId:'human:Nick',humanName:'Nick',now,npcAvailable:!!v?.online&&v.status!=='playing'&&!reserved(npcId),facts:[...confirmedDialogueFacts.values()].map(f=>({...f,participants:[...f.participants]}))};
}
function exampleCandidates(profile:NpcProfile,en:boolean):NpcDialogueCandidate[]{return npcAmbientCandidates(profile,en);}
export function npcReplyCandidates(profile:NpcProfile,prompt:string,en=false,room=en?'International':snapshot.activeRoom):NpcDialogueCandidate[]{return buildNpcReplyCandidates(profile,prompt,en,getNpcDialogueContext(profile.id,room));}
let dialogueEpoch=0;
const actorDialogueEpoch=new Map<string,number>();
const roomDialogueEpoch=new Map<string,number>();
/** Capture at scheduling time; check again inside the final text-publication lock. */
export function captureNpcDialogueGuard(npcId:string,room:string,allowPlaying=false){
  const runId=snapshot.runId,epoch=dialogueEpoch,actorEpoch=actorDialogueEpoch.get(npcId)??0,roomEpoch=roomDialogueEpoch.get(room)??0;
  const adminRoom=getAdminOperations().rooms.find(r=>r.name===room);
  return ()=>{const v=snapshot.people[npcId];return npcRoomHasHumans(room)&&snapshot.runId===runId&&dialogueEpoch===epoch&&(actorDialogueEpoch.get(npcId)??0)===actorEpoch&&(roomDialogueEpoch.get(room)??0)===roomEpoch&&snapshot.running&&!snapshot.disabled.includes(npcId)&&!!v?.online&&v.room===room&&(allowPlaying||v.status!=='playing'&&!reserved(npcId))&&getAdminOperations().rooms.find(r=>r.name===room)===adminRoom&&openRoom(room);};
}
type ChatOptions = { suppressFollowup?:boolean; canPublish?:()=>boolean; metadata?:(text:string)=>Partial<Pick<NpcChat,'replyToId'|'threadId'|'topic'>>; accepted?:(item:NpcChat)=>void };
async function chat(profile:NpcProfile,candidates:NpcTextCandidate[],room:string,allowPaused=false,options:ChatOptions={}){
  if(!NPC_OPEN_ROOMS.includes(room)||!npcRoomHasHumans(room))return;
  const runId=snapshot.runId,epoch=dialogueEpoch,actorEpoch=actorDialogueEpoch.get(profile.id)??0,roomEpoch=roomDialogueEpoch.get(room)??0;
  const styled=candidates.map(candidate=>typeof candidate==='string'?styleNpcConversationText(profile,candidate,room==='International'):{...candidate,text:styleNpcConversationText(profile,candidate.text,room==='International')});
  let delivered:NpcChat|undefined;
  await publishNpcText({npcId:profile.id,channel:`room:${room}`,candidates:styled,
    canPublish:()=>{const v=snapshot.people[profile.id];return npcRoomHasHumans(room)&&snapshot.runId===runId&&dialogueEpoch===epoch&&(actorDialogueEpoch.get(profile.id)??0)===actorEpoch&&(roomDialogueEpoch.get(room)??0)===roomEpoch&&(snapshot.running||allowPaused)&&v.online&&v.room===room&&v.status!=='playing'&&!snapshot.disabled.includes(profile.id)&&!reserved(profile.id)&&openRoom(room)&&(!options.canPublish||options.canPublish());},
    approveCandidate:(text,candidate)=>isNpcDialogueGrounded(text,getNpcDialogueContext(profile.id,room),typeof candidate==='string'?undefined:(candidate as NpcDialogueCandidate).requirement),
    publish:text=>{
      cloneState();
      const item:NpcChat={id:id('chat'),at:snapshot.time,room,name:profile.nickname,text,...options.metadata?.(text)};snapshot.chat=[...snapshot.chat,item].slice(-160);delivered=item;
      appendChatMessage(`room:${room}`,{id:Date.now()+snapshot.sequence,name:profile.nickname,text,time:new Date(snapshot.time).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})});
      event('chat',profile.nickname,text,room);options.accepted?.(item);
      if(!options.suppressFollowup)maybeReplyToNpcPost(profile,item);
      emit();
    }
  });
  return delivered;
}

type Conversation = {id:string;runId:string;room:string;actors:[string,string];plan?:NpcConversationPlan;nextIndex:number;maxTurns:number;lastMessageId?:string;dueReal:number;dueSim:number;expiresReal:number;pending:boolean};
const conversations=new Map<string,Conversation>();
const WELCOME_STORAGE='dartspoint:npc-conversation-welcome:v1';
let welcomeAttempted=false;
let welcomeTimer:ReturnType<typeof setTimeout>|undefined;
function conversationBusy(npcId:string){return [...conversations.values()].some(t=>t.actors.includes(npcId));}
function conversational(profile:NpcProfile,room:string){const v=snapshot.people[profile.id];return profile.languages.includes(room==='International'?'en':'nl')&&v?.online&&v.room===room&&v.status!=='playing'&&!snapshot.disabled.includes(profile.id)&&!reserved(profile.id);}
function validConversation(t:Conversation){return npcRoomHasHumans(t.room)&&conversations.get(t.id)===t&&t.runId===snapshot.runId&&snapshot.running&&openRoom(t.room)&&t.expiresReal>Date.now()&&t.actors.every(id=>conversational(npcByName(id)!,t.room));}
function endConversation(t:Conversation){
  if(!conversations.delete(t.id))return;
  for(const actor of t.actors){const v=snapshot.people[actor];if(v?.status==='chatting'&&!reserved(actor)){v.status='available';v.nextActionAt=Math.max(v.nextActionAt,snapshot.time+20000);}}
}
function cancelConversationsFor(npcId?:string){if(npcId)actorDialogueEpoch.set(npcId,(actorDialogueEpoch.get(npcId)??0)+1);else dialogueEpoch++;for(const t of conversations.values())if(!npcId||t.actors.includes(npcId))endConversation(t);}
function checkConversations(){for(const t of conversations.values())if(!validConversation(t))endConversation(t);}
function queueConversationTurn(t:Conversation,item:NpcChat){
  t.lastMessageId=item.id;t.nextIndex++;t.pending=false;
  if(t.nextIndex>=t.maxTurns){endConversation(t);return;}
  // The real-time floor prevents rapid bursts at 60x. The simulated-time check
  // keeps a stopped director from publishing from a detached timeout.
  const actor=npcByName(t.actors[t.nextIndex%2])!;
  const thoughtMs=range(5000,11000)*(1.15-actor.sociability*.35);
  const realDelay=Math.max(2000,Math.min(9500,thoughtMs/Math.sqrt(snapshot.speed)));
  t.dueReal=Date.now()+realDelay;t.dueSim=snapshot.time+Math.min(12000,realDelay*snapshot.speed);t.expiresReal=Date.now()+45000;
}
function conversationMetadata(t:Conversation,topic:string){return {threadId:t.id,topic,...(t.lastMessageId?{replyToId:t.lastMessageId}:{})};}
function publishConversationTurn(t:Conversation){
  if(!validConversation(t)||!t.plan||t.pending)return;
  const source=snapshot.chat.find(c=>c.id===t.lastMessageId);
  if(!source||source.room!==t.room||source.threadId!==t.id){endConversation(t);return;}
  const profile=npcByName(t.actors[t.nextIndex%2])!;t.pending=true;
  void chat(profile,npcConversationCandidates(t.plan,t.nextIndex,profile,t.room==='International'),t.room,false,{suppressFollowup:true,canPublish:()=>validConversation(t)&&snapshot.chat.some(c=>c.id===source.id),metadata:()=>conversationMetadata(t,t.plan!.topic),accepted:item=>queueConversationTurn(t,item)}).then(item=>{if(!item){endConversation(t);emit();}});
}
function advanceConversations(){
  checkConversations();
  const due=[...conversations.values()].find(t=>!t.pending&&t.plan&&t.dueReal<=Date.now()&&t.dueSim<=snapshot.time);
  if(due)publishConversationTurn(due);
}
function freshConversation(room:string,actors:[NpcProfile,NpcProfile],plans:NpcConversationPlan[],source?:NpcChat){
  if(conversations.size>=3||[...conversations.values()].some(t=>t.room===room)||actors.some(p=>!conversational(p,room)||conversationBusy(p.id)))return false;
  const t:Conversation={id:id('thread'),runId:snapshot.runId,room,actors:[actors[0].id,actors[1].id],nextIndex:0,maxTurns:pick([2,3,3,4,4,5]),dueReal:0,dueSim:0,expiresReal:Date.now()+45000,pending:true};
  conversations.set(t.id,t);for(const p of actors)snapshot.people[p.id].status='chatting';
  if(source){
    t.plan=plans[0];source.threadId=t.id;source.topic=t.plan.topic;
    queueConversationTurn(t,source);return true;
  }
  const en=room==='International';
  const openerCandidates=plans.flatMap(plan=>npcConversationCandidates(plan,0,actors[0],en));
  const selectedPlan=(text:string)=>plans.find(plan=>styleNpcConversationText(actors[0],plan.turns[0],en)===text)!;
  void chat(actors[0],openerCandidates,room,false,{suppressFollowup:true,canPublish:()=>validConversation(t),metadata:text=>conversationMetadata(t,selectedPlan(text).topic),accepted:item=>{t.plan=selectedPlan(item.text);queueConversationTurn(t,item);}}).then(item=>{if(!item){endConversation(t);emit();}});
  return true;
}
function maybeReplyToNpcPost(profile:NpcProfile,item:NpcChat){
  if(!snapshot.running||rnd()>.6||conversationBusy(profile.id))return;
  const plan=npcConversationReplyPlan(item.text,item.room==='International');if(!plan)return;
  const peers=npcProfiles.filter(q=>q.id!==profile.id&&conversational(q,item.room)&&!conversationBusy(q.id));
  if(peers.length)freshConversation(item.room,[profile,pick(peers)],[plan],item);
}
function prepareConversationActors(room:string,profileId?:string):[NpcProfile,NpcProfile]|null {
  if(!snapshot.running||!npcRoomHasHumans(room)||!openRoom(room)||[...conversations.values()].some(t=>t.room===room))return null;
  const eligible=(p:NpcProfile)=>!snapshot.disabled.includes(p.id)&&snapshot.people[p.id].status!=='playing'&&!reserved(p.id)&&!conversationBusy(p.id)&&p.languages.includes(room==='International'?'en':'nl');
  const selected=profileId?npcByName(profileId):undefined;
  if(selected&&!eligible(selected))return null;
  const local=npcProfiles.filter(p=>eligible(p)&&snapshot.people[p.id].online&&snapshot.people[p.id].room===room);
  const candidates=[...(selected?[selected]:[]),...local,...npcProfiles.filter(eligible)].filter((p,i,list)=>list.findIndex(q=>q.id===p.id)===i);
  const actors:NpcProfile[]=[];
  for(const p of candidates){if(actors.length===2)break;const v=snapshot.people[p.id];
    if(!v.online&&Object.values(snapshot.people).filter(p=>p.online).length>=snapshot.settings.maxOnline)continue;
    if((!v.online||v.room!==room)&&!openRoom(room,1))continue;
    if(!v.online||v.room!==room){v.online=true;v.room=room;v.status='available';v.leaveAt=Math.max(v.leaveAt,snapshot.time+25*60000);event('presence',p.nickname,`Schuift aan bij het gesprek in ${room}.`,room);}
    actors.push(p);
  }
  return actors.length===2?actors as [NpcProfile,NpcProfile]:null;
}
export function startNpcConversation(room=snapshot.activeRoom,profileId?:string){
  if(!NPC_OPEN_ROOMS.includes(room))return false;
  const actors=prepareConversationActors(room,profileId);if(!actors)return false;
  return freshConversation(room,actors,npcConversationPlans(actors[0],actors[1],room==='International',rnd));
}
function maybeWelcomeConversation(){
  if(welcomeAttempted||!snapshot.running||snapshot.settings.chatIntensity===0)return;
  try{if(sessionStorage.getItem(WELCOME_STORAGE)==='attempted'){welcomeAttempted=true;return;}}catch{}
  if(startNpcConversation(snapshot.activeRoom)){welcomeAttempted=true;try{sessionStorage.setItem(WELCOME_STORAGE,'attempted');}catch{}}
}
/** Read-only diagnostic metadata, never public chat labels or model prompts. */
export function getNpcConversationDebug(){return [...conversations.values()].map(t=>({id:t.id,room:t.room,actors:[...t.actors],topic:t.plan?.topic,nextIndex:t.nextIndex,maxTurns:t.maxTurns,dueReal:t.dueReal,dueSim:t.dueSim,pending:t.pending}));}
export function npcTarget(state:NpcSnapshot=snapshot){
  if(state.settings.humans<=0)return 0;
  const h=state.settings.hour; let base=h<7?7:h<17?14:21;
  if(state.settings.autoReduce)base-=Math.floor(state.settings.humans*.45);
  return Math.max(0,Math.min(state.settings.maxOnline,25-state.disabled.length,Math.max(state.settings.humans>=40&&state.settings.autoReduce?0:3,base)));
}
function reserved(npcId:string){return snapshot.humanMatch?.npcId===npcId||snapshot.invitations.some(i=>i.npcId===npcId&&i.status==='pending'&&i.expiresAt>snapshot.time);}
function openRoom(room:string,additional=0){const r=getAdminOperations().rooms.find(r=>r.name===room);if(!r||!NPC_OPEN_ROOMS.includes(room)||r.status!=='active'||r.category==='tournament')return false;return r.count+Object.values(snapshot.people).filter(p=>p.online&&p.room===room).length+additional<=r.capacity;}
function activeHours(p:NpcProfile){const hour=snapshot.settings.hour,start=Number(p.preferredHours.start.split(':')[0]),end=Number(p.preferredHours.end.split(':')[0]);return start<=end?hour>=start&&hour<end:hour>=start||hour<end;}
function weightedProfile(list:NpcProfile[]){const weighted=list.flatMap(p=>Array.from({length:activeHours(p)?4:1},()=>p));return pick(weighted);}
function chooseRoom(profile:NpcProfile){
  const preferred=profile.languages[0]==='en'?['International','Afterhours']:profile.skill==='beginner'?['Beginners','Nederland 1']:['Nederland 1','Nederland 1','Nederland 2','Ranked','Afterhours'];
  const options=preferred.filter(room=>npcRoomHasHumans(room)&&openRoom(room,1));return options.length?pick(options):(NPC_OPEN_ROOMS.find(room=>npcRoomHasHumans(room)&&openRoom(room,1))??'');
}
function startMatch(a:NpcProfile,b:NpcProfile,ranked?:boolean){
  const pa=snapshot.people[a.id],pb=snapshot.people[b.id];
  if(!pa?.online||!pb?.online||pa.status==='playing'||pb.status==='playing'||reserved(a.id)||reserved(b.id))return false;
  const room=pa.room; if(!npcRoomHasHumans(room)||!openRoom(room,pb.room===room?0:1))return false;
  cancelConversationsFor(a.id);cancelConversationsFor(b.id);pb.room=room;pa.status='playing';pb.status='playing';
  const rated=snapshot.settings.enableRanked&&(ranked??rnd()>(a.practicePreference+b.practicePreference)/2);
  const match:NpcMatch={id:id('game'),room,players:[a.id,b.id],names:[a.nickname,b.nickname],scores:[301,301],ranked:rated,phase:'playing',turn:0,delta:0,at:snapshot.time};
  snapshot.matches=[match,...snapshot.matches].slice(0,40);
  event('match',a.nickname,`${a.nickname} en ${b.nickname} beginnen een ${rated?'DP-wedstrijd':'oefenwedstrijd'} · 301 DO`,room);return true;
}
function finishMatch(match:NpcMatch,winnerIndex:number){
  if(match.phase!=='playing')return;
  match.phase='finished';match.winner=match.names[winnerIndex];match.finishedAt=snapshot.time;
  const winner=snapshot.people[match.players[winnerIndex]],loser=snapshot.people[match.players[1-winnerIndex]];
  winner.wins++;winner.played++;loser.played++;
  if(match.ranked){const result=completeRatedMatch({id:match.id,a:match.names[0],b:match.names[1],winner:winnerIndex as 0|1,mode:'ranked-demo'});snapshot.people[match.players[0]].rating=result.afterA;snapshot.people[match.players[1]].rating=result.afterB;const delta=Math.round(Math.abs(result.deltaA));match.delta=delta;event('points',match.winner,`+${delta} DP voor ${match.winner}, −${delta} DP voor ${match.names[1-winnerIndex]}. Netto: 0.`,match.room);}
  for(const p of [winner,loser]){p.status='available';p.nextActionAt=snapshot.time+range(40,160)*1000;}
  event('match',match.winner,`${match.winner} wint van ${match.names[1-winnerIndex]}`,match.room);
  const fact=recordCompletedMatch(match.id,match.room,match.players,match.players[winnerIndex]);
  const profile=npcByName(match.winner);if(profile&&rnd()<.65)chat(profile,[npcCompletedMatchCandidate(fact,getNpcDialogueContext(profile.id,match.room),match.room==='International')],match.room);
}
export function npcThrow(profile:NpcProfile,remaining:number,dartsLeft=3):DartHit{
  const route=getCheckoutRoutes(remaining,dartsLeft,1)[0];let label=route?.[0]??(remaining>60?'T20':String(remaining%2?1:Math.max(2,remaining-40)));
  if(label==='BULL')return scoreDart(range(-.06,.06),range(-.06,.06));
  if(label==='25')return scoreDart(.09,0);
  const multiplier=label.startsWith('D')?2:label.startsWith('T')?3:1;const value=Math.max(1,Math.min(20,parseInt(label.replace(/^[DT]/,''))||20));
  const index=DART_NUMBERS.indexOf(value as typeof DART_NUMBERS[number]);let angle=Math.max(0,index)*Math.PI/10;let radius=multiplier===2?.977:multiplier===3?.606:.46;
  if(multiplier===2){const accuracy=profile.doubleAccuracy>1?profile.doubleAccuracy/100:profile.doubleAccuracy;if(rnd()>accuracy)radius=rnd()<.5?.88:1.06;angle+=range(-.045,.045);}
  else {const precision=Math.max(.035,.18-profile.average/700);angle+=range(-precision*1.6,precision*1.6);radius+=range(-precision,precision);}
  return scoreDart(Math.sin(angle)*radius,-Math.cos(angle)*radius);
}
function advanceMatches(){
  for(const match of snapshot.matches){if(match.phase!=='playing'||!npcRoomHasHumans(match.room))continue;
    const index=match.turn%2,profile=npcByName(match.players[index])!;const visitStart=match.scores[index];
    for(let dart=0;dart<3;dart++){const hit=npcThrow(profile,match.scores[index],3-dart);const result=applyDart(match.scores[index],visitStart,hit);match.scores[index]=result.remaining;if(result.checkout){finishMatch(match,index);break;}if(result.bust)break;}match.turn++;
  }
}
export function tickNpcDirector(){
  if(!snapshot.running||!snapshot.hydrated||snapshot.settings.humans<=0)return;
  cloneState();snapshot.time+=1000*snapshot.speed;checkConversations();
  for(const invite of snapshot.invitations){if(invite.status==='pending'&&invite.expiresAt<=snapshot.time){invite.status='expired';snapshot.suppressedUntil=snapshot.time+30*60000;event('invite',invite.name,'Uitnodiging verlopen; de bezoeker krijgt rust.',invite.room);}}
  for(const v of Object.values(snapshot.people)){if(v.online&&v.status!=='playing'&&!openRoom(v.room)&&!reserved(v.id)){cancelConversationsFor(v.id);v.online=false;v.status='offline';event('presence',npcByName(v.id)!.nickname,'Verlaat een gesloten, volle of niet-toegestane kamer.',v.room);}}
  const target=npcTarget(),online=Object.values(snapshot.people).filter(p=>p.online);
  if(online.length<target&&rnd()<.35){const choices=npcProfiles.filter(p=>!snapshot.people[p.id].online&&!snapshot.disabled.includes(p.id));if(choices.length){const p=weightedProfile(choices),presence=snapshot.people[p.id],room=chooseRoom(p);if(room){presence.online=true;presence.status='available';presence.room=room;presence.leaveAt=snapshot.time+range(p.typicalSessionMinutes[0],p.typicalSessionMinutes[1])*60000;presence.nextActionAt=snapshot.time+range(45,150)*1000;event('presence',p.nickname,`${p.nickname} schuift aan in ${presence.room}`,presence.room);announceRoomEntry(presence.room,p.nickname);}}}
  if(online.length>target||online.some(p=>p.leaveAt<snapshot.time)){
    const choices=online.filter(p=>p.status!=='playing'&&!reserved(p.id)&&(online.length>target||p.leaveAt<snapshot.time));if(choices.length&&rnd()<.25){const p=pick(choices);cancelConversationsFor(p.id);p.online=false;p.status='offline';event('presence',npcByName(p.id)!.nickname,'Rondt de sessie af en gaat offline.',p.room);}
  }
  if(Math.floor(snapshot.time/(7*1000))!==Math.floor((snapshot.time-1000*snapshot.speed)/(7*1000)))advanceMatches();
  const due=npcProfiles.filter(p=>npcRoomHasHumans(snapshot.people[p.id].room)&&snapshot.people[p.id].online&&snapshot.people[p.id].status!=='playing'&&!reserved(p.id)&&!conversationBusy(p.id)&&snapshot.people[p.id].nextActionAt<=snapshot.time);
  if(due.length){const p=pick(due),presence=snapshot.people[p.id];presence.nextActionAt=snapshot.time+range(90,300)*(1.3-p.sociability*.6)*1000;
    const peers=npcProfiles.filter(q=>q.id!==p.id&&snapshot.people[q.id].online&&snapshot.people[q.id].status!=='playing'&&!reserved(q.id)&&!conversationBusy(q.id)&&snapshot.people[q.id].room===presence.room);
    const lastChat=[...snapshot.chat].reverse().find(c=>c.room===presence.room);
    if(peers.length&&rnd()<.45)startMatch(p,pick(peers));
    else if(rnd()<snapshot.settings.chatIntensity/100&&(!lastChat||snapshot.time-lastChat.at>45000)){
      presence.status='chatting';chat(p,exampleCandidates(p,presence.room==='International'),presence.room);
    }else presence.status=rnd()<.35?'watching':'available';
  }
  if(snapshot.settings.enableInvites&&!snapshot.humanBusy&&snapshot.time>=snapshot.suppressedUntil&&snapshot.time-snapshot.lastHumanInvite>=snapshot.settings.inviteCooldownMinutes*60000&&!snapshot.invitations.some(i=>i.status==='pending')&&rnd()<.035){
    const choices=npcProfiles.filter(p=>{const v=snapshot.people[p.id];return v.online&&v.status!=='playing'&&!conversationBusy(p.id)&&v.room===snapshot.activeRoom;});if(choices.length)makeInvite(pick(choices));
  }
  advanceConversations();maybeWelcomeConversation();emit();
}
function makeInvite(profile:NpcProfile){
  if(snapshot.humanBusy||snapshot.invitations.some(i=>i.status==='pending'))return;
  const v=snapshot.people[profile.id];if(!npcRoomHasHumans(v.room)||!v.online||v.status==='playing'||!openRoom(v.room)||reserved(profile.id)||snapshot.disabled.includes(profile.id))return;
  cancelConversationsFor(profile.id);snapshot.lastHumanInvite=snapshot.time;const ranked=snapshot.settings.enableRanked&&rnd()>profile.practicePreference;
  const invitation:NpcInvitation={id:id('invite'),npcId:profile.id,name:profile.nickname,room:v.room,ranked,status:'pending',at:snapshot.time,expiresAt:snapshot.time+5*60000};
  snapshot.invitations=[invitation,...snapshot.invitations].slice(0,30);
  event('invite',profile.nickname,`Nodigt jou uit voor ${ranked?'een DP-wedstrijd':'een oefenpotje'}.`,v.room);
}
function validSaved(value:unknown):value is NpcSnapshot{
  if(!value||typeof value!=='object')return false;const s=value as NpcSnapshot;const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);const text=(v:unknown)=>typeof v==='string'&&v.length<2000;
  if(!text(s.runId)||!finite(s.sequence)||!finite(s.time)||!finite(s.lastHumanInvite)||!finite(s.suppressedUntil)||!finite(s.humanRating)||!finite(s.humanWins)||!finite(s.humanPlayed)||typeof s.running!=='boolean'||typeof s.humanBusy!=='boolean'||!NPC_OPEN_ROOMS.includes(s.activeRoom)||![1,10,30,60].includes(s.speed)||!s.people||!s.settings)return false;
  const settings=s.settings;if(![settings.hour,settings.humans,settings.maxOnline,settings.chatIntensity,settings.inviteCooldownMinutes].every(finite)||settings.hour<0||settings.hour>23||settings.maxOnline<0||settings.maxOnline>25||settings.humans<0||settings.humans>100||settings.chatIntensity<0||settings.chatIntensity>100||settings.inviteCooldownMinutes<1||settings.inviteCooldownMinutes>180||![settings.autoReduce,settings.enableInvites,settings.enableRanked].every(v=>typeof v==='boolean'))return false;
  if(!npcProfiles.every(p=>{const v=s.people[p.id];return v&&v.id===p.id&&typeof v.online==='boolean'&&NPC_OPEN_ROOMS.includes(v.room)&&['offline','available','chatting','playing','watching'].includes(v.status)&&[v.rating,v.wins,v.played,v.nextActionAt,v.leaveAt].every(finite);} ))return false;
  if(!Array.isArray(s.disabled)||!s.disabled.every(id=>!!npcByName(id))||!Array.isArray(s.matches)||s.matches.length>40||!s.matches.every(m=>m&&text(m.id)&&NPC_OPEN_ROOMS.includes(m.room)&&Array.isArray(m.players)&&m.players.length===2&&m.players.every(id=>!!npcByName(id))&&Array.isArray(m.names)&&m.names.length===2&&m.names.every(text)&&Array.isArray(m.scores)&&m.scores.length===2&&m.scores.every(n=>finite(n)&&n>=0&&n<=301)&&['playing','finished'].includes(m.phase)&&typeof m.ranked==='boolean'&&[m.turn,m.at,m.delta].every(finite)))return false;
  if(!Array.isArray(s.invitations)||s.invitations.length>30||!s.invitations.every(i=>i&&text(i.id)&&!!npcByName(i.npcId)&&text(i.name)&&NPC_OPEN_ROOMS.includes(i.room)&&['pending','accepted','declined','expired'].includes(i.status)&&typeof i.ranked==='boolean'&&[i.at,i.expiresAt].every(finite)))return false;
  if(!Array.isArray(s.events)||s.events.length>160||!s.events.every(e=>e&&text(e.id)&&text(e.actor)&&text(e.text)&&['presence','chat','invite','match','points','director'].includes(e.kind)&&finite(e.at)))return false;
  if(!Array.isArray(s.chat)||s.chat.length>160||!s.chat.every(c=>c&&text(c.id)&&text(c.name)&&text(c.text)&&NPC_OPEN_ROOMS.includes(c.room)&&finite(c.at)))return false;
  if(s.humanMatch&&(!text(s.humanMatch.id)||!npcByName(s.humanMatch.npcId)||typeof s.humanMatch.ranked!=='boolean'||(s.humanMatch.room!==undefined&&!NPC_OPEN_ROOMS.includes(s.humanMatch.room))))return false;
  return true;
}
function uniqueRunId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function syncRatings(){for(const p of npcProfiles)snapshot.people[p.id].rating=getRatingProfile(p.nickname).rating;snapshot.humanRating=getRatingProfile('Nick').rating;}
function expireAudienceInvitations(){for(const invite of snapshot.invitations)if(invite.status==='pending'&&!npcRoomHasHumans(invite.room))invite.status='expired';}
function reconcileAudiencePresence(){
  // One quiet cleanup on audience changes, never a stream of fake join/leave
  // messages in empty rooms. Paused NPC-only games retain their exact state.
  for(const v of Object.values(snapshot.people))if(!npcRoomHasHumans(v.room)&&v.status!=='playing'){v.online=false;v.status='offline';}
}
function scheduleAfterAudienceChange(){
  for(const v of Object.values(snapshot.people))if(v.status!=='playing'){
    v.nextActionAt=snapshot.time+range(45,150)*1000;
    v.leaveAt=Math.max(v.leaveAt,snapshot.time+20*60000);
  }
  snapshot.lastHumanInvite=snapshot.time;
}
export function initializeNpcDirector(){
  if(typeof window==='undefined')return;
  initializeNpcTextGuard();
  if(!snapshot.hydrated){
    let restored=false;try{const raw=sessionStorage.getItem(STORAGE);const saved=raw&&raw.length<1000000?JSON.parse(raw):null;if(validSaved(saved)){snapshot=saved;restored=true;}}catch{}
    if(!restored)snapshot={...INITIAL,people:Object.fromEntries(Object.entries(seedPeople).map(([id,p])=>[id,{...p}])),runId:uniqueRunId()};
    const operations=getAdminOperations();if(!operations.rooms.some(r=>r.name==='International'))saveAdminRoom({name:'International',subtitle:'A good game, anywhere',capacity:50,category:'social',status:'active',rules:'Respect each other. Play fair. Finish your match.',minRating:0,maxRating:4000,moderator:'Nick',region:'international',primaryLanguage:'en'});
    snapshot={...snapshot,hydrated:true};expireAudienceInvitations();reconcileAudiencePresence();syncRatings();event('director','Regisseur','De lokale demonstratie is gestart. Open kamers, 25 vaste karakters.');emit();
  }
  if(!interval)interval=setInterval(tickNpcDirector,1000);
  if(!welcomeTimer&&!welcomeAttempted)welcomeTimer=setTimeout(()=>{welcomeTimer=undefined;if(snapshot.running){cloneState();maybeWelcomeConversation();emit();}},700);
}
export function subscribeNpcDirector(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function getNpcSnapshot(){return snapshot;}
export function useNpcDirector(){const state=useSyncExternalStore(subscribeNpcDirector,getNpcSnapshot,()=>INITIAL);useEffect(()=>{initializeNpcDirector();},[]);return state;}
export function setNpcRunning(running:boolean){cloneState();snapshot.running=running;if(!running)cancelConversationsFor();event('director','Regisseur',running?'De regisseur is hervat.':'De regisseur is gepauzeerd.');emit();}
export function setNpcSpeed(speed:number){snapshot={...snapshot,speed:[1,10,30,60].includes(speed)?speed:10};emit();}
export function updateNpcSettings(patch:Partial<NpcSettings>){
  const hadHumans=snapshot.settings.humans>0;
  cloneState();snapshot.settings={...snapshot.settings,...patch,hour:Math.max(0,Math.min(23,patch.hour??snapshot.settings.hour)),humans:Math.max(0,Math.min(100,patch.humans??snapshot.settings.humans)),maxOnline:Math.max(0,Math.min(25,patch.maxOnline??snapshot.settings.maxOnline)),chatIntensity:Math.max(0,Math.min(100,patch.chatIntensity??snapshot.settings.chatIntensity))};
  const hasHumans=snapshot.settings.humans>0;
  if(hadHumans!==hasHumans){cancelConversationsFor();expireAudienceInvitations();reconcileAudiencePresence();if(hasHumans)scheduleAfterAudienceChange();}
  event('director','Regisseur',!hasHumans?'Slaapstand: geen bezoekers. Geen gesprekken, uitnodigingen of nieuwe wedstrijden.':!hadHumans?'Een bezoeker is terug. Nieuwe acties worden rustig ingepland; oude berichten vervallen.':'Instellingen bijgewerkt; lopende partijen met bezoekers gaan verder.');emit();
}
export function setNpcActiveRoom(room:string){if(!NPC_OPEN_ROOMS.includes(room)||snapshot.activeRoom===room)return;cloneState();cancelConversationsFor();snapshot.activeRoom=room;expireAudienceInvitations();reconcileAudiencePresence();scheduleAfterAudienceChange();emit();}
export function toggleNpc(idValue:string){const p=snapshot.people[idValue];if(!p||p.status==='playing')return;cloneState();const disabled=snapshot.disabled.includes(idValue);if(!disabled)cancelConversationsFor(idValue);snapshot.disabled=disabled?snapshot.disabled.filter(id=>id!==idValue):[...snapshot.disabled,idValue];if(!disabled){snapshot.people[idValue].online=false;snapshot.people[idValue].status='offline';}event('director',npcByName(idValue)!.nickname,disabled?'Karakter is weer beschikbaar voor de planning.':'Karakter is uit de planning gehaald.');emit();}
export function forceNpcAction(kind:'presence'|'chat'|'match'|'invite'|'conversation',profileId?:string){
  initializeNpcDirector();cloneState();
  if(!npcRoomHasHumans(snapshot.activeRoom)){event('director','Regisseur','Slaapstand: simuleer eerst een echte bezoeker in deze kamer.');emit();return;}
  if(kind==='conversation'){if(!startNpcConversation(snapshot.activeRoom,profileId))event('director','Regisseur','Een onderling gesprek wacht op twee beschikbare karakters in een open kamer.');emit();return;}const targetProfile=profileId?npcByName(profileId):undefined;
  const available=npcProfiles.filter(p=>snapshot.people[p.id].online&&snapshot.people[p.id].status!=='playing'&&!snapshot.disabled.includes(p.id)&&!reserved(p.id));
  const p=targetProfile??(available.length?pick(available):npcProfiles[0]);const v=snapshot.people[p.id];
  if(snapshot.disabled.includes(p.id)||reserved(p.id)){event('director',p.nickname,'Dit karakter is uitgeschakeld of gereserveerd voor een uitnodiging.');emit();return;}
  if(kind==='presence'){cancelConversationsFor(p.id);if(v.status==='playing'){event('director',p.nickname,'Deze speler rondt eerst de actieve partij af.');emit();return;}if(!v.online&&(Object.values(snapshot.people).filter(p=>p.online).length>=snapshot.settings.maxOnline||!openRoom(snapshot.activeRoom,1))){event('director',p.nickname,'De ingestelde bezetting of kamercapaciteit is bereikt.');emit();return;}v.online=!v.online;v.status=v.online?'available':'offline';v.room=v.online?snapshot.activeRoom:v.room;event('presence',p.nickname,v.online?`Komt binnen in ${v.room}`:'Gaat offline.',v.room);}
  if(kind==='chat'&&v.online){cancelConversationsFor(p.id);void chat(p,exampleCandidates(p,v.room==='International'),v.room,true);}
  if(kind==='match'){const other=available.find(q=>q.id!==p.id&&snapshot.people[q.id].room===v.room)??available.find(q=>q.id!==p.id);if(other)startMatch(p,other);}
  if(kind==='invite'){if(v.status!=='playing'&&openRoom(snapshot.activeRoom,v.online&&v.room===snapshot.activeRoom?0:1)&&(v.online||Object.values(snapshot.people).filter(p=>p.online).length<snapshot.settings.maxOnline)){v.online=true;v.room=snapshot.activeRoom;v.status='available';makeInvite(p);}}
  emit();
}
export function respondNpcInvitation(inviteId:string,accept:boolean){cloneState();const invite=snapshot.invitations.find(i=>i.id===inviteId&&i.status==='pending');if(!invite)return false;const v=snapshot.people[invite.npcId];if(accept&&(!npcRoomHasHumans(invite.room)||invite.expiresAt<=snapshot.time||snapshot.humanBusy||!v.online||v.status==='playing'||v.room!==invite.room||!openRoom(v.room)||snapshot.disabled.includes(v.id))){invite.status='expired';event('invite',invite.name,'Deze uitnodiging is niet meer beschikbaar.',invite.room);emit();return false;}invite.status=accept?'accepted':'declined';snapshot.suppressedUntil=snapshot.time+(accept?20:60)*60000;if(accept){cancelConversationsFor(invite.npcId);snapshot.humanBusy=true;snapshot.humanMatch={id:`human-${invite.id}`,npcId:invite.npcId,ranked:invite.ranked,room:invite.room};v.status='playing';event('match',invite.name,`Jij en ${invite.name} starten een ${invite.ranked?'DP-':'oefen'}wedstrijd.`,invite.room);}else event('invite',invite.name,'Afgewezen. Andere NPC’s nemen de rustperiode over.',invite.room);emit();return true;}
export function beginHumanNpcMatch(npcId:string,ranked:boolean,matchId:string,room=snapshot.activeRoom){initializeNpcDirector();const p=snapshot.people[npcId];if(!p||snapshot.disabled.includes(npcId)||!NPC_OPEN_ROOMS.includes(room)||!npcRoomHasHumans(room)||!openRoom(room,p.online&&p.room===room?0:1))return;cloneState();cancelConversationsFor(npcId);for(const i of snapshot.invitations)if(i.npcId===npcId&&i.status==='pending')i.status='accepted';snapshot.people[npcId].online=true;snapshot.people[npcId].status='playing';snapshot.people[npcId].room=room;snapshot.humanBusy=true;snapshot.humanMatch={id:matchId,npcId,ranked,room};emit();}
export function finishHumanNpcMatch(npcId:string,humanWon:boolean,_ranked:boolean){const active=snapshot.humanMatch;if(!active||active.npcId!==npcId)return;cloneState();const p=snapshot.people[npcId];if(!p)return;const name=npcByName(npcId)!.nickname;const result=completeRatedMatch({id:active.id,a:'Nick',b:name,winner:humanWon?0:1,mode:active.ranked?'ranked-demo':'casual'});snapshot.humanRating=result.afterA;p.rating=result.afterB;p.played++;if(!humanWon)p.wins++;snapshot.humanPlayed++;if(humanWon)snapshot.humanWins++;if(active.room)recordCompletedMatch(active.id,active.room,['human:Nick',npcId],humanWon?'human:Nick':npcId);p.status='available';snapshot.humanBusy=false;snapshot.humanMatch=undefined;event('points',name,`${humanWon?'Jij wint':'Je tegenstander wint'} · ${active.ranked?`${result.deltaA>=0?'+':''}${Math.round(result.deltaA)} DP voor jou`:'oefenen, geen DP-mutatie'}.`,p.room);emit();}
export function setNpcHumanBusy(busy:boolean){if(snapshot.humanBusy===busy)return;cloneState();snapshot.humanBusy=busy;if(!busy&&snapshot.humanMatch){const p=snapshot.people[snapshot.humanMatch.npcId];if(p)p.status='available';snapshot.humanMatch=undefined;syncRatings();}emit();}
export function sendNpcRoomMessage(room:string,text:string){
  if(!NPC_OPEN_ROOMS.includes(room)||!npcRoomHasHumans(room)||!text.trim())return;cloneState();roomDialogueEpoch.set(room,(roomDialogueEpoch.get(room)??0)+1);for(const t of [...conversations.values()])if(t.room===room){cancelConversationsFor(t.actors[0]);cancelConversationsFor(t.actors[1]);}const source:NpcChat={id:id('human'),at:snapshot.time,room,name:'Nick',text:text.trim().slice(0,500),human:true};snapshot.chat=[...snapshot.chat,source].slice(-160);emit();
  const choices=npcProfiles.filter(p=>snapshot.people[p.id].online&&snapshot.people[p.id].room===room&&snapshot.people[p.id].status!=='playing');if(!choices.length)return;
  const p=pick(choices),runId=snapshot.runId,epoch=dialogueEpoch,actorEpoch=actorDialogueEpoch.get(p.id)??0,roomEpoch=roomDialogueEpoch.get(room)??0;setTimeout(()=>{const v=snapshot.people[p.id];if(dialogueEpoch!==epoch||(actorDialogueEpoch.get(p.id)??0)!==actorEpoch||(roomDialogueEpoch.get(room)??0)!==roomEpoch||snapshot.runId!==runId||!snapshot.running||!v.online||v.room!==room||v.status==='playing'||!openRoom(room))return;
    void chat(p,npcReplyCandidates(p,source.text,room==='International',room),room,false,{suppressFollowup:true,canPublish:()=>snapshot.chat.some(c=>c.id===source.id)&&[...snapshot.chat].reverse().find(c=>c.room===room&&c.human)?.id===source.id,metadata:()=>({replyToId:source.id})});},1500+Math.floor(range(0,2500)));
}
export function resetNpcDirector(){const humans=snapshot.settings.humans,activeRoom=snapshot.activeRoom;confirmedDialogueFacts.clear();cancelConversationsFor();if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=undefined;}snapshot={...INITIAL,settings:{...INITIAL.settings,humans},activeRoom,people:Object.fromEntries(Object.entries(seedPeople).map(([id,p])=>[id,{...p}])),hydrated:true,runId:uniqueRunId()};reconcileAudiencePresence();randomSeed=186723;syncRatings();event('director','Regisseur','Planning en demonstratie opnieuw ingesteld. Reeds geboekte DP-resultaten blijven behouden.');emit();}
