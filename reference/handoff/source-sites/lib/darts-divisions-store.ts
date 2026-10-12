"use client";

import { useEffect, useSyncExternalStore } from "react";
import { playerByName } from "./darts-data";
import { getRatingProfile } from "./darts-ratings";
import {
  addDivisionDays, applyDivisionResult, buildDivisionSchedule, finishDivisionSeason, getDivisionMovements, getDivisionFixtureAccess,
  validateDivisionSeason, validateDivisionScore, type Division, type DivisionColor, type DivisionMember, type DivisionResultInput,
  type DivisionSeason, type DivisionSeasonInput,
} from "./darts-divisions-model";

export type DivisionAuditEntry = { id: string; at: number; actor: string; action: string; target: string; detail: string };
export type DivisionSeasonState = { version: 1; seasons: DivisionSeason[]; audit: DivisionAuditEntry[] };
const KEY = "dartspoint-divisions-v1";
const stamp = Date.parse("2026-10-05T12:00:00Z");
function uuid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function makeSeason(id: string, input: DivisionSeasonInput = {}): DivisionSeason {
  return { id, name: input.name?.trim() || "Nieuw seizoen", description: input.description?.trim() || "Samen een seizoen lang. Elke wedstrijd telt voor jouw divisie.", status: "draft", startsOn: input.startsOn || today(), bestOf: input.bestOf ?? 5,
    promoteCount: input.promoteCount ?? 1, relegateCount: input.relegateCount ?? 1,
    divisions: (input.divisions ?? [{ name: "Premier Division", color: "gold" }, { name: "Division One", color: "silver" }, { name: "Division Two", color: "bronze" }]).map((d, i) => ({ ...d, id: `${id}-div-${i + 1}`, level: i + 1 })),
    members: [], fixtures: [], previousSeasonId: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, completionReason: "" };
}
function seedState(): DivisionSeasonState {
  let season = makeSeason("season-afterhours-01", { name: "Afterhours · Seizoen 01", startsOn: "2026-10-05", description: "Drie divisies. Wekelijks één tegenstander. Speel voor jouw plek in het volgende seizoen.", bestOf: 5 });
  const groups = [["DartMaster", "TripleKim", "Nick", "Mila"], ["Joey180", "DoubleOut", "Bullseye", "Sophie"], ["NightOwl", "Rookie", "FreshDart", "RedArrow"]];
  season.members = groups.flatMap((names, index) => names.map(name => ({ id: `division-player-${name.toLowerCase()}`, name, divisionId: season.divisions[index].id, rating: playerByName(name).rating })));
  season = { ...buildDivisionSchedule(season), status: "live", createdAt: stamp, updatedAt: stamp };
  for (const [index, fixture] of season.fixtures.filter(f => f.matchday === 1).entries()) season = applyDivisionResult(season, fixture.id, { score: index % 2 ? [1, 3] : [3, 2] }, stamp + index * 60_000);
  return { version: 1, seasons: [season], audit: [{ id: "division-seed", at: stamp, actor: "Systeem", action: "Divisies klaargezet", target: season.id, detail: "Lokale voorbeeldcompetitie met drie divisies; ladderpunten staan los van Elo." }] };
}
const initial = seedState(); let state = initial; let hydrated = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function hydrate() {
  if (hydrated || typeof window === "undefined") return; hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw && raw.length < 5_000_000) {
      const saved = JSON.parse(raw) as DivisionSeasonState;
      requireThat(saved.version === 1 && Array.isArray(saved.seasons) && saved.seasons.length <= 50 && Array.isArray(saved.audit), "Ongeldige lokale divisiegegevens.");
      requireThat(new Set(saved.seasons.map(s => s.id)).size === saved.seasons.length && saved.seasons.filter(s => s.status === "live").length <= 1, "Ongeldige seizoensindeling.");
      for (const season of saved.seasons) validateDivisionSeason(season);
      state = { version: 1, seasons: saved.seasons, audit: saved.audit.filter(a => a && typeof a.id === "string" && typeof a.action === "string" && typeof a.detail === "string" && typeof a.target === "string" && Number.isFinite(a.at)).slice(-1000) };
    }
  } catch { /* Corrupt or incompatible snapshots never partially replace the working demo. */ }
  emit();
}
export function getDivisionSeasonState() { hydrate(); return state; }
export function useDivisionSeasons() { const snapshot = useSyncExternalStore(subscribe, () => state, () => initial); useEffect(hydrate, []); return snapshot; }
function save(seasons: DivisionSeason[], action: string, target: string, detail: string) {
  state = { version: 1, seasons, audit: [...state.audit, { id: uuid("da"), at: Date.now(), actor: "Nick", action, target, detail }].slice(-1000) };
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Local prototype stays usable within this session. */ }
  emit();
}
function find(id: string) { const season = getDivisionSeasonState().seasons.find(s => s.id === id); requireThat(season, "Seizoen niet gevonden."); return season; }
function draft(id: string) { const season = find(id); requireThat(season.status === "draft", "De indeling is vergrendeld na de seizoensstart."); return season; }
function commit(next: DivisionSeason, action: string, detail: string) {
  next = { ...next, updatedAt: Date.now() }; validateDivisionSeason(next);
  save(state.seasons.map(s => s.id === next.id ? next : s), action, next.id, detail); return next;
}
export function createDivisionSeason(input: DivisionSeasonInput = {}) {
  getDivisionSeasonState(); requireThat(state.seasons.length < 50, "Maximaal 50 seizoenen in dit prototype.");
  const season = makeSeason(uuid("season"), input); validateDivisionSeason(season);
  save([season, ...state.seasons], "Seizoen aangemaakt", season.id, "Conceptcompetitie; voeg spelers toe en genereer de speeldagen."); return season;
}
export function updateDivisionSeason(id: string, patch: Omit<DivisionSeasonInput, "divisions">) {
  const season = draft(id);
  const next = { ...season, ...patch, name: (patch.name ?? season.name).trim(), description: (patch.description ?? season.description).trim().slice(0, 2000), fixtures: [] };
  return commit(next, "Seizoen bijgewerkt", "Instellingen aangepast; conceptwedstrijdschema opnieuw genereren.");
}
export function addSeasonDivision(id: string, input: { name: string; color: DivisionColor }) {
  const season = draft(id); const division: Division = { id: uuid("division"), name: input.name.trim(), color: input.color, level: season.divisions.length + 1 };
  return commit({ ...season, divisions: [...season.divisions, division], fixtures: [] }, "Divisie toegevoegd", division.name);
}
export function updateSeasonDivision(id: string, divisionId: string, patch: { name?: string; color?: DivisionColor; level?: number }) {
  const season = draft(id); const current = season.divisions.find(d => d.id === divisionId); requireThat(current, "Divisie niet gevonden.");
  const divisions = season.divisions.map(d => d.id === divisionId ? { ...d, ...patch, name: (patch.name ?? d.name).trim() } : patch.level !== undefined && d.level === patch.level ? { ...d, level: current.level } : d);
  return commit({ ...season, divisions, fixtures: [] }, "Divisie bijgewerkt", patch.name || current.name);
}
export function removeSeasonDivision(id: string, divisionId: string) {
  const season = draft(id); requireThat(season.divisions.some(d => d.id === divisionId), "Divisie niet gevonden.");
  requireThat(!season.members.some(m => m.divisionId === divisionId), "Verplaats eerst alle spelers uit deze divisie.");
  const divisions = season.divisions.filter(d => d.id !== divisionId).sort((a, b) => a.level - b.level).map((d, i) => ({ ...d, level: i + 1 }));
  return commit({ ...season, divisions, fixtures: [] }, "Divisie verwijderd", "Lege divisie verwijderd uit het concept.");
}
export function addDivisionMember(id: string, input: { name: string; divisionId: string; rating?: number }) {
  const season = draft(id); const name = input.name.trim();
  const member: DivisionMember = { id: uuid("dm"), name, divisionId: input.divisionId, rating: input.rating ?? getRatingProfile(name).rating };
  return commit({ ...season, members: [...season.members, member], fixtures: [] }, "Speler ingedeeld", name);
}
export function moveDivisionMember(id: string, memberId: string, divisionId: string) {
  const season = draft(id); const member = season.members.find(m => m.id === memberId); requireThat(member, "Speler niet gevonden.");
  return commit({ ...season, members: season.members.map(m => m.id === memberId ? { ...m, divisionId } : m), fixtures: [] }, "Speler verplaatst", `${member.name} → ${season.divisions.find(d => d.id === divisionId)?.name ?? divisionId}`);
}
export function removeDivisionMember(id: string, memberId: string) {
  const season = draft(id); const member = season.members.find(m => m.id === memberId); requireThat(member, "Speler niet gevonden.");
  return commit({ ...season, members: season.members.filter(m => m.id !== memberId), fixtures: [] }, "Speler uitgedeeld", member.name);
}
export function generateDivisionSchedule(id: string) { return commit(buildDivisionSchedule(draft(id)), "Speeldagen ingedeeld", "Iedere speler ontmoet alle divisiegenoten één keer; een oneven indeling krijgt rustweken."); }
export function startDivisionSeason(id: string) {
  const season = draft(id); requireThat(!state.seasons.some(s => s.status === "live"), "Sluit eerst het lopende seizoen af. Er kan één seizoen tegelijk actief zijn.");
  requireThat(season.fixtures.length > 0, "Genereer eerst de speeldagen.");
  const expected = buildDivisionSchedule({ ...season, fixtures: [] });
  requireThat(JSON.stringify(expected.fixtures) === JSON.stringify(season.fixtures), "De indeling is gewijzigd. Genereer de speeldagen opnieuw.");
  return commit({ ...season, status: "live" }, "Seizoen gestart", "Indeling en spelregels vergrendeld; divisiebadges zijn actief.");
}
export function recordDivisionResult(id: string, fixtureId: string, input: DivisionResultInput) {
  const season = find(id);
  requireThat(!state.seasons.some(s => s.previousSeasonId === id), "Het vervolgseizoen is al ingedeeld. Deze eindstand is vergrendeld.");
  requireThat(!state.seasons.some(s => s.id !== id && s.status === "live"), "Een ander seizoen is actief. Een historisch seizoen kan nu niet worden heropend.");
  const old = season.fixtures.find(f => f.id === fixtureId); const next = applyDivisionResult(season, fixtureId, input);
  const fixture = next.fixtures.find(f => f.id === fixtureId)!;
  return commit(next, old?.result ? "Divisie-uitslag gecorrigeerd" : "Divisie-uitslag vastgelegd", `${fixture.players.map(pid => season.members.find(m => m.id === pid)?.name).join(" – ")}: ${input.score.join("–")}${input.reason ? ` · ${input.reason}` : ""}`);
}
export function completeDivisionSeason(id: string, reason = "") {
  const season = find(id); const pending = season.fixtures.filter(f => f.status === "scheduled").length;
  return commit(finishDivisionSeason(season, reason), "Seizoen afgesloten", `${pending ? `${pending} open wedstrijden niet meegeteld. ` : "Alle wedstrijden afgerond. "}${reason.trim()}`);
}
/** Called only by the isolated competition demo, never the open game's Elo flow. */
export function submitDivisionPlayedResult(id: string, fixtureId: string, playerName: string, score: [number, number]) {
  const season = find(id); const access = getDivisionFixtureAccess(season, fixtureId, playerName);
  validateDivisionScore(season.bestOf, score);
  const member = access.players.find(p => p?.name.toLowerCase() === playerName.toLowerCase());
  // A retried finish receipt is harmless, but it cannot change an existing result.
  if (member && access.fixture?.result?.score.every((value, index) => value === score[index])) return season;
  requireThat(access.canPlay, access.reason);
  return recordDivisionResult(id, fixtureId, { score });
}
export function createNextDivisionSeason(id: string, input: { name?: string; startsOn?: string } = {}) {
  const season = find(id); requireThat(season.status === "completed", "Sluit het seizoen af voordat je het volgende indeelt.");
  requireThat(!state.seasons.some(s => s.previousSeasonId === id), "Er bestaat al een vervolgseizoen voor deze competitie.");
  requireThat(state.seasons.length < 50, "Maximaal 50 seizoenen in dit prototype.");
  const moves = getDivisionMovements(season); const nextId = uuid("season");
  const next: DivisionSeason = { ...season, id: nextId, name: input.name?.trim() || `${season.name} · vervolg`.slice(0, 100),
    startsOn: input.startsOn || addDivisionDays(season.startsOn, Math.max(...season.fixtures.map(f => f.matchday), 1) * 7),
    status: "draft", previousSeasonId: season.id, members: moves.members, fixtures: [], createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, completionReason: "" };
  validateDivisionSeason(next);
  save([next, ...state.seasons], "Vervolgseizoen ingedeeld", next.id, `${moves.movements.length} verplaatsingen. ${moves.warnings.join(" ") || "Promotie en degradatie toegepast. Controleer de indeling vóór de start."}`); return next;
}
