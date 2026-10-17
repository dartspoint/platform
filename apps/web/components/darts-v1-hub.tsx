"use client";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {SupportQuickLinks} from "./darts-support-links";
import {selfName,usePlatform,loadOlderRecords} from "@/lib/platform-client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, Check, ChevronRight, Clock3, Crosshair, History, Medal, Play, Search, Settings2, Target, Trophy, Users } from "lucide-react";
import { PublishedTournaments } from "@/components/admin/darts-tournaments";
import { DivisionLobbyCard } from "@/components/darts-divisions";
import { Brand } from "@/components/design-studio";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { publicGameLabel } from "@/lib/public-game-label";
import { DartsPreferencesPanel } from "@/components/darts-preferences-panel";
import { PracticeAchievements, WeeklyChallengeCard } from "@/components/darts-practice";
import { useMatchRecords, type MatchRecord } from "@/lib/darts-match-records";
import { DART_NUMBERS, dartTipPosition } from "@/lib/darts-rules";
import { playerByName } from "@/lib/darts-data";
import "./darts-v1-hub.css";

/** Legacy entry point now opens the official DartsPoint event catalogue. */
export function EveningCup(_props: { onToast?: (message: string) => void }) { return <PublishedTournaments/>; }

function HitMap({ record }: { record: MatchRecord }) {
 const dpT = useI18n("v1Hub").t;

  const [both, setBoth] = useState(false);
  const events = record.events.filter(event => both || event.player === 0);
  return <section className="v1-hitmap"><div className="v1-section-title"><h3>{dpT("v1Hub.waar_kwamen_je_pijlen")}</h3><button onClick={() => setBoth(!both)} aria-pressed={both}>{both ? dpT("v1Hub.alleen_mijn_pijlen") : dpT("v1Hub.beide_spelers")}</button></div><svg viewBox="0 0 440 440" role="img" aria-label={dpT("v1Hub.raakpuntenkaart_met_pijlen",{length:events.length})}>
    <circle cx="220" cy="220" r="210" fill="#0b1910" stroke="#6f947645"/><circle cx="220" cy="220" r="170" fill="#1c2f22"/>
    {[6.35, 15.9, 99, 107, 162, 170].map(r => <circle key={r} cx="220" cy="220" r={r} stroke="#b4c6a770" strokeWidth="1" fill="none"/>)}
    {DART_NUMBERS.map((number, i) => { const rad = (i * 18 - 9) * Math.PI / 180; return <g key={number}><line x1={220 + Math.sin(rad) * 15.9} y1={220 - Math.cos(rad) * 15.9} x2={220 + Math.sin(rad) * 170} y2={220 - Math.cos(rad) * 170} stroke="#819f7045"/><text x={220 + Math.sin(i * Math.PI / 10) * 190} y={225 - Math.cos(i * Math.PI / 10) * 190} textAnchor="middle" fill="#bcd0af" fontSize="15">{number}</text></g>; })}
    {events.map((event, i) => { const p = dartTipPosition(event.hit); return <circle key={`${event.id}-${i}`} cx={p.x} cy={p.y} r="4" fill={event.player === 0 ? "#f18d73" : "#8bcca0"} opacity=".8"><title>{event.player === 0 ? selfName() : record.opponent}: {event.hit.label}</title></circle>; })}
  </svg><p><i/>{dpT("v1Hub.jij")}{both && <><i className="opponent"/>{record.opponent}</>}<span>{events.length} {events.length === 1 ? dpT("v1Hub.pijl") : dpT("v1Hub.pijlen")} {dpT("v1Hub.alleen_gespeelde_worpen")}</span></p></section>;
}

function recordScore(record: MatchRecord) { return `${(record.rules?.format === "sets" ? record.sets ?? [0, 0] : record.legs).join("–")}${record.rules?.format === "sets" ? " sets" : ""}`; }

