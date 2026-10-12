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
const KEY = "dartspoint-match-records-v1";
const EVENT = "dartspoint-match-records-changed";
const EMPTY: MatchRecord[] = [];
let previousRaw: string | null = null;
let snapshot: MatchRecord[] = EMPTY;
export function getMatchRecords(): MatchRecord[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === previousRaw) return snapshot;
    previousRaw = raw;
    const parsed = raw ? JSON.parse(raw) : [];
    snapshot = Array.isArray(parsed) ? parsed.filter((record): record is MatchRecord => typeof record?.id === "string" && Array.isArray(record.events) && Array.isArray(record.legs)).slice(0, 100) : EMPTY;
    return snapshot;
  } catch { return snapshot; }
}
export function saveMatchRecord(record: MatchRecord) {
  if (typeof window === "undefined") return;
  if (getMatchRecords().some(item => item.id === record.id)) return;
  snapshot = [record, ...getMatchRecords()].slice(0, 100);
  try { previousRaw = JSON.stringify(snapshot); localStorage.setItem(KEY, previousRaw); } catch { /* Session history still works if storage is full. */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
export function useMatchRecords() { return useSyncExternalStore(subscribe, getMatchRecords, () => EMPTY); }
