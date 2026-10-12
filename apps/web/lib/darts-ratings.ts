"use client";
import {usePlatform,getPlatform} from "./platform-client";
import {playerByName} from "./darts-data";
export type RatingProfile = {
  name: string;
  rating: number;
  rankedPlayed: number;
  opponents: string[];
  provisional: boolean;
};
export type RatedMatchInput = { id: string; a: string; b: string; winner: 0 | 1; mode: "ranked-demo" | "casual" | "practice" | "bot" };
// `counted` describes the match's durable result, not whether this particular
// call wrote it. Retrying a completed result returns the same counted result.
export type RatedMatchResult = { beforeA: number; afterA: number; beforeB: number; afterB: number; deltaA: number; deltaB: number; counted: boolean };
export function getRatingProfile(name:string):RatingProfile{const p=getPlatform().players.find(p=>p.name===name)??playerByName(name);const n=p.distinctOpponents??0;return {name,rating:p.rating,rankedPlayed:p.rankedPlayed??0,opponents:Array.from({length:n},(_,i)=>String(i)),provisional:(p.rankedPlayed??0)<10||n<5};}
export function useRatingProfile(name:string){usePlatform();return getRatingProfile(name);}
export function useRatingProfiles(names:readonly string[]){usePlatform();return names.map(getRatingProfile);}
export function completeRatedMatch(_input:RatedMatchInput):RatedMatchResult{throw new Error("Alleen de server kan een ratingresultaat vastleggen.");}