function MatchDetail({ record, onBack }: { record: MatchRecord; onBack: () => void }) {
 const dpT = useI18n("v1Hub").t;

  const platform = usePlatform();
  const [tab, setTab] = useState("history");
  const visits = useMemo(() => {
    const groups = new Map<string, MatchRecord["events"]>();
    for (const event of record.events) {
      const key = `${event.leg}-${event.visit}-${event.player}`;
      groups.set(key, [...(groups.get(key) || []), event]);
    }
    return [...groups.values()];
  }, [record]);
  return <div className="v1-match-detail"><button className="v1-back" onClick={onBack}><ArrowLeft size={16}/>{dpT("v1Hub.alle_wedstrijden")}</button><div className="v1-section-title"><div><span className="v1-eyebrow">{dpT("v1Hub.wedstrijd")} {publicGameLabel(platform,record.id)}</span><h2>{selfName()} <span className="v1-muted">{dpT("v1Hub.tegen")}</span> {record.opponent}</h2></div><strong className="v1-big-score">{recordScore(record)}</strong></div><div className="v1-tabs"><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>{dpT("v1Hub.beurten")}</button><button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>{dpT("v1Hub.raakpuntenkaart")}</button></div>{tab === "map" ? <HitMap record={record}/> : <div className="v1-table-scroll"><table className="v1-history-table"><thead><tr><th>{dpT("v1Hub.leg")}</th><th>{dpT("v1Hub.speler")}</th><th>{dpT("v1Hub.worpen")}</th><th>{dpT("v1Hub.beurt")}</th><th>{dpT("v1Hub.over")}</th></tr></thead><tbody>{visits.map((events, i) => <tr key={i}><td>{events[0].leg}</td><td><PlayerName name={events[0].player === 0 ? selfName() : record.opponent}/></td><td>{events.map(event => <span className={event.bust ? "bust" : event.checkout ? "finish" : ""} key={event.id} title={event.ignoredOnEntry ? dpT("v1Hub.telt_niet_mee_open_eerst_met_een_dubbel") : undefined}>{event.hit.label}{event.ignoredOnEntry ? " · 0" : ""}</span>)}</td><td>{events.some(event => event.bust) ? dpT("v1Hub.bust") : events.reduce((total, event) => total + (event.credited ?? event.hit.score), 0)}</td><td>{events.at(-1)?.after}</td></tr>)}</tbody></table></div>}</div>;
}

