"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AdminAuditEntry } from "@/lib/darts-admin-operations";
import { validateHeroImage, type HeroImage } from "./darts-hero-image";

export type LobbyWidgetType = "announcement" | "tournament" | "releases" | "players" | "challenge" | "moment" | "news" | "poll" | "divisions";
export type LobbyWidget = {
  id: string; type: LobbyWidgetType; enabled: boolean; size: "half" | "wide";
  audience: { mode: "all" | "rooms"; roomIds: string[] };
  title: string; description: string;
  settings: { releaseLimit?: number; allowIdeas?: boolean; announcementSource?: "platform" | "custom"; tournamentId?: string; tournamentImageMode?: "inherit" | "custom" | "none"; heroImage?: HeroImage; articleIds?: string[]; playerName?: string; score?: string; scoreLabel?: string; seedApplause?: number; pollOptions?: string[]; pollVotes?: number[]; ctaLabel?: string; ctaHref?: string };
};
export type LobbyArticle = { id: string; category: "news" | "update" | "guide"; title: string; summary: string; body: string; published: boolean; ctaLabel?: string; ctaHref?: string };
export type LobbyLayout = { headline: string; eyebrow: string; widgets: LobbyWidget[]; articles: LobbyArticle[] };
export type LobbyContentState = { schemaVersion?: 2; draft: LobbyLayout; published: LobbyLayout; revision: number; savedAt: number | null; publishedAt: number | null; audit: AdminAuditEntry[] };
type LobbyResult = { ok: boolean; error?: string };

