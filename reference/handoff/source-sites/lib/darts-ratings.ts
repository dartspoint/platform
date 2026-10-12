"use client";

import { useSyncExternalStore } from "react";
import { playerByName, players } from "./darts-data";
import { calculateElo, ELO_START, isProvisional } from "./darts-elo";

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
type LedgerEntry = { id: string; a: string; b: string; winner: 0 | 1; result: RatedMatchResult };

const STORAGE_KEY = "dartspoint.demo-elo.v1";
// Keep every processed ID. Once the demo ledger is full, refuse more changes
// instead of evicting IDs and accidentally processing an old result twice.
const LEDGER_LIMIT = 5000;
const initialProfiles = new Map<string, RatingProfile>();
const profiles = new Map<string, RatingProfile>();
const ledger = new Map<string, LedgerEntry>();
const listeners = new Set<() => void>();
const initialCollections = new Map<string, RatingProfile[]>();
const collections = new Map<string, { version: number; profiles: RatingProfile[] }>();
let version = 0;
let hydrated = false;
let listening = false;

function initialProfile(name: string): RatingProfile {
  const existing = initialProfiles.get(name);
  if (existing) return existing;
  const player = playerByName(name);
  const opponents = player.played >= 10 ? players.filter((other) => other.name !== name).slice(0, 5).map((other) => other.name) : [];
  const profile = { name, rating: player.played > 0 ? player.rating : ELO_START, rankedPlayed: player.played, opponents, provisional: isProvisional({ rankedPlayed: player.played, opponents }) };
  initialProfiles.set(name, profile);
  return profile;
}

function validProfile(value: unknown): value is RatingProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as RatingProfile;
  return typeof p.name === "string" && p.name.length > 0 && Number.isFinite(p.rating) && Number.isInteger(p.rankedPlayed) && p.rankedPlayed >= 0 && Array.isArray(p.opponents) && p.opponents.every((name) => typeof name === "string");
}

function readStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { version?: number; profiles?: unknown[]; ledger?: LedgerEntry[] };
    if (saved.version !== 1 || !Array.isArray(saved.profiles) || !Array.isArray(saved.ledger) || saved.ledger.length > LEDGER_LIMIT) return;
    const savedProfiles = saved.profiles.filter(validProfile);
    const savedLedger = saved.ledger.filter((entry) => entry && typeof entry.id === "string" && typeof entry.a === "string" && typeof entry.b === "string" && (entry.winner === 0 || entry.winner === 1) && entry.result && [entry.result.beforeA, entry.result.afterA, entry.result.beforeB, entry.result.afterB, entry.result.deltaA, entry.result.deltaB].every(Number.isFinite));
    // Ignore partial/corrupt data rather than restoring ratings without IDs.
    if (savedProfiles.length !== saved.profiles.length || savedLedger.length !== saved.ledger.length) return;
    profiles.clear();
    ledger.clear();
    for (const p of savedProfiles) {
      const opponents = [...new Set(p.opponents.filter((name) => name !== p.name))];
      profiles.set(p.name, { ...p, opponents, provisional: isProvisional({ ...p, opponents }) });
    }
    for (const entry of savedLedger) ledger.set(entry.id, entry);
    version++;
  } catch { /* Local demo continues in memory if storage is unavailable. */ }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  readStorage();
}

function emit() { version++; for (const listener of listeners) listener(); }

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      profiles.clear();
      ledger.clear();
      readStorage();
      emit();
    });
  }
  return () => { listeners.delete(listener); };
}

/** Local prototype data only. This store is never authoritative multiplayer. */
export function getRatingProfile(name: string): RatingProfile {
  hydrate();
  return profiles.get(name) ?? initialProfile(name);
}

export function useRatingProfile(name: string): RatingProfile {
  return useSyncExternalStore(subscribe, () => getRatingProfile(name), () => initialProfile(name));
}

/** A stable collection snapshot lets tables sort live ratings without a
 * client-only storage read changing the initial server-rendered order. */
export function useRatingProfiles(names: readonly string[]): RatingProfile[] {
  const key = JSON.stringify(names);
  const serverSnapshot = () => {
    let cached = initialCollections.get(key);
    if (!cached) { cached = names.map(initialProfile); initialCollections.set(key, cached); }
    return cached;
  };
  const clientSnapshot = () => {
    hydrate();
    const cached = collections.get(key);
    if (cached?.version === version) return cached.profiles;
    const current = names.map(getRatingProfile);
    collections.set(key, { version, profiles: current });
    return current;
  };
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

export function completeRatedMatch(input: RatedMatchInput): RatedMatchResult {
  hydrate();
  const beforeA = getRatingProfile(input.a);
  const beforeB = getRatingProfile(input.b);
  const unchanged = { beforeA: beforeA.rating, afterA: beforeA.rating, beforeB: beforeB.rating, afterB: beforeB.rating, deltaA: 0, deltaB: 0, counted: false };
  // Practice, casual play and bots never affect ratings. Ranked-demo must be
  // selected explicitly; this is a sandbox simulation, not a real ranked game.
  if (input.mode !== "ranked-demo" || typeof window === "undefined") return unchanged;
  if (!input.id.trim() || !input.a.trim() || !input.b.trim() || input.a === input.b) throw new Error("Een ranked wedstrijd heeft een uniek ID en twee verschillende spelers nodig.");
  const processed = ledger.get(input.id);
  if (processed) {
    if (processed.a !== input.a || processed.b !== input.b || processed.winner !== input.winner) throw new Error("Dit wedstrijd-ID is al voor een andere uitslag verwerkt.");
    return { ...processed.result };
  }
  if (ledger.size >= LEDGER_LIMIT) return unchanged;
  const elo = calculateElo(beforeA.rating, beforeB.rating, input.winner);
  const next = (profile: RatingProfile, opponent: string, rating: number): RatingProfile => {
    const rankedPlayed = profile.rankedPlayed + 1;
    const opponents = [...new Set([...profile.opponents, opponent])];
    return { name: profile.name, rating, rankedPlayed, opponents, provisional: isProvisional({ rankedPlayed, opponents }) };
  };
  const result = { beforeA: beforeA.rating, afterA: elo.a, beforeB: beforeB.rating, afterB: elo.b, deltaA: elo.deltaA, deltaB: elo.deltaB, counted: true };
  profiles.set(input.a, next(beforeA, input.b, elo.a));
  profiles.set(input.b, next(beforeB, input.a, elo.b));
  ledger.set(input.id, { id: input.id, a: input.a, b: input.b, winner: input.winner, result });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profiles: [...profiles.values()], ledger: [...ledger.values()] }));
  } catch { /* Same-session idempotency still works when storage is blocked. */ }
  emit();
  return result;
}
