"use client";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {LanguagePicker} from "./language-picker";
import {selfName} from "@/lib/platform-client";

import { useEffect, useRef, useState } from "react";
import {LocalizedLink as Link} from "./localized-link";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Crown, Eye, Menu, MessageCircle, Pause, Play, Shield, Smartphone, Target, Trophy, Users, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Dartboard } from "@/components/darts-game";
import { scoreDart } from "@/lib/darts-rules";
import { usePublicData } from "@/lib/darts-public-data";
import "./darts-marketing.css";

const navigation = [{ label: "Het spel", href: "#het-spel" }, { label: "Toernooien", href: "#toernooien" }, { label: "Ladders", href: "#ladders" }, { label: "De club", href: "#de-club" }];
const navigationStaticSource = navigation;
const slideNames = ["Toernooi", "Divisies", "DP-ladder"];
const slideNamesStaticSource = slideNames;
const previewDarts = [{ id: 1, hit: scoreDart(-.018, -.603) }, { id: 2, hit: scoreDart(.018, -.619) }, { id: 3, hit: scoreDart(.005, -.59) }];
const openingPreviewDarts = [{ id: 1, hit: scoreDart(0, -.975) }, ...previewDarts.slice(1)];
const tournamentFormatLabel = (format: string) => format === "double-elimination" ? "Dubbele eliminatie" : "Knock-out";
const tournamentFormatLabelStaticSource = tournamentFormatLabel;
const doNothing = () => {};
const faq = [
  { question: "Heb ik een echt dartbord nodig?", answer: "Nee. DartsPoint is een digitaal dartspel. Je bepaalt de richting en hoogte met twee bewegende balken en de rode gooiknop. Je speelt met je muis, toetsenbord of touchscreen." },
  { question: "Welke spelvormen kan ik spelen?", answer: "Je kunt 301 dubbel-in/dubbel-uit, 501 en 701 spelen. Voor 501 en 701 begin je zonder openingsdubbel en eindig je op een dubbel. Bij een uitnodiging kies je legs of sets en of je voor de DP-ranking wilt spelen." },
  { question: "Hoe werkt mijn DP-rating?", answer: "Je begint op 1500. Het resultaat en de rating van je tegenstander bepalen hoeveel je stijgt of daalt. Vrij spelen en oefenen tellen niet mee. Je rating is voorlopig totdat je minimaal tien rankingwedstrijden tegen vijf verschillende tegenstanders hebt gespeeld." },
  { question: "Wat is het verschil tussen de ladder en divisies?", answer: "De DP-ladder laat de speelsterkte zien op basis van rankingwedstrijden. Een divisie is een seizoenscompetitie met een eigen programma en stand. Daar tellen competitiepunten: drie voor winst, nul voor verlies. Aan het eind van het seizoen kun je promoveren of degraderen." },
  { question: "Kan ik toernooien bekijken zonder mee te spelen?", answer: "Ja. Elk toernooi heeft een eigen kamer. Als toeschouwer kun je het speelschema en de wedstrijden bekijken. Schrijf je je in, dan speel je de wedstrijden die voor je klaarstaan." },
  { question: "Kan ik tegen andere spelers spelen?", answer: "Je speelt met je eigen account tegen andere spelers. DartsPoint houdt worpen, uitslagen, DP en competities bij. Oefenen en vrije partijen veranderen je DP niet." },
];
const faqStaticSource = faq;

