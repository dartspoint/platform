"use client";
import {getPlatform,usePlatform,mutate,refreshPlatform} from "./platform-client";
import type {Tournament,TournamentInput,TournamentStatus,TournamentParticipant,ParticipantStatus,TournamentResultInput} from "./darts-tournament-model";
export type TournamentAuditEntry = { id: string; at: number; actor: string; action: string; target: string; detail: string };
export type TournamentState = { tournaments: Tournament[]; audit: TournamentAuditEntry[] };
export type ParticipantInput={name:string;rating?:number;played?:number;role?:TournamentParticipant["role"];rulesAccepted?:boolean;approved?:boolean};
export function getTournamentState():TournamentState{const p=getPlatform();return {tournaments:p.tournaments,audit:p.audit};}
export function useTournaments(){usePlatform();return getTournamentState();}
export async function createTournament(input: TournamentInput = {}):Promise<Tournament>{const result=await mutate("tournament",{action:"createTournament",args:[input]});return result.tournament??result;}
export async function updateTournament(id:string,patch:TournamentInput):Promise<Tournament>{const result=await mutate("tournament",{action:"updateTournament",args:[id,patch]});return result.tournament??result;}
export async function cloneTournament(id:string):Promise<Tournament>{const result=await mutate("tournament",{action:"cloneTournament",args:[id]});return result.tournament??result;}
export async function setTournamentPublished(id:string,published:boolean):Promise<Tournament>{const result=await mutate("tournament",{action:"setTournamentPublished",args:[id,published]});return result.tournament??result;}
export async function setTournamentStatus(id:string,status:TournamentStatus):Promise<Tournament>{const result=await mutate("tournament",{action:"setTournamentStatus",args:[id,status]});return result.tournament??result;}
export async function deleteTournament(id:string):Promise<Tournament>{const result=await mutate("tournament",{action:"deleteTournament",args:[id]});return result.tournament??result;}
export async function addTournamentParticipant(id:string,input:ParticipantInput,options?:{selfService?:boolean}):Promise<Tournament>{const result=await mutate("tournament",{action:"addTournamentParticipant",args:[id,input,options]});return result.tournament??result;}
export async function updateTournamentParticipant(id:string,participantId:string,patch:{status?:ParticipantStatus;rulesAccepted?:boolean;approved?:boolean;seed?:number},options?:{selfService?:boolean}):Promise<Tournament>{const result=await mutate("tournament",{action:"updateTournamentParticipant",args:[id,participantId,patch,options]});return result.tournament??result;}
export async function removeTournamentParticipant(id:string,participantId:string):Promise<Tournament>{const result=await mutate("tournament",{action:"removeTournamentParticipant",args:[id,participantId]});return result.tournament??result;}
export async function generateTournamentBracket(id:string):Promise<Tournament>{const result=await mutate("tournament",{action:"generateTournamentBracket",args:[id]});return result.tournament??result;}
export async function startTournament(id:string):Promise<Tournament>{const result=await mutate("tournament",{action:"startTournament",args:[id]});return result.tournament??result;}
export async function recordTournamentResult(id:string,matchId:string,input:TournamentResultInput):Promise<Tournament>{const result=await mutate("tournament",{action:"recordTournamentResult",args:[id,matchId,input]});return result.tournament??result;}
export async function resetTournamentBracket(id:string,reason:string):Promise<Tournament>{const result=await mutate("tournament",{action:"resetTournamentBracket",args:[id,reason]});return result.tournament??result;}
export async function setTournamentReady(id:string,participantId:string,ready:boolean,options?:{actorName?:string}):Promise<Tournament>{const result=await mutate("tournament",{action:"setTournamentReady",args:[id,participantId,ready,options]});return result.tournament??result;}
export async function refreshTournamentSchedule(id:string):Promise<Tournament>{const result=await mutate("tournament",{action:"refreshTournamentSchedule",args:[id]});return result.tournament??result;}
export async function assignTournamentBoard(id:string,matchId:string,boardId:number|null):Promise<Tournament>{const result=await mutate("tournament",{action:"assignTournamentBoard",args:[id,matchId,boardId]});return result.tournament??result;}
export async function startTournamentMatch(id:string,matchId:string,options?:{actorName?:string}):Promise<Tournament>{const result=await mutate("tournament",{action:"startTournamentMatch",args:[id,matchId,options]});return result.tournament??result;}
export async function recordParticipantTournamentResult(id:string,_matchId:string,_input:TournamentResultInput,_actorName:string){await refreshPlatform();return getPlatform().tournaments.find(t=>t.id===id) as Tournament;}
