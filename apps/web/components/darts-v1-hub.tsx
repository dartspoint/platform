"use client";
import {selfName,usePlatform,loadOlderRecords} from "@/lib/platform-client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, Check, ChevronRight, Clock3, Crosshair, History, Medal, Play, Search, Settings2, Target, Trophy, Users } from "lucide-react";
import { PublishedTournaments } from "@/components/admin/darts-tournaments";
import { DivisionLobbyCard } from "@/components/darts-divisions";
import { Brand } from "@/components/design-studio";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { DartsPreferencesPanel } from "@/components/darts-preferences-panel";
import { PracticeAchievements, WeeklyChallengeCard } from "@/components/darts-practice";
import { useMatchRecords, type MatchRecord } from "@/lib/darts-match-records";
import { DART_NUMBERS, dartTipPosition } from "@/lib/darts-rules";
import { playerByName } from "@/lib/darts-data";
import "./darts-v1-hub.css";

/** Legacy entry point now opens the official DartsPoint event catalogue. */
export function EveningCup(_props: { onToast?: (message: string) => void }) { return <PublishedTournaments/>; }

function HitMap({ record }: { record: MatchRecord }) {
  const [both, setBoth] = useState(false);
  const events = record.events.filter(event => both || event.player === 0);
  return <section className="v1-hitmap"><div className="v1-section-title"><h3>Waar kwamen je pijlen?</h3><button onClick={() => setBoth(!both)} aria-pressed={both}>{both ? "Alleen mijn pijlen" : "Beide spelers"}</button></div><svg viewBox="0 0 440 440" role="img" aria-label={`Raakpuntenkaart met ${events.length} pijlen`}>
    <circle cx="220" cy="220" r="210" fill="#0b1910" stroke="#6f947645"/><circle cx="220" cy="220" r="170" fill="#1c2f22"/>
    {[6.35, 15.9, 99, 107, 162, 170].map(r => <circle key={r} cx="220" cy="220" r={r} stroke="#b4c6a770" strokeWidth="1" fill="none"/>)}
    {DART_NUMBERS.map((number, i) => { const rad = (i * 18 - 9) * Math.PI / 180; return <g key={number}><line x1={220 + Math.sin(rad) * 15.9} y1={220 - Math.cos(rad) * 15.9} x2={220 + Math.sin(rad) * 170} y2={220 - Math.cos(rad) * 170} stroke="#819f7045"/><text x={220 + Math.sin(i * Math.PI / 10) * 190} y={225 - Math.cos(i * Math.PI / 10) * 190} textAnchor="middle" fill="#bcd0af" fontSize="15">{number}</text></g>; })}
    {events.map((event, i) => { const p = dartTipPosition(event.hit); return <circle key={`${event.id}-${i}`} cx={p.x} cy={p.y} r="4" fill={event.player === 0 ? "#f18d73" : "#8bcca0"} opacity=".8"><title>{event.player === 0 ? selfName() : record.opponent}: {event.hit.label}</title></circle>; })}
  </svg><p><i/>Jij{both && <><i className="opponent"/>{record.opponent}</>}<span>{events.length} pijlen · alleen gespeelde worpen</span></p></section>;
}

function recordScore(record: MatchRecord) { return `${(record.rules?.format === "sets" ? record.sets ?? [0, 0] : record.legs).join("–")}${record.rules?.format === "sets" ? " sets" : ""}`; }

