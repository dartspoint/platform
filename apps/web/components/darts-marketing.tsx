"use client";
import {selfName} from "@/lib/platform-client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Crown, Eye, Menu, MessageCircle, Pause, Play, Shield, Smartphone, Target, Trophy, Users, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Dartboard } from "@/components/darts-game";
import { scoreDart } from "@/lib/darts-rules";
import { usePublicData } from "@/lib/darts-public-data";
import "./darts-marketing.css";

const navigation = [{ label: "Het spel", href: "#het-spel" }, { label: "Toernooien", href: "#toernooien" }, { label: "Ladders", href: "#ladders" }, { label: "De club", href: "#de-club" }];
const slideNames = ["Toernooi", "Divisies", "DP-ladder"];
const previewDarts = [{ id: 1, hit: scoreDart(-.018, -.603) }, { id: 2, hit: scoreDart(.018, -.619) }, { id: 3, hit: scoreDart(.005, -.59) }];
const openingPreviewDarts = [{ id: 1, hit: scoreDart(0, -.975) }, ...previewDarts.slice(1)];
const tournamentFormatLabel = (format: string) => format === "double-elimination" ? "Dubbele eliminatie" : "Knock-out";
const doNothing = () => {};
const faq = [
  { question: "Heb ik een echt dartbord nodig?", answer: "Nee. DartsPoint is een digitaal dartspel. Je bepaalt de richting en hoogte met twee bewegende balken en de rode gooiknop. Je speelt met je muis, toetsenbord of touchscreen." },
  { question: "Welke spelvormen kan ik spelen?", answer: "Je kunt 301 dubbel-in/dubbel-uit, 501 en 701 spelen. Voor 501 en 701 begin je zonder openingsdubbel en eindig je op een dubbel. Bij een uitnodiging kies je legs of sets en of je voor de DP-ranking wilt spelen." },
  { question: "Hoe werkt mijn DP-rating?", answer: "Je begint op 1500. Het resultaat en de rating van je tegenstander bepalen hoeveel je stijgt of daalt. Vrij spelen en oefenen tellen niet mee. Je rating is voorlopig totdat je minimaal tien rankingwedstrijden tegen vijf verschillende tegenstanders hebt gespeeld." },
  { question: "Wat is het verschil tussen de ladder en divisies?", answer: "De DP-ladder laat de speelsterkte zien op basis van rankingwedstrijden. Een divisie is een seizoenscompetitie met een eigen programma en stand. Daar tellen competitiepunten: drie voor winst, nul voor verlies. Aan het eind van het seizoen kun je promoveren of degraderen." },
  { question: "Kan ik toernooien bekijken zonder mee te spelen?", answer: "Ja. Elk toernooi heeft een eigen kamer. Als toeschouwer kun je het speelschema en de wedstrijden bekijken. Schrijf je je in, dan speel je de wedstrijden die voor je klaarstaan." },
  { question: "Kan ik tegen andere spelers spelen?", answer: "Je speelt met je eigen account tegen andere spelers. DartsPoint houdt worpen, uitslagen, DP en competities bij. Oefenen en vrije partijen veranderen je DP niet." },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`mk-brand${compact ? " mk-brand-small" : ""}`}><img src="/brand/icon.svg" width="44" height="44" alt=""/><img src="/brand/wordmark.svg" width="167" height="38" alt="DartsPoint"/></span>;
}
function PrimaryLink({ children, href = "/registreren", className = "" }: { children: React.ReactNode; href?: string; className?: string }) {
  return <Link className={`mk-cta ${className}`} href={href}>{children}<ArrowUpRight size={19} aria-hidden="true"/></Link>;
}
function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <span className={`mk-kicker${light ? " is-light" : ""}`}><span/>{children}</span>;
}
function RoleName({ name, role }: { name: string; role?: string }) {
  return <span className={`mk-player-name mk-role-${role || "player"}`}>{role === "vip" && <Crown size={13} aria-label="VIP"/>}{name}</span>;
}
function MarketingNav() {
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  return <header className="mk-header"><div className="mk-header-inner">
    <Link href="/" aria-label="DartsPoint startpagina"><Brand/></Link>
    <nav aria-label="Hoofdnavigatie" className="mk-desktop-nav">{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
    <div className="mk-header-actions"><Link href="/inloggen" className="mk-login-link">Inloggen</Link><PrimaryLink className="mk-header-register">Maak je account</PrimaryLink>
      <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button className="mk-menu-trigger" aria-label="Open menu"><Menu size={24}/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="mk-menu-overlay"/><Dialog.Content className="mk-mobile-menu" onCloseAutoFocus={event => { if (navigating.current) { event.preventDefault(); navigating.current = false; } }}><div className="mk-menu-top"><Brand compact/><Dialog.Close asChild><button aria-label="Sluit menu"><X size={23}/></button></Dialog.Close></div><Dialog.Title className="sr-only">DartsPoint menu</Dialog.Title><Dialog.Description className="sr-only">Ontdek het spel, de toernooien en de ladders, of open DartsPoint.</Dialog.Description><nav aria-label="Mobiele hoofdnavigatie">{navigation.map((item, index) => <a onClick={() => { navigating.current = true; setOpen(false); }} href={item.href} key={item.href}><span>0{index + 1}</span>{item.label}<ArrowUpRight size={25}/></a>)}</nav><div className="mk-menu-bottom"><PrimaryLink>Maak je account</PrimaryLink><Link href="/inloggen" onClick={() => setOpen(false)}>Al bekend bij DartsPoint? Inloggen <ArrowRight size={15}/></Link><p>Jouw kamer. Jouw wedstrijd.<br/>Schuif aan voor je volgende potje.</p></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  </div></header>;
}

function HeroSpotlight() {
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
  return <div ref={root} className="mk-spotlight" role="region" aria-roledescription="carrousel" aria-label="Ontdek DartsPoint" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={event => { if (!root.current?.contains(event.relatedTarget as Node)) setInteracting(false); }}>
    <div className="mk-spotlight-heading"><span><span/>IN DE SPOTLIGHT</span><span className="mk-demo-tag">DARTSPOINT</span></div>
    <div className="mk-spotlight-body" aria-live={paused ? "polite" : "off"}><AnimatePresence mode="wait" initial={false}><motion.div key={slide} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: .25 }}>
      {slide === 0 && <><div className="mk-spotlight-icon"><Trophy size={25}/><span>DE AVOND IS NOG JONG</span></div><h2>{event?.name || "De volgende avondcup"}</h2><p>{event ? `${event.maxPlayers} spelers. Eén speelschema. Je kans op de finale.` : "Een eigen kamer. Een spannend speelschema. Je volgende uitdaging."}</p><div className="mk-spotlight-meta"><span>501 · Double out</span><span>Schuif aan</span></div><a href="#toernooien" className="mk-text-link">Ontdek de toernooien <ArrowUpRight size={17}/></a></>}
      {slide === 1 && <><div className="mk-spotlight-icon"><Shield size={25}/><span>SPEEL VOOR JOUW PLEK</span></div><h2>Een seizoen.<br/>Jouw divisie.</h2><p>Vaste tegenstanders. Elke week een nieuw hoofdstuk. Wie promoveert?</p><div className="mk-division-medals" aria-label="Divisiecompetitie"><span><Shield/>D1</span><span><Shield/>D2</span><span><Shield/>D3</span></div><a href="#ladders" className="mk-text-link">Bekijk de divisieladders <ArrowUpRight size={17}/></a></>}
      {slide === 2 && <><div className="mk-spotlight-icon"><Target size={25}/><span>IEDEREEN BEGINT OP 1500</span></div><h2>De ladder roept.</h2><div className="mk-mini-ladder">{top.map((player, index) => <div key={player.name}><span>0{index + 1}</span><RoleName name={player.name} role={player.role}/><b>{player.rating}</b></div>)}</div><a href="#ladders" className="mk-text-link">Ontdek jouw volgende doel <ArrowUpRight size={17}/></a></>}
    </motion.div></AnimatePresence></div>
    <div className="mk-spotlight-controls"><div className="mk-slide-dots">{slideNames.map((name, index) => <button key={name} aria-label={`Toon ${name}`} aria-pressed={slide === index} className={slide === index ? "is-active" : ""} onClick={() => select(index)}><span/></button>)}</div><span>{String(slide + 1).padStart(2, "0")} / 03</span><div className="mk-slide-buttons"><button aria-label="Vorige spotlight" onClick={() => select((slide + 2) % 3)}><ChevronLeft size={16}/></button><button aria-label={paused || reduced ? "Laat de kaarten weer afwisselen" : "Pauzeer de kaarten"} aria-pressed={paused || Boolean(reduced)} disabled={Boolean(reduced)} title={reduced ? "De kaarten wisselen niet automatisch omdat je minder beweging hebt ingesteld" : undefined} onClick={() => setPaused(value => !value)}>{paused || reduced ? <Play size={13}/> : <Pause size={13}/>}</button><button aria-label="Volgende spotlight" onClick={() => select((slide + 1) % 3)}><ChevronRight size={16}/></button></div></div>
  </div>;
}

