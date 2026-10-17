"use client";
import {browserLocale} from '../../../../packages/i18n/src/errors';
import {formatLocales} from '../../../../packages/i18n/src/locale';

import {localiseStaticCopy} from "../../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {formatAudit,dedupeAudit,type AuditRecord} from "../../../../packages/game-core/src/audit-presentation";
import {getPlatform,selfName} from "@/lib/platform-client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, ClipboardList, Clock3, Download, Flag, Gamepad2, LayoutGrid, LayoutDashboard, ListChecks, Menu, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Target, Trophy, Users, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {DartsLegal} from "./darts-legal";
import {useSupportIdentity} from "@/components/darts-support-links";
import { AdminSeasons } from "./darts-seasons";
import {AdminChatModeration} from './darts-chat-moderation';
import { AdminLobbyContent } from "./darts-lobby-content";
import { AdminReleases } from "./darts-releases";
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
  { id: "lobby", label: "Lobby & widgets", icon: LayoutGrid },
  { id: "releases", label: "Releasebeheer", icon: LayoutGrid },
  { id: "platform", label: "Platforminstellingen", icon: Settings2 },
  { id: "legal", label: "Juridisch en informatie", icon: ClipboardList },
  { id: "support", label: "Supporttickets", icon: Bell },
  { id: "teamroles", label: "Gebruikers en teamrollen", icon: Users },
  { id: "audit", label: "Actielogboek", icon: ClipboardList },
] as const;
const navigationStaticSource = navigation;
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
  lobby: { title: "Een clubhuis met karakter.", description: "Beheer lobbywidgets, nieuws, kamerselecties en gedeelde publicaties." },
  releases: { title: "Samen maken we DartsPoint beter.", description: "Van idee naar toevoeging. Beoordeel voorstellen, volg de uitvoering en deel wat nieuw is in de lobby." },
  platform: { title: "DartsPoint, zoals jij het wilt.", description: "Beheer platformvoorkeuren, aankondigingen en de toegang tot jouw community." },
  legal: {title:"Duidelijke afspraken voor de club.",description:"Beheer de openbare documenten, versies en contactgegevens."},
  support: {title:"Help spelers verder.",description:"Open de afgeschermde supportomgeving."},
  teamroles: {title:"De juiste toegang voor het team.",description:"Ken ticketrollen toe zonder spel- of beheerrechten te verruimen."},
  audit: { title: "Iedere wijziging, inzichtelijk.", description: "Wie deed wat, wanneer en waarom? Volg je beheerhandelingen terug." },
};
const titlesStaticSource = titles;
function validTab(value?: string): AdminTab { return navigation.some(item => item.id === value) ? value as AdminTab : "overview"; }
function formatTime(at: number) { return new Date(at).toLocaleString(formatLocales[browserLocale()], { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function tournamentTime(tournament: Tournament) { const value = tournament.settings.startsAt; return value ? formatTime(Date.parse(value)) : "Startmoment nog te bepalen"; }
const statuses = { draft: "Concept", registration: "Inschrijving", checkin: "Check-in", live: "Wordt gespeeld", completed: "Afgerond", cancelled: "Geannuleerd" };

function AuditPreview({ entries }: { entries: AuditEntry[] }) {
 const dpT = useI18n("admin").t;

  return <div className="adm-audit-list">{entries.length ? entries.map(entry => <div key={entry.id}><span><Check size={12}/></span><div><strong>{formatAudit(entry).summary}</strong><p>{formatAudit(entry).subject}{formatAudit(entry).change&&" · "+formatAudit(entry).change}</p></div><small>{formatTime(entry.at)}</small></div>) : <p className="adm-audit-empty">{dpT("admin.je_eerste_beheeractie_verschijnt_hier_wijzig_bijvoorbeeld_een")}</p>}</div>;
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
 const dpT = useI18n("admin").t;

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
  return <><div className="adm-toolbar"><label className="adm-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={dpT("admin.zoek_een_actie_speler_of_toernooi")} aria-label={dpT("admin.doorzoek_actielogboek")}/></label><select className="adm-filter-select" value={period} onChange={event => setPeriod(event.target.value)} aria-label={dpT("admin.periode")}><option value="all">{dpT("admin.alle_periodes")}</option><option value="1">{dpT("admin.afgelopen_24_uur")}</option><option value="7">{dpT("admin.afgelopen_7_dagen")}</option><option value="30">{dpT("admin.afgelopen_30_dagen")}</option></select><button className="adm-btn" disabled={!filtered.length} onClick={download}><Download size={15}/>{dpT("admin.exporteer_csv")}</button></div><div className="adm-panel adm-table-wrap"><table className="adm-table"><thead><tr><th>{dpT("admin.datum")}</th><th>{dpT("admin.beheerder")}</th><th>{dpT("admin.actie")}</th><th>{dpT("admin.onderwerp_toelichting")}</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.id}><td className="adm-no-wrap">{formatTime(entry.at)}</td><td>{entry.actor}</td><td>{formatAudit(entry).action}</td><td>{formatAudit(entry).subject}<small>{formatAudit(entry).change}</small><details><summary>{dpT("admin.technische_details")}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(formatAudit(entry).technical,null,2)}</pre></details></td></tr>)}{!filtered.length && <tr><td colSpan={4}>{dpT("admin.nog_geen_acties_gevonden_voor_deze_selectie")}</td></tr>}</tbody></table></div><p className="adm-audit-meta">{filtered.length} {dpT("admin.van")} {entries.length} {dpT("admin.acties_je_export_bevat_alleen_de_huidige_selectie")}</p></>;
}

export function DartsAdmin({ initialTab, initialTournamentId, initialRoomId, initialWidgetType }: { initialTab?: string; initialTournamentId?: string; initialRoomId?: string; initialWidgetType?: string }) {
 const dpT = useI18n("admin").t;

 const titles=localiseStaticCopy(titlesStaticSource,dpT,dpStaticCopyKeys);

 const navigation=localiseStaticCopy(navigationStaticSource,dpT,dpStaticCopyKeys);



  const [tab, setTab] = useState<AdminTab>(validTab(initialTab));
  const [tournamentId, setTournamentId] = useState(initialTournamentId);
  const [lobbyWidgetType, setLobbyWidgetType] = useState<"releases" | undefined>(initialWidgetType === "releases" ? "releases" : undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);
  const menuWasOpen = useRef(false);
  const navigationGuard = useRef<(() => Promise<boolean>) | null>(null);
  const navigating = useRef(false);
  const registerNavigationGuard = useCallback((guard: (() => Promise<boolean>) | null) => { navigationGuard.current = guard; }, []);
  const supportIdentity=useSupportIdentity();
  const visibleNavigation = navigation.filter(item => (item.id !== "lobby" || getPlatform().actor?.role === "owner") && (item.id !== "releases" || ["owner", "admin"].includes(getPlatform().actor?.role)) && (item.id!=="teamroles"||supportIdentity?.canManageTeam));
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
  async function navigate(next: AdminTab, id?: string, widgetType?: "releases") {
    if (navigating.current) return;
    navigating.current = true;
    try { if (navigationGuard.current && !await navigationGuard.current()) return;
    navigationGuard.current = null;
    if(next==="support"||next==="teamroles"){window.location.assign("/team/support"+(next==="teamroles"?"?view=team":""));return;}
    setTab(next); setTournamentId(id); setLobbyWidgetType(next === "lobby" ? widgetType : undefined); setMenuOpen(false); setSearchOpen(false); setSearch("");
    const params = new URLSearchParams(); if (next !== "overview") params.set("tab", next); if (id) params.set("toernooi", id); if (next === "lobby" && widgetType) params.set("widget", widgetType);
    window.history.replaceState(null, "", `/beheer${params.size ? `?${params}` : ""}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    } finally { navigating.current = false; }
  }
  useEffect(()=>{if(tab==="support"||tab==="teamroles")void navigate(tab);},[tab]);
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
    <aside className={`adm-sidebar ${menuOpen ? "open" : ""}`} aria-label={dpT("admin.platformbeheer")} inert={mobile && !menuOpen}><a className="adm-sidebar-brand" href="/beheer" aria-label={dpT("admin.beheeroverzicht")} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void navigate("overview"); }}><Brand/></a><button ref={menuClose} className="adm-sidebar-close" onClick={() => setMenuOpen(false)} aria-label={dpT("admin.navigatie_sluiten")}><X size={17}/></button><span className="adm-owner-label"><ShieldCheck size={11}/> {dpT("admin.eigenaren_backoffice")}</span><nav>{visibleNavigation.map(item => <div key={item.id} style={{ display: "contents" }}>{"group" in item && <span className="adm-nav-label">{item.group}</span>}<button className={tab === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={tab === item.id ? "page" : undefined}><item.icon size={17}/><span>{item.label}</span>{item.id === "moderation" && openCases > 0 && <b>{openCases}</b>}</button></div>)}</nav><div className="adm-sidebar-footer"><a href="/lobby" onClick={async event => { if (!navigationGuard.current) return; event.preventDefault(); if (await navigationGuard.current()) window.location.assign("/lobby"); }}><ArrowLeft size={15}/>{dpT("admin.terug_naar_de_club")}<ArrowUpRight size={13}/></a><div className="adm-owner-card"><span>{selfName().slice(0, 1).toUpperCase()}</span><div><strong>{selfName()}</strong><small>{getPlatform().actor?.role==="owner"?dpT("admin.platformeigenaar"):dpT("admin.platformbeheerder")}</small></div></div></div></aside>
    <button className="adm-scrim" onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1} aria-label={dpT("admin.navigatie_sluiten")}/>
    <div className="adm-workspace" inert={mobile && menuOpen}><header className="adm-topbar"><button ref={menuTrigger} className="adm-menu-button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label={dpT("admin.beheermenu_openen")}><Menu size={18}/></button><div className="adm-breadcrumb"><ShieldCheck size={15}/><strong>{dpT("admin.platformbeheer")}</strong></div><div className="adm-top-actions"><button className="adm-search-button" onClick={() => setSearchOpen(true)} aria-label={dpT("admin.zoek_een_beheeronderdeel")}><Search size={14}/><span>{dpT("admin.zoek_onderdeel")}</span><kbd>⌘ K</kbd></button><span className="adm-prototype-pill">{dpT("admin.dartspoint")}</span></div></header>
      <main className="adm-content"><div className="adm-page-title"><h1 ref={headingRef} tabIndex={-1}>{selected.label}</h1>{tab === "overview" && <button className="adm-btn adm-btn-primary" onClick={() => navigate("tournaments")}><Trophy size={16}/>{dpT("admin.organiseer_een_toernooi")}<ArrowUpRight size={15}/></button>}</div>
      {tab === "overview" ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
        <div className="adm-kpis"><button className="adm-panel adm-kpi" onClick={() => navigate("players")}><Users/><span>{dpT("admin.spelers_in_je_community")}</span><strong>{operations.members.length}</strong><small><b>{operations.members.filter(member => member.role === "vip").length} {dpT("admin.vip_s")}</b> {dpT("admin.spelersbestand")}</small></button><button className="adm-panel adm-kpi" onClick={() => navigate("rooms")}><Gamepad2/><span>{dpT("admin.actieve_kamers")}</span><strong>{activeRooms.length}<span style={{ fontSize: 22, color: "#62816c" }}> / {operations.rooms.length}</span></strong><small>{population} {dpT("admin.van")} {capacity} {dpT("admin.plekken_bezet")}</small></button><button className="adm-panel adm-kpi" onClick={() => navigate("tournaments")}><Trophy/><span>{dpT("admin.toernooien_op_de_agenda")}</span><strong>{activeTournaments.length}</strong><small><b>{activeTournaments.filter(item => item.status === "live").length} {dpT("admin.wordt_gespeeld")}</b> {dpT("admin.rest_in_voorbereiding")}</small></button><button className={`adm-panel adm-kpi ${openCases ? "action" : ""}`} onClick={() => navigate("moderation")}><Flag/><span>{dpT("admin.meldingen_met_opvolging")}</span><strong>{openCases.toString().padStart(2, "0")}</strong><small>{openCases ? dpT("admin.klaar_om_te_beoordelen") : dpT("admin.alles_is_afgehandeld")}</small></button></div>
        <div className="adm-dashboard-grid"><div className="adm-dashboard-main">
          <section className="adm-panel adm-feature-card"><Trophy className="adm-watermark"/><span className="adm-eyebrow">{featured ? statuses[featured.status].toUpperCase() : dpT("admin.de_volgende_avond_begint_hier")}</span><h2>{featured?.name || dpT("admin.van_eerste_inschrijving_tot_de_laatste_dubbel")}</h2><p>{featured?.description || dpT("admin.stel_je_spelregels_in_nodig_deelnemers_uit_en")}</p><div className="adm-feature-meta"><span><Clock3 size={13}/>{featured ? tournamentTime(featured) : dpT("admin.plan_jouw_moment")}</span><span><Users size={13}/>{featured ? dpT("admin.deelnemers",{length:featured.participants.filter(p => p.status !== "withdrawn" && p.status !== "waiting").length,maxPlayers:featured.settings.maxPlayers}) : dpT("admin.4_tot_64_deelnemers")}</span><span><Target size={13}/>{featured?.settings.startScore || 501} · {featured?.settings.format === "double-elimination" ? dpT("admin.dubbele_eliminatie") : dpT("admin.knock_out")}</span></div><div className="adm-feature-footer"><span>{featured?.matches.length ? dpT("admin.wedstrijden_afgerond",{length:featured.matches.filter(match => match.status === "completed" && match.result?.kind !== "bye").length}) : dpT("admin.vanuit_een_overzicht_georganiseerd")}</span><button className="adm-btn" onClick={() => navigate("tournaments", featured?.id)}>{dpT("admin.open_het_toernooi")}<ArrowUpRight size={15}/></button></div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><div><h2>{dpT("admin.kameroverzicht")}</h2></div><button className="adm-text-btn" onClick={() => navigate("rooms")}>{dpT("admin.beheer")}<ArrowRight size={13}/></button></div><div className="adm-room-bars">{operations.rooms.slice(0,6).map(room => <div key={room.id} className={room.status === "closed" ? "closed" : ""}><div><span>{room.name}{room.status === "closed" ? dpT("admin.gesloten") : room.status === "private" ? dpT("admin.prive") : ""}</span><small>{room.count} / {room.capacity}</small></div><i><span className={room.count / room.capacity > .9 ? "full" : ""} style={{ width: `${Math.min(100,room.count / room.capacity * 100)}%` }}/></i></div>)}</div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><div><h2>{dpT("admin.recente_acties")}</h2></div><button className="adm-text-btn" onClick={() => navigate("audit")}>{dpT("admin.alles")}<ArrowRight size={13}/></button></div><AuditPreview entries={audit.slice(0,4)}/></section>
        </div><div className="adm-dashboard-side">
          <section className="adm-panel"><div className="adm-panel-heading"><h2>{dpT("admin.snel_geregeld")}</h2><Sparkles size={16} color="#b2bf94"/></div><div className="adm-quick-actions"><button onClick={() => navigate("releases")}><LayoutGrid/><strong>{dpT("admin.releasebeheer")}</strong><small>{dpT("admin.ideeen_uitvoering_en_toevoegingen")}</small></button><button onClick={() => navigate("tournaments")}><Trophy/><strong>{dpT("admin.toernooi_organiseren")}</strong><small>{dpT("admin.inschrijven_plaatsen_spelen")}</small></button><button onClick={() => navigate("seasons")}><ListChecks/><strong>{dpT("admin.seizoen_organiseren")}</strong><small>{dpT("admin.divisies_ladder_en_speelrondes")}</small></button><button onClick={() => navigate(getPlatform().actor?.role === "owner" ? "lobby" : "platform")}><Bell/><strong>{getPlatform().actor?.role === "owner" ? dpT("admin.lobby_widgets") : dpT("admin.aankondiging")}</strong><small>{dpT("admin.zichtbaar_in_de_lobby")}</small></button><button onClick={() => navigate("game")}><ListChecks/><strong>{dpT("admin.deelname_instellen")}</strong><small>{dpT("admin.dp_check_in_en_toelating")}</small></button></div></section>
          <section className="adm-panel"><div className="adm-panel-heading"><h2>{dpT("admin.dit_verdient_aandacht")}</h2><Activity size={16} color="#d6aa83"/></div><div className="adm-notes"><button onClick={() => navigate("moderation")}><Flag size={16}/><div><strong>{openCases ? dpT("admin.melding_open",{openCases:openCases,value1:openCases === 1 ? "" : "en"}) : dpT("admin.een_rustige_community")}</strong><p>{dpT("admin.bekijk_de_context_voordat_je_een_maatregel_neemt")}</p></div></button><button onClick={() => navigate("tournaments")}><ClipboardList size={16}/><div><strong>{tournamentState.tournaments.filter(item => item.status === "draft").length} {dpT("admin.toernooiconcepten")}</strong><p>{dpT("admin.controleer_spelregels_en_deelname_voordat_je_publiceert")}</p></div></button><button onClick={() => navigate("elo")}><Target size={16}/><div><strong>{dpT("admin.dp_beleid_k_32")}</strong><p>{dpT("admin.10_wedstrijden_en_5_verschillende_tegenstanders_voor_plaatsing")}</p></div></button></div></section>

        </div></div>
      </motion.div> : tab === "tournaments" ? <DartsTournaments key={tournamentId || "all"} initialTournamentId={tournamentId}/> : tab === "seasons" ? <AdminSeasons/> : tab === "players" ? <AdminPlayers/> : tab === "rooms" ? <AdminRooms/> : tab === "chat-moderation" ? <AdminChatModeration/> : tab === "moderation" ? <AdminModeration/> : tab === "game" ? <AdminGameSettings/> : tab === "elo" ? <AdminEloSettings/> : tab === "lobby" ? <AdminLobbyContent initialWidgetType={lobbyWidgetType} initialRoomId={initialRoomId} onNavigate={next => { void navigate(validTab(next)); }} onRegisterNavigationGuard={registerNavigationGuard}/> : tab === "releases" ? <AdminReleases onConfigureWidget={getPlatform().actor?.role === "owner" ? () => { void navigate("lobby", undefined, "releases"); } : undefined} onRegisterNavigationGuard={registerNavigationGuard}/> : tab === "platform" ? <AdminPlatformSettings/> : tab === "legal" ? <DartsLegal/> : <AuditPanel entries={audit}/>}
      <footer className="adm-page-footer"><span>{dpT("admin.dartspoint_platformbeheer")}</span><span>{dpT("admin.je_wijzigingen_vind_je_terug_in_het_logboek")}</span></footer>
      </main>
    </div>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="adm-command-dialog"><DialogHeader><DialogTitle>{dpT("admin.waar_wil_je_naartoe")}</DialogTitle><DialogDescription>{dpT("admin.zoek_een_onderdeel_van_platformbeheer")}</DialogDescription></DialogHeader><label className="adm-search adm-command-search"><Search size={17}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={dpT("admin.bijvoorbeeld_toernooien_of_spelregels")} aria-label={dpT("admin.zoek_beheeronderdeel")}/></label><div className="adm-command-items">{visibleNavigation.filter(item => `${item.label} ${titles[item.id].title} ${titles[item.id].description}`.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} onClick={() => navigate(item.id)}><item.icon size={17}/>{item.label}<ArrowRight size={14}/></button>)}</div></DialogContent></Dialog>
  </div></MotionConfig>;
}

const dpStaticCopyKeys={
  "Overzicht": "admin.copy_overzicht",
  "DE CLUB": "admin.copy_de_club",
  "Toernooien": "admin.copy_toernooien",
  "Seizoenen & divisies": "admin.copy_seizoenen_divisies",
  "Spelers & rollen": "admin.copy_spelers_rollen",
  "Kamers": "admin.copy_kamers",
  "Moderatie": "admin.copy_moderatie",
  "Chat & moderatie": "admin.copy_chat_moderatie",
  "Spel & deelname": "admin.copy_spel_deelname",
  "HET PLATFORM": "admin.copy_het_platform",
  "DP & competitie": "admin.copy_dp_competitie",
  "Releasebeheer": "admin.copy_releasebeheer",
  "Platforminstellingen": "admin.copy_platforminstellingen",
  "Juridisch en informatie": "admin.copy_juridisch_en_informatie",
  "Supporttickets": "admin.copy_supporttickets",
  "Gebruikers en teamrollen": "admin.copy_gebruikers_en_teamrollen",
  "Actielogboek": "admin.copy_actielogboek",
  "Jouw club. Jouw regie.": "admin.copy_jouw_club_jouw_regie",
  "Van een volle kamer tot de laatste dubbel. Alles wat jouw community laat draaien.": "admin.copy_van_een_volle_kamer_tot_de_laatste_dubbel",
  "Een avond om voor te spelen.": "admin.copy_een_avond_om_voor_te_spelen",
  "Organiseer toernooien, deel het veld in en begeleid iedere ronde tot de finale.": "admin.copy_organiseer_toernooien_deel_het_veld_in_en_begeleid",
  "Een seizoen om te groeien.": "admin.copy_een_seizoen_om_te_groeien",
  "Beheer de divisiespelvorm: indeling, speelrondes, de ladder en promotie of degradatie.": "admin.copy_beheer_de_divisiespelvorm_indeling_speelrondes_de_ladder_en",
  "De mensen achter de pijlen.": "admin.copy_de_mensen_achter_de_pijlen",
  "Een helder overzicht van spelers, rollen en accountmaatregelen.": "admin.copy_een_helder_overzicht_van_spelers_rollen_en_accountmaatregelen",
  "Een plek voor iedereen.": "admin.copy_een_plek_voor_iedereen",
  "Richt kamers in, bepaal de toegang en bewaak de bezetting.": "admin.copy_richt_kamers_in_bepaal_de_toegang_en_bewaak",
  "Houd de club prettig.": "admin.copy_houd_de_club_prettig",
  "Behandel meldingen met context, een passende maatregel en een duidelijke reden.": "admin.copy_behandel_meldingen_met_context_een_passende_maatregel_en",
  "Beheer woorden, uitzonderingen, chatlimieten en verplichte naamwijzigingen.": "admin.copy_beheer_woorden_uitzonderingen_chatlimieten_en_verplichte_naamwijzigingen",
  "Jouw spelregels.": "admin.copy_jouw_spelregels",
  "Stel de basis in voor nieuwe toernooien en bepaal wie mag deelnemen.": "admin.copy_stel_de_basis_in_voor_nieuwe_toernooien_en",
  "Een eerlijke plek op de ladder.": "admin.copy_een_eerlijke_plek_op_de_ladder",
  "Bekijk het actieve DP-beleid en reken een nieuw beleidsvoorstel door.": "admin.copy_bekijk_het_actieve_dp_beleid_en_reken_een",
  "Een clubhuis met karakter.": "admin.copy_een_clubhuis_met_karakter",
  "Beheer lobbywidgets, nieuws, kamerselecties en gedeelde publicaties.": "admin.copy_beheer_lobbywidgets_nieuws_kamerselecties_en_gedeelde_publicaties",
  "Samen maken we DartsPoint beter.": "admin.copy_samen_maken_we_dartspoint_beter",
  "Van idee naar toevoeging. Beoordeel voorstellen, volg de uitvoering en deel wat nieuw is in de lobby.": "admin.copy_van_idee_naar_toevoeging_beoordeel_voorstellen_volg_de",
  "DartsPoint, zoals jij het wilt.": "admin.copy_dartspoint_zoals_jij_het_wilt",
  "Beheer platformvoorkeuren, aankondigingen en de toegang tot jouw community.": "admin.copy_beheer_platformvoorkeuren_aankondigingen_en_de_toegang_tot_jouw",
  "Duidelijke afspraken voor de club.": "admin.copy_duidelijke_afspraken_voor_de_club",
  "Beheer de openbare documenten, versies en contactgegevens.": "admin.copy_beheer_de_openbare_documenten_versies_en_contactgegevens",
  "Help spelers verder.": "admin.copy_help_spelers_verder",
  "Open de afgeschermde supportomgeving.": "admin.copy_open_de_afgeschermde_supportomgeving",
  "De juiste toegang voor het team.": "admin.copy_de_juiste_toegang_voor_het_team",
  "Ken ticketrollen toe zonder spel- of beheerrechten te verruimen.": "admin.copy_ken_ticketrollen_toe_zonder_spel_of_beheerrechten_te",
  "Iedere wijziging, inzichtelijk.": "admin.copy_iedere_wijziging_inzichtelijk",
  "Wie deed wat, wanneer en waarom? Volg je beheerhandelingen terug.": "admin.copy_wie_deed_wat_wanneer_en_waarom_volg_je"
};
