"use client";
import {getPlatform,usePlatform,mutate,playerId,selfName} from "./platform-client";
export const FRIEND_NAMES:string[]=[];
export type FriendRequest = { id: string; name: string; direction: "incoming" | "outgoing"; createdAt: number };
export type FriendStatus = "self" | "friends" | "incoming" | "outgoing" | "none";
export type SocialResult = { ok: true } | { ok: false; error: string };
export type PlayerPresence = { online: boolean; room: string; status: string; available: boolean };
export type ModerationKind = "warn" | "mute" | "remove";
export type ModerationEntry = { id: string; name: string; room: string; kind: ModerationKind; reason: string; createdAt: number; until: number; moderator: string };
export type PlayerReport = { id: string; name: string; room: string; gameId: string; reason: string; detail: string; context: string; createdAt: number; status: "Nieuw" | "In behandeling" | "Afgesloten"; response?: string; messageId?: string };
export type SocialState = { friends: string[]; friendRequests: FriendRequest[]; muted: string[]; blocked: string[]; moderation: ModerationEntry[]; reports: PlayerReport[]; queues: Record<string, string[]> };
export function getDartsSocial():SocialState{return getPlatform().social;}
export function getPlayerPresence(name:string):PlayerPresence{return getPlatform().players.find(p=>p.name===name)?.presence??{online:false,room:"",status:"Offline",available:false};}
export function friendStatus(name:string,current=getDartsSocial()):FriendStatus{if(name===selfName())return "self";if(current.friends.includes(name))return "friends";return current.friendRequests.find(p=>p.name===name)?.direction??"none";}
export function useDartsSocial(){const p=usePlatform();return {...p.social,isBlocked,isMuted:isPersonallyMuted,isFriend,friendStatus,getPresence:getPlayerPresence} as SocialState&{isBlocked:typeof isBlocked;isMuted:typeof isPersonallyMuted;isFriend:typeof isFriend;friendStatus:typeof friendStatus;getPresence:typeof getPlayerPresence};}
async function act(action:string,name:string):Promise<SocialResult>{try{await mutate("social",{action,targetId:playerId(name)});return {ok:true};}catch(e){return {ok:false,error:e instanceof Error?e.message:"De actie kon niet worden uitgevoerd."};}}
export function sendFriendRequest(name:string){return act("request",name);}
export function acceptFriendRequest(name:string){return act("accept",name);}
export function rejectFriendRequest(name:string){return act("reject",name);}
export function cancelFriendRequest(name:string){return act("cancel",name);}
export function removeFriend(name:string){return act("remove",name);}
export function simulateFriendAcceptance(_name:string){return Promise.resolve({ok:false,error:"Alleen de ontvanger kan het verzoek accepteren."} as SocialResult);}
export function isFriend(name:string){return getDartsSocial().friends.includes(name);}
export function isBlocked(name:string){return getDartsSocial().blocked.includes(name);}
export function isPersonallyMuted(name:string){return getDartsSocial().muted.includes(name);}
export function toggleBlocked(name:string){return act(isBlocked(name)?"unblock":"block",name);}
export function togglePersonalMute(name:string){return act(isPersonallyMuted(name)?"unmute":"mute",name);}
export function isRoomMuted(name:string,room:string,at=Date.now()){return getDartsSocial().moderation.some(e=>e.name===name&&e.room===room&&e.kind==="mute"&&e.until>at);}
export function isRoomRemoved(name:string,room:string,at=Date.now()){return getDartsSocial().moderation.some(e=>e.name===name&&e.room===room&&e.kind==="remove"&&e.until>at);}
export function canModeratePlayer(name:string,room:string,actor=selfName()){const p=getPlatform(),viewer=p.players.find(p=>p.name===actor),victim=p.players.find(p=>p.name===name);return !!viewer&&name!==actor&&victim?.role!=="owner"&&(viewer.role==="owner"||(viewer.role==="admin"&&victim?.role!=="admin")||p.rooms.some(r=>r.name===room&&r.moderator===actor));}
export async function moderationAction(input:{name:string;room:string;kind:ModerationKind;reason:string;minutes?:number;actor?:string}){try{await mutate("moderation",{targetId:playerId(input.name),roomId:getPlatform().rooms.find(r=>r.name===input.room)?.id,kind:input.kind,reason:input.reason,minutes:input.minutes??10});return true;}catch{return false;}}
export async function revokeModeration(id:string,_actor=selfName()){try{await mutate("moderation/revoke",{id,reason:"Sanctie na beoordeling ingetrokken"});return true;}catch{return false;}}
export async function reportPlayer(input:Omit<PlayerReport,"id"|"createdAt"|"status">){const result=await mutate("report",{targetId:playerId(input.name),reason:input.reason,detail:input.detail,...(input.messageId?{messageId:input.messageId}:{}),...(getPlatform().rooms.find(r=>r.name===input.room)?{roomId:getPlatform().rooms.find(r=>r.name===input.room)!.id}:{}),...((getPlatform().matches.some(m=>m.id===input.gameId)||getPlatform().records.some(m=>m.id===input.gameId))?{matchId:input.gameId}:{})});return result.id as string;}
export function toggleQueue(matchId:string,_name=selfName()){return mutate("queue",{matchId});}
export async function advanceQueue(matchId:string){return (await mutate("queue/advance",{matchId})).name as string|null;}
export function canReceivePrivate(name:string,policy:"everyone"|"friends"|"nobody",existing:boolean){return !isBlocked(name)&&(existing||policy==="everyone"||(policy==="friends"&&isFriend(name)));}