function GameplayPreview() {
  const [mode, setMode] = useState<301 | 501 | 701>(501);
  return <div className="mk-game-preview">
    <div className="mk-preview-top"><Brand compact/><span><span/>SPELVOORBEELD</span></div>
    <div className="mk-preview-mode"><span>{mode === 301 ? "DOUBLE IN · DOUBLE OUT" : "DOUBLE OUT"}</span><div aria-label="Spelvorm kiezen" role="group">{([301, 501, 701] as const).map(value => <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value}>{value}</button>)}</div></div>
    <div className="mk-preview-board"><div className="mk-preview-horizontal" aria-hidden="true"><ArrowRight size={15}/><span><i/></span></div><Dartboard darts={mode === 301 ? openingPreviewDarts : previewDarts} pendingId={null} onLand={doNothing} lessMotion/><div className="mk-preview-vertical" aria-hidden="true"><span>↑</span><i><b/></i><span>↓</span></div><Link href="/inloggen?next=/spelen" className="mk-throw-preview" aria-label="Open DartsPoint om zelf te gooien">GOOI<ArrowUpRight size={22}/></Link></div>
    <div className="mk-preview-score"><div className="mk-preview-score-head"><span>{mode} · Best of 3 legs</span><span>Voorbeeldwedstrijd</span></div><div className="mk-preview-score-row"><span className="mk-role-player">Speler A <small>[1500]</small></span><span className="mk-preview-active-dot"/><b>{mode === 301 ? 141 : mode - 180}</b><strong>{mode === 301 ? 160 : 180}</strong></div><div className="mk-preview-score-row"><span className="mk-role-player"><Crown size={14}/> Speler B <small>[1500]</small></span><span/><b>{mode}</b><strong>—</strong></div></div>
    <div className="mk-preview-bottom"><span>Richt, gooi en zie je score.</span><span><Smartphone size={13}/> Ook op mobiel</span></div>
  </div>;
}