function MatchDetail({ record, onBack }: { record: MatchRecord; onBack: () => void }) {
  const [tab, setTab] = useState("history");
  const visits = useMemo(() => {
    const groups = new Map<string, MatchRecord["events"]>();
    for (const event of record.events) {
      const key = `${event.leg}-${event.visit}-${event.player}`;
      groups.set(key, [...(groups.get(key) || []), event]);
    }
    return [...groups.values()];
  }, [record]);
  return <div className="v1-match-detail"><button className="v1-back" onClick={onBack}><ArrowLeft size={16}/>Alle wedstrijden</button><div className="v1-section-title"><div><span className="v1-eyebrow">GAME ID: #{record.id}</span><h2>{selfName()} <span className="v1-muted">tegen</span> {record.opponent}</h2></div><strong className="v1-big-score">{recordScore(record)}</strong></div><div className="v1-tabs"><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Beurten</button><button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Raakpuntenkaart</button></div>{tab === "map" ? <HitMap record={record}/> : <div className="v1-table-scroll"><table className="v1-history-table"><thead><tr><th>Leg</th><th>Speler</th><th>Worpen</th><th>Beurt</th><th>Over</th></tr></thead><tbody>{visits.map((events, i) => <tr key={i}><td>{events[0].leg}</td><td><PlayerName name={events[0].player === 0 ? selfName() : record.opponent}/></td><td>{events.map(event => <span className={event.bust ? "bust" : event.checkout ? "finish" : ""} key={event.id} title={event.ignoredOnEntry ? "Telt niet mee: open eerst met een dubbel" : undefined}>{event.hit.label}{event.ignoredOnEntry ? " · 0" : ""}</span>)}</td><td>{events.some(event => event.bust) ? "BUST" : events.reduce((total, event) => total + (event.credited ?? event.hit.score), 0)}</td><td>{events.at(-1)?.after}</td></tr>)}</tbody></table></div>}</div>;
}