export const LOBBY_WIDGET_LABELS: Record<LobbyWidgetType, string> = {
  announcement: "Aankondiging", tournament: "Uitgelicht toernooi", releases: "Laatste toevoegingen", players: "Spelers in de kamer", challenge: "Weekchallenge", moment: "Communitymoment", news: "Nieuws & updates", poll: "Communitypoll", divisions: "Divisies",
};
const KEY = "dartspoint-lobby-content-v1";
const kinds = Object.keys(LOBBY_WIDGET_LABELS) as LobbyWidgetType[];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
let sequence = 0;
function id(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

const widgetDefaults: Record<LobbyWidgetType, Omit<LobbyWidget, "id" | "type" | "enabled" | "audience">> = {
  announcement: { size: "wide", title: "Van het team", description: "Welkom aan de oche. Een nieuw gezicht? Zeg even hoi in de kamerchat.", settings: { announcementSource: "platform" } },
  tournament: { size: "wide", title: "", description: "", settings: { tournamentImageMode: "inherit" } },
  releases: { size: "wide", title: "DartsPoint blijft groeien.", description: "De laatste toevoegingen, samen met de community.", settings: { releaseLimit: 3, allowIdeas: true } },
  players: { size: "wide", title: "Al zin in een potje?", description: "Je volgende tegenstander zit misschien al in de kamer.", settings: { ctaLabel: "Zoek een speler" } },
  challenge: { size: "half", title: "Vijf dubbels.\nEén lekker gevoel.", description: "Een kleine uitdaging, precies tussen twee potjes in.", settings: { ctaLabel: "Pak je pijlen", ctaHref: "/oefenen?uitdaging=1" } },
  moment: { size: "half", title: "Drie pijlen. Groot applaus.", description: "vindt drie keer de triple 20. Dít zijn de momenten.", settings: { playerName: "TripleKim", score: "180", scoreLabel: "MAXIMUM!", seedApplause: 24 } },
  news: { size: "wide", title: "Van het prikbord", description: "Nieuws & updates", settings: { articleIds: [] } },
  poll: { size: "half", title: "Wat wordt onze volgende clubavond?", description: "Jouw stem maakt de avond.", settings: { pollOptions: ["Een gezellige avondcup", "Een koppels-toernooi", "Een beginnersavond"], pollVotes: [48, 32, 20] } },
  divisions: { size: "half", title: "Jouw plek op de ladder.", description: "Een vaste divisie, nieuwe tegenstanders en elke speelronde iets om voor te gaan.", settings: { ctaLabel: "Bekijk de divisies", ctaHref: "/divisies" } },
};
export function createLobbyWidget(type: LobbyWidgetType): LobbyWidget {
  if (!kinds.includes(type)) throw new Error("Kies een geldig widgettype.");
  return { id: id("widget"), type, enabled: true, audience: { mode: "all", roomIds: [] }, ...clone(widgetDefaults[type]) };
}
export function createLobbyArticle(): LobbyArticle { return { id: id("article"), category: "news", title: "Nieuw bericht", summary: "", body: "", published: false }; }

function seedLayout(): LobbyLayout {
  const articles: LobbyArticle[] = [
    { id: "rooms", category: "news", title: "Een kamer die als thuis voelt.", summary: "Van de eerste ‘hoi’ tot nog één laatste leg.", published: true, body: ["Je hoeft niet meteen een wedstrijd te starten. Schuif aan, praat bij in de kamerchat en kijk wie er zin heeft in een potje. Het clubhuis geeft je ondertussen iets leuks om te ontdekken.", "In dit ontwerp blijft de rechterhelft je vaste plek: de spelers in je kamer en je vrienden bovenaan, de gesprekken daaronder. Start je een partij, dan maakt het clubhuis links plaats voor je dartbord.", "Een aankondiging van het team, een uitgelicht toernooi en prestaties van je kamergenoten geven iedere kamer een eigen karakter. Het platformbeheer bepaalt welke widgets overal of alleen in bepaalde kamers verschijnen."].join("\n\n") },
    { id: "update", category: "update", title: "Meer clubgevoel. Tussen de potjes door.", summary: "Ontdek het nieuwe prikbord van je kamer.", published: true, body: ["Een rustig grid brengt toernooien, nieuws en community bij elkaar, met de belangrijkste aankondiging bovenaan.", "De toernooikaarten gebruiken de bestaande demotoernooien. De weekchallenge sluit aan op je oefenbord en telt je eigen geraakte dubbels mee. Via de filters kies je wat je wilt bekijken.", "Platformbeheerders kunnen de inhoud nu centraal inrichten, een concept bekijken en publiceren. Widgets kunnen voor alle kamers gelden of voor een selectie. De nieuwsberichten, communitymomenten en stemmen blijven voorbeeldinhoud in deze browser."].join("\n\n") },
    { id: "welcome", category: "guide", title: "Je eerste avond aan de oche.", summary: "Geen haast. Begin met vijf oefenpijlen.", published: true, body: ["Voor het eerst in DartsPoint? In de oefenruimte leer je op je eigen tempo hoe je richt en gooit. Je hoeft geen tegenstander te laten wachten.", "Daarna kun je in de kamer een speler uitdagen. Kies samen een spelvorm, spreek het aantal legs af en speel je eerste potje. Je vindt de spelerslijst altijd naast het clubhuis op desktop.", "Een gemiste dubbel hoort erbij. Een ‘lekker gegooid’ ook. Houd het sportief, verwelkom nieuwe spelers en maak er samen een gezellige avond van."].join("\n\n"), ctaLabel: "Begin met vijf oefenpijlen", ctaHref: "/oefenen?les=1" },
  ];
  const widgets = kinds.map(type => ({ ...createLobbyWidget(type), id: `lobby-${type}` }));
  widgets.find(widget => widget.type === "news")!.settings.articleIds = articles.map(article => article.id);
  return { headline: "Goed dat je er bent.", eyebrow: "JOUW KAMER. JOUW CLUB.", widgets, articles };
}
const seed = seedLayout();
const initial: LobbyContentState = freeze({ schemaVersion: 2, draft: clone(seed), published: clone(seed), revision: 1, savedAt: null, publishedAt: null, audit: [] });
let snapshot = initial;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function text(value: unknown, limit: number, label: string, required = false): asserts value is string {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new Error(`${label}: ${required ? "vul tekst in van" : "gebruik"} maximaal ${limit} tekens.`);
}
function uniqueIds(values: { id: string }[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || typeof value.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value.id) || seen.has(value.id)) throw new Error(`${label}: gebruik unieke, geldige id's.`);
    seen.add(value.id);
  }
}
/** Only same-site paths are accepted; encoded network paths and backslashes are rejected too. */
export function safeLobbyHref(value: string | undefined, fallback = ""): string {
  if (!value) return fallback;
  try {
    let decoded = value;
    for (let pass = 0; pass < 3; pass++) {
      if (!/^\/(?!\/)/.test(decoded) || /[\\\s\u0000-\u001f\u007f]/.test(decoded)) return fallback;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    return /^\/(?!\/)/.test(decoded) && !/[\\\s\u0000-\u001f\u007f]/.test(decoded) ? value : fallback;
  } catch { return fallback; }
}
function link(value: unknown, label: string) {
  if (value === undefined || value === "") return;
  text(value, 500, label);
  if (!safeLobbyHref(value)) throw new Error(`${label}: gebruik een intern pad, bijvoorbeeld /oefenen of /divisies.`);
}
function strings(value: unknown, limit: number, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== "string" || item.length > 160)) throw new Error(`${label}: gebruik maximaal ${limit} korte tekstwaarden.`);
}
function validate(layout: LobbyLayout, publishing: boolean) {
  if (!layout || typeof layout !== "object") throw new Error("De lobby-inrichting ontbreekt.");
  text(layout.headline, 100, "Welkomsttitel", publishing); text(layout.eyebrow, 80, "Boventitel");
  if (!Array.isArray(layout.widgets) || layout.widgets.length > 30) throw new Error("Gebruik maximaal 30 widgets.");
  if (!Array.isArray(layout.articles) || layout.articles.length > 60) throw new Error("Gebruik maximaal 60 nieuwsberichten.");
  uniqueIds(layout.widgets, "Widgets"); uniqueIds(layout.articles, "Nieuwsberichten");
  const articleIds = new Set(layout.articles.map(article => article.id));
  for (const article of layout.articles) {
    if (!["news", "update", "guide"].includes(article.category) || typeof article.published !== "boolean") throw new Error("Kies een geldige berichtsoort en publicatiestatus.");
    const required = publishing && article.published;
    text(article.title, 140, "Berichttitel", required); text(article.summary, 400, "Berichtintro", required); text(article.body, 12000, "Berichtinhoud", required);
    if (article.ctaLabel !== undefined) text(article.ctaLabel, 60, "Linktekst");
    link(article.ctaHref, "Berichtlink");
  }
  for (const widget of layout.widgets) {
    if (!kinds.includes(widget.type) || typeof widget.enabled !== "boolean" || !["half", "wide"].includes(widget.size)) throw new Error("Kies een geldig widgettype, formaat en zichtbaarheid.");
    const required = publishing && widget.enabled;
    text(widget.title, 140, `${LOBBY_WIDGET_LABELS[widget.type]}: titel`, required && widget.type !== "tournament"); text(widget.description, 800, "Widgettekst");
    if (!widget.audience || !["all", "rooms"].includes(widget.audience.mode)) throw new Error("Kies alle kamers of een kamerselectie.");
    strings(widget.audience.roomIds, 100, "Kamerselectie");
    if (widget.audience.roomIds.some(roomId => !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(roomId)) || new Set(widget.audience.roomIds).size !== widget.audience.roomIds.length) throw new Error("Kies kamers met unieke, geldige kamer-id's.");
    if (required && widget.audience.mode === "rooms" && !widget.audience.roomIds.length) throw new Error(`${widget.title}: selecteer minimaal één kamer.`);
    const settings = widget.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("De widgetinstellingen ontbreken.");
    if (settings.releaseLimit !== undefined && (!Number.isInteger(settings.releaseLimit) || settings.releaseLimit < 1 || settings.releaseLimit > 5)) throw new Error("Toon één tot vijf toevoegingen in de widget.");
    if (settings.allowIdeas !== undefined && typeof settings.allowIdeas !== "boolean") throw new Error("Kies of de knop voor ideeën zichtbaar is.");
    if (settings.tournamentImageMode !== undefined && !["inherit", "custom", "none"].includes(settings.tournamentImageMode)) throw new Error("Kies de toernooiafbeelding, een eigen afbeelding of geen afbeelding.");
    if (settings.heroImage !== undefined) validateHeroImage(settings.heroImage);
    if (required && widget.type === "tournament" && settings.tournamentImageMode === "custom" && !settings.heroImage?.src) throw new Error("Kies een afbeelding voor de eigen toernooihero, of kies overnemen / geen afbeelding.");
    if (settings.announcementSource !== undefined && !["platform", "custom"].includes(settings.announcementSource)) throw new Error("Kies platformbericht of eigen aankondiging.");
    for (const key of ["tournamentId", "playerName", "score", "scoreLabel", "ctaLabel"] as const) if (settings[key] !== undefined) text(settings[key], key === "tournamentId" ? 160 : 80, "Widgetinstelling");
    link(settings.ctaHref, "Widgetlink");
    if (settings.seedApplause !== undefined && (!Number.isInteger(settings.seedApplause) || settings.seedApplause < 0 || settings.seedApplause > 1000000)) throw new Error("Voorbeeldapplaus: kies een heel getal van 0 tot 1.000.000.");
    if (settings.articleIds !== undefined) {
      strings(settings.articleIds, 20, "Gekoppelde berichten");
      if (new Set(settings.articleIds).size !== settings.articleIds.length || settings.articleIds.some(articleId => !articleIds.has(articleId))) throw new Error("Koppel ieder bestaand bericht maximaal één keer aan een widget.");
    }
    if (settings.pollOptions !== undefined) strings(settings.pollOptions, 5, "Pollopties");
    if (settings.pollVotes !== undefined && (!Array.isArray(settings.pollVotes) || settings.pollVotes.length > 5 || settings.pollVotes.some(value => !Number.isInteger(value) || value < 0 || value > 1000000))) throw new Error("Pollstemmen: gebruik positieve gehele aantallen, of nul.");
    if (required && widget.type === "poll") {
      const options = settings.pollOptions ?? [];
      if (options.length < 2 || options.some(option => !option.trim()) || new Set(options.map(option => option.trim().toLocaleLowerCase("nl-NL"))).size !== options.length) throw new Error(`${widget.title}: vul twee tot vijf verschillende pollopties in.`);
      if (settings.pollVotes && settings.pollVotes.length !== options.length) throw new Error("Gebruik één voorbeeldaantal stemmen per polloptie.");
    }
    if (required && widget.type === "announcement" && !widget.description.trim() && settings.announcementSource !== "platform") throw new Error("Vul de tekst van je eigen aankondiging in.");
    if (required && widget.type === "moment" && !settings.playerName?.trim()) throw new Error("Kies de speler van het communitymoment.");
  }
}
export function validateLobbyLayout(layout: LobbyLayout): void { validate(layout, true); }
export function visibleLobbyWidgets(layout: LobbyLayout, roomId?: string): LobbyWidget[] {
  return layout.widgets.filter(widget => widget.enabled && (widget.audience.mode === "all" || (!!roomId && widget.audience.roomIds.includes(roomId))));
}

