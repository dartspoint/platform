"use client";
import {formatAudit,dedupeAudit,type AuditRecord} from "../../../../packages/game-core/src/audit-presentation";
import {getPlatform,selfName} from "@/lib/platform-client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, ClipboardList, Clock3, Download, Flag, Gamepad2, LayoutDashboard, ListChecks, Menu, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Target, Trophy, Users, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminSeasons } from "./darts-seasons";
import {AdminChatModeration} from './darts-chat-moderation';
import { DartsTournaments } from "./darts-tournaments";
import { AdminPlayers, AdminRooms, AdminModeration } from "./darts-operations";
import { AdminGameSettings, AdminPlatformSettings, AdminEloSettings } from "./darts-settings";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import { useAdminSettings } from "@/lib/darts-admin-settings";
import { useDivisionSeasons } from "@/lib/darts-divisions-store";
import { useTournaments } from "@/lib/darts-tournament-store";
import { useDartsPreferences } from "@/lib/darts-preferences";
import type { Tournament } from "@/lib/darts-tournament-model";
import "./darts-admin.css";

const navigation = [
  { id: "overview", label: "Overzicht", icon: LayoutDashboard, group: "DE CLUB" },
  { id: "tournaments", label: "Toernooien", icon: Trophy },
  { id: "seasons", label: "Seizoenen & divisies", icon: ListChecks },
  { id: "players", label: "Spelers & rollen", icon: Users },
  { id: "rooms", label: "Kamers", icon: Gamepad2 },
  { id: "moderation", label: "Moderatie", icon: ShieldCheck },
  { id: "chat-moderation", label: "Chat & moderatie", icon: ShieldCheck },
  { id: "game", label: "Spel & deelname", icon: SlidersHorizontal, group: "HET PLATFORM" },
  { id: "elo", label: "DP & competitie", icon: Target },
  { id: "platform", label: "Platforminstellingen", icon: Settings2 },
  { id: "audit", label: "Actielogboek", icon: ClipboardList },
] as const;
type AdminTab = typeof navigation[number]["id"];
type AuditEntry = AuditRecord;
const titles: Record<AdminTab, { title: string; description: string }> = {
  overview: { title: "Jouw club. Jouw regie.", description: "Van een volle kamer tot de laatste dubbel. Alles wat jouw community laat draaien." },
  tournaments: { title: "Een avond om voor te spelen.", description: "Organiseer toernooien, deel het veld in en begeleid iedere ronde tot de finale." },
  seasons: { title: "Een seizoen om te groeien.", description: "Beheer de divisiespelvorm: indeling, speelrondes, de ladder en promotie of degradatie." },
  players: { title: "De mensen achter de pijlen.", description: "Een helder overzicht van spelers, rollen en accountmaatregelen." },
  rooms: { title: "Een plek voor iedereen.", description: "Richt kamers in, bepaal de toegang en bewaak de bezetting." },
  moderation: { title: "Houd de club prettig.", description: "Behandel meldingen met context, een passende maatregel en een duidelijke reden." },
  'chat-moderation': {title:'Chat & moderatie',description:'Beheer woorden, uitzonderingen, chatlimieten en verplichte naamwijzigingen.'},
  game: { title: "Jouw spelregels.", description: "Stel de basis in voor nieuwe toernooien en bepaal wie mag deelnemen." },
  elo: { title: "Een eerlijke plek op de ladder.", description: "Bekijk het actieve DP-beleid en reken een nieuw beleidsvoorstel door." },
  platform: { title: "DartsPoint, zoals jij het wilt.", description: "Beheer platformvoorkeuren, aankondigingen en de toegang tot jouw community." },
  audit: { title: "Iedere wijziging, inzichtelijk.", description: "Wie deed wat, wanneer en waarom? Volg je beheerhandelingen terug." },
};
function validTab(value?: string): AdminTab { return navigation.some(item => item.id === value) ? value as AdminTab : "overview"; }
function formatTime(at: number) { return new Date(at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function tournamentTime(tournament: Tournament) { const value = tournament.settings.startsAt; return value ? formatTime(Date.parse(value)) : "Startmoment nog te bepalen"; }
const statuses = { draft: "Concept", registration: "Inschrijving", checkin: "Check-in", live: "Wordt gespeeld", completed: "Afgerond", cancelled: "Geannuleerd" };

function AuditPreview({ entries }: { entries: AuditEntry[] }) {
  return <div className="adm-audit-list">{entries.length ? entries.map(entry => <div key={entry.id}><span><Check size={12}/></span><div><strong>{formatAudit(entry).summary}</strong><p>{formatAudit(entry).subject}{formatAudit(entry).change&&" · "+formatAudit(entry).change}</p></div><small>{formatTime(entry.at)}</small></div>) : <p className="adm-audit-empty">Je eerste beheeractie verschijnt hier. Wijzig bijvoorbeeld een kamer of maak een toernooi aan.</p>}</div>;
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
  const filtered = entries.filter(entry => entry.at >= cutoff && `${entry.action} ${entry.subject} ${entry.actor} ${entry.detail}`.toLowerCase().includes(query.toLowerCase()));
  function download() {
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + [["Datum", "Beheerder", "Actie", "Onderwerp", "Toelichting"], ...filtered.map(entry => [formatAudit(entry).localTime, formatAudit(entry).actor, formatAudit(entry).action, formatAudit(entry).subject, formatAudit(entry).change])].map(row => row.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "dartspoint-actielogboek.csv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><div className="adm-toolbar"><label className="adm-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek een actie, speler of toernooi…" aria-label="Doorzoek actielogboek"/></label><select className="adm-filter-select" value={period} onChange={event => setPeriod(event.target.value)} aria-label="Periode"><option value="all">Alle periodes</option><option value="1">Afgelopen 24 uur</option><option value="7">Afgelopen 7 dagen</option><option value="30">Afgelopen 30 dagen</option></select><button className="adm-btn" disabled={!filtered.length} onClick={download}><Download size={15}/>Exporteer CSV</button></div><div className="adm-panel adm-table-wrap"><table className="adm-table"><thead><tr><th>Datum</th><th>Beheerder</th><th>Actie</th><th>Onderwerp & toelichting</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.id}><td className="adm-no-wrap">{formatTime(entry.at)}</td><td>{entry.actor}</td><td>{formatAudit(entry).action}</td><td>{formatAudit(entry).subject}<small>{formatAudit(entry).change}</small><details><summary>Technische details</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(formatAudit(entry).technical,null,2)}</pre></details></td></tr>)}{!filtered.length && <tr><td colSpan={4}>Nog geen acties gevonden voor deze selectie.</td></tr>}</tbody></table></div><p className="adm-audit-meta">{filtered.length} van {entries.length} acties · duurzaam opgeslagen op de server. Een export bevat alleen de huidige selectie.</p></>;
}

export function DartsAdmin({ initialTab, initialTournamentId }: { initialTab?: string; initialTournamentId?: string }) {
  const [tab, setTab] = useState<AdminTab>(validTab(initialTab));
  const [tournamentId, setTournamentId] = useState(initialTournamentId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);
  const menuWasOpen = useRef(false);
  const operations = useAdminOperations();
  const settings = useAdminSettings();
  const tournamentState = useTournaments();
  const divisionState = useDivisionSeasons();
  const preferences = useDartsPreferences();
  const audit = useMemo(() => dedupeAudit(operations.audit).sort((a,b)=>b.at-a.at),[operations.audit]);
  const openCases = operations.cases.filter(item => item.status !== "resolved").length;
  const activeTournaments = tournamentState.tournaments.filter(item => ["registration", "checkin", "live"].includes(item.status));
  const featured = activeTournaments.find(item => item.status === "live") || activeTournaments[0];
  const activeRooms = operations.rooms.filter(room => room.status !== "closed");
  const capacity = activeRooms.reduce((sum, room) => sum + room.capacity, 0);
  const population = activeRooms.reduce((sum, room) => sum + room.count, 0);
  function navigate(next: AdminTab, id?: string) {
    setTab(next); setTournamentId(id); setMenuOpen(false); setSearchOpen(false); setSearch("");
    const params = new URLSearchParams(); if (next !== "overview") params.set("tab", next); if (id) params.set("toernooi", id);
    window.history.replaceState(null, "", `/beheer${params.size ? `?${params}` : ""}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    const query = window.matchMedia("(max-width: 950px)");
    const update = () => { setMobile(query.matches); if (!query.matches) setMenuOpen(false); };
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(value => !value); } if (event.key === "Escape") setMenuOpen(false); }
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => { if (!menuOpen) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [menuOpen]);
  useEffect(() => { if (menuOpen) menuClose.current?.focus(); else if (menuWasOpen.current) menuTrigger.current?.focus(); menuWasOpen.current = menuOpen; }, [menuOpen]);
  const selected = navigation.find(item => item.id === tab)!;
  return <MotionConfig reducedMotion={preferences.lessMotion ? "always" : "user"}><div className="dp-admin">
    <aside className={`adm-sidebar ${menuOpen ? "open" : ""}`} aria-label="Platformbeheer" inert={mobile && !menuOpen}><a className="adm-sidebar-brand" href="/beheer" aria-label="Beheeroverzicht"><Brand/></a><button ref={menuClose} className="adm-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Navigatie sluiten"><X size={17}/></button><span className="adm-owner-label"><ShieldCheck size={11}/> EIGENAREN · BACKOFFICE</span><nav>{navigation.map(item => <div key={item.id} style={{ display: "contents" }}>{"group" in item && <span className="adm-nav-label">{item.group}</span>}<button className={tab === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={tab === item.id ? "page" : undefined}><item.icon size={17}/><span>{item.label}</span>{item.id === "moderation" && openCases > 0 && <b>{openCases}</b>}</button></div>)}</nav><div className="adm-sidebar-footer"><a href="/lobby"><ArrowLeft size={15}/>Terug naar de club<ArrowUpRight size={13}/></a><div className="adm-owner-card"><span>N</span><div><strong>{selfName()}</strong><small>{getPlatform().actor?.role==="owner"?"Platformeigenaar":"Platformbeheerder"}</small></div></div></div></aside>
    <button className="adm-scrim" onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1} aria-label="Navigatie sluiten"/>
    <div className="adm-workspace" inert={mobile && menuOpen}><header className="adm-topbar"><button ref={menuTrigger} className="adm-menu-button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label="Beheermenu openen"><Menu size={18}/></button><div className="adm-breadcrumb"><ShieldCheck size={15}/><strong>Platformbeheer</strong></div><div className="adm-top-actions"><button className="adm-search-button" onClick={() => setSearchOpen(true)} aria-label="Zoek een beheeronderdeel"><Search size={14}/><span>Zoek onderdeel</span><kbd>⌘ K</kbd></button><span className="adm-prototype-pill">DARTSPOINT</span></div></header>
      <main className="adm-content"><div className="adm-page-title"><h1 ref={headingRef} tabIndex={-1}>{selected.label}</h1>{tab === "overview" && <button className="adm-btn adm-btn-primary" onClick={() => navigate("tournaments")}><Trophy size={16}/>Organiseer een toernooi<ArrowUpRight size={15}/></button>}</div>
      {tab === "overview" ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
        <div className="adm-kpis"><button className="adm-panel adm-kpi" onClick={() => navigate("players")}><Users/><span>Spelers in je community</span><strong>{operations.members.length}</strong><small><b>{operations.members.filter(member => member.role === "vip").length} VIP’s</b> · spelersbestand</small></button><button className="adm-panel adm-kpi" onClick={() => navigate("rooms")}><Gamepad2/><span>Actieve kamers</span><strong>{activeRooms.length}<span style={{ fontSize: 22, color: "#62816c" }}> / {operations.rooms.length}</span></strong><small>{population} van {capacity} plekken bezet</small></button><button className="adm-panel adm-kpi" onClick={() => navigate("tournaments")}><Trophy/><span>Toernooien op de agenda</span><strong>{activeTournaments.length}</strong><small><b>{activeTournaments.filter(item => item.status === "live").length} wordt gespeeld</b> · rest in voorbereiding</small></button><button className={`adm-panel adm-kpi ${openCases ? "action" : ""}`} onClick={() => navigate("moderation")}><Flag/><span>Meldingen met opvolging</span><strong>{openCases.toString().padStart(2, "0")}</strong><small>{openCases ? "Klaar om te beoordelen" : "Alles is afgehandeld"}</small></button></div>
        <div className="adm-dashboard-grid"><div className="adm-dashboard-main">
          <section className="adm-panel adm-feature-card"><Trophy className="adm-watermark"/><span className="adm-eyebrow">{featured ? statuses[featured.status].toUpperCase() : "DE VOLGENDE AVOND BEGINT HIER"}</span><h2>{featured?.name || "Van eerste inschrijving tot de laatste dubbel."}</h2><p>{featured?.description || "Stel je spelregels in, nodig deelnemers uit en laat het bracket het werk doen."}</p><div className="adm-feature-meta"><span><Clock3 size={13}/>{featured ? tournamentTime(featured) : "Plan jouw moment"}</span><span><Users size={13}/>{featured ? `${featured.participants.filter(p => p.status !== "withdrawn" && p.status !== "waiting").length} / ${featured.settings.maxPlayers} deelnemers` : "4 tot 64 deelnemers"}</span><span><Target size={13}/>{featured?.settings.startScore || 501} · {featured?.settings.format === "double-elimination" ? "Dubbele eliminatie" : "Knock-out"}</span></div><div className="adm-feature-footer"><span>{featured?.matches.length ? `${featured.matches.filter(match => match.status === "completed" && match.result?.kind !== "bye").length} wedstrijden afgerond` : "Vanuit één overzicht georganiseerd"}</span><button className="adm-btn" onClick={() => navigate("tournaments", featured?.id)}>Open het toernooi<ArrowUpRight size={15}/></button></div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><div><h2>Kameroverzicht</h2></div><button className="adm-text-btn" onClick={() => navigate("rooms")}>Beheer<ArrowRight size={13}/></button></div><div className="adm-room-bars">{operations.rooms.slice(0,6).map(room => <div key={room.id} className={room.status === "closed" ? "closed" : ""}><div><span>{room.name}{room.status === "closed" ? " · gesloten" : room.status === "private" ? " · privé" : ""}</span><small>{room.count} / {room.capacity}</small></div><i><span className={room.count / room.capacity > .9 ? "full" : ""} style={{ width: `${Math.min(100,room.count / room.capacity * 100)}%` }}/></i></div>)}</div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><div><h2>Recente acties</h2></div><button className="adm-text-btn" onClick={() => navigate("audit")}>Alles<ArrowRight size={13}/></button></div><AuditPreview entries={audit.slice(0,4)}/></section>
        </div><div className="adm-dashboard-side">
          <section className="adm-panel"><div className="adm-panel-heading"><h2>Snel geregeld</h2><Sparkles size={16} color="#b2bf94"/></div><div className="adm-quick-actions"><button onClick={() => navigate("tournaments")}><Trophy/><strong>Toernooi organiseren</strong><small>Inschrijven, plaatsen, spelen</small></button><button onClick={() => navigate("seasons")}><ListChecks/><strong>Seizoen organiseren</strong><small>Divisies, ladder en speelrondes</small></button><button onClick={() => navigate("platform")}><Bell/><strong>Aankondiging</strong><small>Zichtbaar in de lobby</small></button><button onClick={() => navigate("game")}><ListChecks/><strong>Deelname instellen</strong><small>DP, check-in en toelating</small></button></div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><h2>Dit verdient aandacht</h2><Activity size={16} color="#d6aa83"/></div><div className="adm-notes"><button onClick={() => navigate("moderation")}><Flag size={16}/><div><strong>{openCases ? `${openCases} melding${openCases === 1 ? "" : "en"} open` : "Een rustige community"}</strong><p>Bekijk de context voordat je een maatregel neemt.</p></div></button><button onClick={() => navigate("tournaments")}><ClipboardList size={16}/><div><strong>{tournamentState.tournaments.filter(item => item.status === "draft").length} toernooiconcepten</strong><p>Controleer spelregels en deelname voordat je publiceert.</p></div></button><button onClick={() => navigate("elo")}><Target size={16}/><div><strong>DP-beleid: K = 32</strong><p>10 wedstrijden en 5 verschillende tegenstanders voor plaatsing.</p></div></button></div></section>

        </div></div>
      </motion.div> : tab === "tournaments" ? <DartsTournaments key={tournamentId || "all"} initialTournamentId={tournamentId}/> : tab === "seasons" ? <AdminSeasons/> : tab === "players" ? <AdminPlayers/> : tab === "rooms" ? <AdminRooms/> : tab === "chat-moderation" ? <AdminChatModeration/> : tab === "moderation" ? <AdminModeration/> : tab === "game" ? <AdminGameSettings/> : tab === "elo" ? <AdminEloSettings/> : tab === "platform" ? <AdminPlatformSettings/> : <AuditPanel entries={audit}/>}
      <footer className="adm-page-footer"><span>DARTSPOINT · OWNER BACKOFFICE</span><span>Beheerhandelingen worden op de server gecontroleerd en vastgelegd.</span></footer>
      </main>
    </div>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="adm-command-dialog"><DialogHeader><DialogTitle>Waar wil je naartoe?</DialogTitle><DialogDescription>Zoek een onderdeel van platformbeheer.</DialogDescription></DialogHeader><label className="adm-search adm-command-search"><Search size={17}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Bijvoorbeeld toernooien of spelregels" aria-label="Zoek beheeronderdeel"/></label><div className="adm-command-items">{navigation.filter(item => `${item.label} ${titles[item.id].title} ${titles[item.id].description}`.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} onClick={() => navigate(item.id)}><item.icon size={17}/>{item.label}<ArrowRight size={14}/></button>)}</div></DialogContent></Dialog>
  </div></MotionConfig>;
}
