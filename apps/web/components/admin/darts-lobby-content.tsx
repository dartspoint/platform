"use client";
import {LobbyTranslationsEditor} from "./lobby-translations";
import {browserLocale} from '../../../../packages/i18n/src/errors';
import {formatLocales} from '../../../../packages/i18n/src/locale';

import {runtimeFeedback} from "../../../../packages/i18n/src/feedback";
import {localiseStaticCopy} from "../../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';


import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleAlert, Copy, Eye, Globe, Heart, LayoutGrid, Megaphone, Monitor, Newspaper, Plus, Save, Send, Smartphone, Sparkles, Target, Trash2, Trophy, Users, Vote } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoomLobbyFeed } from "@/components/darts-room-feed";
import { DartsHeroBackground } from "@/components/darts-hero-background";
import { HeroImageEditor } from "./darts-hero-editor";
import { DEFAULT_HERO_IMAGE, normalizeHeroImage } from "@/lib/darts-hero-image";
import { registrationIsOpen } from "@/lib/darts-tournament-model";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import { useTournaments } from "@/lib/darts-tournament-store";
import { createLobbyArticle, createLobbyWidget, LOBBY_WIDGET_LABELS, publishLobbyLayout, saveLobbyDraft, useLobbyContent, isLobbyVersionConflict, visibleLobbyWidgets, type LobbyArticle, type LobbyLayout, type LobbyWidget, type LobbyContentState, type LobbyFeedPayload } from "@/lib/darts-lobby-content";
import { api, usePlatform } from "@/lib/platform-client";
import "./darts-lobby-content.css";

