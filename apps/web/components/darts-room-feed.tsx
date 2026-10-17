"use client";
import {localiseLobbyLayout} from "../../../packages/i18n/src/lobby-content";
import {browserLocale} from '../../../packages/i18n/src/errors';
import {formatLocales} from '../../../packages/i18n/src/locale';

import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';


// Clubhouse presentation adapted from the 2026-10-14 UI/UX handoff; data is server-owned.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, ChevronRight, Flame, Heart, Megaphone, Newspaper, Sparkles, Target, Trophy, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName } from "@/components/player-identity";
import { ReleaseUpdatesWidget } from "@/components/darts-release-updates";
import { DartsHeroBackground } from "@/components/darts-hero-background";
import { registrationIsOpen, type Tournament } from "@/lib/darts-tournament-model";
import { visibleLobbyWidgets, safeLobbyHref, type LobbyLayout, type LobbyWidget, type LobbyArticle, type LobbyFeedPayload } from "@/lib/darts-lobby-content";
import { api, ApiError, usePlatform } from "@/lib/platform-client";
import { usePracticeProgress } from "@/components/darts-practice";
import "./darts-room-feed.css";

const filters = ["Ontdekken", "Toernooien", "Community", "Nieuws"] as const;
const filtersStaticSource = filters;
type FeedFilter = typeof filters[number];
const widgetFilters: Record<LobbyWidget["type"], FeedFilter> = { announcement: "Nieuws", tournament: "Toernooien", releases: "Nieuws", players: "Community", challenge: "Community", moment: "Community", news: "Nieuws", poll: "Community", divisions: "Community" };
const widgetFiltersStaticSource = widgetFilters;
const articleLabels: Record<LobbyArticle["category"], string> = { news: "NIEUWS", update: "NIEUW OP DARTSPOINT", guide: "VOOR NIEUWE SPELERS" };
const articleLabelsStaticSource = articleLabels;
const articleIcons = { news: Users, update: Sparkles, guide: Target };
type Reaction = LobbyFeedPayload["reactions"][string];

