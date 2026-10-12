"use client";
import { useEffect, useSyncExternalStore } from "react";
import { ELO_K, ELO_START, PLACEMENT_MATCHES, PLACEMENT_OPPONENTS } from "@/lib/darts-elo";

export type AdminGameDefaults = {
  startScore: 301 | 501 | 701;
  finish: "double" | "single";
  bestOfLegs: number;
  finalBestOfLegs: number;
  turnSeconds: number;
  reconnectSeconds: number;
  spectators: boolean;
  checkoutHints: boolean;
};
export type AdminEntryDefaults = {
  maxPlayers: number;
  minRating: number;
  maxRating: number;
  minMatches: number;
  requireCheckIn: boolean;
  checkInMinutes: number;
  approval: boolean;
  vipOnly: boolean;
};
export type AdminPlatformDefaults = {
  name: string;
  tagline: string;
  registrationOpen: boolean;
  maintenance: boolean;
  maintenanceMessage: string;
  announcement: string;
  announcementActive: boolean;
  supportEmail: string;
  chatSlowMode: number;
  privateMessages: "everyone" | "friends" | "nobody";
};
export type AdminEloDraft = { k: number; startRating: number; placementMatches: number; placementOpponents: number; redBelow: number; greenFrom: number };
export type AdminSettings = { game: AdminGameDefaults; entry: AdminEntryDefaults; platform: AdminPlatformDefaults; eloDraft: AdminEloDraft };
export type AdminSettingsPatch = { [K in keyof AdminSettings]?: Partial<AdminSettings[K]> };
export type AdminSettingsAudit = { id: string; at: number; actor: string; action: string; subject: string; detail: string };

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  game: { startScore: 501, finish: "double", bestOfLegs: 3, finalBestOfLegs: 5, turnSeconds: 30, reconnectSeconds: 90, spectators: true, checkoutHints: true },
  entry: { maxPlayers: 16, minRating: 0, maxRating: 3000, minMatches: 0, requireCheckIn: true, checkInMinutes: 15, approval: false, vipOnly: false },
  platform: { name: "DartsPoint", tagline: "Jouw club. Jouw volgende dart.", registrationOpen: true, maintenance: false, maintenanceMessage: "We maken DartsPoint nog een beetje beter. Je bent zo weer welkom.", announcement: "Vanavond tijd voor een potje? Kies je kamer en schuif aan.", announcementActive: false, supportEmail: "", chatSlowMode: 0, privateMessages: "everyone" },
  eloDraft: { k: ELO_K, startRating: ELO_START, placementMatches: PLACEMENT_MATCHES, placementOpponents: PLACEMENT_OPPONENTS, redBelow: 1450, greenFrom: 1550 },
};
const KEY = "dartspoint-admin-settings-v1";
const initial = { settings: DEFAULT_ADMIN_SETTINGS, audit: [] as AdminSettingsAudit[] };
let snapshot = initial;
let hydrated = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const sectionLabels = { game: "Spelregels", entry: "Deelname", platform: "Platform", eloDraft: "Elo-beleidsconcept" };