export function DartsV1Hub() {
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpT = useI18n("v1Hub").t;

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
    { title: dpT("v1Hub.copy_eerste_finish"), detail: dpT("v1Hub.copy_een_leg_uitgooien_op_een_dubbel"), done: earned.has("first-finish"), icon: Target },
    { title: "Maximum!", detail: dpT("v1Hub.copy_180_punten_in_een_beurt"), done: earned.has("180"), icon: Trophy },
    { title: dpT("v1Hub.copy_dubbelverzamelaar"), detail: `${allDoubles.size} / 10 verschillende dubbels`, done: earned.has("10-doubles"), icon: Crosshair },
    { title: dpT("v1Hub.copy_eerste_overwinning"), detail: dpT("v1Hub.copy_je_eerste_volledige_wedstrijd_winnen"), done: earned.has("first-win"), icon: Medal },
  ];
  const tabs = [{ id: "history", name: dpT("v1Hub.copy_wedstrijden"), icon: History }, { id: "records", name: "Records", icon: Trophy }, { id: "badges", name: "Badges", icon: Award }, { id: "cup", name: dpT("v1Hub.copy_toernooien"), icon: Users }, { id: "settings", name: dpT("v1Hub.copy_instellingen"), icon: Settings2 }];
  return <main className="v1-hub"><header className="v1-hub-header"><a href="/lobby" className="v1-back"><ArrowLeft size={18}/><span>{dpT("v1Hub.lobby")}</span></a><Brand/><span className="v1-demo-tag">{dpT("v1Hub.jouw_clubhuis")}</span></header><div className="v1-hub-content"><div className="v1-hub-heading"><span className="v1-eyebrow">{dpT("v1Hub.elke_avond_een_beetje_beter")}</span><h1>{dpT("v1Hub.jouw_dartspoint")}<span>.</span></h1><p>{dpT("v1Hub.je_wedstrijden_je_beste_momenten_en_je_volgende")}</p><a className="v1-secondary" href="/oefenen"><Target size={16}/>{dpT("v1Hub.naar_de_oefenruimte")}<ArrowUpRight size={15}/></a></div><div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}} aria-label={dpT("v1Hub.hulp_en_account")}><SupportQuickLinks className="v1-secondary" newTab={platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id))}/></div><nav className="v1-hub-tabs" aria-label={dpT("v1Hub.clubhuis")}>{tabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setSelected(null); }} aria-pressed={tab === item.id}><item.icon size={17}/>{item.name}</button>)}</nav>
    <div className="v1-hub-panel">
      {tab === "history" && (selectedRecord ? <MatchDetail record={selectedRecord} onBack={() => setSelected(null)}/> : <><div className="v1-section-title"><h2>{dpT("v1Hub.jouw_wedstrijden")}</h2><span>{records.length} {dpT("v1Hub.bewaard")}</span></div><label className="v1-search"><Search size={17}/><input placeholder={dpT("v1Hub.zoek_op_wedstrijdnummer_of_tegenstander")} value={query} onChange={event => setQuery(event.target.value)} aria-label={dpT("v1Hub.zoek_een_wedstrijd")}/></label><div className="v1-match-list">{records.filter(record => `${publicGameLabel(platform,record.id)} ${record.opponent}`.toLowerCase().includes(query.toLowerCase())).map(record => <button key={record.id} onClick={() => setSelected(record.id)}><span className={`v1-result-icon ${record.winner === 0 ? "won" : "lost"}`}>{record.winner === 0 ? "W" : "V"}</span><span><strong>{selfName()} <em>{dpT("v1Hub.vs")}</em> <PlayerName name={record.opponent}/></strong><small>{publicGameLabel(platform,record.id)} · {new Date(record.endedAt).toLocaleDateString(dpFormatLocale, { day: "numeric", month: "short" })} · {record.mode === "ranked-demo" ? dpT("v1Hub.gerankt") : dpT("v1Hub.vrij_spelen")}</small></span><b>{recordScore(record)}</b><ChevronRight size={17}/></button>)}</div>{records.length === 0 && <div className="v1-empty"><History size={32}/><h3>{dpT("v1Hub.hier_begint_jouw_verhaal")}</h3><p>{dpT("v1Hub.na_een_volledige_wedstrijd_vind_je_hier_iedere")}</p><a className="v1-primary" href="/spelen">{dpT("v1Hub.speel_je_eerste_wedstrijd")}<ArrowUpRight size={17}/></a></div>}{records.length > 0 && !records.some(record => `${publicGameLabel(platform,record.id)} ${record.opponent}`.toLowerCase().includes(query.toLowerCase())) && <p className="v1-empty">{dpT("v1Hub.geen_wedstrijd_gevonden_probeer_een_andere_naam_of")}</p>}{!historyEnd&&platform.records.length>=100&&<button className="v1-back" disabled={loadingHistory} onClick={async()=>{setLoadingHistory(true);try{setHistoryEnd((await loadOlderRecords()??0)<100);}finally{setLoadingHistory(false);}}}>{dpT("v1Hub.oudere_wedstrijden_laden")}<ChevronRight size={17}/></button>}</>)}
      {tab === "records" && <><div className="v1-section-title"><h2>{dpT("v1Hub.jouw_persoonlijke_records")}</h2><RatingValue player={playerByName(selfName())}/></div><div className="v1-record-grid"><div><Target/><span>{dpT("v1Hub.hoogste_beurt")}</span><strong>{maxVisit || "—"}</strong><small>{dpT("v1Hub.punten_in_een_beurt")}</small></div><div><Crosshair/><span>{dpT("v1Hub.hoogste_finish")}</span><strong>{maxFinish || "—"}</strong><small>{dpT("v1Hub.uitgegooid_op_een_dubbel")}</small></div><div><Clock3/><span>{dpT("v1Hub.snelste_leg")}</span><strong>{fastestLeg || "—"}</strong><small>{dpT("v1Hub.pijlen_voor_een_gewonnen_leg")}</small></div><div><Target/><span>{dpT("v1Hub.180_s_gegooid")}</span><strong>{oneEighties}</strong><small>{dpT("v1Hub.drie_keer_triple_twintig")}</small></div><div><Trophy/><span>{dpT("v1Hub.overwinningen")}</span><strong>{wins}</strong><small>{dpT("v1Hub.uit")} {records.length} {dpT("v1Hub.gespeelde_wedstrijden")}</small></div><div><Medal/><span>{dpT("v1Hub.verschillende_dubbels")}</span><strong>{allDoubles.size}</strong><small>{dpT("v1Hub.van_de_20_buitenste_dubbels")}</small></div></div><p className="v1-subtle">{dpT("v1Hub.deze_records_komen_uit_je_gespeelde_wedstrijden_je")}</p><WeeklyChallengeCard onStart={() => window.location.assign("/oefenen?uitdaging=1")}/></>}
      {tab === "badges" && <><DivisionLobbyCard/><div className="v1-section-title"><h2>{dpT("v1Hub.verdiend_aan_het_bord")}</h2><span>{dpT("v1Hub.puur_voor_de_eer")}</span></div><div className="v1-badge-grid">{badges.map(badge => <article key={badge.title} className={badge.done ? "unlocked" : "locked"}><badge.icon size={31}/><h3>{badge.title}</h3><p>{badge.detail}</p><span>{badge.done ? dpT("v1Hub.behaald") : dpT("v1Hub.nog_te_verdienen")}</span></article>)}</div><p className="v1-subtle">{dpT("v1Hub.badges_zijn_er_voor_de_eer_ze_veranderen")}</p><PracticeAchievements/></>}
      {tab === "cup" && <EveningCup/>}
      {tab === "settings" && <><div className="v1-section-title"><h2>{dpT("v1Hub.jouw_speelritme")}</h2></div><DartsPreferencesPanel/></>}
    </div></div></main>;
}

const dpStaticCopyKeys={
  "Eerste finish": "v1Hub.copy_eerste_finish",
  "Een leg uitgooien op een dubbel": "v1Hub.copy_een_leg_uitgooien_op_een_dubbel",
  "180 punten in één beurt": "v1Hub.copy_180_punten_in_een_beurt",
  "Dubbelverzamelaar": "v1Hub.copy_dubbelverzamelaar",
  "Eerste overwinning": "v1Hub.copy_eerste_overwinning",
  "Je eerste volledige wedstrijd winnen": "v1Hub.copy_je_eerste_volledige_wedstrijd_winnen",
  "Wedstrijden": "v1Hub.copy_wedstrijden",
  "Toernooien": "v1Hub.copy_toernooien",
  "Instellingen": "v1Hub.copy_instellingen"
};
