"use client";

import { useSyncExternalStore } from "react";
import type { DartHit } from "./darts-rules";
import type { GameRules } from "./darts-match-rules";

export type MatchMode = "ranked-demo" | "casual" | "practice" | "bot";
export type MatchDartEvent = {
  id: number; player: 0 | 1; leg: number; visit: number; hit: DartHit;
  before: number; after: number; bust: boolean; checkout: boolean; at: number;
  /** Physical hits can count as zero before a double-in has opened the leg. */
  credited?: number; ignoredOnEntry?: boolean;
};
export type MatchRatingChange = { beforeA: number; afterA: number; beforeB: number; afterB: number; deltaA: number; deltaB: number; counted: boolean };
export type MatchRecord = {
  id: string; opponent: string; mode: MatchMode; winner: 0 | 1; legs: [number, number];
  averages: [number, number]; highestVisit: [number, number]; highestCheckout: [number, number];
  darts: [number, number]; events: MatchDartEvent[]; startedAt: number; endedAt: number;
  ratingChange?: MatchRatingChange; forfeit?: boolean;
  rules?: GameRules; sets?: [number, number]; totalLegs?: [number, number];
};
import {getPlatform,usePlatform,refreshPlatform} from './platform-client';
let source:unknown,actorId:string|undefined,records:MatchRecord[]=[];
export function getMatchRecords():MatchRecord[]{
 const p=getPlatform();if(source===p.records&&actorId===p.actor?.id)return records;source=p.records;actorId=p.actor?.id;
 records=p.records.filter(r=>r.winner_id&&r.started_at).map(r=>{
  const d=r.data,seat=r.players.find((a:any)=>a.id===actorId)?.seat??0;
  const pair=<T,>(value:[T,T]):[T,T]=>seat===1?[value[1],value[0]]:value;
  const own=r.ledger?.find((l:any)=>l.id===actorId),other=r.ledger?.find((l:any)=>l.id!==actorId);
  return {id:r.id,opponent:r.players.find((a:any)=>a.id!==actorId)?.name??'',mode:r.ranked?'ranked-demo':'casual',winner:(r.winner_id===actorId?0:1),legs:pair(d.legs),sets:pair(d.sets),totalLegs:pair(d.totalLegs),rules:r.rules,darts:pair(d.dartCount),averages:pair(d.dartCount.map((n:number,i:number)=>n?d.pointsScored[i]/n*3:0)),highestVisit:pair(d.highestVisit),highestCheckout:pair(d.highestCheckout),events:d.events.map((e:any)=>({...e,player:seat===1?1-e.player:e.player})),startedAt:new Date(r.started_at).getTime(),endedAt:new Date(r.ended_at).getTime(),forfeit:['forfeit','disconnect'].includes(r.kind),ratingChange:own&&other?{beforeA:Number(own.before),afterA:Number(own.after),beforeB:Number(other.before),afterB:Number(other.after),deltaA:Number(own.delta),deltaB:Number(other.delta),counted:true}:undefined};
 });return records;
}
export function useMatchRecords(){usePlatform();return getMatchRecords();}
export async function saveMatchRecord(){await refreshPlatform();}
