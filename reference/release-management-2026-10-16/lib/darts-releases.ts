"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AdminAuditEntry } from "./darts-admin-operations";

export type ReleaseStatus = "ideas" | "considering" | "doing" | "added";
export type ReleaseCategory = "game" | "community" | "tournaments" | "account" | "other";
export type ReleasePriority = "low" | "normal" | "high";
export const RELEASE_STATUSES: Record<ReleaseStatus, string> = { ideas: "Ideeën", considering: "In overweging", doing: "In uitvoering", added: "Toegevoegd" };
export const RELEASE_CATEGORIES: Record<ReleaseCategory, string> = { game: "Spel", community: "Community", tournaments: "Toernooien", account: "Account", other: "Overig" };
export const RELEASE_PRIORITIES: Record<ReleasePriority, string> = { low: "Laag", normal: "Normaal", high: "Hoog" };
export type ReleaseHistoryEntry = { id: string; at: number; actor: string; text: string };
export type ReleaseItem = {
  id: string; number: number; title: string; description: string; category: ReleaseCategory;
  status: ReleaseStatus; priority: ReleasePriority; authorName: string; source: "player" | "team";
  createdAt: number; updatedAt: number; version: string; releaseTitle: string; releaseSummary: string;
  notes: string; revision: number; history: ReleaseHistoryEntry[];
  publication?: { title: string; summary: string; version: string; publishedAt: number; category?: ReleaseCategory };
};
export type ReleaseBoardState = { items: ReleaseItem[]; revision: number; audit: AdminAuditEntry[] };
export type ReleaseItemPatch = Partial<Pick<ReleaseItem, "title" | "description" | "category" | "priority" | "status" | "version" | "releaseTitle" | "releaseSummary" | "notes">>;
export type PublicReleaseUpdate = { id: string; number: number; category: ReleaseCategory; title: string; summary: string; version: string; publishedAt: number };