function Brand({ compact = false }: { compact?: boolean }) {
 const dpT = useI18n("marketing").t;

  return <span className={`mk-brand${compact ? " mk-brand-small" : ""}`}><img src="/brand/icon.svg" width="44" height="44" alt=""/><img src="/brand/wordmark.svg" width="167" height="38" alt={dpT("marketing.dartspoint")}/></span>;
}
function PrimaryLink({ children, href = "/registreren", className = "" }: { children: React.ReactNode; href?: string; className?: string }) {
  return <Link className={`mk-cta ${className}`} href={href}>{children}<ArrowUpRight size={19} aria-hidden="true"/></Link>;
}
function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <span className={`mk-kicker${light ? " is-light" : ""}`}><span/>{children}</span>;
}
function RoleName({ name, role }: { name: string; role?: string }) {
 const dpT = useI18n("marketing").t;

  return <span className={`mk-player-name mk-role-${role || "player"}`}>{role === "vip" && <Crown size={13} aria-label={dpT("marketing.vip")}/>}{name}</span>;
}
function MarketingNav() {
 const dpT = useI18n("marketing").t;

 const navigation=localiseStaticCopy(navigationStaticSource,dpT,dpStaticCopyKeys);



  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  return <header className="mk-header"><div className="mk-header-inner">
    <Link href="/" aria-label={dpT("marketing.dartspoint_startpagina")}><Brand/></Link>
    <nav aria-label={dpT("marketing.hoofdnavigatie")} className="mk-desktop-nav"><LanguagePicker/>{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
    <div className="mk-header-actions"><Link href="/inloggen" className="mk-login-link">{dpT("marketing.inloggen")}</Link><PrimaryLink className="mk-header-register">{dpT("marketing.maak_je_account")}</PrimaryLink>
      <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button className="mk-menu-trigger" aria-label={dpT("marketing.open_menu")}><Menu size={24}/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="mk-menu-overlay"/><Dialog.Content className="mk-mobile-menu" onCloseAutoFocus={event => { if (navigating.current) { event.preventDefault(); navigating.current = false; } }}><div className="mk-menu-top"><Brand compact/><Dialog.Close asChild><button aria-label={dpT("marketing.sluit_menu")}><X size={23}/></button></Dialog.Close><LanguagePicker/></div><Dialog.Title className="sr-only">{dpT("marketing.dartspoint_menu")}</Dialog.Title><Dialog.Description className="sr-only">{dpT("marketing.ontdek_het_spel_de_toernooien_en_de_ladders")}</Dialog.Description><nav aria-label={dpT("marketing.mobiele_hoofdnavigatie")}>{navigation.map((item, index) => <a onClick={() => { navigating.current = true; setOpen(false); }} href={item.href} key={item.href}><span>0{index + 1}</span>{item.label}<ArrowUpRight size={25}/></a>)}</nav><div className="mk-menu-bottom"><PrimaryLink>{dpT("marketing.maak_je_account")}</PrimaryLink><Link href="/inloggen" onClick={() => setOpen(false)}>{dpT("marketing.al_bekend_bij_dartspoint_inloggen")} <ArrowRight size={15}/></Link><p>{dpT("marketing.jouw_kamer_jouw_wedstrijd")}<br/>{dpT("marketing.schuif_aan_voor_je_volgende_potje")}</p></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  </div></header>;
}

function HeroSpotlight() {
 const dpT = useI18n("marketing").t;

 const slideNames=localiseStaticCopy(slideNamesStaticSource,dpT,dpStaticCopyKeys);



  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const change = () => setHidden(document.hidden); document.addEventListener("visibilitychange", change); change(); return () => document.removeEventListener("visibilitychange", change); }, []);
  useEffect(() => {
    if (paused || interacting || hidden || reduced) return;
    const timer = window.setInterval(() => setSlide(value => (value + 1) % 3), 6500);
    return () => window.clearInterval(timer);
  }, [paused, interacting, hidden, reduced]);
  const event = PUBLIC_EVENTS.find(item => item.status === "registration");
  const top = PUBLIC_LADDER.slice(0, 3);
  const select = (index: number) => { setSlide(index); setPaused(true); };
  return <div ref={root} className="mk-spotlight" role="region" aria-roledescription="carrousel" aria-label={dpT("marketing.ontdek_dartspoint")} onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={event => { if (!root.current?.contains(event.relatedTarget as Node)) setInteracting(false); }}>
    <div className="mk-spotlight-heading"><span><span/>{dpT("marketing.in_de_spotlight")}</span><span className="mk-demo-tag">{dpT("marketing.dartspoint_2")}</span></div>
    <div className="mk-spotlight-body" aria-live={paused ? "polite" : "off"}><AnimatePresence mode="wait" initial={false}><motion.div key={slide} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: .25 }}>
      {slide === 0 && <><div className="mk-spotlight-icon"><Trophy size={25}/><span>{dpT("marketing.de_avond_is_nog_jong")}</span></div><h2>{event?.name || dpT("marketing.de_volgende_avondcup")}</h2><p>{event ? dpT("marketing.spelers_een_speelschema_je_kans_op_de_finale",{maxPlayers:event.maxPlayers}) : dpT("marketing.een_eigen_kamer_een_spannend_speelschema_je_volgende")}</p><div className="mk-spotlight-meta"><span>{dpT("marketing.501_double_out")}</span><span>{dpT("marketing.schuif_aan")}</span></div><a href="#toernooien" className="mk-text-link">{dpT("marketing.ontdek_de_toernooien")} <ArrowUpRight size={17}/></a></>}
      {slide === 1 && <><div className="mk-spotlight-icon"><Shield size={25}/><span>{dpT("marketing.speel_voor_jouw_plek")}</span></div><h2>{dpT("marketing.een_seizoen")}<br/>{dpT("marketing.jouw_divisie")}</h2><p>{dpT("marketing.vaste_tegenstanders_elke_week_een_nieuw_hoofdstuk_wie")}</p><div className="mk-division-medals" aria-label={dpT("marketing.divisiecompetitie")}><span><Shield/>D1</span><span><Shield/>D2</span><span><Shield/>D3</span></div><a href="#ladders" className="mk-text-link">{dpT("marketing.bekijk_de_divisieladders")} <ArrowUpRight size={17}/></a></>}
      {slide === 2 && <><div className="mk-spotlight-icon"><Target size={25}/><span>{dpT("marketing.iedereen_begint_op_1500")}</span></div><h2>{dpT("marketing.de_ladder_roept")}</h2><div className="mk-mini-ladder">{top.map((player, index) => <div key={player.name}><span>0{index + 1}</span><RoleName name={player.name} role={player.role}/><b>{player.rating}</b></div>)}</div><a href="#ladders" className="mk-text-link">{dpT("marketing.ontdek_jouw_volgende_doel")} <ArrowUpRight size={17}/></a></>}
    </motion.div></AnimatePresence></div>
    <div className="mk-spotlight-controls"><div className="mk-slide-dots">{slideNames.map((name, index) => <button key={name} aria-label={dpT("marketing.toon",{name:name})} aria-pressed={slide === index} className={slide === index ? "is-active" : ""} onClick={() => select(index)}><span/></button>)}</div><span>{String(slide + 1).padStart(2, "0")} / 03</span><div className="mk-slide-buttons"><button aria-label={dpT("marketing.vorige_spotlight")} onClick={() => select((slide + 2) % 3)}><ChevronLeft size={16}/></button><button aria-label={paused || reduced ? dpT("marketing.laat_de_kaarten_weer_afwisselen") : dpT("marketing.pauzeer_de_kaarten")} aria-pressed={paused || Boolean(reduced)} disabled={Boolean(reduced)} title={reduced ? dpT("marketing.de_kaarten_wisselen_niet_automatisch_omdat_je_minder") : undefined} onClick={() => setPaused(value => !value)}>{paused || reduced ? <Play size={13}/> : <Pause size={13}/>}</button><button aria-label={dpT("marketing.volgende_spotlight")} onClick={() => select((slide + 1) % 3)}><ChevronRight size={16}/></button></div></div>
  </div>;
}

