"use client";

import { useEffect, useSyncExternalStore } from "react";
import { playerByName } from "./darts-data";
import { getRatingProfile } from "./darts-ratings";
import { getAdminSettings } from "./darts-admin-settings";
import { getAdminOperations } from "./darts-admin-operations";
import {
  DEFAULT_TOURNAMENT_SETTINGS, applyTournamentResult, buildTournamentBracket, checkInIsOpen, normalizeTournament,
  eligibilityReasons, registrationIsOpen, validateTournamentSettings,
  type ParticipantStatus, type Tournament, type TournamentSettings, type TournamentInput, type TournamentParticipant, type TournamentResultInput, type TournamentStatus,
} from "./darts-tournament-model";

import { assignTournamentBoardPure, getTournamentMatchAccess, planTournamentBoards, startTournamentMatchPure } from "./darts-tournament-planning";

export type TournamentAuditEntry = { id: string; at: number; actor: string; action: string; target: string; detail: string };
export type TournamentState = { tournaments: Tournament[]; audit: TournamentAuditEntry[] };
const KEY = "dartspoint-owner-tournaments-v1";
const statuses: TournamentStatus[] = ["draft", "registration", "checkin", "live", "completed", "cancelled"];
const participantStatuses: ParticipantStatus[] = ["waiting", "confirmed", "checkedin", "withdrawn"];
const stamp = 1791748800000;
function uuid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function makeTournament(id: string, name: string, patch: TournamentInput = {}): Tournament {
  return { id, name, organizer: "DartsPoint", description: "Samen de avond afsluiten. Eén bracket, één winnaar.", status: "draft", published: false,
    participants: [], matches: [], championId: null, createdAt: stamp, updatedAt: stamp, ...patch,
    settings: { ...DEFAULT_TOURNAMENT_SETTINGS, ...patch.settings } };
}
function seedParticipant(name: string, index: number, checked = true): TournamentParticipant {
  const p = playerByName(name);
  return { id: `seed-${name.toLowerCase()}`, name, rating: p.played ? p.rating : 1460 + index * 17, played: p.played || 42 + index * 3,
    role: p.role, status: checked ? "checkedin" : "confirmed", ready: checked, rulesAccepted: true, approved: true, seed: index + 1, joinedAt: stamp + index };
}
function seedState(): TournamentState {
  const registration = makeTournament("cup-afterhours-open", "Afterhours Open", { published: true, description: "De vertrouwde avondcup voor acht spelers. Schrijf je in, check in en speel mee.", settings: { maxPlayers: 8, bestOf: 3, finalBestOf: 5, startsAt: "", requireCheckIn: true } });
  registration.status = "registration";
  registration.participants = ["Mila", "Bullseye", "Joey180", "TripleKim", "Sophie"].map((name, i) => seedParticipant(name, i, i < 2));
  let live = makeTournament("cup-sunday-masters", "Sunday Masters", { published: true, description: "Zestien spelers, knock-out. Volg de demo-uitslagen en de weg naar de finale.", settings: { maxPlayers: 16, bestOf: 5, finalBestOf: 7, minMatches: 10, requireCheckIn: true } });
  live.status = "checkin";
  live.participants = ["Nick", "Mila", "DartMaster", "TripleKim", "Bullseye", "DoubleOut", "Joey180", "Rookie", "Sophie", "NightOwl", "RedArrow", "TheFinisher", "Nora", "MaxDarts", "Daan", "Lotte"].map((name, i) => seedParticipant(name, i));
  live = { ...buildTournamentBracket(live), status: "live" };
  for (const match of live.matches.filter(m => m.round === 0).slice(0, 6)) live = applyTournamentResult(live, match.id, { score: match.index % 2 ? [2, 3] : [3, 1] }, stamp + 60_000 * match.index);
  const readyQuarter = live.matches.find(m => m.round === 1 && m.status === "ready");
  if (readyQuarter) live = applyTournamentResult(live, readyQuarter.id, { score: [3, 2] }, stamp + 600_000);
  const draft = makeTournament("cup-vip-draft", "Friday Night VIP", { description: "Concept voor een exclusieve clubavond. Stel de deelname en plaatsing eerst helemaal naar wens in.", settings: { maxPlayers: 32, vipOnly: true, approvalRequired: true, minMatches: 10, bestOf: 5, finalBestOf: 9 } });
  let doubleDemo = makeTournament("cup-dartspoint-double-chance", "DartsPoint Double Chance", { published: true, description: "Officieel DartsPoint-demotoernooi: winnaarsroute, herkansing en een mogelijke finalereset. Alle bezoekers kunnen meekijken.", settings: { format: "double-elimination", maxPlayers: 8, boardCount: 2, restSeconds: 30, bestOf: 3, finalBestOf: 5 } });
  doubleDemo.status = "checkin";
  doubleDemo.participants = ["Nick", "Mila", "DartMaster", "TripleKim", "Bullseye", "DoubleOut", "Joey180", "Sophie"].map((name, i) => seedParticipant(name, i));
  doubleDemo = { ...buildTournamentBracket(doubleDemo), status: "live" };
  const demoNickId = doubleDemo.participants.find(p => p.name === "Nick")!.id;
  for (const match of doubleDemo.matches.filter(m => m.bracket === "winners" && m.round === 0)) {
    // Nick enters the demo on his second chance, immediately playable on the lower bracket.
    const score: [number, number] = match.players.includes(demoNickId) ? match.players[0] === demoNickId ? [0, 2] : [2, 0] : match.index % 2 ? [1, 2] : [2, 0];
    doubleDemo = applyTournamentResult(doubleDemo, match.id, { score }, stamp + match.index * 60000);
  }
  return { tournaments: [registration, planTournamentBoards(live, stamp + 900000), planTournamentBoards(doubleDemo, stamp + 900000), draft], audit: [{ id: "tournament-seed-audit", at: stamp, actor: "Systeem", action: "Demotoernooien klaargezet", target: "DartsPoint", detail: "Voorbeelddata: inschrijving, live bracket en concept. Geen echte wedstrijden of Elo-mutaties." }] };
}
const initial = seedState();
let state = initial; let hydrated = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function emit() { listeners.forEach(listener => listener()); }
function validTournament(value: unknown): value is Tournament {
  if (!value || typeof value !== "object") return false;
  const t = value as Tournament;
  if (typeof t.id !== "string" || typeof t.name !== "string" || !statuses.includes(t.status) || typeof t.published !== "boolean" || !Array.isArray(t.participants) || t.participants.length > 512 || !Array.isArray(t.matches) || t.matches.length > 127) return false;
  try { validateTournamentSettings(t.settings); } catch { return false; }
  if (!t.participants.every(p => p && typeof p.id === "string" && typeof p.name === "string" && Number.isFinite(p.rating) && Number.isInteger(p.played) && participantStatuses.includes(p.status))) return false;
  if (new Set(t.participants.map(p => p.id)).size !== t.participants.length || new Set(t.participants.map(p => p.name.toLowerCase())).size !== t.participants.length) return false;
  return t.matches.every(m => m && typeof m.id === "string" && Number.isInteger(m.round) && Number.isInteger(m.index) && Array.isArray(m.players) && m.players.length === 2 && m.players.every(p => p === null || t.participants.some(entry => entry.id === p)) && ["ready", "pending", "playing", "completed", "skipped"].includes(m.status));
}
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && raw.length < 3_000_000) {
      const parsed = JSON.parse(raw) as TournamentState;
      const tournaments = Array.isArray(parsed?.tournaments) ? parsed.tournaments.map(t => normalizeTournament(t)) : [];
      if (parsed && Array.isArray(parsed.tournaments) && tournaments.length <= 100 && tournaments.every(validTournament) && Array.isArray(parsed.audit)) state = { tournaments: tournaments.some(t => t.id === "cup-dartspoint-double-chance") ? tournaments : [...tournaments, initial.tournaments.find(t => t.id === "cup-dartspoint-double-chance")!], audit: parsed.audit.filter(a => a && typeof a.id === "string" && typeof a.action === "string" && Number.isFinite(a.at)).slice(-1000) };
    }
  } catch { /* Local prototype can still run in memory if storage is unavailable. */ }
  emit();
}
function save(tournaments: Tournament[], action: string, target: string, detail: string, actor = "Nick") {
  state = { tournaments: tournaments.some(t => t.id === "cup-dartspoint-double-chance") ? tournaments : [...tournaments, initial.tournaments.find(t => t.id === "cup-dartspoint-double-chance")!], audit: [...state.audit, { id: uuid("ta"), at: Date.now(), actor, action, target, detail }].slice(-1000) };
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* State remains available this session. */ }
  emit();
}
export function getTournamentState() { hydrate(); return state; }
export function useTournaments() { const snapshot = useSyncExternalStore(subscribe, () => state, () => initial); useEffect(hydrate, []); return snapshot; }
function find(id: string) { const tournament = getTournamentState().tournaments.find(t => t.id === id); requireThat(tournament, "Toernooi niet gevonden."); return tournament; }
function commit(next: Tournament, action: string, detail: string, actor = "Nick") {
  next = { ...planTournamentBoards(next), updatedAt: Date.now() };
  save(state.tournaments.map(t => t.id === next.id ? next : t), action, next.id, detail, actor); return next;
}
export function createTournament(input: TournamentInput = {}) {
  getTournamentState(); requireThat(state.tournaments.length < 100, "Maximaal 100 toernooien in dit prototype.");
  const name = (input.name || "Nieuw toernooi").trim(); requireThat(name.length > 0 && name.length <= 100, "Vul een toernooinaam van maximaal 100 tekens in.");
  const { game, entry } = getAdminSettings();
  const inherited: Partial<TournamentSettings> = {
    startScore: game.startScore, doubleOut: game.finish === "double", bestOf: game.bestOfLegs, finalBestOf: game.finalBestOfLegs,
    turnSeconds: game.turnSeconds, reconnectSeconds: game.reconnectSeconds, spectators: game.spectators, checkoutHints: game.checkoutHints,
    maxPlayers: entry.maxPlayers as TournamentSettings["maxPlayers"], minRating: entry.minRating, maxRating: entry.maxRating,
    minMatches: entry.minMatches, requireCheckIn: entry.requireCheckIn, checkInMinutes: entry.checkInMinutes,
    approvalRequired: entry.approval, vipOnly: entry.vipOnly,
  };
  const settings = { ...DEFAULT_TOURNAMENT_SETTINGS, ...inherited, ...input.settings, spectators: true }; validateTournamentSettings(settings);
  const now = Date.now(); const next = { ...makeTournament(uuid("cup"), name, { ...input, name, settings }), createdAt: now, updatedAt: now };
  save([next, ...state.tournaments], "Toernooi aangemaakt", next.id, "Concept aangemaakt; nog niet geopend voor deelnemers."); return next;
}
export function updateTournament(id: string, patch: TournamentInput) {
  const t = find(id); const settings = { ...t.settings, ...patch.settings, spectators: true };
  if (["live", "completed", "cancelled"].includes(t.status) && patch.settings) requireThat(JSON.stringify(settings) === JSON.stringify(t.settings), "Spel- en deelname-instellingen zijn vergrendeld na de start. Maak een kopie of reset met reden.");
  const name = patch.name === undefined ? t.name : patch.name.trim(); requireThat(name.length > 0 && name.length <= 100, "Vul een toernooinaam van maximaal 100 tekens in.");
  validateTournamentSettings(settings);
  requireThat(t.participants.filter(p => ["confirmed", "checkedin"].includes(p.status)).length <= settings.maxPlayers, "De capaciteit mag niet lager zijn dan het huidige aantal deelnemers.");
  const changedSettings = JSON.stringify(settings) !== JSON.stringify(t.settings);
  return commit({ ...t, ...patch, name, description: (patch.description ?? t.description).slice(0, 2000), settings, ...(changedSettings ? { matches: [], championId: null } : {}) }, "Toernooi bijgewerkt", changedSettings && t.matches.length ? "Instellingen aangepast; eerder ingedeeld previewbracket gewist." : "Toernooigegevens aangepast.");
}
export function cloneTournament(id: string) {
  const source = find(id); return createTournament({ name: `${source.name} — kopie`.slice(0, 100), description: source.description, settings: { ...source.settings, registrationOpens: "", registrationCloses: "", checkInOpens: "", checkInCloses: "", startsAt: "" }, published: false });
}
export function setTournamentPublished(id: string, published: boolean) { return commit({ ...find(id), published }, published ? "Toernooi gepubliceerd" : "Toernooi verborgen", published ? "Zichtbaar in de lobby zodra inschrijving of check-in is geopend." : "Niet zichtbaar in de publieke toernooilijst."); }
export function setTournamentStatus(id: string, status: TournamentStatus) {
  const t = find(id); requireThat(statuses.includes(status), "Ongeldige toernooistatus.");
  if (status === "live") return startTournament(id);
  requireThat(status !== "completed", "Een toernooi is pas afgelopen wanneer de finale beslist is.");
  requireThat(!["live", "completed", "cancelled"].includes(t.status) || status === "cancelled", "Reset het bracket met reden om een gestart of gesloten toernooi opnieuw te openen.");
  return commit({ ...t, status }, "Toernooistatus gewijzigd", `${t.status} → ${status}`);
}
export function deleteTournament(id: string) { const t = find(id); requireThat(t.status === "draft", "Alleen concepttoernooien kunnen worden verwijderd. Annuleer andere toernooien."); save(state.tournaments.filter(item => item.id !== id), "Concept verwijderd", t.id, "Concepttoernooi verwijderd."); }
export type ParticipantInput = { name: string; rating?: number; played?: number; role?: TournamentParticipant["role"]; rulesAccepted?: boolean; approved?: boolean };
export function addTournamentParticipant(id: string, input: ParticipantInput, options?: { selfService?: boolean }) {
  const t = find(id); const name = input.name.trim();
  requireThat(!["live", "completed", "cancelled"].includes(t.status), "De deelnemerslijst is vergrendeld na de start.");
  if (options?.selfService) requireThat(registrationIsOpen(t), "De inschrijving is op dit moment gesloten.");
  requireThat(name.length > 0 && name.length <= 40, "Vul een spelersnaam van maximaal 40 tekens in.");
  const formerParticipant = t.participants.find(p => p.name.toLowerCase() === name.toLowerCase());
  requireThat(!formerParticipant || formerParticipant.status === "withdrawn", "Deze speler staat al op de deelnemerslijst.");
  const isFull = t.participants.filter(p => ["confirmed", "checkedin"].includes(p.status)).length >= t.settings.maxPlayers;
  requireThat(Boolean(formerParticipant) || t.participants.length < 512, "De limiet van 512 historische inschrijvingen voor dit prototype is bereikt.");
  const profile = getRatingProfile(name); const player = getAdminOperations().members.find(p => p.name.toLowerCase() === name.toLowerCase()) ?? playerByName(name);
  const participant: TournamentParticipant = { id: formerParticipant?.id ?? uuid("tp"), name, rating: options?.selfService ? profile.rating : input.rating ?? profile.rating, played: options?.selfService ? player.played : input.played ?? player.played, role: options?.selfService ? player.role : input.role ?? player.role,
    status: "confirmed", ready: false, approved: options?.selfService ? !t.settings.approvalRequired : input.approved ?? !t.settings.approvalRequired,
    rulesAccepted: Boolean(input.rulesAccepted), seed: formerParticipant?.seed ?? t.participants.length + 1, joinedAt: Date.now() };
  requireThat(Number.isFinite(participant.rating) && participant.rating >= 0 && participant.rating <= 5000 && Number.isInteger(participant.played) && participant.played >= 0, "Controleer Elo en gespeelde wedstrijden.");
  const reasons = eligibilityReasons(t, participant);
  if (options?.selfService) requireThat(!reasons.filter(reason => reason !== "Goedkeuring door beheer nodig").length, reasons.join(" · "));
  if (isFull) reasons.push("Wachtlijst: alle plaatsen zijn bezet");
  if (reasons.length) participant.status = "waiting";
  participant.ready = participant.status === "confirmed" && !t.settings.requireCheckIn;
  return commit({ ...t, participants: formerParticipant ? t.participants.map(p => p.id === formerParticipant.id ? participant : p) : [...t.participants, participant], matches: [], championId: null }, formerParticipant ? "Deelnemer opnieuw ingeschreven" : "Deelnemer toegevoegd", `${name}${reasons.length ? ` — wacht: ${reasons.join(", ")}` : ""}`, options?.selfService ? name : "Nick");
}
export function updateTournamentParticipant(id: string, participantId: string, patch: { status?: ParticipantStatus; rulesAccepted?: boolean; approved?: boolean; seed?: number }, options?: { selfService?: boolean }) {
  const t = find(id); const participant = t.participants.find(p => p.id === participantId);
  requireThat(participant, "Deelnemer niet gevonden."); requireThat(!["live", "completed", "cancelled"].includes(t.status), "Gebruik een walk-over om een deelnemer na de start te laten uitvallen.");
  if (patch.status) requireThat(participantStatuses.includes(patch.status), "Ongeldige deelnemersstatus.");
  if (options?.selfService) {
    requireThat(patch.approved === undefined && patch.seed === undefined, "Goedkeuring en plaatsing zijn voor beheer.");
    requireThat(patch.status === undefined || patch.status === "checkedin" || patch.status === "withdrawn", "Deze status kan alleen door beheer worden ingesteld.");
    if (patch.status === "checkedin") requireThat(checkInIsOpen(t), "Check-in is op dit moment gesloten.");
  }
  if (patch.seed !== undefined) requireThat(Number.isInteger(patch.seed) && patch.seed >= 1 && patch.seed <= 64, "Plaatsing moet tussen 1 en 64 liggen.");
  const currentMember = getAdminOperations().members.find(p => p.name.toLowerCase() === participant.name.toLowerCase());
  const nextParticipant = { ...participant, ...(currentMember ? { role: currentMember.role } : {}), ...patch, ready: patch.status === "checkedin" || patch.status === "confirmed" && !t.settings.requireCheckIn ? true : patch.status === "withdrawn" || patch.status === "waiting" ? false : participant.ready };
  if (["confirmed", "checkedin"].includes(nextParticipant.status)) requireThat(!eligibilityReasons(t, nextParticipant).length, eligibilityReasons(t, nextParticipant).join(" · "));
  if (["confirmed", "checkedin"].includes(nextParticipant.status)) requireThat(t.participants.filter(p => p.id !== participantId && ["confirmed", "checkedin"].includes(p.status)).length < t.settings.maxPlayers, "Het toernooi is vol; laat deze speler op de wachtlijst staan.");
  let participants = t.participants.map(p => p.id === participantId ? nextParticipant : p);
  // Swapping seed numbers avoids ambiguous manual ordering.
  if (patch.seed !== undefined && patch.seed !== participant.seed) participants = participants.map(p => p.id !== participantId && p.seed === patch.seed ? { ...p, seed: participant.seed } : p);
  return commit({ ...t, participants, matches: [], championId: null }, "Deelnemer bijgewerkt", `${participant.name}: ${nextParticipant.status}${patch.seed !== undefined ? `, plaatsing ${patch.seed}` : ""}`, options?.selfService ? participant.name : "Nick");
}
export function removeTournamentParticipant(id: string, participantId: string) { return updateTournamentParticipant(id, participantId, { status: "withdrawn" }); }
export function generateTournamentBracket(id: string) { const t = find(id); return commit(buildTournamentBracket(t), "Bracket ingedeeld", `${t.settings.seeding} plaatsing; automatische vrijlotingen. Dit is een preview tot de start.`); }
export function startTournament(id: string) {
  const t = find(id); requireThat(["registration", "checkin"].includes(t.status), "Open eerst inschrijving of check-in voordat je start.");
  requireThat(t.matches.length > 0, "Genereer eerst het bracket.");
  return commit({ ...t, status: "live" }, "Toernooi gestart", `${t.matches.filter(m => m.bracket === "winners" && m.round === 0).length * 2} bracketposities. Deelname en spelregels zijn nu vergrendeld.`);
}
export function recordTournamentResult(id: string, matchId: string, input: TournamentResultInput) {
  const t = find(id); const old = t.matches.find(m => m.id === matchId); const next = applyTournamentResult(t, matchId, input);
  const match = next.matches.find(m => m.id === matchId)!;
  const names = match.players.map(pid => t.participants.find(p => p.id === pid)?.name ?? "Vrij");
  return commit(next, old?.result ? "Uitslag gecorrigeerd" : input.kind === "walkover" ? "Walk-over toegekend" : "Uitslag vastgelegd", `${names.join(" – ")}: ${match.result!.score.join("–")}${input.reason ? ` · ${input.reason}` : ""}${old?.result ? " · Afhankelijke uitslagen gewist." : ""}`);
}
export function resetTournamentBracket(id: string, reason: string) {
  const t = find(id); requireThat(reason.trim().length >= 3, "Geef een duidelijke reden voor het resetten van het bracket.");
  return commit({ ...t, matches: [], championId: null, status: "checkin" }, "Bracket gereset", reason.trim().slice(0, 500));
}

