"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, ChevronRight, Flame, Heart, Megaphone, Newspaper, Sparkles, Target, Trophy, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReleaseUpdatesWidget } from "@/components/darts-release-updates";
import { PlayerName } from "@/components/player-identity";
import { DartsHeroBackground } from "@/components/darts-hero-background";
import { useTournaments } from "@/lib/darts-tournament-store";
import { registrationIsOpen, type Tournament } from "@/lib/darts-tournament-model";
import { useAdminSettings } from "@/lib/darts-admin-settings";
import { useLobbyContent, visibleLobbyWidgets, safeLobbyHref, type LobbyLayout, type LobbyWidget, type LobbyArticle } from "@/lib/darts-lobby-content";
import { usePracticeProgress } from "@/components/darts-practice";
import "./darts-room-feed.css";

const filters = ["Ontdekken", "Toernooien", "Community", "Nieuws"] as const;
type FeedFilter = typeof filters[number];
const widgetFilters: Record<LobbyWidget["type"], FeedFilter> = { announcement: "Nieuws", tournament: "Toernooien", releases: "Nieuws", players: "Community", challenge: "Community", moment: "Community", news: "Nieuws", poll: "Community", divisions: "Community" };
const articleLabels: Record<LobbyArticle["category"], string> = { news: "NIEUWS", update: "PRODUCTUPDATE", guide: "VOOR NIEUWE SPELERS" };
const articleIcons = { news: Users, update: Sparkles, guide: Target };