function GameplayPreview() {
 const dpT = useI18n("marketing").t;

  const [mode, setMode] = useState<301 | 501 | 701>(501);
  return <div className="mk-game-preview">
    <div className="mk-preview-top"><Brand compact/><span><span/>{dpT("marketing.spelvoorbeeld")}</span></div>
    <div className="mk-preview-mode"><span>{mode === 301 ? dpT("marketing.double_in_double_out") : dpT("marketing.double_out")}</span><div aria-label={dpT("marketing.spelvorm_kiezen")} role="group">{([301, 501, 701] as const).map(value => <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value}>{value}</button>)}</div></div>
    <div className="mk-preview-board"><div className="mk-preview-horizontal" aria-hidden="true"><ArrowRight size={15}/><span><i/></span></div><Dartboard darts={mode === 301 ? openingPreviewDarts : previewDarts} pendingId={null} onLand={doNothing} lessMotion/><div className="mk-preview-vertical" aria-hidden="true"><span>↑</span><i><b/></i><span>↓</span></div><Link href="/inloggen?next=/spelen" className="mk-throw-preview" aria-label={dpT("marketing.open_dartspoint_om_zelf_te_gooien")}>{dpT("marketing.gooi")}<ArrowUpRight size={22}/></Link></div>
    <div className="mk-preview-score"><div className="mk-preview-score-head"><span>{mode} {dpT("marketing.best_of_3_legs")}</span><span>{dpT("marketing.voorbeeldwedstrijd")}</span></div><div className="mk-preview-score-row"><span className="mk-role-player">{dpT("marketing.speler_a")} <small>[1500]</small></span><span className="mk-preview-active-dot"/><b>{mode === 301 ? 141 : mode - 180}</b><strong>{mode === 301 ? 160 : 180}</strong></div><div className="mk-preview-score-row"><span className="mk-role-player"><Crown size={14}/> {dpT("marketing.speler_b")} <small>[1500]</small></span><span/><b>{mode}</b><strong>—</strong></div></div>
    <div className="mk-preview-bottom"><span>{dpT("marketing.richt_gooi_en_zie_je_score")}</span><span><Smartphone size={13}/> {dpT("marketing.ook_op_mobiel")}</span></div>
  </div>;
}