const KEY = "dartspoint-releases-v1";
const MAX_BYTES = 2_000_000;
const MAX_ITEMS = 500;
const TEAM = "DartsPoint-team";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} ontbreekt of is ongeldig.`);
}
function text(value: unknown, maximum: number, label: string, minimum = 0): string {
  if (typeof value !== "string" || value.length > maximum || value.trim().length < minimum) throw new Error(`${label}: gebruik ${minimum ? `${minimum} tot ` : "maximaal "}${maximum} tekens.`);
  return value.trim();
}
function choice<T extends string>(value: unknown, labels: Record<T, string>, label: string): T {
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(labels, value)) throw new Error(`Kies een geldige ${label}.`);
  return value as T;
}
function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is ongeldig.`);
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("De opgeslagen datum is ongeldig.");
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(value)) throw new Error("De release-id is ongeldig.");
  return value;
}
let sequence = 0;
function uniqueId(prefix: string, existing: Set<string> = new Set()): string {
  let candidate: string;
  do {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
    candidate = `${prefix}-${random}-${(++sequence).toString(36)}`;
  } while (existing.has(candidate));
  return candidate;
}
function validateItem(value: unknown): ReleaseItem {
  record(value, "Release");
  if (!Array.isArray(value.history) || value.history.length > 100) throw new Error("Gebruik maximaal 100 historie-items per release.");
  const historyIds = new Set<string>();
  const history = value.history.map(entry => {
    record(entry, "Historie");
    const id = identifier(entry.id);
    if (historyIds.has(id)) throw new Error("De historie bevat dubbele id's.");
    historyIds.add(id);
    return { id, at: timestamp(entry.at), actor: text(entry.actor, 80, "Naam", 1), text: text(entry.text, 500, "Historie", 1) };
  });
  const item: ReleaseItem = {
    id: identifier(value.id), number: positive(value.number, "Releasenummer"), title: text(value.title, 140, "Titel", 3),
    description: text(value.description, 3000, "Omschrijving"), category: choice(value.category, RELEASE_CATEGORIES, "categorie"),
    status: choice(value.status, RELEASE_STATUSES, "status"), priority: choice(value.priority, RELEASE_PRIORITIES, "prioriteit"),
    authorName: text(value.authorName, 80, "Naam", 1), source: choice(value.source, { player: "Speler", team: "Team" }, "herkomst"),
    createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt), version: text(value.version, 40, "Versie"),
    releaseTitle: text(value.releaseTitle, 140, "Openbare titel"), releaseSummary: text(value.releaseSummary, 800, "Openbare samenvatting"),
    notes: text(value.notes, 5000, "Interne notities"), revision: positive(value.revision, "Itemversie"), history,
  };
  if (item.updatedAt < item.createdAt) throw new Error("De wijzigingsdatum kan niet vóór de aanmaakdatum liggen.");
  if (value.publication !== undefined) {
    record(value.publication, "Publicatie");
    if (item.status !== "added") throw new Error("Alleen toegevoegde verbeteringen kunnen gepubliceerd zijn.");
    item.publication = { title: text(value.publication.title, 140, "Openbare titel", 3), summary: text(value.publication.summary, 800, "Openbare samenvatting", 20), version: text(value.publication.version, 40, "Versie"), publishedAt: timestamp(value.publication.publishedAt) };
    if (value.publication.category !== undefined) item.publication.category = choice(value.publication.category, RELEASE_CATEGORIES, "publicatiecategorie");
  }
  return item;
}
function validateState(value: unknown): ReleaseBoardState {
  record(value, "Releasebord");
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS) throw new Error(`Het releasebord bevat maximaal ${MAX_ITEMS} items.`);
  if (!Array.isArray(value.audit) || value.audit.length > 250) throw new Error("De opgeslagen beheerhistorie is ongeldig.");
  const items = value.items.map(validateItem);
  if (new Set(items.map(item => item.id)).size !== items.length || new Set(items.map(item => item.number)).size !== items.length) throw new Error("Het releasebord bevat dubbele id's of nummers.");
  const audit = value.audit.map(entry => {
    record(entry, "Beheerhistorie");
    return { id: identifier(entry.id), at: timestamp(entry.at), actor: text(entry.actor, 80, "Naam", 1), action: text(entry.action, 100, "Actie", 1), subject: text(entry.subject, 180, "Onderwerp", 1), detail: text(entry.detail, 500, "Toelichting") };
  });
  return { items, revision: positive(value.revision, "Bordversie"), audit };
}

