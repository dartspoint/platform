"use client";
import type {DartsPlayer,PlayerRole} from "./darts-data";
import type {PlayerReport} from "./darts-social";
import {getPlatform,usePlatform,mutate,playerId} from "./platform-client";
export type AdminAuditEntry = { id: string; at: number; actor: string; action: string; subject: string; detail: string; data?:Record<string,any>; subjectName?:string };
export type AdminMember = DartsPlayer & { joinedAt: number; sanctions: AdminSanction[] };
export type AdminSanction = { id: string; kind: "warn" | "mute" | "suspend"; reason: string; at: number; until: number; revokedAt?: number };
export type AdminRoom = { id: string; name: string; subtitle: string; count: number; matches: number; capacity: number; category: "social" | "ranked" | "beginners" | "tournament"; status: "active" | "closed" | "private"; rules: string; minRating: number; maxRating: number; moderator: string; moderatorIds?:string[] };
export type AdminCase = { id: string; player: string; reporter: string; room: string; gameId: string; reason: string; context: string; at: number; status: "open" | "review" | "resolved"; response: string; source: "demo" | "report"; actionId?: string };
export type AdminOperations = { members: AdminMember[]; rooms: AdminRoom[]; cases: AdminCase[]; audit: AdminAuditEntry[] };
export type AdminResult = { ok: true; id?: string } | { ok: false; error: string };
export function getAdminOperations():AdminOperations{const p=getPlatform();return p.admin??{members:p.players.map(p=>({...p,sanctions:[]})),rooms:p.rooms,cases:[],audit:[]};}
export function useAdminOperations(){usePlatform();return getAdminOperations();}
export function memberStatus(member:AdminMember,at=Date.now()):"active"|"muted"|"suspended"{return member.sanctions.some(s=>!s.revokedAt&&s.until>at&&s.kind==="suspend")?"suspended":member.sanctions.some(s=>!s.revokedAt&&s.until>at&&s.kind==="mute")?"muted":"active";}
async function act(action:string,args:unknown[]):Promise<AdminResult>{try{return await mutate("admin",{action,args});}catch(e){return {ok:false,error:e instanceof Error?e.message:"De actie kon niet worden uitgevoerd."};}}
export function updateAdminMemberRole(name:string,role:PlayerRole){return act("role",[playerId(name),role]);}
export async function applyAdminMemberAction(input:{name:string;kind:AdminSanction["kind"];reason:string;minutes?:number;caseId?:string}):Promise<AdminResult>{try{return await mutate("moderation",{targetId:playerId(input.name),kind:input.kind,reason:input.reason,minutes:input.minutes??10,...(input.caseId?{caseId:input.caseId}:{})});}catch(e){return {ok:false,error:e instanceof Error?e.message:"Actie mislukt."};}}
export function revokeAdminMemberAction(_name:string,id:string,reason:string){return act("revoke-sanction",[id,reason]);}
export function saveAdminRoom(input:Omit<AdminRoom,"id"|"count"|"matches">&{id?:string}){return act("room-save",[input]);}
export function closeAdminRoom(id:string){return act("room-close",[id]);}
export function deleteAdminRoom(id:string){return act("room-delete",[id]);}
export function syncAdminReports(_reports:PlayerReport[]){}
export function updateAdminCase(id:string,status:AdminCase["status"],response:string){return act("case",[id,status,response]);}
export function resetAdminOperations(){throw new Error("Platformgegevens worden duurzaam opgeslagen.");}
