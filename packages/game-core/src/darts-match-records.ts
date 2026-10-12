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