export function setTournamentReady(id: string, participantId: string, ready: boolean, options?: { actorName?: string }) {
  const t = find(id); const participant = t.participants.find(p => p.id === participantId);
  requireThat(participant && ["confirmed", "checkedin"].includes(participant.status), "Alleen toegelaten deelnemers kunnen zich gereed melden.");
  if (options?.actorName) requireThat(participant.name.toLowerCase() === options.actorName.toLowerCase(), "Je kunt alleen je eigen gereedmelding wijzigen.");
  requireThat(typeof ready === "boolean", "Kies gereed of pauze.");
  requireThat(!["completed", "cancelled"].includes(t.status), "Dit toernooi is afgesloten.");
  if (!ready) requireThat(!t.matches.some(m => m.status === "playing" && m.players.includes(participantId)), "Rond eerst je actieve wedstrijd af.");
  if (ready) requireThat(!eligibilityReasons(t, participant).length && (!t.settings.requireCheckIn || participant.status === "checkedin"), "Accepteer de voorwaarden en check eerst in.");
  return commit({ ...t, participants: t.participants.map(p => p.id === participantId ? { ...p, ready } : p) }, ready ? "Deelnemer gereed" : "Deelnemer op pauze", participant.name, options?.actorName ?? "Nick");
}
export function refreshTournamentSchedule(id: string) {
  const t = find(id); const next = planTournamentBoards(t);
  if (JSON.stringify(next.matches) === JSON.stringify(t.matches) && next.status === t.status) return t;
  return commit(next, "Bordplanning bijgewerkt", "Beschikbare wedstrijden ingepland; check-in, gereedmelding, rusttijd en vrije borden gecontroleerd.");
}
export function assignTournamentBoard(id: string, matchId: string, boardId: number | null) {
  const next = assignTournamentBoardPure(find(id), matchId, boardId);
  return commit(next, boardId === null ? "Bord vrijgegeven" : "Wedstrijd ingedeeld", `${matchId}${boardId === null ? "" : ` · Bord ${boardId}`}`);
}
export function startTournamentMatch(id: string, matchId: string, options?: { actorName?: string }) {
  const t = find(id); const selected = t.matches.find(m => m.id === matchId);
  const selectedNames = selected?.players.map(pid => t.participants.find(p => p.id === pid)?.name.toLowerCase()).filter(Boolean) ?? [];
  const otherActive = state.tournaments.find(other => other.id !== id && other.status === "live" && other.matches.some(m => m.status === "playing" && m.players.some(pid => selectedNames.includes(other.participants.find(p => p.id === pid)?.name.toLowerCase()))));
  requireThat(!otherActive, `Een deelnemer speelt al in ${otherActive?.name ?? "een ander toernooi"}. Wacht tot die wedstrijd is afgerond.`);
  if (options?.actorName) { const access = getTournamentMatchAccess(t, matchId, options.actorName); requireThat(access.canPlay, access.reason); }
  return commit(startTournamentMatchPure(t, matchId), "Wedstrijd gestart", matchId, options?.actorName ?? "Nick");
}
export function recordParticipantTournamentResult(id: string, matchId: string, input: TournamentResultInput, actorName: string) {
  const t = find(id); const match = t.matches.find(m => m.id === matchId); const access = getTournamentMatchAccess(t, matchId, actorName);
  requireThat(match?.status === "playing" && access.canPlay, access.reason || "Start eerst je toegewezen wedstrijd.");
  requireThat((input.kind ?? "played") === "played", "Een walk-over of correctie wordt door de organisatie vastgelegd.");
  const next = applyTournamentResult(t, matchId, input);
  return commit(next, "Demoresultaat deelnemer", `${matchId} · ${input.score.join("–")}`, actorName);
}