const kinds: LobbyWidget["type"][] = ["announcement", "tournament", "releases", "players", "challenge", "moment", "news", "poll", "divisions"];
const widgetIcons = { announcement: Megaphone, tournament: Trophy, releases: Sparkles, players: Users, challenge: Target, moment: Heart, news: Newspaper, poll: Vote, divisions: Sparkles };
const descriptions: Record<LobbyWidget["type"], string> = {
  announcement: "Een welkom, mededeling of belangrijke platformupdate.",
  tournament: "Licht een bestaand toernooi uit met actuele deelname.",
  releases: "Toon gepubliceerde toevoegingen en laat spelers een idee insturen.",
  players: "Nodig spelers uit om iemand in hun kamer uit te dagen.",
  challenge: "Verbind het clubhuis met de persoonlijke weekchallenge.",
  moment: "Redactionele aandacht voor een moment uit de community.",
  news: "Een selectie uit je eigen nieuws, updates en uitleg.",
  poll: "Laat de community meedenken met een korte vraag.",
  divisions: "Breng het divisieseizoen onder de aandacht.",
};
const categoryLabels: Record<LobbyArticle["category"], string> = { news: "Nieuws", update: "Productupdate", guide: "Uitleg & tips" };
const categoryLabelsStaticSource = categoryLabels;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function timeLabel(value: number | string | null | undefined) { return value ? new Date(value).toLocaleString(formatLocales[browserLocale()], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nog niet gepubliceerd"; }
function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) { return <label className={`dlc-field${wide ? " wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Source({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) { return <div className="dlc-source"><span><Sparkles size={16}/></span><div><p>{children}</p>{action && onAction && <button type="button" onClick={onAction}>{action}<ArrowRight size={13}/></button>}</div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="dlc-empty"><LayoutGrid size={27}/><strong>{title}</strong><p>{text}</p></div>; }

type NavigationGuard = () => Promise<boolean>;
type Props = { onNavigate?: (tab: string) => void; initialRoomId?: string; initialWidgetType?: "releases"; onRegisterNavigationGuard?: (guard: NavigationGuard | null) => void };
export function AdminLobbyContent(props: Props) {
 const dpT = useI18n("lobbyContent").t;

  const platform = usePlatform();
  const content = useLobbyContent();
  if (platform.actor?.role !== "owner") return <section className="dlc-empty"><strong>{dpT("lobbyContent.lobbybeheer_is_voor_de_platformeigenaar")}</strong><p>{dpT("lobbyContent.alleen_de_eigenaar_kan_concepten_nieuws_en_publicaties")}</p></section>;
  if (content.loading) return <section className="dlc-empty" role="status">{dpT("lobbyContent.lobby_inrichting_laden")}</section>;
  if (content.error || !content.state) return <section className="dlc-empty" role="alert"><p>{content.error || dpT("lobbyContent.de_lobby_inrichting_kan_niet_worden_geladen")}</p><button className="dlc-button" onClick={content.reload}>{dpT("lobbyContent.opnieuw_laden")}</button></section>;
  return <LobbyEditor {...props} stored={content.state} onStored={content.setState} reload={content.reload}/>;
}
function LobbyEditor({ onNavigate, initialRoomId, initialWidgetType, onRegisterNavigationGuard, stored, onStored, reload }: Props & { stored: LobbyContentState; onStored: (state: LobbyContentState) => void; reload: () => void }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("lobbyContent").t;

 const categoryLabels=localiseStaticCopy(categoryLabelsStaticSource,dpT,dpStaticCopyKeys);



  const { rooms } = useAdminOperations();
  const { tournaments } = useTournaments();
  const [layout, setLayout] = useState<LobbyLayout>(() => clone(stored.draft));
  const [touched, setTouched] = useState(false);
  const [tab, setTab] = useState<"widgets" | "articles" | "preview">(initialWidgetType ? "widgets" : initialRoomId ? "preview" : "widgets");
  const [selected, setSelected] = useState((initialWidgetType ? stored.draft.widgets.find(widget => widget.type === initialWidgetType)?.id : stored.draft.widgets[0]?.id) ?? "");
  useEffect(() => {
    if (!initialWidgetType) return;
    setTab("widgets"); setSelected(layout.widgets.find(widget => widget.type === initialWidgetType)?.id ?? "");
  }, [initialWidgetType]);
  const [selectedArticle, setSelectedArticle] = useState(stored.draft.articles[0]?.id ?? "");
  const [showPicker, setShowPicker] = useState(false);
  const [remove, setRemove] = useState<{ type: "widget" | "article"; id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [previewRoom, setPreviewRoom] = useState(initialRoomId ?? rooms[0]?.id ?? "");
  const [previewMode, setPreviewMode] = useState<"draft" | "published">("draft");
  const [previewMobile, setPreviewMobile] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [previewData, setPreviewData] = useState<LobbyFeedPayload | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const saveFlight = useRef(false);
  const persistedLayout = useRef(stored.draft);
  const request = useRef<{ signature: string; id: string } | null>(null);
  async function persist(action: "save" | "publish") {
    if (heroBusy || saveFlight.current) { setNotice({ text: dpFeedback("feedback.wacht_tot_de_afbeelding_of_opslag_is_afgerond"), error: true }); return false; }
    saveFlight.current = true; setSaving(true); setNotice(null);
    const signature = JSON.stringify([action, stored.draftVersion, layout]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    try {
      const next = await (action === "publish" ? publishLobbyLayout : saveLobbyDraft)(layout, stored.draftVersion, request.current.id);
      persistedLayout.current = next.draft; onStored(next); setTouched(false); setConflict(false); request.current = null;
      setNotice({ text: action === "publish" ? dpFeedback("feedback.lobby_gepubliceerd_de_gekozen_kamers_zien_nu_deze") : dpFeedback("feedback.concept_opgeslagen_de_gepubliceerde_lobby_blijft_ongewijzigd_tot") });
      return true;
    } catch (cause) {
      if (isLobbyVersionConflict(cause)) setConflict(true);
      setNotice({ text: cause instanceof Error ? cause.message : dpFeedback("feedback.opslaan_is_niet_gelukt_je_wijzigingen_blijven_in"), error: true });
      return false;
    } finally { saveFlight.current = false; setSaving(false); }
  }
  useEffect(() => { if (!touched) { persistedLayout.current = stored.draft; setLayout(clone(stored.draft)); } }, [stored.draft, touched]);
  const dirty = !same(layout, stored.draft);
  const unpublished = !same(layout, stored.published);
  useEffect(() => {
    onRegisterNavigationGuard?.(async () => { if (heroBusy || saveFlight.current) return false; return same(layout, persistedLayout.current) || await persist("save"); });
    return () => onRegisterNavigationGuard?.(null);
  }, [dirty, heroBusy, layout, stored.draftVersion, onRegisterNavigationGuard]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const widget = layout.widgets.find(item => item.id === selected) ?? (initialWidgetType && !selected ? undefined : layout.widgets[0]);
  const article = layout.articles.find(item => item.id === selectedArticle) ?? layout.articles[0];
  const room = rooms.find(item => item.id === previewRoom) ?? rooms[0];
  const edit = (next: LobbyLayout) => { setLayout(next); setTouched(true); setNotice(null); };
  const patchWidget = (patch: Partial<LobbyWidget>) => { if (widget) edit({ ...layout, widgets: layout.widgets.map(item => item.id === widget.id ? { ...item, ...patch } : item) }); };
  const patchSettings = (patch: Partial<LobbyWidget["settings"]>) => { if (widget) patchWidget({ settings: { ...widget.settings, ...patch } }); };
  const patchArticle = (patch: Partial<LobbyArticle>) => { if (article) edit({ ...layout, articles: layout.articles.map(item => item.id === article.id ? { ...item, ...patch } : item) }); };
  const go = async (target: string) => { if (heroBusy || saveFlight.current) return; if (dirty && !await persist("save")) return; onNavigate?.(target); };
  const save = () => { void persist("save"); };
  const publish = () => { void persist("publish"); };
  const add = (type: LobbyWidget["type"]) => { const next = createLobbyWidget(type); edit({ ...layout, widgets: [...layout.widgets, next] }); setSelected(next.id); setShowPicker(false); setTab("widgets"); };
  const move = (id: string, step: number) => { const list = [...layout.widgets]; const at = list.findIndex(item => item.id === id); const to = at + step; if (at < 0 || to < 0 || to >= list.length) return; [list[at], list[to]] = [list[to], list[at]]; edit({ ...layout, widgets: list }); };
  const duplicate = (item: LobbyWidget) => { const copy = { ...clone(item), id: createLobbyWidget(item.type).id, title: `${item.title || LOBBY_WIDGET_LABELS[item.type]} (kopie)`.slice(0, 140) }; const list = [...layout.widgets]; list.splice(list.findIndex(entry => entry.id === item.id) + 1, 0, copy); edit({ ...layout, widgets: list }); setSelected(copy.id); };
  const addArticle = () => { const next = createLobbyArticle(); edit({ ...layout, articles: [next, ...layout.articles] }); setSelectedArticle(next.id); };
  const confirmRemove = () => { if (!remove) return; if (remove.type === "widget") edit({ ...layout, widgets: layout.widgets.filter(item => item.id !== remove.id) }); else edit({ ...layout, articles: layout.articles.filter(item => item.id !== remove.id), widgets: layout.widgets.map(item => ({ ...item, enabled: item.type === "news" && item.settings.articleIds?.length === 1 && item.settings.articleIds[0] === remove.id ? false : item.enabled, settings: { ...item.settings, articleIds: item.settings.articleIds?.filter(id => id !== remove.id) } })) }); setRemove(null); };
  const roomLabel = (item: LobbyWidget) => item.audience.mode === "all" ? dpT("lobbyContent.copy_alle_kamers") : item.audience.roomIds.length ? item.audience.roomIds.map(id => rooms.find(entry => entry.id === id)?.name ?? "Verwijderde kamer").join(", ") : dpT("lobbyContent.copy_nog_geen_kamer_gekozen");
  const previewLayout = previewMode === "draft" ? layout : stored.published;
  const availableTournaments = tournaments.filter(event => event.published && ["registration", "checkin", "live"].includes(event.status));
  const featuredTournament = widget?.settings.tournamentId ? availableTournaments.find(event => event.id === widget.settings.tournamentId) : availableTournaments.find(event => registrationIsOpen(event)) ?? availableTournaments[0];
  const inheritedHero = normalizeHeroImage(featuredTournament?.hero);

  useEffect(() => {
    if (tab !== "preview" || !room?.id) { setPreviewData(null); return; }
    let disposed = false; setPreviewData(null); setPreviewError(""); setPreviewLoading(true);
    const timer = setTimeout(() => {
      void api<LobbyFeedPayload>("lobby/preview", { layout: previewLayout, roomId: room.id }).then(value => { if (!disposed) setPreviewData(value); }).catch(cause => { if (!disposed) setPreviewError(cause instanceof Error ? cause.message : "Dit voorbeeld kan niet worden geladen."); }).finally(() => { if (!disposed) setPreviewLoading(false); });
    }, 300);
    return () => { disposed = true; clearTimeout(timer); };
  }, [tab, room?.id, previewLayout]);

  return <div className="dlc-page">
    <section className="dlc-intro"><div><span className="dlc-eyebrow">{dpT("lobbyContent.een_clubhuis_ruimte_voor_elke_kamer")}</span><h2>{dpT("lobbyContent.een_levendige_lobby_begint_hier")}</h2><p>{dpT("lobbyContent.bepaal_centraal_wat_spelers_tussen_de_potjes_door")}</p></div><div className="dlc-intro-mark"><LayoutGrid size={35}/><span>{dpT("lobbyContent.centraal_ingericht")}<br/><b>{dpT("lobbyContent.gericht_getoond")}</b></span></div></section>
    <div className="dlc-summary"><span><LayoutGrid size={17}/><strong>{layout.widgets.filter(item => item.enabled).length}</strong> {dpT("lobbyContent.actieve_widgets")}</span><span><Users size={17}/><strong>{layout.widgets.filter(item => item.audience.mode === "rooms").length}</strong> {dpT("lobbyContent.met_kamerselectie")}</span><span><Newspaper size={17}/><strong>{layout.articles.filter(item => item.published).length}</strong> {dpT("lobbyContent.zichtbare_artikelen")}</span><span className="dlc-summary-version"><i/>{stored.publishedAt ? dpT("lobbyContent.publicatie",{revision:stored.revision,value1:timeLabel(stored.publishedAt)}) : dpT("lobbyContent.standaard_lobby_actief")}</span></div>
    <LobbyTranslationsEditor layout={layout} onChange={edit}/><div className="dlc-tabbed"><div className="dlc-tabs" role="tablist" aria-label={dpT("lobbyContent.lobbybeheer")}><button role="tab" aria-selected={tab === "widgets"} onClick={() => setTab("widgets")}><LayoutGrid size={16}/>{dpT("lobbyContent.widgets")}<span>{layout.widgets.length}</span></button><button role="tab" aria-selected={tab === "articles"} onClick={() => setTab("articles")}><Newspaper size={16}/>{dpT("lobbyContent.nieuws_updates")}</button><button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}><Eye size={16}/>{dpT("lobbyContent.voorbeeld")}</button></div>
      <div className="dlc-tab-body" role="tabpanel"><fieldset className="dlc-editing-fields" disabled={saving}>
        {tab === "widgets" && <>
          <div className="dlc-heading-fields"><Field label={dpT("lobbyContent.kleine_bovenregel")}><input maxLength={80} value={layout.eyebrow} onChange={e => edit({ ...layout, eyebrow: e.target.value })}/></Field><Field label={dpT("lobbyContent.begroeting_in_de_lobby")}><input maxLength={100} value={layout.headline} onChange={e => edit({ ...layout, headline: e.target.value })}/></Field></div>
          <div className="dlc-builder"><section className="dlc-widget-list"><div className="dlc-section-heading"><div><h3>{dpT("lobbyContent.het_lobbygrid")}</h3><p>{dpT("lobbyContent.de_volgorde_hieronder_is_de_volgorde_in_de")}</p></div><button className="dlc-button small" onClick={() => setShowPicker(true)}><Plus size={15}/>{dpT("lobbyContent.widget")}</button></div>
            {layout.widgets.map((item, index) => { const Icon = widgetIcons[item.type]; return <div key={item.id} className={`dlc-widget-row${widget?.id === item.id ? " selected" : ""}${!item.enabled ? " disabled" : ""}`}><button className="dlc-widget-select" onClick={() => setSelected(item.id)} aria-pressed={widget?.id === item.id}><span className={`dlc-widget-icon kind-${item.type}`}><Icon size={19}/></span><span><small>{String(index + 1).padStart(2, "0")} · {LOBBY_WIDGET_LABELS[item.type]} · {item.size === "wide" ? dpT("lobbyContent.breed") : dpT("lobbyContent.halve_rij")}</small><strong>{item.title || LOBBY_WIDGET_LABELS[item.type]}</strong><em><Globe size={11}/>{roomLabel(item)}</em></span></button><div className="dlc-row-actions"><label className="dlc-switch" title={item.enabled ? dpT("lobbyContent.widget_uitschakelen") : dpT("lobbyContent.widget_inschakelen")}><input type="checkbox" aria-label={dpT("lobbyContent.zichtbaar",{title:item.title})} checked={item.enabled} onChange={e => edit({ ...layout, widgets: layout.widgets.map(entry => entry.id === item.id ? { ...entry, enabled: e.target.checked } : entry) })}/><i/></label><div><button aria-label={dpT("lobbyContent.omhoog",{title:item.title})} title={dpT("lobbyContent.omhoog_2")} disabled={index === 0} onClick={() => move(item.id, -1)}><ArrowUp size={14}/></button><button aria-label={dpT("lobbyContent.omlaag",{title:item.title})} title={dpT("lobbyContent.omlaag_2")} disabled={index === layout.widgets.length - 1} onClick={() => move(item.id, 1)}><ArrowDown size={14}/></button></div></div></div>; })}
            {!layout.widgets.length && <Empty title={dpT("lobbyContent.begin_met_een_widget")} text="Voeg bijvoorbeeld een aankondiging, toernooi of nieuwsblok toe."/>}
            <button className="dlc-add-row" onClick={() => setShowPicker(true)}><Plus size={16}/>{dpT("lobbyContent.nog_een_widget_toevoegen")}</button>
          </section>
          <section className="dlc-editor">{widget ? <><div className="dlc-section-heading"><div><span className="dlc-eyebrow">{dpT("lobbyContent.widget_instellen")}</span><h3>{LOBBY_WIDGET_LABELS[widget.type]}</h3></div><div className="dlc-icon-actions"><button title={dpT("lobbyContent.widget_dupliceren")} aria-label={dpT("lobbyContent.widget_dupliceren")} onClick={() => duplicate(widget)}><Copy size={16}/></button><button className="danger" title={dpT("lobbyContent.widget_verwijderen")} aria-label={dpT("lobbyContent.widget_verwijderen")} onClick={() => setRemove({ type: "widget", id: widget.id, title: widget.title })}><Trash2 size={16}/></button></div></div>
            <div className="dlc-fields"><Field label={widget.type === "tournament" ? dpT("lobbyContent.eigen_titel_optioneel") : dpT("lobbyContent.titel")} hint={widget.type === "tournament" ? dpT("lobbyContent.laat_leeg_om_de_toernooinaam_te_gebruiken") : undefined} wide><input maxLength={140} value={widget.title} onChange={e => patchWidget({ title: e.target.value })}/></Field><Field label={widget.type === "announcement" ? dpT("lobbyContent.eigen_tekst_welkomsttekst") : dpT("lobbyContent.omschrijving")} wide><textarea rows={3} maxLength={800} value={widget.description} onChange={e => patchWidget({ description: e.target.value })}/></Field><Field label={dpT("lobbyContent.breedte_in_het_grid")}><select value={widget.size} onChange={e => patchWidget({ size: e.target.value as LobbyWidget["size"] })}><option value="half">{dpT("lobbyContent.halve_rij")}</option><option value="wide">{dpT("lobbyContent.volledige_rij")}</option></select></Field><Field label={dpT("lobbyContent.waar_zichtbaar")}><select value={widget.audience.mode} onChange={e => patchWidget({ audience: { mode: e.target.value as "all" | "rooms", roomIds: widget.audience.roomIds } })}><option value="all">{dpT("lobbyContent.alle_kamers")}</option><option value="rooms">{dpT("lobbyContent.geselecteerde_kamers")}</option></select></Field></div>
            {widget.audience.mode === "rooms" && <fieldset className="dlc-checkset"><legend>{dpT("lobbyContent.kamers_voor_deze_widget")}</legend>{rooms.map(entry => <label key={entry.id}><input type="checkbox" checked={widget.audience.roomIds.includes(entry.id)} onChange={e => patchWidget({ audience: { mode: "rooms", roomIds: e.target.checked ? [...widget.audience.roomIds, entry.id] : widget.audience.roomIds.filter(id => id !== entry.id) } })}/><span>{entry.name}<small>{entry.status === "closed" ? dpT("lobbyContent.gesloten") : entry.status === "private" ? dpT("lobbyContent.privekamer") : entry.subtitle}</small></span></label>)}{!rooms.length && <p>{dpT("lobbyContent.maak_eerst_een_kamer_aan_bij_kamerbeheer")}</p>}{widget.audience.roomIds.some(id => !rooms.some(entry => entry.id === id)) && <p className="dlc-inline-warning">{dpT("lobbyContent.deze_selectie_bevat_een_verwijderde_kamer")} <button onClick={() => patchWidget({ audience: { ...widget.audience, roomIds: widget.audience.roomIds.filter(id => rooms.some(entry => entry.id === id)) } })}>{dpT("lobbyContent.selectie_opschonen")}</button></p>}</fieldset>}
            <div className="dlc-content-heading">{dpT("lobbyContent.inhoud_bron")}</div>
            {widget.type === "announcement" && <><Field label={dpT("lobbyContent.bron_van_de_aankondiging")}><select value={widget.settings.announcementSource ?? "platform"} onChange={e => patchSettings({ announcementSource: e.target.value as "platform" | "custom" })}><option value="platform">{dpT("lobbyContent.platformaankondiging")}</option><option value="custom">{dpT("lobbyContent.eigen_widgettekst")}</option></select></Field><Source action="Naar platforminstellingen" onAction={() => void go("platform")}>{widget.settings.announcementSource === "custom" ? dpT("lobbyContent.de_eigen_tekst_hierboven_is_de_aankondiging_handig") : dpT("lobbyContent.een_actieve_platformaankondiging_wordt_automatisch_overgenomen_zonder_actieve")}</Source></>}
            {widget.type === "tournament" && <>
              <Field label={dpT("lobbyContent.uitgelicht_toernooi")}><select value={widget.settings.tournamentId ?? ""} onChange={e => patchSettings({ tournamentId: e.target.value })}><option value="">{dpT("lobbyContent.automatisch_eerstvolgend_beschikbaar_toernooi")}</option>{tournaments.map(event => <option key={event.id} value={event.id}>{event.name}{event.published ? "" : dpT("lobbyContent.verborgen")}</option>)}</select></Field>
              <Source action="Open toernooibeheer" onAction={() => void go("tournaments")}>{dpT("lobbyContent.naam_starttijd_plekken_en_inschrijfstatus_komen_uit_het")}</Source>
              <div className="dlc-widget-imagery">
                <Field label={dpT("lobbyContent.achtergrond_van_deze_widget")} hint={dpT("lobbyContent.deze_keuze_geldt_voor_alle_kamers_waarin_je")}><select value={widget.settings.tournamentImageMode ?? "inherit"} onChange={e => { const mode = e.target.value as "inherit" | "custom" | "none"; patchSettings({ tournamentImageMode: mode, ...(mode === "custom" && !widget.settings.heroImage ? { heroImage: { ...(inheritedHero.src ? inheritedHero : DEFAULT_HERO_IMAGE) } } : {}) }); }}><option value="inherit">{dpT("lobbyContent.hero_van_het_toernooi_overnemen")}</option><option value="custom">{dpT("lobbyContent.eigen_afbeelding_voor_deze_widget")}</option><option value="none">{dpT("lobbyContent.zonder_afbeelding_grafische_stijl")}</option></select></Field>
                {(widget.settings.tournamentImageMode ?? "inherit") === "inherit" && <div className="dlc-inherited-image">
                  <div className="dlc-image-placeholder"><DartsHeroBackground hero={inheritedHero} fallback={<Trophy size={24}/>}/></div>
                  <div><strong>{featuredTournament?.name ?? dpT("lobbyContent.automatisch_gekoppeld")}</strong><p>{inheritedHero.src ? dpT("lobbyContent.de_afbeelding_uitsnede_en_verduistering_volgen_het_toernooi") : dpT("lobbyContent.dit_toernooi_gebruikt_de_grafische_stijl_zonder_foto")}</p></div>
                </div>}
                {widget.settings.tournamentImageMode === "custom" && <HeroImageEditor key={widget.id} value={normalizeHeroImage(widget.settings.heroImage)} onChange={heroImage => patchSettings({ heroImage })} title={dpT("lobbyContent.eigen_widgetafbeelding")} allowNone={false} onBusyChange={setHeroBusy}/>}
                {widget.settings.tournamentImageMode === "none" && <p className="dlc-help">{dpT("lobbyContent.de_vertrouwde_groene_toernooikaart_met_trofee_blijft_zichtbaar")}</p>}
                <button type="button" className="dlc-image-preview-link" onClick={() => { setPreviewMode("draft"); setTab("preview"); }}><Eye size={14}/>{dpT("lobbyContent.bekijk_de_widget_in_de_kamer")}<ArrowRight size={13}/></button>
              </div>
            </>}
            {widget.type === "challenge" && <Source action="Oefenruimte bekijken" onAction={() => window.open("/oefenen", "_blank", "noopener,noreferrer")}>{dpT("lobbyContent.de_weekchallenge_en_voortgang_komen_uit_de_oefenruimte")}</Source>}
            {widget.type === "releases" && <><div className="dlc-fields"><Field label={dpT("lobbyContent.aantal_recente_toevoegingen")}><select value={widget.settings.releaseLimit ?? 3} onChange={e => patchSettings({ releaseLimit: Number(e.target.value) })}>{[1,2,3,4,5].map(count => <option key={count} value={count}>{count} {count === 1 ? dpT("lobbyContent.toevoeging") : dpT("lobbyContent.toevoegingen")}</option>)}</select></Field><Field label={dpT("lobbyContent.knop_idee_inbrengen")}><select value={widget.settings.allowIdeas === false ? "hide" : "show"} onChange={e => patchSettings({ allowIdeas: e.target.value === "show" })}><option value="show">{dpT("lobbyContent.tonen_in_deze_widget")}</option><option value="hide">{dpT("lobbyContent.verbergen_in_deze_widget")}</option></select></Field></div><Source action="Open releasebeheer" onAction={() => void go("releases")}>{dpT("lobbyContent.de_inhoud_komt_uit_releasebeheer_alleen_toevoegingen_die")}</Source></>}
            {widget.type === "moment" && <><p className="dlc-help">{dpT("lobbyContent.plaats_hier_een_mooi_moment_uit_de_community")}</p><div className="dlc-fields"><Field label={dpT("lobbyContent.gebruikersnaam")}><input maxLength={40} value={widget.settings.playerName ?? ""} onChange={e => patchSettings({ playerName: e.target.value })}/></Field><Field label={dpT("lobbyContent.score_prestatie")}><input maxLength={20} value={widget.settings.score ?? ""} onChange={e => patchSettings({ score: e.target.value })}/></Field><Field label={dpT("lobbyContent.label_bij_de_score")}><input maxLength={80} value={widget.settings.scoreLabel ?? ""} onChange={e => patchSettings({ scoreLabel: e.target.value })}/></Field></div></>}
            {widget.type === "poll" && <><p className="dlc-help">{dpT("lobbyContent.de_titel_is_je_vraag_voeg_twee_tot")}</p><div className="dlc-poll-options">{(widget.settings.pollOptions ?? []).map((option, index, options) => <div key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={dpT("lobbyContent.antwoord",{value0:index + 1})} maxLength={100} value={option} onChange={e => patchSettings({ pollOptions: options.map((text, at) => at === index ? e.target.value : text) })}/><button aria-label={dpT("lobbyContent.antwoord_verwijderen",{value0:index + 1})} disabled={options.length <= 2} onClick={() => patchSettings({ pollOptions: options.filter((_, at) => at !== index) })}><Trash2 size={14}/></button></div>)}</div><button className="dlc-add-row" disabled={(widget.settings.pollOptions?.length ?? 0) >= 5} onClick={() => patchSettings({ pollOptions: [...(widget.settings.pollOptions ?? []), ""] })}><Plus size={14}/>{dpT("lobbyContent.antwoord_toevoegen")}</button><p className="dlc-help">{dpT("lobbyContent.iedere_speler_kan_een_stem_uitbrengen_wijzig_je")}</p></>}
            {widget.type === "news" && <><fieldset className="dlc-checkset"><legend>{dpT("lobbyContent.artikelen_in_dit_blok")}</legend><p className="dlc-help">{dpT("lobbyContent.geen_selectie_dan_verschijnen_alle_artikelen_die_je")}</p>{layout.articles.map(entry => <label key={entry.id}><input type="checkbox" checked={widget.settings.articleIds?.includes(entry.id) ?? false} onChange={e => patchSettings({ articleIds: e.target.checked ? [...(widget.settings.articleIds ?? []), entry.id] : (widget.settings.articleIds ?? []).filter(id => id !== entry.id) })}/><span>{entry.title}<small>{categoryLabels[entry.category]}{entry.published ? "" : dpT("lobbyContent.verborgen_verschijnt_niet_in_de_lobby")}</small></span></label>)}{!layout.articles.length && <p className="dlc-help">{dpT("lobbyContent.er_zijn_nog_geen_artikelen")}</p>}</fieldset><Source action="Nieuws & updates beheren" onAction={() => setTab("articles")}>{dpT("lobbyContent.artikelen_beheer_je_centraal_selecteer_hier_welke_berichten")}</Source></>}
            {(widget.type === "players" || widget.type === "divisions" || widget.type === "challenge" || widget.type === "tournament") && <Field label={dpT("lobbyContent.tekst_op_de_knop")}><input maxLength={60} value={widget.settings.ctaLabel ?? ""} onChange={e => patchSettings({ ctaLabel: e.target.value })} placeholder={dpT("lobbyContent.gebruik_de_standaardtekst")}/></Field>}
            {widget.type === "players" && <Source>{dpT("lobbyContent.het_aantal_spelers_en_de_spelerslijst_volgen_altijd")}</Source>}
            {widget.type === "divisions" && <Source action="Naar seizoenen & divisies" onAction={() => void go("seasons")}>{dpT("lobbyContent.de_knop_opent_het_bestaande_divisieoverzicht_de_seizoensindeling")}</Source>}
            <div className="dlc-editor-foot"><Globe size={14}/><span>{roomLabel(widget)} · {widget.enabled ? dpT("lobbyContent.zichtbaar_na_publicatie") : dpT("lobbyContent.widget_uitgeschakeld")}</span></div>
          </> : initialWidgetType === "releases" ? <div><Empty title={dpT("lobbyContent.laatste_toevoegingen_is_nog_niet_ingericht")} text="Voeg de releasewidget bewust toe aan je concept. Kies daarna de breedte, volgorde en kamers en publiceer de lobby."/><button type="button" className="dlc-add-row" onClick={() => add("releases")}><Plus size={15}/>{dpT("lobbyContent.laatste_toevoegingen_toevoegen")}</button><Source action="Open releasebeheer" onAction={() => void go("releases")}>{dpT("lobbyContent.gepubliceerde_toevoegingen_beheer_je_centraal_een_verwijderde_widget")}</Source></div> : <Empty title={dpT("lobbyContent.kies_je_eerste_widget")} text="Gebruik ‘Widget toevoegen’ om je lobby samen te stellen."/>}</section></div>
        </>}
        {tab === "articles" && <div className="dlc-builder"><section className="dlc-widget-list"><div className="dlc-section-heading"><div><h3>{dpT("lobbyContent.nieuws_updates")}</h3><p>{dpT("lobbyContent.een_artikel_te_gebruiken_in_meerdere_widgets")}</p></div><button className="dlc-button small" onClick={addArticle}><Plus size={15}/>{dpT("lobbyContent.artikel")}</button></div>{layout.articles.map(item => <button className={`dlc-article-row${article?.id === item.id ? " selected" : ""}`} key={item.id} onClick={() => setSelectedArticle(item.id)}><span><small>{categoryLabels[item.category]}<i className={item.published ? "visible" : ""}>{item.published ? dpT("lobbyContent.zichtbaar_2") : dpT("lobbyContent.verborgen_2")}</i></small><strong>{item.title || dpT("lobbyContent.nieuw_artikel")}</strong><p>{item.summary || dpT("lobbyContent.voeg_een_korte_introductie_toe")}</p></span><ArrowRight size={16}/></button>)}{!layout.articles.length && <Empty title={dpT("lobbyContent.schrijf_je_eerste_update")} text="Een nieuw seizoen, een productverbetering of een verhaal uit de community."/>}</section><section className="dlc-editor">{article ? <><div className="dlc-section-heading"><div><span className="dlc-eyebrow">{dpT("lobbyContent.artikel_bewerken")}</span><h3>{article.title || dpT("lobbyContent.nieuw_artikel")}</h3></div><button className="dlc-icon-button danger" title={dpT("lobbyContent.artikel_verwijderen")} aria-label={dpT("lobbyContent.artikel_verwijderen")} onClick={() => setRemove({ type: "article", id: article.id, title: article.title || "Nieuw artikel" })}><Trash2 size={16}/></button></div><div className="dlc-fields"><Field label={dpT("lobbyContent.titel")} wide><input maxLength={140} value={article.title} onChange={e => patchArticle({ title: e.target.value })}/></Field><Field label={dpT("lobbyContent.soort_bericht")}><select value={article.category} onChange={e => patchArticle({ category: e.target.value as LobbyArticle["category"] })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={dpT("lobbyContent.beschikbaarheid")}><select value={article.published ? "published" : "hidden"} onChange={e => patchArticle({ published: e.target.value === "published" })}><option value="published">{dpT("lobbyContent.zichtbaar_na_publicatie")}</option><option value="hidden">{dpT("lobbyContent.verborgen_in_voorbereiding")}</option></select></Field><Field label={dpT("lobbyContent.korte_introductie")} wide><textarea rows={2} maxLength={400} value={article.summary} onChange={e => patchArticle({ summary: e.target.value })}/></Field><Field label={dpT("lobbyContent.volledig_artikel")} hint={dpT("lobbyContent.gebruik_een_lege_regel_tussen_alinea_s")} wide><textarea className="dlc-article-body" rows={10} maxLength={12000} value={article.body} onChange={e => patchArticle({ body: e.target.value })}/></Field><Field label={dpT("lobbyContent.optionele_knoptekst")}><input maxLength={60} value={article.ctaLabel ?? ""} onChange={e => patchArticle({ ctaLabel: e.target.value })} placeholder={dpT("lobbyContent.bijvoorbeeld_bekijk_de_divisies")}/></Field><Field label={dpT("lobbyContent.interne_bestemming")} hint={dpT("lobbyContent.bijvoorbeeld_divisies_of_oefenen")}><input maxLength={200} value={article.ctaHref ?? ""} onChange={e => patchArticle({ ctaHref: e.target.value })} placeholder="/divisies"/></Field></div><Source>{dpT("lobbyContent.een_artikel_verschijnt_via_een_nieuws_widget_de")}</Source></> : <Empty title={dpT("lobbyContent.nog_geen_artikelen")} text="Maak een artikel aan en koppel het aan een nieuws-widget."/>}</section></div>}
        {tab === "preview" && <><div className="dlc-preview-toolbar"><Field label={dpT("lobbyContent.bekijk_de_lobby_in")}><select value={room?.id ?? ""} onChange={e => setPreviewRoom(e.target.value)}>{rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><div className="dlc-segment" aria-label={dpT("lobbyContent.versie")}><button aria-pressed={previewMode === "draft"} onClick={() => setPreviewMode("draft")}>{dpT("lobbyContent.huidig_concept")}</button><button aria-pressed={previewMode === "published"} onClick={() => setPreviewMode("published")}>{dpT("lobbyContent.gepubliceerd")}</button></div><div className="dlc-segment dlc-device"><button title={dpT("lobbyContent.desktopbreedte")} aria-label={dpT("lobbyContent.desktopvoorbeeld")} aria-pressed={!previewMobile} onClick={() => setPreviewMobile(false)}><Monitor size={17}/></button><button title={dpT("lobbyContent.mobiele_breedte")} aria-label={dpT("lobbyContent.mobiel_voorbeeld")} aria-pressed={previewMobile} onClick={() => setPreviewMobile(true)}><Smartphone size={17}/></button></div></div><div className="dlc-preview-note"><Eye size={15}/><span>{visibleLobbyWidgets(previewLayout, room?.id).length} {dpT("lobbyContent.widgets_ingesteld_voor")} {room?.name ?? dpT("lobbyContent.deze_kamer")}{dpT("lobbyContent.dit_voorbeeld_volgt")} {previewMode === "draft" ? dpT("lobbyContent.je_huidige_nog_niet_gepubliceerde_wijzigingen") : dpT("lobbyContent.de_gepubliceerde_lobby")}.</span></div><div className={`dlc-preview-frame${previewMobile ? " mobile" : ""}`}><div className="dlc-preview-chrome"><span><i/><i/><i/></span><small>{room?.name ?? dpT("lobbyContent.kamer")} · {previewMode === "draft" ? dpT("lobbyContent.concept") : dpT("lobbyContent.gepubliceerd_2")}</small><LayoutGrid size={13}/></div>{previewLoading ? <p className="dlc-help" role="status">{dpT("lobbyContent.voorbeeld_laden")}</p> : previewError ? <p className="dlc-help" role="alert">{previewError}</p> : previewData ? <RoomLobbyFeed previewPayload={previewData} roomId={room?.id} roomName={room?.name ?? "Nederland 1"} roomCount={room?.count ?? 0} layoutOverride={previewData.layout} preview onPlayers={() => setNotice({ text: dpFeedback("feedback.deze_knop_opent_voor_spelers_de_spelerslijst_van") })} onTournaments={() => setNotice({ text: dpFeedback("feedback.deze_knop_opent_voor_spelers_het_toernooioverzicht") })} onProfile={name => setNotice({ text: dpFeedback("feedback.deze_knop_opent_voor_spelers_het_profiel_van",{value0:name}) })}/> : <p className="dlc-help">{dpT("lobbyContent.kies_een_bestaande_kamer_voor_het_voorbeeld")}</p>}</div></>}
      </fieldset></div>
    </div>
    {notice && <div className={`dlc-notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.error ? <CircleAlert size={17}/> : <Check size={17}/>}<span>{notice.text}</span></div>}
    <div className="dlc-savebar"><div><span className={`dlc-save-dot${dirty || unpublished ? " pending" : ""}`}/><span><strong>{dirty ? dpT("lobbyContent.wijzigingen_nog_niet_opgeslagen") : unpublished ? dpT("lobbyContent.concept_opgeslagen_nog_niet_gepubliceerd") : dpT("lobbyContent.lobby_is_bijgewerkt")}</strong><small>{dirty ? dpT("lobbyContent.sla_op_als_concept_of_publiceer_direct") : dpT("lobbyContent.laatst_opgeslagen",{saved:String(!!stored.savedAt),time:stored.savedAt?timeLabel(stored.savedAt):""})}</small></span></div><div><button className="dlc-button" disabled={!dirty || heroBusy || saving || conflict} onClick={save}><Save size={15}/>{dpT("lobbyContent.concept_opslaan")}</button><button className="dlc-button primary" disabled={heroBusy || saving || conflict || (!unpublished && !dirty)} onClick={publish}><Send size={15}/>{dpT("lobbyContent.publiceren")}</button></div></div>
    {conflict && <Dialog open onOpenChange={setConflict}><DialogContent className="dlc-dialog dlc-confirm"><DialogHeader><DialogTitle>{dpT("lobbyContent.een_ander_concept_is_opgeslagen")}</DialogTitle><DialogDescription>{dpT("lobbyContent.een_andere_beheerder_heeft_inmiddels_wijzigingen_opgeslagen_jouw")}</DialogDescription></DialogHeader><div className="dlc-confirm-actions"><button className="dlc-button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "dartspoint-lobby-concept.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{dpT("lobbyContent.eigen_concept_bewaren")}</button><button className="dlc-button primary" onClick={() => { setTouched(false); setConflict(false); reload(); }}>{dpT("lobbyContent.nieuwste_concept_laden")}</button></div></DialogContent></Dialog>}
    {showPicker && <Dialog open onOpenChange={setShowPicker}><DialogContent className="dlc-dialog"><DialogHeader><DialogTitle>{dpT("lobbyContent.wat_voeg_je_toe_aan_de_lobby")}</DialogTitle><DialogDescription>{dpT("lobbyContent.kies_een_widget_daarna_stel_je_inhoud_breedte")}</DialogDescription></DialogHeader><div className="dlc-type-grid">{kinds.map(type => { const Icon = widgetIcons[type]; return <button key={type} onClick={() => add(type)}><span className={`dlc-widget-icon kind-${type}`}><Icon size={20}/></span><strong>{LOBBY_WIDGET_LABELS[type]}</strong><p>{descriptions[type]}</p><Plus size={15}/></button>; })}</div></DialogContent></Dialog>}
    {remove && <Dialog open onOpenChange={open => !open && setRemove(null)}><DialogContent className="dlc-dialog dlc-confirm"><DialogHeader><DialogTitle>{remove.type === "widget" ? dpT("lobbyContent.widget") : dpT("lobbyContent.artikel")} {dpT("lobbyContent.verwijderen")}</DialogTitle><DialogDescription>‘{remove.title}{dpT("lobbyContent.wordt_uit_je_concept_verwijderd")}{remove.type === "article" ? dpT("lobbyContent.ook_selecties_in_nieuws_widgets_worden_bijgewerkt_nieuws") : dpT("lobbyContent.de_andere_widgets_blijven_op_hun_plek")} {dpT("lobbyContent.de_wijziging_wordt_zichtbaar_na_publicatie")}</DialogDescription></DialogHeader><div className="dlc-confirm-actions"><button className="dlc-button" onClick={() => setRemove(null)}>{dpT("lobbyContent.annuleren")}</button><button className="dlc-button danger" onClick={confirmRemove}><Trash2 size={15}/>{dpT("lobbyContent.verwijderen_2")}</button></div></DialogContent></Dialog>}
  </div>;
}

const dpStaticCopyKeys={
  "Nieuws": "lobbyContent.copy_nieuws",
  "Productupdate": "lobbyContent.copy_productupdate",
  "Uitleg & tips": "lobbyContent.copy_uitleg_tips",
  "Alle kamers": "lobbyContent.copy_alle_kamers",
  "Nog geen kamer gekozen": "lobbyContent.copy_nog_geen_kamer_gekozen"
};