function eventStatus(event: Tournament) {
  if (event.status === "live") return "LIVE";
  if (event.status === "checkin") return "CHECK-IN";
  return registrationIsOpen(event) ? "INSCHRIJVING OPEN" : "INSCHRIJVING GESLOTEN";
}
function eventDate(event: Tournament) {
  return event.settings.startsAt ? new Date(event.settings.startsAt).toLocaleString(formatLocales[browserLocale()], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "Starttijd volgt";
}
function participantCount(event: Tournament) {
  return event.participants.filter(player => ["confirmed", "checkedin"].includes(player.status)).length;
}
function widgetClass(widget: LobbyWidget, classes: string) {
  return `${classes} ${widget.size === "wide" ? "dpf-wide" : "dpf-half"}`;
}
function FeedLink({ href, fallback, preview, className, children, onPreview }: { href?: string; fallback?: string; preview: boolean; className: string; children: ReactNode; onPreview: () => void }) {
  const destination = safeLobbyHref(href, fallback);
  if (!destination) return null;
  return <a className={className} href={destination} onClick={preview ? event => { event.preventDefault(); onPreview(); } : undefined}>{children}</a>;
}
function MomentWidget({ widget, preview, reaction, busy, onProfile, onApplause }: { widget: LobbyWidget; preview: boolean; reaction?: Reaction["applause"]; busy: boolean; onProfile: (name: string) => void; onApplause: (active: boolean) => void }) {
 const {t:dpT,locale}=useI18n("roomFeed");

  const platform = usePlatform();
  const player = platform.players.find(value => value.name === widget.settings.playerName);
  return <article className={widgetClass(widget, "dpf-card dpf-moment")} data-widget-id={widget.id}>
    <div className="dpf-card-top"><span className="dpf-label"><Sparkles size={14}/>{dpT("roomFeed.uit_de_community")}</span></div>
    {widget.settings.score && <div className="dpf-big-score" aria-label={dpT("roomFeed.label",{score:widget.settings.score,value1:widget.settings.scoreLabel ?? ""})}>{widget.settings.score}<span>{widget.settings.scoreLabel}</span></div>}
    <h3>{widget.title}</h3><p>{widget.settings.playerName && <>{player ? <button type="button" className="dpf-inline-profile" onClick={() => onProfile(player.id)}><PlayerName name={player.name}/></button> : <span>{widget.settings.playerName}</span>}{" "}</>}{widget.description}</p>
    <div className="dpf-moment-footer"><span>{dpT("roomFeed.van_het_dartspoint_team")}</span><button type="button" disabled={preview || busy || !reaction} onClick={() => reaction && onApplause(!reaction.active)} className={reaction?.active ? "is-liked" : ""} aria-pressed={reaction?.active ?? false}><Heart size={15} fill={reaction?.active ? "currentColor" : "none"}/>{reaction?.active ? dpT("roomFeed.applaus_gegeven") : dpT("roomFeed.geef_applaus")}{reaction && <b>{reaction.count}</b>}</button></div>
    {!reaction && <small className="dpf-inline-empty">{dpT("roomFeed.applaus_geven_is_op_dit_moment_niet_beschikbaar")}</small>}
  </article>;
}
function PollWidget({ widget, preview, reaction, busy, onVote }: { widget: LobbyWidget; preview: boolean; reaction?: Reaction["poll"]; busy: boolean; onVote: (optionIndex: number | null, version: string) => void }) {
 const {t:dpT,locale}=useI18n("roomFeed");

  const options = widget.settings.pollOptions ?? [];
  const vote = reaction?.optionIndex ?? null;
  const total = reaction?.counts.reduce((sum, value) => sum + value, 0);
  return <article className={widgetClass(widget, "dpf-card dpf-poll")} data-widget-id={widget.id}>
    <span className="dpf-label"><BarChart3 size={15}/>{dpT("roomFeed.de_kamer_beslist")}</span><h3>{widget.title}</h3><p>{widget.description}</p>
    {options.length < 2 ? <p className="dpf-inline-empty">{dpT("roomFeed.er_is_op_dit_moment_geen_vraag_om")}</p> : <div className="dpf-poll-options">{options.map((option, index) => {
      const percentage = total ? Math.round((reaction!.counts[index] ?? 0) / total * 100) : 0;
      return <button type="button" key={`${index}:${option}`} disabled={preview || busy || !reaction} onClick={() => reaction && onVote(index, reaction.version)} aria-pressed={vote === index} className={vote === index ? "is-selected" : ""}>{vote !== null && <i style={{ width: `${percentage}%` }}/>}<span>{vote === index ? <Check size={13}/> : <span className="dpf-radio"/>}{option}</span>{vote !== null && <b>{percentage}%</b>}</button>;
    })}</div>}
    <div className="dpf-poll-foot" aria-live="polite"><span>{reaction ? dpT("roomFeed._2",{total:total,value1:total === 1 ? "stem" : "stemmen",value2:vote !== null ? " · jouw stem is opgeslagen" : ""}) : dpT("roomFeed.je_kunt_op_dit_moment_niet_stemmen")}</span>{vote !== null && <button type="button" disabled={preview || busy} onClick={() => reaction && onVote(null, reaction.version)}>{dpT("roomFeed.intrekken")}</button>}</div>
  </article>;
}

export type RoomLobbyFeedProps = {
  roomId?: string; roomName: string; roomCount: number; onPlayers: () => void; onTournaments: () => void; onProfile: (name: string) => void;
  layoutOverride?: LobbyLayout; previewPayload?: LobbyFeedPayload; preview?: boolean; managementHref?: string; onChooseRoom?: () => void;
};
export function RoomLobbyFeed({ roomId, roomName, roomCount, onPlayers, onTournaments, onProfile, layoutOverride, previewPayload, preview = false, managementHref, onChooseRoom }: RoomLobbyFeedProps) {
 const dpFeedback=useI18n("feedback").t;

 const {t:dpT,locale}=useI18n("roomFeed");

 const articleLabels=localiseStaticCopy(articleLabelsStaticSource,dpT,dpStaticCopyKeys);

 const widgetFilters=localiseStaticCopy(widgetFiltersStaticSource,dpT,dpStaticCopyKeys);

 const filters=localiseStaticCopy(filtersStaticSource,dpT,dpStaticCopyKeys);



  const platform = usePlatform();
  const [filter, setFilter] = useState<FeedFilter>("Ontdekken");
  const [article, setArticle] = useState<string | null>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Record<string, string>>({});
  const [previewNotice, setPreviewNotice] = useState("");
  const [feed, setFeed] = useState<LobbyFeedPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const requestVersion = useRef(0);
  const actionPending = useRef(false);
  const identity = `${platform.actor?.id ?? ""}:${roomId ?? ""}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    let disposed = false;
    setFeed(null); setError(""); setBusy(null); actionPending.current = false;
    setFilter("Ontdekken"); setArticle(null); setDismissedAnnouncements({});
    if (preview) { setLoading(false); return; }
    if (!roomId || !platform.actor?.id) { setLoading(false); return; }
    const selectedRoom = roomId;
    async function refresh() {
      if (disposed || actionPending.current || document.visibilityState !== "visible") return;
      const version = ++requestVersion.current;
      try {
        const value = await api<LobbyFeedPayload>("lobby/feed?roomId=" + encodeURIComponent(selectedRoom));
        if (!disposed && version === requestVersion.current && value.roomId === selectedRoom) { setFeed(value); setError(""); }
      } catch (cause) {
        if (!disposed && version === requestVersion.current) { setError(cause instanceof Error ? cause.message : dpFeedback("feedback.het_clubhuis_laden_lukt_even_niet_probeer_het")); if (cause instanceof ApiError && [401,403].includes(cause.status)) setFeed(null); }
      } finally { if (!disposed && version === requestVersion.current) setLoading(false); }
    }
    setLoading(true); void refresh();
    // Only this idle-room component reads content; a match never polls lobby data.
    const timer = setInterval(() => { void refresh(); }, 30000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; ++requestVersion.current; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [roomId, platform.actor?.id, preview, reload]);
  async function react(widgetId: string, kind: "vote" | "applause", value: number | null | boolean, pollVersion?: string) {
    if (preview || !roomId || actionPending.current) return;
    const actionIdentity = identity, version = ++requestVersion.current;
    actionPending.current = true; setBusy(widgetId); setError("");
    try {
      const payload = kind === "vote" ? { roomId, widgetId, optionIndex: value, pollVersion } : { roomId, widgetId, active: value };
      const next = await api<LobbyFeedPayload>("lobby/" + kind, payload);
      if (currentIdentity.current === actionIdentity && version === requestVersion.current && next.roomId === roomId) setFeed(next);
    } catch (cause) { if (currentIdentity.current === actionIdentity && version === requestVersion.current) setError(cause instanceof Error ? cause.message : dpFeedback("feedback.je_reactie_is_niet_opgeslagen_probeer_het_nog")); }
    finally { if (currentIdentity.current === actionIdentity && version === requestVersion.current) { actionPending.current = false; setBusy(null); } }
  }
  const candidate = preview ? previewPayload : feed;
  const projection = candidate?.roomId === roomId ? candidate : undefined;
  const sourceLayout = preview ? layoutOverride ?? projection?.layout : projection?.layout;
  const layout=sourceLayout?localiseLobbyLayout(sourceLayout,locale):undefined;
  const upcoming = (platform.tournaments as Tournament[]).filter(event => event.published && ["registration", "checkin", "live"].includes(event.status));
  const settings = platform.settings;
  const { progress, challenge } = usePracticeProgress();
  const hit = progress.weeks[challenge.id] ?? [];
  const completed = challenge.targets.filter(target => hit.includes(target)).length;
  const seasons = platform.seasons.filter(season => season.status === "live");
  const ownDivision = seasons.flatMap(season => season.members.filter((member: { name: string }) => member.name === platform.actor?.username).map((member: { divisionId: string }) => ({ season, division: season.divisions.find((division: { id: string }) => division.id === member.divisionId) }))).find(value => value.division);
  const publishedArticles = layout?.articles.filter(item => item.published) ?? [];
  const selectedStory = publishedArticles.find(story => story.id === article);
  function announcementText(widget: LobbyWidget) {
    return widget.settings.announcementSource === "custom" ? widget.description : settings?.platform?.announcementActive ? settings.platform.announcement : "";
  }
  const widgets = layout ? visibleLobbyWidgets(layout, roomId).filter(widget => {
    if (filter !== "Ontdekken" && widgetFilters[widget.type] !== filter) return false;
    if (widget.type === "announcement") { const text = announcementText(widget); return Boolean(text.trim()) && (preview || dismissedAnnouncements[widget.id] !== text); }
    return true;
  }) : [];
  useEffect(() => { if (!previewNotice) return; const timer = setTimeout(() => setPreviewNotice(""), 3000); return () => clearTimeout(timer); }, [previewNotice]);
  function showPreviewNotice() { setPreviewNotice("Deze knop opent de bijbehorende pagina in de gepubliceerde lobby."); }
  function previewAction(action: () => void) { if (preview) showPreviewNotice(); else action(); }
  const linkProps = { preview, onPreview: showPreviewNotice };
  if (!layout) return <div className="dp-room-feed"><div className="dpf-empty" role={error ? "alert" : "status"}><Users size={27}/><h3>{error ? dpT("roomFeed.het_clubhuis_laden_lukt_even_niet") : loading ? dpT("roomFeed.het_clubhuis_wordt_geladen") : dpT("roomFeed.kies_een_kamer")}</h3>{error && <><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>{dpT("roomFeed.opnieuw_laden")}<ArrowRight size={14}/></button></>}{onChooseRoom && <button type="button" onClick={onChooseRoom}>{dpT("roomFeed.andere_kamer")}<ArrowRight size={14}/></button>}</div></div>;
  return <div className={`dp-room-feed${preview ? " dp-room-feed-preview" : ""}`}>
    <header className="dpf-heading"><div><span className="dpf-eyebrow">{layout.eyebrow}</span><h1>{layout.headline.endsWith(".") ? <>{layout.headline.slice(0, -1)}<span>.</span></> : layout.headline}</h1><p><span className="dpf-dot"/>{roomName}<span className="dpf-heading-separator">/</span>{roomCount} {roomCount === 1 ? dpT("roomFeed.speler") : dpT("roomFeed.spelers")} {dpT("roomFeed.in_de_kamer")}</p></div><div className="dpf-heading-actions"><span className="dpf-demo">{preview ? dpT("roomFeed.voorbeeld") : dpT("roomFeed.clubhuis")}</span>{!preview && safeLobbyHref(managementHref) && <a className="dpf-manage" href={safeLobbyHref(managementHref)}>{dpT("roomFeed.inrichten")}<ArrowUpRight size={12}/></a>}</div></header>

    {settings?.platform?.maintenance && <div className="dpf-maintenance"><Bell size={16}/><p><strong>{dpT("roomFeed.onderhoudsbericht")}</strong>{settings.platform.maintenanceMessage}</p></div>}
    {error && <div className="dpf-error" role="alert"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>{dpT("roomFeed.opnieuw_laden")}</button></div>}
    {previewNotice && <div className="dpf-preview-notice" role="status">{previewNotice}</div>}

    <section className="dpf-content" aria-label={dpT("roomFeed.clubhuis_2")}>
      <div className="dpf-filterbar" role="group" aria-label={dpT("roomFeed.filter_clubhuis")}><div>{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div><Sparkles size={16} aria-hidden="true"/></div>
      <div className="dpf-grid">
        {widgets.map(widget => {
          switch (widget.type) {
            case "announcement": return <div key={widget.id} className={widgetClass(widget, "dpf-announcement")} data-widget-id={widget.id}><Megaphone size={16}/><p><strong>{widget.title || dpT("roomFeed.van_het_team")}</strong>{announcementText(widget)}</p>{!preview && <button type="button" onClick={() => setDismissedAnnouncements(previous => ({ ...previous, [widget.id]: announcementText(widget) }))} aria-label={dpT("roomFeed.aankondiging_verbergen")}><X size={15}/></button>}</div>;
            case "tournament": {
              const featured = widget.settings.tournamentId ? upcoming.find(event => event.id === widget.settings.tournamentId) : upcoming.find(event => registrationIsOpen(event)) ?? upcoming[0];
              return <article className={widgetClass(widget, "dpf-hero")} key={widget.id} data-widget-id={widget.id}>
                <DartsHeroBackground enabled={Boolean(featured) && widget.settings.tournamentImageMode !== "none"} hero={widget.settings.tournamentImageMode === "custom" ? widget.settings.heroImage : featured?.hero} fallback={<div className="dpf-hero-art" aria-hidden="true"><div className="dpf-orbit dpf-orbit-one"/><div className="dpf-orbit dpf-orbit-two"/><span className="dpf-art-star">✦</span><Trophy strokeWidth={1}/><span className="dpf-art-label">{dpT("roomFeed.the_night")}<br/>{dpT("roomFeed.is_yours")}</span></div>}/>
                <div className="dpf-hero-copy"><span className="dpf-label"><Trophy size={13}/>{dpT("roomFeed.uitgelicht_toernooi")}</span><h2>{featured ? widget.title || featured.name : dpT("roomFeed.de_volgende_cup_begint_hier")}<span>{dpT("roomFeed.schuif_aan")}</span></h2><p>{featured ? widget.description || featured.description : dpT("roomFeed.er_staat_nu_geen_toernooi_klaar_zin_in")}</p>
                  {featured && <div className="dpf-event-meta"><span><Users size={13}/>{participantCount(featured)}/{featured.settings.maxPlayers} {dpT("roomFeed.spelers")}</span><span><CalendarDays size={13}/>{eventDate(featured)}</span></div>}
                  {featured ? <FeedLink {...linkProps} className="dpf-primary" href={`/toernooi/${encodeURIComponent(featured.id)}`}>{widget.settings.ctaLabel || dpT("roomFeed.bekijk_het_toernooi")}<ArrowUpRight size={16}/></FeedLink> : <button type="button" className="dpf-primary" onClick={() => previewAction(onTournaments)}>{dpT("roomFeed.bekijk_de_kalender")}<ArrowUpRight size={16}/></button>}
                </div><div className="dpf-hero-bottom"><span><i/>{featured ? eventStatus(featured) : dpT("roomFeed.nieuwe_events_volgen")}</span><span>{featured ? dpT("roomFeed.best_of",{startScore:featured.settings.startScore,value1:featured.settings.doubleOut ? "double-out" : "single-out",bestOf:featured.settings.bestOf}) : dpT("roomFeed.samen_spelen_samen_beter")}</span></div>
              </article>;
            }
            case "releases": return <article key={`${widget.id}:${platform.actor?.id ?? ""}:${roomId ?? ""}`} className={widgetClass(widget, "dpf-card dpf-releases")} data-widget-id={widget.id}><ReleaseUpdatesWidget updates={projection?.releases ?? []} title={widget.title} description={widget.description} limit={widget.settings.releaseLimit ?? 3} allowIdeas={widget.settings.allowIdeas !== false} preview={preview}/></article>;
            case "players": return <div className={widgetClass(widget, "dpf-play-invitation")} key={widget.id} data-widget-id={widget.id}><span className="dpf-play-icon"><Target size={23}/></span><div><strong>{widget.title}</strong><p>{widget.description}</p></div><button type="button" onClick={() => previewAction(onPlayers)}>{widget.settings.ctaLabel || dpT("roomFeed.zoek_een_speler")}<ArrowRight size={15}/></button></div>;
            case "challenge": return <article className={widgetClass(widget, "dpf-card dpf-challenge")} key={widget.id} data-widget-id={widget.id}><div className="dpf-card-top"><span className="dpf-label"><Flame size={15}/>{dpT("roomFeed.weekchallenge")}</span><span className="dpf-small-count">{completed}/{challenge.targets.length}</span></div><h3>{widget.title}</h3><p>{widget.description}</p><div className="dpf-targets">{challenge.targets.map(target => <span key={target} className={hit.includes(target) ? "is-hit" : ""}>{hit.includes(target) ? <Check size={13}/> : null}{target}</span>)}</div><div className="dpf-progress" role="progressbar" aria-label={dpT("roomFeed.geraakte_dubbels_deze_week")} aria-valuemin={0} aria-valuemax={challenge.targets.length} aria-valuenow={completed}><span style={{ width: `${challenge.targets.length ? completed / challenge.targets.length * 100 : 0}%` }}/></div><FeedLink {...linkProps} className="dpf-text-link" href={widget.settings.ctaHref} fallback="/oefenen?uitdaging=1">{widget.settings.ctaLabel || (completed === challenge.targets.length ? dpT("roomFeed.nog_even_oefenen") : dpT("roomFeed.pak_je_pijlen"))}<ArrowUpRight size={15}/></FeedLink></article>;
            case "moment": return <MomentWidget key={`${widget.id}:${preview}`} widget={widget} preview={preview} reaction={projection?.reactions[widget.id]?.applause} busy={busy !== null} onApplause={active => { void react(widget.id, "applause", active); }} onProfile={name => previewAction(() => onProfile(name))}/>;
            case "news": {
              const articles = widget.settings.articleIds?.length ? widget.settings.articleIds.map(id => publishedArticles.find(story => story.id === id)).filter((item): item is LobbyArticle => Boolean(item)) : publishedArticles;
              return <article className={widgetClass(widget, "dpf-card dpf-news")} key={widget.id} data-widget-id={widget.id}><div className="dpf-section-heading"><span className="dpf-label"><Newspaper size={15}/>{widget.title || dpT("roomFeed.van_het_prikbord")}</span><span>{widget.description}</span></div><div className="dpf-news-list">{articles.length ? articles.map((story, index) => { const Icon = articleIcons[story.category]; return <button type="button" key={story.id} onClick={() => setArticle(story.id)}><span className={`dpf-news-icon dpf-news-icon-${index % 3}`}><Icon size={21}/></span><span><small>{articleLabels[story.category]}</small><strong>{story.title}</strong><span>{story.summary}</span></span><ChevronRight size={18}/></button>; }) : <p className="dpf-inline-empty">{dpT("roomFeed.er_is_nog_geen_nieuws_kom_gerust_later")}</p>}</div></article>;
            }
            case "poll": return <PollWidget key={`${widget.id}:${JSON.stringify(widget.settings.pollOptions)}:${preview}`} widget={widget} preview={preview} reaction={projection?.reactions[widget.id]?.poll} busy={busy !== null} onVote={(index, version) => { void react(widget.id, "vote", index, version); }}/>;
            case "divisions": return <article className={widgetClass(widget, "dpf-card dpf-division")} key={widget.id} data-widget-id={widget.id}><span className="dpf-label"><Trophy size={15}/>{dpT("roomFeed.een_beetje_verder")}</span><div className="dpf-division-art" aria-hidden="true"><span>{ownDivision?.division.level ?? <Trophy size={33}/>}</span><i/><i/></div><h3>{widget.title}</h3><p>{widget.description}</p><p className="dpf-division-current">{ownDivision ? dpT("roomFeed._3",{name:ownDivision.division.name,nameValue:ownDivision.season.name}) : seasons.length ? dpT("roomFeed._4",{length:seasons.length,value1:seasons.length === 1 ? "actief seizoen" : "actieve seizoenen"}) : dpT("roomFeed.de_divisiecompetitie_is_nog_niet_gestart")}</p><FeedLink {...linkProps} className="dpf-text-link" href={widget.settings.ctaHref} fallback="/divisies">{widget.settings.ctaLabel || dpT("roomFeed.bekijk_de_divisies")}<ArrowUpRight size={15}/></FeedLink></article>;
          }
        })}
        {!widgets.length && <div className="dpf-empty dpf-wide"><Newspaper size={27}/><h3>{filter === "Ontdekken" ? dpT("roomFeed.even_rustig_op_het_prikbord") : dpT("roomFeed.nog_niets_bij",{value0:filter.toLowerCase()})}</h3><p>{filter === "Ontdekken" ? dpT("roomFeed.er_staan_nog_geen_berichten_of_activiteiten_in") : dpT("roomFeed.er_staan_nog_geen_berichten_in_deze_categorie")}</p>{filter !== "Ontdekken" && <button type="button" onClick={() => setFilter("Ontdekken")}>{dpT("roomFeed.bekijk_alles")}<ArrowRight size={14}/></button>}</div>}
      </div>
      <footer className="dpf-footer"><img src="/brand/icon.svg" alt=""/><span>{dpT("roomFeed.blijf_nog_even_hangen")}</span>{onChooseRoom && <button type="button" onClick={() => previewAction(onChooseRoom)}>{dpT("roomFeed.andere_kamer")}<ArrowUpRight size={12}/></button>}{preview && <small>{dpT("roomFeed.voorbeeld_van_de_geselecteerde_kamer")}</small>}</footer>
    </section>

    <Dialog open={!!selectedStory} onOpenChange={open => !open && setArticle(null)}><DialogContent className="dp-dialog dpf-article"><DialogHeader><span className="dpf-label">{selectedStory && articleLabels[selectedStory.category]}</span><DialogTitle>{selectedStory?.title}</DialogTitle><DialogDescription>{selectedStory?.summary}</DialogDescription></DialogHeader><div className="dpf-article-body">{selectedStory?.body.split(/\n+/).filter(paragraph => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{selectedStory?.ctaLabel && safeLobbyHref(selectedStory.ctaHref) ? <FeedLink {...linkProps} className="dpf-primary" href={selectedStory.ctaHref}>{selectedStory.ctaLabel}<ArrowRight size={16}/></FeedLink> : <button type="button" className="dpf-primary" onClick={() => setArticle(null)}>{dpT("roomFeed.terug_naar_het_clubhuis")}<ArrowRight size={16}/></button>}{preview && previewNotice && <div className="dpf-preview-notice" role="status">{previewNotice}</div>}</DialogContent></Dialog>
  </div>;
}

const dpStaticCopyKeys={
  "Ontdekken": "roomFeed.copy_ontdekken",
  "Toernooien": "roomFeed.copy_toernooien",
  "Nieuws": "roomFeed.copy_nieuws",
  "NIEUWS": "roomFeed.copy_nieuws_2",
  "NIEUW OP DARTSPOINT": "roomFeed.copy_nieuw_op_dartspoint",
  "VOOR NIEUWE SPELERS": "roomFeed.copy_voor_nieuwe_spelers"
};
