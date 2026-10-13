"use client";
import { useEffect, useSyncExternalStore } from "react";

export type DartsPreferences = {
  sound: boolean;
  lessMotion: boolean;
  leftHanded: boolean;
  haptics: boolean;
  quietTurn: boolean;
  privateMessages: "everyone" | "friends" | "nobody";
  availability: "available" | "playing" | "watching";
};
export const DEFAULT_DARTS_PREFERENCES: DartsPreferences = Object.freeze({ sound: false, lessMotion: false, leftHanded: false, haptics: true, quietTurn: false, privateMessages: "everyone", availability: "available" });
const KEY = "dartspoint-preferences-v1";
let current: DartsPreferences = DEFAULT_DARTS_PREFERENCES;
let hydrated = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function clean(value: unknown): Partial<DartsPreferences> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const valid: Partial<DartsPreferences> = {};
  for (const key of ["sound", "lessMotion", "leftHanded", "haptics", "quietTurn"] as const) if (typeof raw[key] === "boolean") valid[key] = raw[key];
  if (["everyone", "friends", "nobody"].includes(String(raw.privateMessages))) valid.privateMessages = raw.privateMessages as DartsPreferences["privateMessages"];
  if (["available", "playing", "watching"].includes(String(raw.availability))) valid.availability = raw.availability as DartsPreferences["availability"];
  return valid;
}
export function hydrateDartsPreferences() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try { current = { ...DEFAULT_DARTS_PREFERENCES, ...clean(JSON.parse(localStorage.getItem(KEY) || "null")) }; } catch { /* Preferences remain usable in memory. */ }
  listeners.forEach(listener => listener());
}
export function getDartsPreferences(): DartsPreferences { return current; }
export function updateDartsPreferences(patch: Partial<DartsPreferences>) {
  hydrateDartsPreferences();
  current = { ...current, ...clean(patch) };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* optional */ }
  listeners.forEach(listener => listener());
}
export function useDartsPreferences(): DartsPreferences {
  useEffect(hydrateDartsPreferences, []);
  return useSyncExternalStore(subscribe, getDartsPreferences, () => DEFAULT_DARTS_PREFERENCES);
}