function numberIn(value: unknown, min: number, max: number, label: string) { if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: kies een heel getal tussen ${min} en ${max}.`); }
function boolean(value: unknown, label: string) { if (typeof value !== "boolean") throw new Error(`${label}: kies aan of uit.`); }
function text(value: unknown, max: number, label: string, required = false) { if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label}: ${required ? "vul een waarde in van " : "gebruik "}maximaal ${max} tekens.`); }
export function validateAdminSettings(settings: AdminSettings) {
  const { game, entry, platform, eloDraft } = settings;
  if (![301, 501, 701].includes(game.startScore)) throw new Error("Kies 301, 501 of 701 als startscore.");
  if (!["double", "single"].includes(game.finish)) throw new Error("Kies single-out of double-out.");
  for (const [name, value] of [["Legs per ronde", game.bestOfLegs], ["Legs in de finale", game.finalBestOfLegs]] as const) { numberIn(value, 1, 21, name); if (value % 2 === 0) throw new Error(`${name}: gebruik een oneven aantal.`); }
  numberIn(game.turnSeconds, 10, 120, "Beurttijd"); numberIn(game.reconnectSeconds, 15, 600, "Hersteltijd");
  boolean(game.spectators, "Toeschouwers"); boolean(game.checkoutHints, "Uitgooihulp");
  if (![4, 8, 16, 32, 64].includes(entry.maxPlayers)) throw new Error("Kies 4, 8, 16, 32 of 64 deelnemers.");
  numberIn(entry.minRating, 0, 5000, "Minimumrating"); numberIn(entry.maxRating, 0, 5000, "Maximumrating");
  if (entry.minRating > entry.maxRating) throw new Error("De minimumrating mag niet hoger zijn dan de maximumrating.");
  numberIn(entry.minMatches, 0, 500, "Minimaal gespeelde wedstrijden"); numberIn(entry.checkInMinutes, 5, 120, "Check-inperiode");
  boolean(entry.requireCheckIn, "Check-in"); boolean(entry.approval, "Goedkeuring"); boolean(entry.vipOnly, "Alleen VIP");
  text(platform.name, 40, "Platformnaam", true); text(platform.tagline, 100, "Slogan"); text(platform.maintenanceMessage, 300, "Onderhoudsbericht", platform.maintenance); text(platform.announcement, 240, "Aankondiging", platform.announcementActive); text(platform.supportEmail, 120, "Supportadres");
  if (platform.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(platform.supportEmail)) throw new Error("Vul een geldig support-e-mailadres in, of laat dit leeg.");
  numberIn(platform.chatSlowMode, 0, 60, "Chatvertraging");
  for (const name of ["registrationOpen", "maintenance", "announcementActive"] as const) boolean(platform[name], name);
  if (!["everyone", "friends", "nobody"].includes(platform.privateMessages)) throw new Error("Kies een geldige standaard voor privéberichten.");
  numberIn(eloDraft.k, 8, 64, "K-factor"); numberIn(eloDraft.startRating, 500, 2500, "Beginrating"); numberIn(eloDraft.placementMatches, 1, 50, "Plaatsingswedstrijden"); numberIn(eloDraft.placementOpponents, 1, 50, "Unieke tegenstanders");
  if (eloDraft.placementOpponents > eloDraft.placementMatches) throw new Error("Het aantal unieke tegenstanders mag niet hoger zijn dan het aantal plaatsingswedstrijden.");
  numberIn(eloDraft.redBelow, 0, 4000, "Ondergrens geel"); numberIn(eloDraft.greenFrom, 1, 5000, "Ondergrens groen");
  if (eloDraft.redBelow >= eloDraft.greenFrom) throw new Error("De grens voor groen moet hoger zijn dan de grens voor geel.");
}
function mergeSettings(base: AdminSettings, patch: AdminSettingsPatch): AdminSettings {
  return { game: patch.game ? { ...base.game, ...patch.game } : base.game, entry: patch.entry ? { ...base.entry, ...patch.entry } : base.entry, platform: patch.platform ? { ...base.platform, ...patch.platform } : base.platform, eloDraft: patch.eloDraft ? { ...base.eloDraft, ...patch.eloDraft } : base.eloDraft };
}
export function hydrateAdminSettings() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw?.settings && typeof raw.settings === "object") {
      const settings = mergeSettings(DEFAULT_ADMIN_SETTINGS, raw.settings);
      validateAdminSettings(settings);
      const audit = Array.isArray(raw.audit) ? raw.audit.filter((item: AdminSettingsAudit) => item && typeof item.id === "string" && Number.isFinite(item.at) && typeof item.actor === "string" && typeof item.action === "string" && typeof item.subject === "string" && typeof item.detail === "string").slice(0, 250) : [];
      snapshot = { settings, audit };
    }
  } catch { /* Damaged or unavailable storage falls back to the documented defaults. */ }
  listeners.forEach(listener => listener());
}
export function getAdminSettings(): AdminSettings { hydrateAdminSettings(); return snapshot.settings; }
export function updateAdminSettings(patch: AdminSettingsPatch, reason = "") {
  hydrateAdminSettings();
  const settings = mergeSettings(snapshot.settings, patch);
  validateAdminSettings(settings);
  const changed = (Object.keys(sectionLabels) as (keyof AdminSettings)[]).filter(key => JSON.stringify(settings[key]) !== JSON.stringify(snapshot.settings[key]));
  if (!changed.length) return;
  const now = Date.now();
  const entries = changed.map((section, index): AdminSettingsAudit => ({ id: `settings-${now}-${index}`, at: now, actor: "Nick", action: section === "eloDraft" ? "Beleidsconcept opgeslagen" : "Instellingen gewijzigd", subject: sectionLabels[section], detail: reason.trim().slice(0, 300) || (section === "eloDraft" ? "Alleen concept; actieve Elo en historische ratings blijven gelijk." : section === "game" || section === "entry" ? "Standaardwaarden voor nieuw aangemaakte toernooien bijgewerkt." : "Platformvoorkeuren bijgewerkt in deze lokale beheerdemo.") }));
  snapshot = { settings, audit: [...entries, ...snapshot.audit].slice(0, 250) };
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* Session remains usable with storage disabled. */ }
  listeners.forEach(listener => listener());
}
export function useAdminSettings(): { settings: AdminSettings; audit: AdminSettingsAudit[] } {
  useEffect(hydrateAdminSettings, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