export function DartsV1Hub() {
  const [tab, setTab] = useState("history");
  const [query, setQuery] = useState("");
  const [loadingHistory,setLoadingHistory]=useState(false),[historyEnd,setHistoryEnd]=useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const platform=usePlatform();const earned=new Set(platform.badges.map(b=>b.badge));
  const records = useMatchRecords();
  const selectedRecord = records.find(record => record.id === selected);
  const totals=platform.personalRecords;
  const maxVisit=totals?.highestVisit??0,maxFinish=totals?.highestCheckout??0,wins=totals?.wins??0;
  const allDoubles=new Set<string>(totals?.doubles??[]);
  const fastestLeg=totals?.fastestLeg??null,oneEighties=totals?.oneEighties??0;
  const badges = [
    { title: "Eerste finish", detail: "Een leg uitgooien op een dubbel", done: earned.has("first-finish"), icon: Target },
    { title: "Maximum!", detail: "180 punten in één beurt", done: earned.has("180"), icon: Trophy },
    { title: "Double collector", detail: `${allDoubles.size} / 10 verschillende dubbels`, done: earned.has("10-doubles"), icon: Crosshair },
    { title: "Eerste overwinning", detail: "Je eerste volledige wedstrijd winnen", done: earned.has("first-win"), icon: Medal },
  ];
  const tabs = [{ id: "history", name: "Wedstrijden", icon: History }, { id: "records", name: "Records", icon: Trophy }, { id: "badges", name: "Badges", icon: Award }, { id: "cup", name: "Toernooien", icon: Users }, { id: "settings", name: "Instellingen", icon: Settings2 }];
  return <main className="v1-hub"><header className="v1-hub-header"><a href="/lobby" className="v1-back"><ArrowLeft size={18}/><span>Lobby</span></a><Brand/><span className="v1-demo-tag">JOUW CLUBHUIS</span></header><div className="v1-hub-content"><div className="v1-hub-heading"><span className="v1-eyebrow">ELKE AVOND EEN BEETJE BETER</span><h1>Jouw DartsPoint<span>.</span></h1><p>Je wedstrijden, je beste momenten en je volgende uitdaging.</p><a className="v1-secondary" href="/oefenen"><Target size={16}/>Naar de oefenruimte<ArrowUpRight size={15}/></a></div><nav className="v1-hub-tabs" aria-label="Clubhuis">{tabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setSelected(null); }} aria-pressed={tab === item.id}><item.icon size={17}/>{item.name}</button>)}</nav>
    <div className="v1-hub-panel">
      {tab === "history" && (selectedRecord ? <MatchDetail record={selectedRecord} onBack={() => setSelected(null)}/> : <><div className="v1-section-title"><h2>Jouw wedstrijden</h2><span>{records.length} bewaard</span></div><label className="v1-search"><Search size={17}/><input placeholder="Zoek op Game ID of tegenstander…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Zoek een wedstrijd"/></label><div className="v1-match-list">{records.filter(record => `${record.id} ${record.opponent}`.toLowerCase().includes(query.toLowerCase())).map(record => <button key={record.id} onClick={() => setSelected(record.id)}><span className={`v1-result-icon ${record.winner === 0 ? "won" : "lost"}`}>{record.winner === 0 ? "W" : "V"}</span><span><strong>{selfName()} <em>vs</em> <PlayerName name={record.opponent}/></strong><small>#{record.id} · {new Date(record.endedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} · {record.mode === "ranked-demo" ? "Gerankt" : "Vrij spelen"}</small></span><b>{recordScore(record)}</b><ChevronRight size={17}/></button>)}</div>{records.length === 0 && <div className="v1-empty"><History size={32}/><h3>Hier begint jouw verhaal.</h3><p>Na een volledige wedstrijd vind je hier iedere beurt, je uitslag en de raakpuntenkaart.</p><a className="v1-primary" href="/spelen">Speel je eerste wedstrijd<ArrowUpRight size={17}/></a></div>}{records.length > 0 && !records.some(record => `${record.id} ${record.opponent}`.toLowerCase().includes(query.toLowerCase())) && <p className="v1-empty">Geen wedstrijd gevonden met deze zoekterm.</p>}<p className="v1-subtle">Wedstrijdhistorie en records zijn gekoppeld aan je account.</p>{!historyEnd&&platform.records.length>=100&&<button className="v1-back" disabled={loadingHistory} onClick={async()=>{setLoadingHistory(true);try{setHistoryEnd((await loadOlderRecords()??0)<100);}finally{setLoadingHistory(false);}}}>Oudere wedstrijden laden<ChevronRight size={17}/></button>}</>)}
      {tab === "records" && <><div className="v1-section-title"><h2>Jouw persoonlijke records</h2><RatingValue player={playerByName(selfName())}/></div><div className="v1-record-grid"><div><Target/><span>Hoogste beurt</span><strong>{maxVisit || "—"}</strong><small>Punten in één beurt</small></div><div><Crosshair/><span>Hoogste finish</span><strong>{maxFinish || "—"}</strong><small>Uitgegooid op een dubbel</small></div><div><Clock3/><span>Snelste leg</span><strong>{fastestLeg || "—"}</strong><small>Pijlen voor een gewonnen leg</small></div><div><Target/><span>180’s gegooid</span><strong>{oneEighties}</strong><small>Drie keer triple twintig</small></div><div><Trophy/><span>Overwinningen</span><strong>{wins}</strong><small>Uit {records.length} gespeelde wedstrijden</small></div><div><Medal/><span>Verschillende dubbels</span><strong>{allDoubles.size}</strong><small>Van de 20 buitenste dubbels</small></div></div><p className="v1-subtle">Deze records komen uit je gespeelde wedstrijden. Je oefenprestaties staan apart.</p><WeeklyChallengeCard onStart={() => window.location.assign("/oefenen?uitdaging=1")}/></>}
      {tab === "badges" && <><DivisionLobbyCard/><div className="v1-section-title"><h2>Verdiend aan het bord.</h2><span>Puur voor de eer</span></div><div className="v1-badge-grid">{badges.map(badge => <article key={badge.title} className={badge.done ? "unlocked" : "locked"}><badge.icon size={31}/><h3>{badge.title}</h3><p>{badge.detail}</p><span>{badge.done ? "Behaald" : "Nog te verdienen"}</span></article>)}</div><p className="v1-subtle">Badges geven geen extra punten, andere timing of ratingvoordeel.</p><PracticeAchievements/></>}
      {tab === "cup" && <EveningCup/>}
      {tab === "settings" && <><div className="v1-section-title"><h2>Jouw speelritme</h2></div><DartsPreferencesPanel/></>}
    </div></div></main>;
}