function RankingSection() {
  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  const [selected, setSelected] = useState("elo");
  const division = PUBLIC_DIVISIONS.find(item => item.id === selected);
  const tabs = [{ id: "elo", name: "DP-ladder" }, ...PUBLIC_DIVISIONS.map(item => ({ id: item.id, name: item.name }))];
  return <section className="mk-rankings" id="ladders" aria-labelledby="mk-ranking-title"><div className="mk-wrap mk-ranking-layout">
    <div className="mk-ranking-copy"><Kicker light>VOOR DE VOLGENDE STAP</Kicker><h2 id="mk-ranking-title">Elk potje brengt<br/>je <em>een stap verder.</em></h2><p>De eerste dubbel. Je eerste 180. Of die ene speler boven je op de ladder. Er is altijd iets om voor terug te komen.</p><div className="mk-ranking-explainer"><div><span className="mk-ranking-number">1500</span><div><h3>Jouw vertrekpunt</h3><p>DP groeit met je mee. Speel voor je rating of kies een ontspannen potje zonder ranking.</p></div></div><div><Shield size={38} strokeWidth={1}/><div><h3>Jouw plek in de divisie</h3><p>Een eigen speelschema, competitiepunten en een badge. Een seizoen lang om te klimmen.</p></div></div></div><Link href="/registreren" className="mk-text-link">Zet jouw eerste stap <ArrowUpRight size={18}/></Link></div>
    <div className="mk-ranking-card"><div className="mk-ranking-card-head"><div><span>DE STAND VAN DE CLUB</span><h3>{division ? division.name : "De DP-ladder"}</h3></div><span className="mk-demo-tag">ACTUELE STAND</span></div>
      <div className="mk-ranking-tabs" role="tablist" aria-label="Kies een ladder">{tabs.map(tab => <button key={tab.id} id={`mk-tab-${tab.id}`} aria-controls="mk-ladder-panel" role="tab" aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") { event.preventDefault(); const index = tabs.findIndex(item => item.id === selected); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setSelected(tabs[next].id); document.getElementById(`mk-tab-${tabs[next].id}`)?.focus(); } }} onClick={() => setSelected(tab.id)}>{tab.name === "Premier Division" ? "Premier" : tab.name}</button>)}</div>
      <div id="mk-ladder-panel" role="tabpanel" tabIndex={0} aria-labelledby={`mk-tab-${selected}`} className="mk-ladder-panel">
        <table><caption className="sr-only">{division ? `${division.name}: gespeelde wedstrijden, legsaldo en competitiepunten` : "DP-ladder met spelers en ratings"}</caption><thead><tr><th scope="col">#</th><th scope="col">Speler</th>{division ? <><th scope="col">G</th><th scope="col">+/−</th><th scope="col">Ptn</th></> : <><th scope="col">Gespeeld</th><th scope="col">DP</th></>}</tr></thead><tbody>{division ? division.standings.map(player => <tr key={player.name}><td>{String(player.rank).padStart(2, "0")}</td><th scope="row"><span className="mk-table-avatar">{player.name.slice(0, 1)}</span>{player.name}</th><td>{player.played}</td><td>{player.legDifference > 0 ? "+" : ""}{player.legDifference}</td><td><b>{player.points}</b></td></tr>) : PUBLIC_LADDER.slice(0, 5).map((player, index) => <tr key={player.name}><td>{String(index + 1).padStart(2, "0")}</td><th scope="row"><span className="mk-table-avatar">{player.name.slice(0, 1)}</span>{player.role === "vip" && <Crown size={13}/>}<span>{player.name}</span></th><td>{player.played}</td><td><b>{player.rating}</b></td></tr>)}</tbody></table>{!division && PUBLIC_LADDER.length===0 && <p className="mk-ranking-note">De ladder verschijnt zodra spelers tien ratingpartijen tegen vijf verschillende tegenstanders hebben gespeeld.</p>}
        <div className="mk-ranking-note">{division ? <><Shield size={14}/> Divisie · 3 punten voor winst · eigen divisieladder</> : <><Target size={14}/> DP staat los van de competitiepunten in je divisie</>}</div>
      </div><Link href="/inloggen?next=/divisies" className="mk-ranking-bottom">Verken alle standen bij DartsPoint <ArrowRight size={17}/></Link>
    </div>
  </div></section>;
}

function EventSection() {
  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  const upcoming = PUBLIC_EVENTS.filter(event => event.status === "registration");
  const others = PUBLIC_EVENTS.filter(event => event.status === "live");
  return <section className="mk-events mk-wrap" id="toernooien" aria-labelledby="mk-events-title"><div className="mk-section-top"><div><Kicker>GEORGANISEERD DOOR DARTSPOINT</Kicker><h2 id="mk-events-title">Een avond.<br/><em>Alles om voor te gooien.</em></h2></div><div className="mk-section-aside"><p>Een eigen toernooikamer. Een helder speelschema.<br/>En publiek dat met je meeleeft.</p><span className="mk-demo-tag">OFFICIËLE TOERNOOIEN</span></div></div>
    <div className="mk-events-list">{upcoming.length ? upcoming.map(event => <article className="mk-event-row mk-event-featured" key={event.id}><div className="mk-event-date"><span>DATUM</span><b>VOLGT</b><Trophy size={28} strokeWidth={1.2}/></div><div className="mk-event-main"><span className="mk-event-status">OPKOMEND · INSCHRIJVING</span><h3>{event.name}</h3><p>{event.description}</p><div className="mk-event-meta"><span><Users size={14}/>{event.maxPlayers} plaatsen</span><span>501 · Double out</span><span>{tournamentFormatLabel(event.format)}</span></div></div><Link href={`/inloggen?next=${encodeURIComponent(`/toernooi/${event.id}`)}`} className="mk-event-link" aria-label={`Bekijk het toernooi ${event.name}`}><span>Bekijk het toernooi</span><ArrowUpRight size={24}/></Link></article>) : <div className="mk-event-empty"><Trophy/><h3>De volgende avond wordt voorbereid.</h3><p>Zodra de kalender bekend is, vind je de toernooien hier.</p></div>}
      {others.map(event => <article className="mk-event-row mk-event-secondary" key={event.id}><div className="mk-event-small-icon">{event.format === "double-elimination" ? <Shield size={23}/> : <Trophy size={23}/>}</div><div className="mk-event-main"><span className="mk-event-status">HET TOERNOOI IS BEGONNEN</span><h3>{event.name}</h3><div className="mk-event-meta"><span>{event.format === "double-elimination" ? "Winnaarsroute + herkansing" : `${event.maxPlayers} spelers · Knock-out`}</span><span><Eye size={14}/> Toeschouwers welkom</span></div></div><Link className="mk-event-link" href={`/inloggen?next=${encodeURIComponent(`/toernooi/${event.id}`)}`} aria-label={`Bekijk het toernooi ${event.name}`}><span>Bekijk speelschema</span><ArrowUpRight size={23}/></Link></article>)}
    </div><p className="mk-data-note">Bekijk een toernooi voor het speelschema, de inschrijving en de actuele stand.</p>
  </section>;
}

export function DartsMarketing() {
  const {PUBLIC_EVENTS,PUBLIC_LADDER,PUBLIC_DIVISIONS,PUBLIC_ROOMS}=usePublicData();
  return <MotionConfig reducedMotion="user"><div className="mk-site"><a className="mk-skip-link" href="#inhoud">Ga naar inhoud</a><MarketingNav/><main id="inhoud">
    <section className="mk-hero" aria-labelledby="mk-hero-title"><picture className="mk-hero-picture"><img src="/marketing/afterhours-hero.webp" width="1672" height="941" alt="" fetchPriority="high"/></picture><div className="mk-hero-shade"/>
      <div className="mk-hero-inner mk-wrap"><div className="mk-hero-copy"><Kicker>ONLINE DARTS. DAT VERTROUWDE GEVOEL.</Kicker><h1 id="mk-hero-title">Nog één<br/><em>laatste leg.</em></h1><p>Jouw vaste kamer. Bekende namen in de chat.<br className="mk-desktop-break"/> En die ene finish waar je voor terugkomt.<br className="mk-desktop-break"/> Welkom bij DartsPoint.</p><div className="mk-hero-actions"><PrimaryLink>Maak je account</PrimaryLink><a href="#het-spel" className="mk-hero-secondary"><span><Play size={13} fill="currentColor"/></span>Ontdek het spel</a></div><span className="mk-hero-prototype"><span/>Speel samen. Voel die finish.</span></div><HeroSpotlight/>
      <div className="mk-hero-foot"><a href="#het-spel"><ArrowDown size={17}/><span>DE AVOND BEGINT HIER</span></a><span>01 / DARTSPOINT AFTERHOURS</span><span>DARTS. MAAR DAN SAMEN.</span></div></div>
    </section>
    <div className="mk-intro-strip"><div className="mk-wrap"><span><Target/>301 / 501 / 701</span><span><Users/>Jouw kamer. Jouw club.</span><span><Trophy/>Toernooien & divisies</span><span><Smartphone/>Desktop, tablet & mobiel</span></div></div>
    <section className="mk-game-section mk-wrap" id="het-spel" aria-labelledby="mk-game-title"><div className="mk-game-copy"><Kicker>JE KENT HET GEVOEL</Kicker><h2 id="mk-game-title">De spanning<br/>zit in <em>je timing.</em></h2><p className="mk-lead">Geen eigen dartbord nodig. Alleen jij, twee bewegende balken en precies het juiste moment.</p><div className="mk-game-steps"><div><span>01</span><div><h3>Vind je richting.</h3><p>Stop de horizontale balk waar je de pijl wilt plaatsen.</p></div></div><div><span>02</span><div><h3>Bepaal je hoogte.</h3><p>De verticale balk loopt door. Eén klik en je pijl vertrekt.</p></div></div><div><span>03</span><div><h3>Voel die finish.</h3><p>De score verschijnt bij de landing. Speel je dubbel uit en pak de leg.</p></div></div></div><PrimaryLink href="/inloggen?next=/spelen">Probeer het spel</PrimaryLink><p className="mk-small-note">Oefen je worp of daag een andere speler uit.</p></div><div className="mk-game-visual"><div className="mk-game-visual-word" aria-hidden="true">GAME ON.</div><GameplayPreview/><div className="mk-game-caption"><span>PRECISION IS A FEELING.</span><span>HET DARTSPOINT SPEELVELD ↗</span></div></div></section>
    <EventSection/>
    <RankingSection/>
    <section className="mk-community mk-wrap" id="de-club" aria-labelledby="mk-club-title"><div className="mk-community-visual"><div className="mk-community-orbit" aria-hidden="true"/><div className="mk-room-directory"><div className="mk-room-directory-heading"><div><span>JE BENT WELKOM</span><h3>Kies je kamer.</h3></div><Users size={23}/></div>{PUBLIC_ROOMS.filter(room => room.category !== "tournament").slice(0, 4).map((room, index) => <Link key={room.name} href="/inloggen?next=/lobby" className="mk-room-row"><span className={`mk-room-symbol mk-room-symbol-${index}`} aria-hidden="true">{index === 0 ? <MessageCircle size={18}/> : index === 1 ? <Users size={18}/> : index === 2 ? <Target size={18}/> : <Shield size={18}/>}</span><span><strong>{room.name}</strong><small>{room.subtitle}</small></span><span className="mk-room-capacity">{room.count}<small> / {room.capacity}</small></span><ChevronRight size={16}/></Link>)}<p>Actuele kamers en bezetting</p></div><div className="mk-community-note"><MessageCircle size={21}/><div><strong>Het potje is voorbij.<br/>De avond nog niet.</strong><span>Daarom blijf je nog even hangen.</span></div></div></div><div className="mk-community-copy"><Kicker>MEER DAN HET SCOREBORD</Kicker><h2>Een plek waar<br/>je <em>blijft plakken.</em></h2><p>Kom voor een snel potje. Blijf voor de bekende gezichten. Voeg vrienden toe, stuur een uitnodiging en spreek af in jullie vaste kamer.</p><ul><li><Check size={17}/> Kamerchat, spelchat en privégesprekken</li><li><Check size={17}/> Vrienden en uitnodigingen binnen handbereik</li><li><Check size={17}/> Meekijken, aanmoedigen en een revanche</li></ul><Link href="/inloggen?next=/lobby" className="mk-text-link">Neem een kijkje in de lobby <ArrowUpRight size={18}/></Link></div></section>
    <section className="mk-faq mk-wrap" aria-labelledby="mk-faq-title"><div><Kicker>NOG EVEN VOOR JE GOOIT</Kicker><h2 id="mk-faq-title">Goed om<br/><em>te weten.</em></h2><p>Van je eerste pijl tot je eerste seizoen.</p></div><div className="mk-faq-list">{faq.map((item, index) => <details key={item.question}><summary><span>0{index + 1}</span><h3>{item.question}</h3><ChevronDown size={19}/></summary><p>{item.answer}</p></details>)}</div></section>
    <section className="mk-final" aria-labelledby="mk-final-title"><div className="mk-final-rings" aria-hidden="true"><span/><span/><span/></div><div className="mk-wrap"><Kicker>DE VOLGENDE PIJL IS VAN JOU</Kicker><h2 id="mk-final-title">Het bord wacht.<br/><em>Schuif aan.</em></h2><p>Jouw naam op het scorebord.<br/>Jouw avond bij DartsPoint.</p><PrimaryLink>Maak je account</PrimaryLink><span className="mk-final-note">Kies je spelersnaam en schuif aan voor je eerste potje.</span></div></section>
  </main><footer className="mk-footer"><div className="mk-wrap"><div className="mk-footer-main"><div><Link href="/" aria-label="DartsPoint startpagina"><Brand/></Link><p>Dat vertrouwde gevoel.<br/>Een nieuwe generatie online darts.</p></div><nav aria-label="Footer spel"><span>ONTDEK</span>{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav><nav aria-label="Footer account"><span>SCHUIF AAN</span><Link href="/registreren">Maak je account</Link><Link href="/inloggen">Inloggen</Link><Link href="/inloggen?next=/spelen">Probeer het spel</Link></nav><div className="mk-footer-signature"><img src="/brand/icon.svg" alt="" width="82" height="82"/><span>ONE MORE LEG.</span></div></div><div className="mk-footer-bottom"><span>© {new Date().getUTCFullYear()} DartsPoint · Een concept van DG Webservices</span><span>Je kamer. Je wedstrijd. Je avond.</span><a href="#inhoud">Terug naar boven <ArrowUpRight size={14}/></a></div></div></footer></div></MotionConfig>;
}