function seedItem(number: number, id: string, title: string, description: string, category: ReleaseCategory, status: ReleaseStatus, source: "player" | "team" = "team", authorName = TEAM): ReleaseItem {
  const at = Date.UTC(2026, 9, 15, 12, number);
  return { id, number, title, description, category, status, source, authorName, priority: "normal", createdAt: at, updatedAt: at, version: "", releaseTitle: "", releaseSummary: "", notes: "", revision: 1, history: [{ id: `${id}-created`, at, actor: source === "player" ? authorName : TEAM, text: "Voorbeelditem toegevoegd aan het releasebord." }] };
}
function seedState(): ReleaseBoardState {
  const published = [
    seedItem(1, "release-google-login", "Inloggen met Google", "Een extra inlogmogelijkheid naast de bestaande e-mailcode.", "account", "added"),
    seedItem(2, "release-support", "Support op één plek", "Vragen en meldingen volgen in een eigen ticket, met een duidelijk gesprek met het supportteam.", "other", "added"),
    seedItem(3, "release-lobby-widgets", "Een levendige lobby", "Aankondigingen, toernooien, nieuws en communitywidgets centraal inrichten en per kamer tonen.", "community", "added"),
  ].map(item => ({ ...item, releaseTitle: item.title, releaseSummary: item.description, publication: { title: item.title, summary: item.description, version: "", publishedAt: item.updatedAt, category: item.category }, history: [{ id: `${item.id}-published`, at: item.updatedAt, actor: TEAM, text: "Voorbeeld van een al toegevoegde verbetering gepubliceerd." }, ...item.history] }));
  return {
    revision: 1, audit: [], items: [
      ...published,
      seedItem(4, "idea-practice-route", "Een oefenroute voor je dubbels", "Kies de dubbels die lastig blijven en oefen ze in een korte persoonlijke reeks.", "game", "ideas", "player", "Nick"),
      seedItem(5, "idea-tournament-calendar", "Mijn toernooien in een kalender", "Bekijk ingeschreven toernooien op datum en zie wanneer de volgende wedstrijd begint.", "tournaments", "considering", "player", "TripleKim"),
      seedItem(6, "idea-support-clock", "Weten wanneer support antwoordt", "Toon een duidelijke antwoordverwachting en laat het team vragen met haast herkennen.", "other", "considering"),
      seedItem(7, "idea-active-sessions", "Mijn actieve sessies bekijken", "Herken een login op een gedeeld apparaat en sluit een andere sessie zelf af.", "account", "ideas", "player", "Nick"),
      seedItem(8, "idea-lobby-schedule", "Lobbyberichten vooruit plannen", "Zet een clubavondbericht klaar met een start- en eindmoment en bekijk vooraf hoe het in de kamer verschijnt.", "community", "doing"),
      seedItem(9, "idea-readable-export", "Een leesbare gegevenskopie", "Open je gegevens in een overzicht met uitleg, naast het bestaande machineleesbare bestand.", "account", "doing"),
    ],
  };
}
const initial = freeze(validateState(seedState()));
let snapshot: ReleaseBoardState = initial;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function fits(raw: string) {
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error("Het releasebord is groter dan 2 MB. Verkort omschrijvingen of interne notities voordat je opslaat.");
}
function parse(raw: string | null): ReleaseBoardState {
  if (raw === null) return initial;
  fits(raw);
  return freeze(validateState(JSON.parse(raw)));
}
function adopt(next: ReleaseBoardState) {
  if (JSON.stringify(snapshot) === JSON.stringify(next)) return;
  snapshot = freeze(next); emit();
}
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try { snapshot = parse(window.localStorage.getItem(KEY)); } catch { snapshot = initial; }
  window.addEventListener("storage", event => {
    if (event.key !== KEY && event.key !== null) return;
    // Events can arrive late: the current stored value wins over event.newValue.
    try { adopt(parse(window.localStorage.getItem(KEY))); } catch { /* Preserve the last valid view. */ }
  });
  emit();
}
function latest(): { state: ReleaseBoardState; raw: string | null } {
  hydrate();
  if (typeof window === "undefined") throw new Error("Open het releasebord in je browser om wijzigingen op te slaan.");
  let raw: string | null;
  try { raw = window.localStorage.getItem(KEY); }
  catch { throw new Error("Lokale opslag is niet beschikbaar. Sta opslag toe in je browser en probeer opnieuw."); }
  try { return { state: parse(raw), raw }; }
  catch { throw new Error("De opgeslagen releasegegevens zijn ongeldig. Herstel de lokale opslag voordat je wijzigingen opslaat."); }
}
function persist(next: ReleaseBoardState, expectedRaw: string | null) {
  const checked = validateState(next), serialized = JSON.stringify(checked);
  fits(serialized);
  let currentRaw: string | null;
  try { currentRaw = window.localStorage.getItem(KEY); }
  catch { throw new Error("Lokale opslag is niet beschikbaar. Sta opslag toe in je browser en probeer opnieuw."); }
  if (currentRaw !== expectedRaw) throw new Error("Het releasebord is in een ander tabblad gewijzigd. Herlaad het item en probeer opnieuw.");
  try { window.localStorage.setItem(KEY, serialized); }
  catch { throw new Error("Opslaan is niet gelukt. De lokale opslag is vol of geblokkeerd; maak ruimte vrij of sta opslag toe en probeer opnieuw."); }
  // Neither the public view nor the internal snapshot changes on a failed write.
  snapshot = freeze(checked); emit();
}
export function getReleaseBoard(): ReleaseBoardState { hydrate(); return snapshot; }
export function useReleaseBoard(): ReleaseBoardState {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => initial);
  useEffect(hydrate, []);
  return state;
}
function audit(item: ReleaseItem, action: string, detail: string, actor = TEAM): AdminAuditEntry {
  return { id: uniqueId("release-audit"), at: item.updatedAt, actor, action, subject: `#${item.number} · ${item.title}`, detail };
}
function nextRevision(value: number): number { return positive(value + 1, "Volgende versie"); }
function commit(base: ReturnType<typeof latest>, item: ReleaseItem, action: string, detail: string, actor = TEAM): ReleaseItem {
  const exists = base.state.items.some(existing => existing.id === item.id);
  const items = exists ? base.state.items.map(existing => existing.id === item.id ? item : existing) : [...base.state.items, item];
  persist({ items, revision: nextRevision(base.state.revision), audit: [audit(item, action, detail, actor), ...base.state.audit].slice(0, 250) }, base.raw);
  return snapshot.items.find(existing => existing.id === item.id)!;
}
function newItem(input: { title: string; description: string; category: ReleaseCategory; priority?: ReleasePriority; authorName?: string }, source: "player" | "team"): ReleaseItem {
  record(input, "Idee");
  const base = latest();
  if (base.state.items.length >= MAX_ITEMS) throw new Error(`Het releasebord bevat al ${MAX_ITEMS} items. Er kan geen nieuw item bij.`);
  const now = Date.now(), authorName = source === "player" ? text(input.authorName ?? "Speler", 80, "Naam", 1) : TEAM;
  const item: ReleaseItem = {
    id: uniqueId("release", new Set(base.state.items.map(existing => existing.id))), number: nextRevision(Math.max(0, ...base.state.items.map(existing => existing.number))),
    title: text(input.title, 140, "Titel", 3), description: text(input.description, 3000, "Omschrijving"), category: choice(input.category, RELEASE_CATEGORIES, "categorie"),
    status: "ideas", priority: source === "player" ? "normal" : choice(input.priority ?? "normal", RELEASE_PRIORITIES, "prioriteit"), source, authorName,
    createdAt: now, updatedAt: now, revision: 1, version: "", releaseTitle: "", releaseSummary: "", notes: "",
    history: [{ id: uniqueId("release-history"), at: now, actor: authorName, text: source === "player" ? "Idee ingediend. Alleen zichtbaar voor de indiener en het beheer in dit prototype." : "Verbetering toegevoegd aan de ideeënlijst." }],
  };
  return commit(base, item, source === "player" ? "Idee ingediend" : "Release-item aangemaakt", "Begint als idee; er is geen openbare releaseupdate gepubliceerd.", authorName);
}
export function submitReleaseIdea(input: { title: string; description: string; category: ReleaseCategory; authorName?: string }): ReleaseItem { return newItem(input, "player"); }
export function createReleaseItem(input: { title: string; description: string; category: ReleaseCategory; priority?: ReleasePriority }): ReleaseItem { return newItem(input, "team"); }
function currentItem(base: ReturnType<typeof latest>, id: string, expectedRevision: number): ReleaseItem {
  identifier(id); positive(expectedRevision, "Verwachte itemversie");
  const item = base.state.items.find(existing => existing.id === id);
  if (!item) throw new Error("Dit release-item bestaat niet meer. Herlaad het releasebord.");
  if (item.revision !== expectedRevision) throw new Error("Dit item is ondertussen gewijzigd. Herlaad het item voordat je jouw wijzigingen opnieuw opslaat.");
  return item;
}
function changed(item: ReleaseItem, message: string): ReleaseItem {
  const now = Math.max(Date.now(), item.updatedAt);
  return { ...item, updatedAt: now, revision: nextRevision(item.revision), history: [{ id: uniqueId("release-history", new Set(item.history.map(entry => entry.id))), at: now, actor: TEAM, text: message }, ...item.history].slice(0, 100) };
}
export function saveReleaseItem(id: string, patch: ReleaseItemPatch, expectedRevision: number): ReleaseItem {
  record(patch, "Wijziging");
  const allowed = new Set(["title", "description", "category", "priority", "status", "version", "releaseTitle", "releaseSummary", "notes"]);
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error("Deze releasevelden kunnen niet worden gewijzigd.");
  const base = latest(), current = currentItem(base, id, expectedRevision);
  const next = copy(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    switch (key) {
      case "title": next.title = text(value, 140, "Titel", 3); break;
      case "description": next.description = text(value, 3000, "Omschrijving"); break;
      case "category": next.category = choice(value, RELEASE_CATEGORIES, "categorie"); break;
      case "priority": next.priority = choice(value, RELEASE_PRIORITIES, "prioriteit"); break;
      case "status": next.status = choice(value, RELEASE_STATUSES, "status"); break;
      case "version": next.version = text(value, 40, "Versie"); break;
      case "releaseTitle": next.releaseTitle = text(value, 140, "Openbare titel"); break;
      case "releaseSummary": next.releaseSummary = text(value, 800, "Openbare samenvatting"); break;
      case "notes": next.notes = text(value, 5000, "Interne notities"); break;
    }
  }
  if (JSON.stringify(next) === JSON.stringify(current)) { adopt(base.state); return snapshot.items.find(item => item.id === id)!; }
  const withdrawn = !!current.publication && next.status !== "added";
  if (withdrawn) delete next.publication;
  const statusChanged = next.status !== current.status;
  const message = statusChanged ? `Status gewijzigd van ${RELEASE_STATUSES[current.status]} naar ${RELEASE_STATUSES[next.status]}.${withdrawn ? " De openbare releaseupdate is ingetrokken." : ""}` : "Item bijgewerkt. Een bestaande openbare releaseupdate blijft ongewijzigd tot opnieuw publiceren.";
  return commit(base, changed(next, message), statusChanged ? "Releasestatus gewijzigd" : "Release-item bijgewerkt", message);
}
export function moveReleaseItem(id: string, status: ReleaseStatus, expectedRevision: number): ReleaseItem { return saveReleaseItem(id, { status }, expectedRevision); }
export function publishReleaseItem(id: string, expectedRevision: number): ReleaseItem {
  const base = latest(), current = currentItem(base, id, expectedRevision);
  if (current.status !== "added") throw new Error("Zet de verbetering eerst op Toegevoegd voordat je een releaseupdate publiceert.");
  const publication = { title: text(current.releaseTitle, 140, "Openbare titel", 3), summary: text(current.releaseSummary, 800, "Openbare samenvatting", 20), version: text(current.version, 40, "Versie"), publishedAt: Math.max(Date.now(), current.updatedAt), category: current.category };
  const message = current.publication ? "Openbare releaseupdate opnieuw gepubliceerd met de nieuwe tekst." : "Openbare releaseupdate gepubliceerd.";
  return commit(base, changed({ ...copy(current), publication }, message), "Releaseupdate gepubliceerd", message);
}
export function unpublishReleaseItem(id: string, expectedRevision: number): ReleaseItem {
  const base = latest(), current = currentItem(base, id, expectedRevision);
  if (!current.publication) { adopt(base.state); return snapshot.items.find(item => item.id === id)!; }
  const next = copy(current); delete next.publication;
  const message = "Openbare releaseupdate ingetrokken. Het item blijft in het releasebeheer.";
  return commit(base, changed(next, message), "Releaseupdate ingetrokken", message);
}
/** Explicit whitelist: internal descriptions, drafts, authors, notes and history never enter the public feed. */
export function publicReleaseUpdates(state: ReleaseBoardState): PublicReleaseUpdate[] {
  return state.items.filter(item => item.status === "added" && item.publication).map(item => ({ id: item.id, number: item.number, category: item.publication!.category ?? item.category, title: item.publication!.title, summary: item.publication!.summary, version: item.publication!.version, publishedAt: item.publication!.publishedAt })).sort((a, b) => b.publishedAt - a.publishedAt || b.number - a.number);
}