/** Introduce the release widget once, keeping saved drafts, scopes and ordering intact. */
function addReleaseWidget(layout: LobbyLayout): LobbyLayout {
  if (layout.widgets.some(widget => widget.type === "releases") || layout.widgets.length >= 30) return layout;
  const widget = createLobbyWidget("releases");
  let suffix = 0;
  while (layout.widgets.some(value => value.id === `lobby-releases${suffix ? `-${suffix}` : ""}`)) suffix++;
  widget.id = `lobby-releases${suffix ? `-${suffix}` : ""}`;
  const widgets = [...layout.widgets];
  widgets.splice(Math.max(0, widgets.findIndex(value => value.type === "tournament") + 1), 0, widget);
  return { ...layout, widgets };
}
function parseState(raw: string | null): LobbyContentState {
  if (!raw) return initial;
  if (raw.length > 2000000) throw new Error("Opgeslagen lobby-inhoud is te groot.");
  const data = JSON.parse(raw) as LobbyContentState;
  validate(data.draft, false); validateLobbyLayout(data.published);
  if (!Number.isInteger(data.revision) || data.revision < 1 || data.revision > Number.MAX_SAFE_INTEGER || ![data.savedAt, data.publishedAt].every(value => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)) || !Array.isArray(data.audit)) throw new Error("De opgeslagen lobbyversie is ongeldig.");
  if (data.schemaVersion !== 2) { data.draft = addReleaseWidget(data.draft); data.published = addReleaseWidget(data.published); }
  const audit = data.audit.filter(entry => entry && typeof entry.id === "string" && typeof entry.at === "number" && Number.isFinite(entry.at) && [entry.actor, entry.action, entry.subject, entry.detail].every(value => typeof value === "string" && value.length <= 500)).slice(0, 250);
  return freeze({ schemaVersion: 2, draft: clone(data.draft), published: clone(data.published), revision: data.revision, savedAt: data.savedAt, publishedAt: data.publishedAt, audit });
}
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try { snapshot = parseState(localStorage.getItem(KEY)); } catch { snapshot = initial; }
  window.addEventListener?.("storage", event => {
    if (event.key !== KEY && event.key !== null) return;
    try { snapshot = parseState(event.key === null ? null : event.newValue); emit(); } catch { /* Keep the last valid version if another tab writes corrupt content. */ }
  });
  emit();
}
function persist(next: LobbyContentState) {
  // Commit only after the value fits storage, so the UI never reports a saved change that was lost.
  const serialized = JSON.stringify(next);
  if (serialized.length > 2000000) throw new Error("De lobby met afbeeldingen is te groot om lokaal op te slaan. Verklein of verwijder een afbeelding.");
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, serialized); }
    catch { throw new Error("Opslaan lukt niet in deze browser. Sta lokale opslag toe en probeer opnieuw."); }
  }
  snapshot = freeze(next); emit();
}
export function getLobbyContent(): LobbyContentState { hydrate(); return snapshot; }
export function useLobbyContent(): LobbyContentState {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => initial);
  useEffect(hydrate, []);
  return state;
}
export function saveLobbyDraft(layout: LobbyLayout): LobbyResult {
  hydrate();
  try {
    validate(layout, false);
    if (JSON.stringify(layout) === JSON.stringify(snapshot.draft)) return { ok: true };
    const now = Date.now();
    const entry: AdminAuditEntry = { id: id("lobby-audit"), at: now, actor: "Nick", action: "Lobbyconcept opgeslagen", subject: "Lobby-inrichting", detail: `${layout.widgets.length} widgets en ${layout.articles.length} berichten in het concept. De gepubliceerde lobby blijft gelijk.` };
    persist({ ...snapshot, draft: clone(layout), savedAt: now, audit: [entry, ...snapshot.audit].slice(0, 250) });
    return { ok: true };
  }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Het concept kon niet worden opgeslagen." }; }
}
export function publishLobbyLayout(layout: LobbyLayout): LobbyResult {
  hydrate();
  try {
    validateLobbyLayout(layout);
    const now = Date.now(); const revision = snapshot.revision + 1;
    const enabled = layout.widgets.filter(widget => widget.enabled);
    const entry: AdminAuditEntry = { id: id("lobby-audit"), at: now, actor: "Nick", action: "Lobby gepubliceerd", subject: `Lobby · versie ${revision}`, detail: `${enabled.length} zichtbare widgets, waarvan ${enabled.filter(widget => widget.audience.mode === "rooms").length} voor geselecteerde kamers. ${layout.articles.filter(article => article.published).length} gepubliceerde berichten.` };
    persist({ schemaVersion: 2, draft: clone(layout), published: clone(layout), revision, savedAt: now, publishedAt: now, audit: [entry, ...snapshot.audit].slice(0, 250) });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "De lobby kon niet worden gepubliceerd." }; }
}
