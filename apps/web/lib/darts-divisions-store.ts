"use client";
import {getPlatform,usePlatform,mutate,refreshPlatform} from "./platform-client";
import type {DivisionSeason,DivisionSeasonInput,DivisionColor,DivisionResultInput} from "./darts-divisions-model";
export type DivisionAuditEntry = { id: string; at: number; actor: string; action: string; target: string; detail: string };
export type DivisionSeasonState = { version: 1; seasons: DivisionSeason[]; audit: DivisionAuditEntry[] };
export function getDivisionSeasonState():DivisionSeasonState{const p=getPlatform();return {version:1,seasons:p.seasons,audit:p.audit};}
export function useDivisionSeasons(){usePlatform();return getDivisionSeasonState();}
export async function createDivisionSeason(input:DivisionSeasonInput={}):Promise<DivisionSeason>{return await mutate("division",{action:"createDivisionSeason",args:[input]});}
export async function updateDivisionSeason(id:string,patch:Omit<DivisionSeasonInput,"divisions">):Promise<DivisionSeason>{return await mutate("division",{action:"updateDivisionSeason",args:[id,patch]});}
export async function addSeasonDivision(id:string,input:{name:string;color:DivisionColor}):Promise<DivisionSeason>{return await mutate("division",{action:"addSeasonDivision",args:[id,input]});}
export async function updateSeasonDivision(id:string,divisionId:string,patch:{name?:string;color?:DivisionColor;level?:number}):Promise<DivisionSeason>{return await mutate("division",{action:"updateSeasonDivision",args:[id,divisionId,patch]});}
export async function removeSeasonDivision(id:string,divisionId:string):Promise<DivisionSeason>{return await mutate("division",{action:"removeSeasonDivision",args:[id,divisionId]});}
export async function addDivisionMember(id:string,input:{name:string;divisionId:string;rating?:number}):Promise<DivisionSeason>{return await mutate("division",{action:"addDivisionMember",args:[id,input]});}
export async function moveDivisionMember(id:string,memberId:string,divisionId:string):Promise<DivisionSeason>{return await mutate("division",{action:"moveDivisionMember",args:[id,memberId,divisionId]});}
export async function removeDivisionMember(id:string,memberId:string):Promise<DivisionSeason>{return await mutate("division",{action:"removeDivisionMember",args:[id,memberId]});}
export async function generateDivisionSchedule(id:string):Promise<DivisionSeason>{return await mutate("division",{action:"generateDivisionSchedule",args:[id]});}
export async function startDivisionSeason(id:string):Promise<DivisionSeason>{return await mutate("division",{action:"startDivisionSeason",args:[id]});}
export async function recordDivisionResult(id:string,fixtureId:string,input:DivisionResultInput):Promise<DivisionSeason>{return await mutate("division",{action:"recordDivisionResult",args:[id,fixtureId,input]});}
export async function completeDivisionSeason(id:string,reason=""):Promise<DivisionSeason>{return await mutate("division",{action:"completeDivisionSeason",args:[id,reason]});}
export async function createNextDivisionSeason(id:string,input:{name?:string;startsOn?:string}={}):Promise<DivisionSeason>{return await mutate("division",{action:"createNextDivisionSeason",args:[id,input]});}
export async function submitDivisionPlayedResult(id:string,_fixtureId:string,_playerName:string,_score:[number,number]){await refreshPlatform();return getPlatform().seasons.find(s=>s.id===id) as DivisionSeason;}