function RankingSection() {
 const dpT = useI18n("marketing").t;

  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  const [selected, setSelected] = useState("elo");
  const division = PUBLIC_DIVISIONS.find(item => item.id === selected);
  const tabs = [{ id: "elo", name: dpT("marketing.copy_dp_ladder") }, ...PUBLIC_DIVISIONS.map(item => ({ id: item.id, name: item.name }))];
  return <section className="mk-rankings" id="ladders" aria-labelledby="mk-ranking-title"><div className="mk-wrap mk-ranking-layout">
    <div className="mk-ranking-copy"><Kicker light>{dpT("marketing.voor_de_volgende_stap")}</Kicker><h2 id="mk-ranking-title">{dpT("marketing.elk_potje_brengt")}<br/>{dpT("marketing.je")} <em>{dpT("marketing.een_stap_verder")}</em></h2><p>{dpT("marketing.de_eerste_dubbel_je_eerste_180_of_die")}</p><div className="mk-ranking-explainer"><div><span className="mk-ranking-number">1500</span><div><h3>{dpT("marketing.jouw_vertrekpunt")}</h3><p>{dpT("marketing.dp_groeit_met_je_mee_speel_voor_je")}</p></div></div><div><Shield size={38} strokeWidth={1}/><div><h3>{dpT("marketing.jouw_plek_in_de_divisie")}</h3><p>{dpT("marketing.een_eigen_speelschema_competitiepunten_en_een_badge_een")}</p></div></div></div><Link href="/registreren" className="mk-text-link">{dpT("marketing.zet_jouw_eerste_stap")} <ArrowUpRight size={18}/></Link></div>
    <div className="mk-ranking-card"><div className="mk-ranking-card-head"><div><span>{dpT("marketing.de_stand_van_de_club")}</span><h3>{division ? division.name : dpT("marketing.de_dp_ladder")}</h3></div><span className="mk-demo-tag">{dpT("marketing.actuele_stand")}</span></div>
      <div className="mk-ranking-tabs" role="tablist" aria-label={dpT("marketing.kies_een_ladder")}>{tabs.map(tab => <button key={tab.id} id={`mk-tab-${tab.id}`} aria-controls="mk-ladder-panel" role="tab" aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") { event.preventDefault(); const index = tabs.findIndex(item => item.id === selected); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setSelected(tabs[next].id); document.getElementById(`mk-tab-${tabs[next].id}`)?.focus(); } }} onClick={() => setSelected(tab.id)}>{tab.name === "Premier Division" ? dpT("marketing.premier") : tab.name}</button>)}</div>
      <div id="mk-ladder-panel" role="tabpanel" tabIndex={0} aria-labelledby={`mk-tab-${selected}`} className="mk-ladder-panel">
        <table><caption className="sr-only">{division ? dpT("marketing.gespeelde_wedstrijden_legsaldo_en_competitiepunten",{name:division.name}) : dpT("marketing.dp_ladder_met_spelers_en_ratings")}</caption><thead><tr><th scope="col">#</th><th scope="col">{dpT("marketing.speler")}</th>{division ? <><th scope="col">G</th><th scope="col">+/−</th><th scope="col">{dpT("marketing.ptn")}</th></> : <><th scope="col">{dpT("marketing.gespeeld")}</th><th scope="col">{dpT("marketing.dp")}</th></>}</tr></thead><tbody>{division ? division.standings.map(player => <tr key={player.name}><td>{String(player.rank).padStart(2, "0")}</td><th scope="row"><span className="mk-table-avatar">{player.name.slice(0, 1)}</span>{player.name}</th><td>{player.played}</td><td>{player.legDifference > 0 ? "+" : ""}{player.legDifference}</td><td><b>{player.points}</b></td></tr>) : PUBLIC_LADDER.slice(0, 5).map((player, index) => <tr key={player.name}><td>{String(index + 1).padStart(2, "0")}</td><th scope="row"><span className="mk-table-avatar">{player.name.slice(0, 1)}</span>{player.role === "vip" && <Crown size={13}/>}<span>{player.name}</span></th><td>{player.played}</td><td><b>{player.rating}</b></td></tr>)}</tbody></table>{!division && PUBLIC_LADDER.length===0 && <p className="mk-ranking-note">{dpT("marketing.de_ladder_verschijnt_zodra_spelers_tien_ratingpartijen_tegen")}</p>}
        <div className="mk-ranking-note">{division ? <><Shield size={14}/> {dpT("marketing.divisie_3_punten_voor_winst_eigen_divisieladder")}</> : <><Target size={14}/> {dpT("marketing.dp_staat_los_van_de_competitiepunten_in_je")}</>}</div>
      </div><Link href="/inloggen?next=/divisies" className="mk-ranking-bottom">{dpT("marketing.verken_alle_standen_bij_dartspoint")} <ArrowRight size={17}/></Link>
    </div>
  </div></section>;
}

function EventSection() {
 const dpT = useI18n("marketing").t;

 const tournamentFormatLabel=localiseStaticCopy(tournamentFormatLabelStaticSource,dpT,dpStaticCopyKeys);



  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  const upcoming = PUBLIC_EVENTS.filter(event => event.status === "registration");
  const others = PUBLIC_EVENTS.filter(event => event.status === "live");
  return <section className="mk-events mk-wrap" id="toernooien" aria-labelledby="mk-events-title"><div className="mk-section-top"><div><Kicker>{dpT("marketing.georganiseerd_door_dartspoint")}</Kicker><h2 id="mk-events-title">{dpT("marketing.een_avond")}<br/><em>{dpT("marketing.alles_om_voor_te_gooien")}</em></h2></div><div className="mk-section-aside"><p>{dpT("marketing.een_eigen_toernooikamer_een_helder_speelschema")}<br/>{dpT("marketing.en_publiek_dat_met_je_meeleeft")}</p><span className="mk-demo-tag">{dpT("marketing.officiele_toernooien")}</span></div></div>
    <div className="mk-events-list">{upcoming.length ? upcoming.map(event => <article className="mk-event-row mk-event-featured" key={event.id}><div className="mk-event-date"><span>{dpT("marketing.datum")}</span><b>{dpT("marketing.volgt")}</b><Trophy size={28} strokeWidth={1.2}/></div><div className="mk-event-main"><span className="mk-event-status">{dpT("marketing.opkomend_inschrijving")}</span><h3>{event.name}</h3><p>{event.description}</p><div className="mk-event-meta"><span><Users size={14}/>{event.maxPlayers} {dpT("marketing.plaatsen")}</span><span>{dpT("marketing.501_double_out")}</span><span>{tournamentFormatLabel(event.format)}</span></div></div><Link href={`/inloggen?next=${encodeURIComponent(`/toernooi/${event.id}`)}`} className="mk-event-link" aria-label={dpT("marketing.bekijk_het_toernooi",{name:event.name})}><span>{dpT("marketing.bekijk_het_toernooi_2")}</span><ArrowUpRight size={24}/></Link></article>) : <div className="mk-event-empty"><Trophy/><h3>{dpT("marketing.de_volgende_avond_wordt_voorbereid")}</h3><p>{dpT("marketing.zodra_de_kalender_bekend_is_vind_je_de")}</p></div>}
      {others.map(event => <article className="mk-event-row mk-event-secondary" key={event.id}><div className="mk-event-small-icon">{event.format === "double-elimination" ? <Shield size={23}/> : <Trophy size={23}/>}</div><div className="mk-event-main"><span className="mk-event-status">{dpT("marketing.het_toernooi_is_begonnen")}</span><h3>{event.name}</h3><div className="mk-event-meta"><span>{event.format === "double-elimination" ? dpT("marketing.winnaarsroute_herkansing") : dpT("marketing.spelers_knock_out",{maxPlayers:event.maxPlayers})}</span><span><Eye size={14}/> {dpT("marketing.toeschouwers_welkom")}</span></div></div><Link className="mk-event-link" href={`/inloggen?next=${encodeURIComponent(`/toernooi/${event.id}`)}`} aria-label={dpT("marketing.bekijk_het_toernooi",{name:event.name})}><span>{dpT("marketing.bekijk_speelschema")}</span><ArrowUpRight size={23}/></Link></article>)}
    </div><p className="mk-data-note">{dpT("marketing.bekijk_een_toernooi_voor_het_speelschema_de_inschrijving")}</p>
  </section>;
}

export function DartsMarketing() {
 const dpT = useI18n("marketing").t;

 const faq=localiseStaticCopy(faqStaticSource,dpT,dpStaticCopyKeys);

 const navigation=localiseStaticCopy(navigationStaticSource,dpT,dpStaticCopyKeys);



  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  return <MotionConfig reducedMotion="user"><div className="mk-site"><a className="mk-skip-link" href="#inhoud">{dpT("marketing.ga_naar_inhoud")}</a><MarketingNav/><main id="inhoud">
    <section className="mk-hero" aria-labelledby="mk-hero-title"><picture className="mk-hero-picture"><img src="/marketing/afterhours-hero.webp" width="1672" height="941" alt="" fetchPriority="high"/></picture><div className="mk-hero-shade"/>
      <div className="mk-hero-inner mk-wrap"><div className="mk-hero-copy"><Kicker>{dpT("marketing.dartspoint_dat_vertrouwde_gevoel")}</Kicker><h1 id="mk-hero-title"><span className="mk-hero-topic">{dpT("marketing.online_darten")}</span>{dpT("marketing.nog_een")}<br/><em>{dpT("marketing.laatste_leg")}</em></h1><p>{dpT("marketing.speel_online_darts_tegen_andere_spelers_zonder_eigen")}<br className="mk-desktop-break"/> {dpT("marketing.jouw_vaste_kamer_bekende_namen_in_de_chat")}<br className="mk-desktop-break"/> {dpT("marketing.en_die_ene_finish_waar_je_voor_terugkomt")}</p><div className="mk-hero-actions"><PrimaryLink>{dpT("marketing.maak_je_account")}</PrimaryLink><a href="#het-spel" className="mk-hero-secondary"><span><Play size={13} fill="currentColor"/></span>{dpT("marketing.ontdek_het_spel")}</a></div><span className="mk-hero-prototype"><span/>{dpT("marketing.speel_samen_voel_die_finish")}</span></div><HeroSpotlight/>
      <div className="mk-hero-foot"><a href="#het-spel"><ArrowDown size={17}/><span>{dpT("marketing.de_avond_begint_hier")}</span></a><span>{dpT("marketing.01_dartspoint_afterhours")}</span><span>{dpT("marketing.darts_maar_dan_samen")}</span></div></div>
    </section>
    <div className="mk-intro-strip"><div className="mk-wrap"><span><Target/>301 / 501 / 701</span><span><Users/>{dpT("marketing.jouw_kamer_jouw_club")}</span><span><Trophy/>{dpT("marketing.toernooien_divisies")}</span><span><Smartphone/>{dpT("marketing.desktop_tablet_mobiel")}</span></div></div>
    <section className="mk-game-section mk-wrap" id="het-spel" aria-labelledby="mk-game-title"><div className="mk-game-copy"><Kicker>{dpT("marketing.je_kent_het_gevoel")}</Kicker><h2 id="mk-game-title">{dpT("marketing.de_spanning")}<br/>{dpT("marketing.zit_in")} <em>{dpT("marketing.je_timing")}</em></h2><p className="mk-lead">{dpT("marketing.geen_eigen_dartbord_nodig_alleen_jij_twee_bewegende")}</p><div className="mk-game-steps"><div><span>01</span><div><h3>{dpT("marketing.vind_je_richting")}</h3><p>{dpT("marketing.stop_de_horizontale_balk_waar_je_de_pijl")}</p></div></div><div><span>02</span><div><h3>{dpT("marketing.bepaal_je_hoogte")}</h3><p>{dpT("marketing.de_verticale_balk_loopt_door_een_klik_en")}</p></div></div><div><span>03</span><div><h3>{dpT("marketing.voel_die_finish")}</h3><p>{dpT("marketing.de_score_verschijnt_bij_de_landing_speel_je")}</p></div></div></div><PrimaryLink href="/inloggen?next=/spelen">{dpT("marketing.probeer_het_spel")}</PrimaryLink><p className="mk-small-note">{dpT("marketing.oefen_je_worp_of_daag_een_andere_speler")}</p></div><div className="mk-game-visual"><div className="mk-game-visual-word" aria-hidden="true">{dpT("marketing.game_on")}</div><GameplayPreview/><div className="mk-game-caption"><span>{dpT("marketing.precision_is_a_feeling")}</span><span>{dpT("marketing.het_dartspoint_speelveld")}</span></div></div></section>
    <EventSection/>
    <RankingSection/>
    <section className="mk-community mk-wrap" id="de-club" aria-labelledby="mk-club-title"><div className="mk-community-visual"><div className="mk-community-orbit" aria-hidden="true"/><div className="mk-room-directory"><div className="mk-room-directory-heading"><div><span>{dpT("marketing.je_bent_welkom")}</span><h3>{dpT("marketing.kies_je_kamer")}</h3></div><Users size={23}/></div>{PUBLIC_ROOMS.filter(room => room.category !== "tournament").slice(0, 4).map((room, index) => <Link key={room.name} href="/inloggen?next=/lobby" className="mk-room-row"><span className={`mk-room-symbol mk-room-symbol-${index}`} aria-hidden="true">{index === 0 ? <MessageCircle size={18}/> : index === 1 ? <Users size={18}/> : index === 2 ? <Target size={18}/> : <Shield size={18}/>}</span><span><strong>{room.name}</strong><small>{room.subtitle}</small></span><span className="mk-room-capacity">{room.count}<small> / {room.capacity}</small></span><ChevronRight size={16}/></Link>)}<p>{dpT("marketing.actuele_kamers_en_bezetting")}</p></div><div className="mk-community-note"><MessageCircle size={21}/><div><strong>{dpT("marketing.het_potje_is_voorbij")}<br/>{dpT("marketing.de_avond_nog_niet")}</strong><span>{dpT("marketing.daarom_blijf_je_nog_even_hangen")}</span></div></div></div><div className="mk-community-copy"><Kicker>{dpT("marketing.meer_dan_het_scorebord")}</Kicker><h2>{dpT("marketing.een_plek_waar")}<br/>{dpT("marketing.je")} <em>{dpT("marketing.blijft_plakken")}</em></h2><p>{dpT("marketing.kom_voor_een_snel_potje_blijf_voor_de")}</p><ul><li><Check size={17}/> {dpT("marketing.kamerchat_spelchat_en_privegesprekken")}</li><li><Check size={17}/> {dpT("marketing.vrienden_en_uitnodigingen_binnen_handbereik")}</li><li><Check size={17}/> {dpT("marketing.meekijken_aanmoedigen_en_een_revanche")}</li></ul><Link href="/inloggen?next=/lobby" className="mk-text-link">{dpT("marketing.neem_een_kijkje_in_de_lobby")} <ArrowUpRight size={18}/></Link></div></section>
    <section className="mk-faq mk-wrap" aria-labelledby="mk-faq-title"><div><Kicker>{dpT("marketing.nog_even_voor_je_gooit")}</Kicker><h2 id="mk-faq-title">{dpT("marketing.goed_om")}<br/><em>{dpT("marketing.te_weten")}</em></h2><p>{dpT("marketing.van_je_eerste_pijl_tot_je_eerste_seizoen")}</p></div><div className="mk-faq-list">{faq.map((item, index) => <details key={item.question}><summary><span>0{index + 1}</span><h3>{item.question}</h3><ChevronDown size={19}/></summary><p>{item.answer}</p></details>)}</div></section>
    <section className="mk-final" aria-labelledby="mk-final-title"><div className="mk-final-rings" aria-hidden="true"><span/><span/><span/></div><div className="mk-wrap"><Kicker>{dpT("marketing.de_volgende_pijl_is_van_jou")}</Kicker><h2 id="mk-final-title">{dpT("marketing.het_bord_wacht")}<br/><em>{dpT("marketing.schuif_aan_2")}</em></h2><p>{dpT("marketing.jouw_naam_op_het_scorebord")}<br/>{dpT("marketing.jouw_avond_bij_dartspoint")}</p><PrimaryLink>{dpT("marketing.maak_je_account")}</PrimaryLink><span className="mk-final-note">{dpT("marketing.kies_je_spelersnaam_en_schuif_aan_voor_je")}</span></div></section>
  </main><footer className="mk-footer"><div className="mk-wrap"><div className="mk-footer-main"><div><Link href="/" aria-label={dpT("marketing.dartspoint_startpagina")}><Brand/></Link><p>{dpT("marketing.dat_vertrouwde_gevoel")}<br/>{dpT("marketing.een_nieuwe_generatie_online_darts")}</p></div><nav aria-label={dpT("marketing.footer_spel")}><span>{dpT("marketing.ontdek")}</span>{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav><nav aria-label={dpT("marketing.footer_account")}><span>{dpT("marketing.schuif_aan_3")}</span><Link href="/registreren">{dpT("marketing.maak_je_account")}</Link><Link href="/inloggen">{dpT("marketing.inloggen")}</Link><Link href="/inloggen?next=/spelen">{dpT("marketing.probeer_het_spel")}</Link></nav><div className="mk-footer-signature"><img src="/brand/icon.svg" alt="" width="82" height="82"/><span>{dpT("marketing.one_more_leg")}</span></div></div><nav className="mk-footer-info" aria-label={dpT("marketing.hulp_en_informatie")}><Link href="/handleiding">{dpT("marketing.handleiding")}</Link><Link href="/support">{dpT("marketing.hulp_en_support")}</Link><Link href="/contact">{dpT("marketing.contact")}</Link><Link href="/algemene-voorwaarden">{dpT("marketing.algemene_voorwaarden")}</Link><Link href="/privacy">{dpT("marketing.privacyverklaring")}</Link></nav><div className="mk-footer-bottom"><span>© {new Date().getUTCFullYear()} {dpT("marketing.dartspoint_een_concept_van_dg_webservices")}</span><span>{dpT("marketing.je_kamer_je_wedstrijd_je_avond")}</span><a href="#inhoud">{dpT("marketing.terug_naar_boven")} <ArrowUpRight size={14}/></a></div></div></footer></div></MotionConfig>;
}

const dpStaticCopyKeys={
  "Het spel": "marketing.copy_het_spel",
  "Toernooien": "marketing.copy_toernooien",
  "De club": "marketing.copy_de_club",
  "Toernooi": "marketing.copy_toernooi",
  "Divisies": "marketing.copy_divisies",
  "DP-ladder": "marketing.copy_dp_ladder",
  "Dubbele eliminatie": "marketing.copy_dubbele_eliminatie",
  "Knock-out": "marketing.copy_knock_out",
  "Heb ik een echt dartbord nodig?": "marketing.copy_heb_ik_een_echt_dartbord_nodig",
  "Nee. DartsPoint is een digitaal dartspel. Je bepaalt de richting en hoogte met twee bewegende balken en de rode gooiknop. Je speelt met je muis, toetsenbord of touchscreen.": "marketing.copy_nee_dartspoint_is_een_digitaal_dartspel_je_bepaalt",
  "Welke spelvormen kan ik spelen?": "marketing.copy_welke_spelvormen_kan_ik_spelen",
  "Je kunt 301 dubbel-in/dubbel-uit, 501 en 701 spelen. Voor 501 en 701 begin je zonder openingsdubbel en eindig je op een dubbel. Bij een uitnodiging kies je legs of sets en of je voor de DP-ranking wilt spelen.": "marketing.copy_je_kunt_301_dubbel_in_dubbel_uit_501",
  "Hoe werkt mijn DP-rating?": "marketing.copy_hoe_werkt_mijn_dp_rating",
  "Je begint op 1500. Het resultaat en de rating van je tegenstander bepalen hoeveel je stijgt of daalt. Vrij spelen en oefenen tellen niet mee. Je rating is voorlopig totdat je minimaal tien rankingwedstrijden tegen vijf verschillende tegenstanders hebt gespeeld.": "marketing.copy_je_begint_op_1500_het_resultaat_en_de",
  "Wat is het verschil tussen de ladder en divisies?": "marketing.copy_wat_is_het_verschil_tussen_de_ladder_en",
  "De DP-ladder laat de speelsterkte zien op basis van rankingwedstrijden. Een divisie is een seizoenscompetitie met een eigen programma en stand. Daar tellen competitiepunten: drie voor winst, nul voor verlies. Aan het eind van het seizoen kun je promoveren of degraderen.": "marketing.copy_de_dp_ladder_laat_de_speelsterkte_zien_op",
  "Kan ik toernooien bekijken zonder mee te spelen?": "marketing.copy_kan_ik_toernooien_bekijken_zonder_mee_te_spelen",
  "Ja. Elk toernooi heeft een eigen kamer. Als toeschouwer kun je het speelschema en de wedstrijden bekijken. Schrijf je je in, dan speel je de wedstrijden die voor je klaarstaan.": "marketing.copy_ja_elk_toernooi_heeft_een_eigen_kamer_als",
  "Kan ik tegen andere spelers spelen?": "marketing.copy_kan_ik_tegen_andere_spelers_spelen",
  "Je speelt met je eigen account tegen andere spelers. DartsPoint houdt worpen, uitslagen, DP en competities bij. Oefenen en vrije partijen veranderen je DP niet.": "marketing.copy_je_speelt_met_je_eigen_account_tegen_andere"
};