function eventStatus(event: Tournament) {
  if (event.status === "live") return "LIVE DEMO";
  if (event.status === "checkin") return "CHECK-IN";
  return registrationIsOpen(event) ? "INSCHRIJVING OPEN" : "INSCHRIJVING GESLOTEN";
}
function eventDate(event: Tournament) {
  return event.settings.startsAt ? new Date(event.settings.startsAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "Starttijd volgt";
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

function MomentWidget({ widget, preview, onProfile }: { widget: LobbyWidget; preview: boolean; onProfile: (name: string) => void }) {
  const [liked, setLiked] = useState(false);
  const storageKey = `dartspoint-lobby-applause-v2:${widget.id}`;
  useEffect(() => {
    if (preview) return;
    try { setLiked(localStorage.getItem(storageKey) === "1"); } catch { /* Reactions still work without browser storage. */ }
  }, [storageKey, preview]);
  function applaud() {
    const next = !liked;
    setLiked(next);
    if (!preview) try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
  }
  const player = widget.settings.playerName;
  return <article className={widgetClass(widget, "dpf-card dpf-moment")} data-widget-id={widget.id}>
    <div className="dpf-card-top"><span className="dpf-label"><Sparkles size={14}/>MOMENT VAN DE KAMER</span></div>
    <div className="dpf-big-score" aria-label={`${widget.settings.score ?? "180"} ${widget.settings.scoreLabel ?? ""}`}>{widget.settings.score ?? "180"}<span>{widget.settings.scoreLabel}</span></div>
    <h3>{widget.title}</h3><p>{player && <><button className="dpf-inline-profile" onClick={() => onProfile(player)}><PlayerName name={player}/></button>{" "}</>}{widget.description}</p>
    <div className="dpf-moment-footer"><span>{preview ? "Voorbeeldreactie" : "Communitymoment"}</span><button onClick={applaud} className={liked ? "is-liked" : ""} aria-pressed={liked}><Heart size={15} fill={liked ? "currentColor" : "none"}/>{liked ? "Applaus gegeven" : "Geef applaus"}<b>{(widget.settings.seedApplause ?? 0) + Number(liked)}</b></button></div>
  </article>;
}

function PollWidget({ widget, preview }: { widget: LobbyWidget; preview: boolean }) {
  const options = widget.settings.pollOptions ?? [];
  const initialVotes = options.map((_, index) => widget.settings.pollVotes?.[index] ?? 0);
  const [vote, setVote] = useState<number | null>(null);
  const storageKey = `dartspoint-lobby-poll-v2:${widget.id}:${encodeURIComponent(JSON.stringify(options))}`;
  useEffect(() => {
    if (preview) return;
    try {
      const saved = localStorage.getItem(storageKey);
      const index = saved === null ? -1 : Number(saved);
      if (Number.isInteger(index) && index >= 0 && index < options.length) setVote(index);
    } catch { /* Reactions still work without browser storage. */ }
  }, [storageKey, preview, options.length]);
  function castVote(index: number | null) {
    setVote(index);
    if (!preview) try { if (index === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, String(index)); } catch {}
  }
  const initialCount = initialVotes.reduce((sum, value) => sum + value, 0);
  const total = initialCount + Number(vote !== null);
  return <article className={widgetClass(widget, "dpf-card dpf-poll")} data-widget-id={widget.id}>
    <span className="dpf-label"><BarChart3 size={15}/>DE KAMER BESLIST</span><h3>{widget.title}</h3><p>{widget.description}</p>
    {options.length < 2 ? <p className="dpf-inline-empty">Er staat nog geen poll klaar.</p> : <div className="dpf-poll-options">{options.map((option, index) => {
      const percentage = total ? Math.round((initialVotes[index] + Number(vote === index)) / total * 100) : 0;
      return <button key={`${index}:${option}`} onClick={() => castVote(index)} aria-pressed={vote === index} className={vote === index ? "is-selected" : ""}>{vote !== null && <i style={{ width: `${percentage}%` }}/>}<span>{vote === index ? <Check size={13}/> : <span className="dpf-radio"/>}{option}</span>{vote !== null && <b>{percentage}%</b>}</button>;
    })}</div>}
    <div className="dpf-poll-foot" aria-live="polite"><span>{vote === null ? `${initialCount} voorbeeldstemmen` : preview ? "Voorbeeldstem · wordt niet opgeslagen" : "Jouw demostem is opgeslagen"}</span>{vote !== null && <button onClick={() => castVote(null)}>Intrekken</button>}</div>
  </article>;
}

export function RoomLobbyFeed({ roomId, roomName, roomCount, onPlayers, onTournaments, onProfile, layoutOverride, preview = false, managementHref }: {
  roomId?: string; roomName: string; roomCount: number; onPlayers: () => void; onTournaments: () => void; onProfile: (name: string) => void; layoutOverride?: LobbyLayout; preview?: boolean; managementHref?: string;
}) {
  const [filter, setFilter] = useState<FeedFilter>("Ontdekken");
  const [article, setArticle] = useState<string | null>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Record<string, string>>({});
  const [previewNotice, setPreviewNotice] = useState("");
  const { published } = useLobbyContent();
  const layout = layoutOverride ?? published;
  const { tournaments } = useTournaments();
  const { settings } = useAdminSettings();
  const { progress, challenge } = usePracticeProgress();
  const upcoming = tournaments.filter(event => event.published && ["registration", "checkin", "live"].includes(event.status));
  const hit = progress.weeks[challenge.id] ?? [];
  const completed = challenge.targets.filter(target => hit.includes(target)).length;
  const publishedArticles = layout.articles.filter(item => item.published);
  const selectedStory = publishedArticles.find(story => story.id === article);
  function announcementText(widget: LobbyWidget) {
    return widget.settings.announcementSource === "custom" ? widget.description : settings.platform.announcementActive ? settings.platform.announcement : "";
  }
  const widgets = visibleLobbyWidgets(layout, roomId).filter(widget => {
    if (filter !== "Ontdekken" && widgetFilters[widget.type] !== filter) return false;
    if (widget.type === "announcement") {
      const text = announcementText(widget);
      return Boolean(text.trim()) && (preview || dismissedAnnouncements[widget.id] !== text);
    }
    return true;
  });
  useEffect(() => {
    if (!previewNotice) return;
    const timer = setTimeout(() => setPreviewNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [previewNotice]);
  function showPreviewNotice() { setPreviewNotice("Deze knop opent de bijbehorende pagina in de gepubliceerde lobby."); }
  function previewAction(action: () => void) { if (preview) showPreviewNotice(); else action(); }
  const linkProps = { preview, onPreview: showPreviewNotice };

  return <div className={`dp-room-feed${preview ? " dp-room-feed-preview" : ""}`}>
    <header className="dpf-heading"><div><span className="dpf-eyebrow">{layout.eyebrow}</span><h1>{layout.headline.endsWith(".") ? <>{layout.headline.slice(0, -1)}<span>.</span></> : layout.headline}</h1><p><span className="dpf-dot"/>{roomName}<span className="dpf-heading-separator">/</span>{roomCount} {roomCount === 1 ? "speler" : "spelers"} in de kamer</p></div><div className="dpf-heading-actions"><span className="dpf-demo">{preview ? "VOORBEELD" : "ONTWERP · DEMO"}</span>{!preview && safeLobbyHref(managementHref) && <a className="dpf-manage" href={safeLobbyHref(managementHref)}>Inrichten<ArrowUpRight size={12}/></a>}</div></header>

    {settings.platform.maintenance && <div className="dpf-maintenance"><Bell size={16}/><p><strong>Onderhoudsbericht</strong>{settings.platform.maintenanceMessage}</p></div>}
    {previewNotice && <div className="dpf-preview-notice" role="status">{previewNotice}</div>}

    <section className="dpf-content" aria-label="Clubhuis">
      <div className="dpf-filterbar" role="group" aria-label="Filter clubhuis"><div>{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div><Sparkles size={16} aria-hidden="true"/></div>
      <div className="dpf-grid">
        {widgets.map(widget => {
          switch (widget.type) {
            case "announcement": return <div key={widget.id} className={widgetClass(widget, "dpf-announcement")} data-widget-id={widget.id}><Megaphone size={16}/><p><strong>{widget.title || "Van het team"}</strong>{announcementText(widget)}</p>{!preview && <button onClick={() => setDismissedAnnouncements(previous => ({ ...previous, [widget.id]: announcementText(widget) }))} aria-label="Aankondiging verbergen"><X size={15}/></button>}</div>;
            case "tournament": {
              const featured = widget.settings.tournamentId ? upcoming.find(event => event.id === widget.settings.tournamentId) : upcoming.find(event => registrationIsOpen(event)) ?? upcoming[0];
              return <article className={widgetClass(widget, "dpf-hero")} key={widget.id} data-widget-id={widget.id}>
                <DartsHeroBackground enabled={Boolean(featured) && widget.settings.tournamentImageMode !== "none"} hero={widget.settings.tournamentImageMode === "custom" ? widget.settings.heroImage : featured?.hero} fallback={<div className="dpf-hero-art" aria-hidden="true"><div className="dpf-orbit dpf-orbit-one"/><div className="dpf-orbit dpf-orbit-two"/><span className="dpf-art-star">✦</span><Trophy strokeWidth={1}/><span className="dpf-art-label">THE NIGHT<br/>IS YOURS.</span></div>}/>
                <div className="dpf-hero-copy"><span className="dpf-label"><Trophy size={13}/>UITGELICHT TOERNOOI</span><h2>{featured ? widget.title || featured.name : "De volgende cup begint hier."}<span>Schuif aan.</span></h2><p>{featured ? widget.description || featured.description : "Er is nog geen gepubliceerd toernooi beschikbaar voor deze plek. Nieuwe toernooien verschijnen hier zodra ze klaarstaan."}</p>
                  {featured && <div className="dpf-event-meta"><span><Users size={13}/>{participantCount(featured)}/{featured.settings.maxPlayers} spelers</span><span><CalendarDays size={13}/>{eventDate(featured)}</span></div>}
                  {featured ? <FeedLink {...linkProps} className="dpf-primary" href={`/toernooi/${encodeURIComponent(featured.id)}`}>{widget.settings.ctaLabel || "Bekijk het toernooi"}<ArrowUpRight size={16}/></FeedLink> : <button className="dpf-primary" onClick={() => previewAction(onTournaments)}>Bekijk de kalender<ArrowUpRight size={16}/></button>}
                </div><div className="dpf-hero-bottom"><span><i/>{featured ? eventStatus(featured) : "NIEUWE EVENTS VOLGEN"}</span><span>{featured ? `${featured.settings.startScore} · ${featured.settings.doubleOut ? "double-out" : "single-out"} · best of ${featured.settings.bestOf}` : "Samen spelen. Samen beter."}</span></div>
              </article>;
            }
            case "releases": return <article key={widget.id} className={widgetClass(widget, "dpf-card dpf-releases")} data-widget-id={widget.id}><ReleaseUpdatesWidget title={widget.title} description={widget.description} limit={widget.settings.releaseLimit ?? 3} allowIdeas={widget.settings.allowIdeas !== false} preview={preview}/></article>;
            case "players": return <div className={widgetClass(widget, "dpf-play-invitation")} key={widget.id} data-widget-id={widget.id}><span className="dpf-play-icon"><Target size={23}/></span><div><strong>{widget.title}</strong><p>{widget.description}</p></div><button onClick={() => previewAction(onPlayers)}>{widget.settings.ctaLabel || "Zoek een speler"}<ArrowRight size={15}/></button></div>;
            case "challenge": return <article className={widgetClass(widget, "dpf-card dpf-challenge")} key={widget.id} data-widget-id={widget.id}><div className="dpf-card-top"><span className="dpf-label"><Flame size={15}/>WEEKCHALLENGE</span><span className="dpf-small-count">{completed}/{challenge.targets.length}</span></div><h3>{widget.title}</h3><p>{widget.description}</p><div className="dpf-targets">{challenge.targets.map(target => <span key={target} className={hit.includes(target) ? "is-hit" : ""}>{hit.includes(target) ? <Check size={13}/> : null}{target}</span>)}</div><div className="dpf-progress" role="progressbar" aria-label="Geraakte dubbels deze week" aria-valuemin={0} aria-valuemax={challenge.targets.length} aria-valuenow={completed}><span style={{ width: `${challenge.targets.length ? completed / challenge.targets.length * 100 : 0}%` }}/></div><FeedLink {...linkProps} className="dpf-text-link" href={widget.settings.ctaHref} fallback="/oefenen?uitdaging=1">{widget.settings.ctaLabel || (completed === challenge.targets.length ? "Nog even oefenen" : "Pak je pijlen")}<ArrowUpRight size={15}/></FeedLink></article>;
            case "moment": return <MomentWidget key={`${widget.id}:${preview}`} widget={widget} preview={preview} onProfile={name => previewAction(() => onProfile(name))}/>;
            case "news": {
              const articles = widget.settings.articleIds?.length ? widget.settings.articleIds.map(id => publishedArticles.find(story => story.id === id)).filter((item): item is LobbyArticle => Boolean(item)) : publishedArticles;
              return <article className={widgetClass(widget, "dpf-card dpf-news")} key={widget.id} data-widget-id={widget.id}><div className="dpf-section-heading"><span className="dpf-label"><Newspaper size={15}/>{widget.title || "VAN HET PRIKBORD"}</span><span>{widget.description}</span></div><div className="dpf-news-list">{articles.length ? articles.map((story, index) => { const Icon = articleIcons[story.category]; return <button key={story.id} onClick={() => setArticle(story.id)}><span className={`dpf-news-icon dpf-news-icon-${index % 3}`}><Icon size={21}/></span><span><small>{articleLabels[story.category]}</small><strong>{story.title}</strong><span>{story.summary}</span></span><ChevronRight size={18}/></button>; }) : <p className="dpf-inline-empty">Er zijn nog geen nieuwsberichten gepubliceerd. Kom later nog eens kijken.</p>}</div></article>;
            }
            case "poll": return <PollWidget key={`${widget.id}:${JSON.stringify(widget.settings.pollOptions)}:${preview}`} widget={widget} preview={preview}/>;
            case "divisions": return <article className={widgetClass(widget, "dpf-card dpf-division")} key={widget.id} data-widget-id={widget.id}><span className="dpf-label"><Trophy size={15}/>EEN BEETJE VERDER</span><div className="dpf-division-art" aria-hidden="true"><span>IV</span><i/><i/></div><h3>{widget.title}</h3><p>{widget.description}</p><FeedLink {...linkProps} className="dpf-text-link" href={widget.settings.ctaHref} fallback="/divisies">{widget.settings.ctaLabel || "Bekijk de divisies"}<ArrowUpRight size={15}/></FeedLink></article>;
          }
        })}
        {!widgets.length && <div className="dpf-empty dpf-wide"><Newspaper size={27}/><h3>{filter === "Ontdekken" ? "Even rustig op het prikbord." : `Nog niets bij ${filter.toLowerCase()}.`}</h3><p>{filter === "Ontdekken" ? "Nieuwe berichten en activiteiten verschijnen hier zodra ze voor deze kamer zijn gepubliceerd." : "Er is voor deze kamer nog geen inhoud in deze categorie."}</p>{filter !== "Ontdekken" && <button onClick={() => setFilter("Ontdekken")}>Bekijk alles<ArrowRight size={14}/></button>}</div>}
      </div>
      <footer className="dpf-footer"><img src="/brand/icon.svg" alt=""/><span>Blijf nog even hangen.</span><small>{preview ? "Voorbeeld van de geselecteerde kamer" : "Voorbeeldinhoud · reacties lokaal"}</small></footer>
    </section>

    <Dialog open={!!selectedStory} onOpenChange={open => !open && setArticle(null)}><DialogContent className="dp-dialog dpf-article"><DialogHeader><span className="dpf-label">{selectedStory && articleLabels[selectedStory.category]}</span><DialogTitle>{selectedStory?.title}</DialogTitle><DialogDescription>{selectedStory?.summary}</DialogDescription></DialogHeader><div className="dpf-article-body">{selectedStory?.body.split(/\n+/).filter(paragraph => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{selectedStory?.ctaLabel && safeLobbyHref(selectedStory.ctaHref) ? <FeedLink {...linkProps} className="dpf-primary" href={selectedStory.ctaHref}>{selectedStory.ctaLabel}<ArrowRight size={16}/></FeedLink> : <button className="dpf-primary" onClick={() => setArticle(null)}>Terug naar het clubhuis<ArrowRight size={16}/></button>}{preview && previewNotice && <div className="dpf-preview-notice" role="status">{previewNotice}</div>}</DialogContent></Dialog>
  </div>;
}
