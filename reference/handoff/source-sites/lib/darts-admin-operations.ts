"use client";

import { useEffect, useSyncExternalStore } from "react";
import { players, rooms as seedRooms, type DartsPlayer, type PlayerRole } from "@/lib/darts-data";
import type { PlayerReport } from "@/lib/darts-social";

export type AdminAuditEntry = { id: string; at: number; actor: string; action: string; subject: string; detail: string };
export type AdminMember = DartsPlayer & { joinedAt: number; sanctions: AdminSanction[] };
export type AdminSanction = { id: string; kind: "warn" | "mute" | "suspend"; reason: string; at: number; until: number; revokedAt?: number };
export type AdminRoom = { id: string; name: string; subtitle: string; count: number; matches: number; capacity: number; category: "social" | "ranked" | "beginners" | "tournament"; status: "active" | "closed" | "private"; rules: string; minRating: number; maxRating: number; moderator: string };
export type AdminCase = { id: string; player: string; reporter: string; room: string; gameId: string; reason: string; context: string; at: number; status: "open" | "review" | "resolved"; response: string; source: "demo" | "report"; actionId?: string };
export type AdminOperations = { members: AdminMember[]; rooms: AdminRoom[]; cases: AdminCase[]; audit: AdminAuditEntry[] };
export type AdminResult = { ok: true; id?: string } | { ok: false; error: string };
const KEY = "dartspoint:admin-operations:v1";
const seedTime = Date.UTC(2026, 9, 11, 18, 0);
function createInitial(): AdminOperations {
  return {
    members: players.map((player, index) => ({ ...player, joinedAt: seedTime - (index + 3) * 86400000, sanctions: [] })),
    rooms: seedRooms.map((room, index) => ({ id: `room-${index + 1}`, name: room.name, subtitle: room.subtitle, count: room.count, matches: room.matches, capacity: 50, category: room.category === "Competitief" ? "ranked" : room.category === "Toernooi" ? "tournament" : room.name === "Beginners" ? "beginners" : "social", status: "active", rules: "Respecteer elkaar. Geen spam of beledigingen. Speel eerlijk en maak je wedstrijd af.", minRating: 0, maxRating: 4000, moderator: index % 2 === 0 ? "Mila" : "Nick" })),
    cases: [{ id: "DEMO-001", player: "NightOwl", reporter: "Demo-speler", room: "Nederland 1", gameId: "83626", reason: "Herhaalde berichten", context: "Voorbeeldmelding: dezelfde uitnodiging is meerdere keren in de kamerchat geplaatst. Dit is fictief bewijsmateriaal om de behandelstappen te demonstreren.", at: seedTime, status: "open", response: "", source: "demo" }],
    audit: [],
  };
}
const initial = createInitial();
let state = initial;
let hydrated = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length < 4_000_000) {
      const data = JSON.parse(raw) as AdminOperations;
      if (Array.isArray(data.members) && Array.isArray(data.rooms) && Array.isArray(data.cases) && Array.isArray(data.audit)) {
        state = {
          members: initial.members.map(seed => {
            const saved = data.members.find(member => member?.name === seed.name);
            if (!saved) return seed;
            return { ...seed, role: seed.name === "Nick" ? "owner" : ["player", "vip", "admin"].includes(saved.role) ? saved.role : seed.role, sanctions: seed.name === "Nick" ? [] : Array.isArray(saved.sanctions) ? saved.sanctions.filter(item => item && ["warn", "mute", "suspend"].includes(item.kind) && typeof item.reason === "string" && Number.isFinite(item.at) && Number.isFinite(item.until)).slice(-100) : [] };
          }),
          rooms: data.rooms.filter(room => room && typeof room.id === "string" && typeof room.name === "string" && typeof room.subtitle === "string" && typeof room.rules === "string" && Number.isInteger(room.capacity) && room.capacity >= 2 && room.capacity <= 50 && Number.isInteger(room.count) && room.count >= 0 && room.count <= room.capacity && Number.isFinite(room.matches) && ["social", "ranked", "beginners", "tournament"].includes(room.category) && ["active", "closed", "private"].includes(room.status) && Number.isFinite(room.minRating) && Number.isFinite(room.maxRating) && typeof room.moderator === "string").slice(0, 100),
          cases: data.cases.filter(item => item && typeof item.id === "string" && typeof item.player === "string" && typeof item.reason === "string" && typeof item.context === "string" && typeof item.response === "string" && Number.isFinite(item.at) && ["open", "review", "resolved"].includes(item.status)).slice(-500),
          audit: data.audit.filter(entry => entry && typeof entry.id === "string" && Number.isFinite(entry.at) && typeof entry.action === "string" && typeof entry.detail === "string").slice(-1000),
        };
      }
    }
  } catch { /* The local prototype remains available if browser storage is blocked. */ }
  emit();
}
function save(next: AdminOperations) {
  state = next;
  try { if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* In-memory demo only. */ }
  emit();
}
function audit(action: string, subject: string, detail: string): AdminAuditEntry { return { id: uid("audit"), at: Date.now(), actor: "Nick", action, subject, detail }; }
function withAudit(next: AdminOperations, entry: AdminAuditEntry) { save({ ...next, audit: [...next.audit, entry].slice(-1000) }); }
export function getAdminOperations() { hydrate(); return state; }
export function useAdminOperations() { const snapshot = useSyncExternalStore(subscribe, () => state, () => initial); useEffect(hydrate, []); return snapshot; }
export function memberStatus(member: AdminMember, at = Date.now()): "active" | "muted" | "suspended" {
  const active = member.sanctions.filter(item => !item.revokedAt && item.until > at);
  return active.some(item => item.kind === "suspend") ? "suspended" : active.some(item => item.kind === "mute") ? "muted" : "active";
}
export function updateAdminMemberRole(name: string, role: PlayerRole): AdminResult {
  const current = getAdminOperations();
  const member = current.members.find(item => item.name === name);
  if (!member || member.role === "owner" || name === "Nick") return { ok: false, error: "De eigenaar is beschermd en kan hier niet worden gewijzigd." };
  if (!["player", "vip", "admin"].includes(role)) return { ok: false, error: "Kies speler, VIP of admin." };
  if (member.role === role) return { ok: true };
  const handover = member.role === "admin" && role !== "admin" && current.rooms.some(room => room.moderator === name);
  withAudit({ ...current, members: current.members.map(item => item.name === name ? { ...item, role } : item), rooms: handover ? current.rooms.map(room => room.moderator === name ? { ...room, moderator: "Nick" } : room) : current.rooms }, audit("Rol gewijzigd", name, `${member.role} → ${role}${handover ? " · kamermoderatie overgedragen aan Nick" : ""}`));
  return { ok: true };
}
export function applyAdminMemberAction(input: { name: string; kind: AdminSanction["kind"]; reason: string; minutes?: number; caseId?: string }): AdminResult {
  const current = getAdminOperations();
  const member = current.members.find(item => item.name === input.name);
  if (!member) return { ok: false, error: "Speler niet gevonden." };
  if (member.role === "owner" || input.name === "Nick") return { ok: false, error: "Je kunt de eigenaar niet beperken." };
  if (input.caseId && !current.cases.some(item => item.id === input.caseId && item.player === input.name && item.status !== "resolved")) return { ok: false, error: "Deze melding is al afgehandeld of hoort niet bij deze speler." };
  if (!["warn", "mute", "suspend"].includes(input.kind)) return { ok: false, error: "Kies een geldige maatregel." };
  if (input.reason.trim().length < 5) return { ok: false, error: "Geef een concrete reden van minimaal 5 tekens." };
  const minutes = input.minutes ?? 60;
  if (input.kind !== "warn" && (!Number.isFinite(minutes) || minutes < 1 || minutes > 43200)) return { ok: false, error: "Kies een duur tussen 1 minuut en 30 dagen." };
  const at = Date.now();
  const sanction: AdminSanction = { id: uid("action"), kind: input.kind, reason: input.reason.trim().slice(0, 600), at, until: input.kind === "warn" ? at : at + minutes * 60000 };
  const action = { warn: "Waarschuwing", mute: "Chat beperkt", suspend: "Account geschorst" }[input.kind];
  withAudit({ ...current, members: current.members.map(item => item.name === input.name ? { ...item, sanctions: [...item.sanctions, sanction].slice(-100) } : item), cases: current.cases.map(item => item.id === input.caseId ? { ...item, actionId: sanction.id, status: "resolved", response: `${action}: ${sanction.reason}` } : item) }, audit(action, input.name, `${sanction.reason}${input.kind !== "warn" ? ` · ${minutes} minuten` : ""}${input.caseId ? ` · ${input.caseId}` : ""}`));
  return { ok: true, id: sanction.id };
}
export function revokeAdminMemberAction(name: string, id: string, reason: string): AdminResult {
  const current = getAdminOperations();
  if (reason.trim().length < 5) return { ok: false, error: "Geef een reden voor het intrekken." };
  const member = current.members.find(item => item.name === name);
  const sanction = member?.sanctions.find(item => item.id === id && !item.revokedAt);
  if (!sanction) return { ok: false, error: "Deze maatregel is niet meer actief." };
  withAudit({ ...current, members: current.members.map(item => item.name === name ? { ...item, sanctions: item.sanctions.map(entry => entry.id === id ? { ...entry, revokedAt: Date.now() } : entry) } : item) }, audit("Maatregel ingetrokken", name, reason.trim().slice(0, 600)));
  return { ok: true };
}
export function saveAdminRoom(input: Omit<AdminRoom, "id" | "count" | "matches"> & { id?: string }): AdminResult {
  const current = getAdminOperations();
  const existing = input.id ? current.rooms.find(room => room.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, error: "Deze kamer bestaat niet meer." };
  const name = input.name.trim();
  if (name.length < 3 || name.length > 40) return { ok: false, error: "Gebruik een kamernaam van 3 tot 40 tekens." };
  if (current.rooms.some(room => room.id !== input.id && room.name.toLocaleLowerCase("nl") === name.toLocaleLowerCase("nl"))) return { ok: false, error: "Deze kamernaam bestaat al." };
  if (!Number.isInteger(input.capacity) || input.capacity < 2 || input.capacity > 50) return { ok: false, error: "Een kamer heeft 2 tot maximaal 50 plaatsen." };
  if (existing && existing.count > input.capacity) return { ok: false, error: `Er zijn ${existing.count} spelers aanwezig. De capaciteit mag daar niet onder komen.` };
  if (!Number.isInteger(input.minRating) || !Number.isInteger(input.maxRating) || input.minRating < 0 || input.maxRating > 4000 || input.minRating > input.maxRating) return { ok: false, error: "Controleer het ratingbereik (0 tot 4000)." };
  if (!["social", "ranked", "beginners", "tournament"].includes(input.category) || !["active", "closed", "private"].includes(input.status)) return { ok: false, error: "Kies een geldige categorie en toegang." };
  const moderator = current.members.find(member => member.name === input.moderator);
  if (!moderator || !["owner", "admin"].includes(moderator.role)) return { ok: false, error: "Kies een eigenaar of admin als moderator." };
  if (!existing && current.rooms.length >= 100) return { ok: false, error: "De demo ondersteunt maximaal 100 kamers." };
  const room: AdminRoom = { ...input, id: existing?.id ?? uid("room"), name, subtitle: input.subtitle.trim().slice(0, 100), rules: input.rules.trim().slice(0, 1500), count: existing?.count ?? 0, matches: existing?.matches ?? 0 };
  withAudit({ ...current, rooms: existing ? current.rooms.map(item => item.id === existing.id ? room : item) : [...current.rooms, room] }, audit(existing ? "Kamer bijgewerkt" : "Kamer aangemaakt", name, `${input.category} · ${input.capacity} plaatsen · ${input.status} · rating ${input.minRating}–${input.maxRating}`));
  return { ok: true, id: room.id };
}
export function closeAdminRoom(id: string): AdminResult {
  const current = getAdminOperations();
  const room = current.rooms.find(item => item.id === id);
  if (!room) return { ok: false, error: "Kamer niet gevonden." };
  if (room.status === "closed") return { ok: true };
  withAudit({ ...current, rooms: current.rooms.map(item => item.id === id ? { ...item, status: "closed" } : item) }, audit("Kamer gesloten voor instroom", room.name, `${room.count} aanwezige spelers en ${room.matches} wedstrijden blijven behouden in de beheerdemo.`));
  return { ok: true };
}
export function deleteAdminRoom(id: string): AdminResult {
  const current = getAdminOperations();
  const room = current.rooms.find(item => item.id === id);
  if (!room) return { ok: false, error: "Kamer niet gevonden." };
  if (room.count > 0 || room.matches > 0) return { ok: false, error: "Deze kamer is in gebruik. Sluit de instroom; actieve wedstrijden blijven behouden." };
  if (room.status !== "closed") return { ok: false, error: "Sluit de kamer voordat je deze verwijdert." };
  withAudit({ ...current, rooms: current.rooms.filter(item => item.id !== id) }, audit("Lege kamer verwijderd", room.name, "Gesloten kamer zonder spelers of wedstrijden."));
  return { ok: true };
}
export function syncAdminReports(reports: PlayerReport[]) {
  const current = getAdminOperations();
  const fresh: AdminCase[] = reports.filter(report => !current.cases.some(item => item.id === report.id)).map(report => ({ id: report.id, player: report.name, reporter: "Nick", room: report.room, gameId: report.gameId, reason: report.reason, context: [report.detail, report.context].filter(Boolean).join("\n\n"), at: report.createdAt, status: "open", response: "", source: "report" }));
  if (fresh.length) save({ ...current, cases: [...current.cases, ...fresh].slice(-500) });
}
export function updateAdminCase(id: string, status: AdminCase["status"], response: string): AdminResult {
  const current = getAdminOperations();
  if (!current.cases.some(item => item.id === id)) return { ok: false, error: "Melding niet gevonden." };
  if (status === "resolved" && response.trim().length < 5) return { ok: false, error: "Noteer waarom de melding wordt afgesloten." };
  if (!["open", "review", "resolved"].includes(status)) return { ok: false, error: "Ongeldige status." };
  withAudit({ ...current, cases: current.cases.map(item => item.id === id ? { ...item, status, response: response.trim().slice(0, 1200) } : item) }, audit("Melding behandeld", id, `${status}${response.trim() ? ` · ${response.trim().slice(0, 1200)}` : ""}`));
  return { ok: true };
}
export function resetAdminOperations() {
  const next = createInitial();
  save({ ...next, audit: [audit("Beheerdemo hersteld", "Spelers, kamers en moderatie", "Lokale beheerwijzigingen teruggezet naar voorbeeldgegevens.")] });
}
