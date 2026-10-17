"use client";
import {browserLocale} from '../../../packages/i18n/src/errors';
import {formatLocales} from '../../../packages/i18n/src/locale';

import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {selfName,mutate} from "@/lib/platform-client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleAlert, Flag, Play, Shield, Trophy, Users, X } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { PlayerName } from "@/components/player-identity";
import { CompetitionGame } from "@/components/darts-competition-game";
import { getDivisionFixtureAccess, getDivisionMovements, getDivisionStandings, getPlayerDivision, type Division, type DivisionFixture, type DivisionSeason } from "@/lib/darts-divisions-model";
import { submitDivisionPlayedResult, useDivisionSeasons } from "@/lib/darts-divisions-store";
import "./darts-divisions.css";

export { DivisionBadge } from "@/components/division-badge";
const seasonLabels = { draft: "Binnenkort", live: "Seizoen actief", completed: "Afgerond" };
const seasonLabelsStaticSource = seasonLabels;
export function divisionDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(formatLocales[browserLocale()], { day: "numeric", month: "short" }); }
const initials = (name: string) => name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
function Emblem({ division, large = false }: { division: Division; large?: boolean }) { return <span className={`dv-emblem color-${division.color} ${large ? "large" : ""}`} aria-hidden="true"><Shield/><b>{division.level}</b></span>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="dv-empty"><CalendarDays size={25}/><p>{children}</p></div>; }

function Fixture({ fixture, season, mine = false, canPlay = false, onPlay }: { fixture: DivisionFixture; season: DivisionSeason; mine?: boolean; canPlay?: boolean; onPlay?: () => void }) {
 const dpT = useI18n("divisions").t;

  const [a, b] = fixture.players.map(id => season.members.find(p => p.id === id));
  return <article className={`dv-fixture ${mine ? "mine" : ""}`}>
    <div className="dv-fixture-round"><span>{dpT("divisions.ronde")} {fixture.matchday}</span><small>{fixture.status === "completed" ? dpT("divisions.gespeeld") : fixture.status === "bye" ? dpT("divisions.vrije_ronde") : dpT("divisions.voor",{value0:divisionDate(fixture.dueOn)})}</small></div>
    <div className="dv-fixture-players"><span><span className="dv-avatar">{initials(a?.name ?? "?")}</span><PlayerName name={a?.name ?? "Onbekend"}/></span><strong>{fixture.result ? fixture.result.score.join(" : ") : fixture.status === "bye" ? "—" : dpT("divisions.vs")}</strong><span><PlayerName name={b?.name ?? "Vrijgeloot"}/><span className="dv-avatar">{b ? initials(b.name) : "—"}</span></span></div>
    {canPlay && <button className="dv-button primary" onClick={onPlay}><Play size={13}/>{dpT("divisions.speel_mijn_wedstrijd")}<ArrowUpRight size={14}/></button>}
    {fixture.status === "completed" && <span className="dv-fixture-result"><Check size={12}/>{season.members.find(m => m.id === fixture.result?.winnerId)?.name} {dpT("divisions.wint")}</span>}
  </article>;
}

export function DivisionLobbyCard() {
 const dpT = useI18n("divisions").t;

  const { seasons } = useDivisionSeasons();
  const membership = getPlayerDivision(seasons, selfName());
  const season = membership?.season ?? seasons.find(s => s.status === "live") ?? seasons.find(s => s.status === "draft");
  if (!season) return null;
  const standing = membership ? getDivisionStandings(season, membership.division.id).find(row => row.memberId === membership.member.id) : null;
  const next = membership ? season.fixtures.find(f => f.status === "scheduled" && f.players.includes(membership.member.id)) : null;
  return <section className="dv-lobby-card"><div className="dv-lobby-art" aria-hidden="true"><Shield/><span>{membership?.division.level ?? "D"}</span><i/><i/></div><div className="dv-lobby-body"><p className="dv-eyebrow">{dpT("divisions.je_eigen_seizoen_je_eigen_plek")}</p><h2>{membership ? membership.division.name : dpT("divisions.de_divisies")}<span>.</span></h2><p>{membership ? dpT("divisions.punten_plek",{name:season.name,value1:standing?.points ?? 0,value2:standing?.rank ?? "—"}) : dpT("divisions.een_vaste_groep_tegenstanders_een_ladder_die_elke")}</p><div className="dv-lobby-meta">{next ? <span><CalendarDays size={13}/>{dpT("divisions.ronde_2")} {next.matchday} {dpT("divisions.voor_2")} {divisionDate(next.dueOn)}</span> : <span><Users size={13}/>{season.divisions.length} {season.divisions.length === 1 ? dpT("divisions.divisie") : dpT("divisions.divisies")} · {season.members.length} {season.members.length === 1 ? dpT("divisions.speler") : dpT("divisions.spelers")}</span>}<a className="dv-button primary" href="/divisies">{dpT("divisions.naar_de_divisieladder")}<ArrowUpRight size={14}/></a></div></div></section>;
}

export function DivisionsPanel({ embedded = false }: { embedded?: boolean }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("divisions").t;

 const seasonLabels=localiseStaticCopy(seasonLabelsStaticSource,dpT,dpStaticCopyKeys);



  const { seasons } = useDivisionSeasons();
  const [seasonId, setSeasonId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [tab, setTab] = useState<"ladder" | "fixtures" | "mine">("ladder");
  const [round, setRound] = useState("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const membership = getPlayerDivision(seasons, selfName());
  const season = seasons.find(s => s.id === seasonId) ?? membership?.season ?? seasons.find(s => s.status === "live") ?? seasons[0];
  const nick = season?.members.find(m => m.name === selfName());
  const division = season?.divisions.find(d => d.id === divisionId) ?? season?.divisions.find(d => d.id === nick?.divisionId) ?? season?.divisions[0];
  const standings = useMemo(() => season && division ? getDivisionStandings(season, division.id) : [], [season, division]);
  const ownFixtures = season?.fixtures.filter(f => nick && f.players.includes(nick.id)) ?? [];
  const nextFixture = ownFixtures.filter(f => f.status === "scheduled").sort((a,b) => a.matchday-b.matchday)[0];
  const activeFixture = season?.fixtures.find(f => f.id === playing);
  const movements = season ? getDivisionMovements(season).movements : [];
  const nextAccess = season && nextFixture ? getDivisionFixtureAccess(season, nextFixture.id, selfName()) : null;
  const fixtures = (tab === "mine" ? ownFixtures : season?.fixtures.filter(f => f.divisionId === division?.id) ?? []).filter(f => round === "all" || f.matchday === Number(round)).sort((a,b) => a.matchday-b.matchday);
  const completed = season?.fixtures.filter(f => f.status === "completed").length ?? 0;
  const total = season?.fixtures.filter(f => f.status !== "bye").length ?? 0;
  const ownStanding = season && nick ? getDivisionStandings(season, nick.divisionId).find(row => row.memberId === nick.id) : null;
  useEffect(() => { if (message) { const timer = setTimeout(() => setMessage(""), 6000); return () => clearTimeout(timer); } }, [message]);
  function selectSeason(id: string) { setSeasonId(id); setDivisionId(""); setRound("all"); setPlaying(null); }
  async function playFixture(fixture:DivisionFixture){try{const result=await mutate("division/start",{seasonId:season!.id,fixtureId:fixture.id});setPlaying(fixture.id);setMessage("");}catch(e){setMessage(e instanceof Error?e.message:dpFeedback("feedback.je_wedstrijd_kon_niet_starten_probeer_het_nog"));setFailed(true);}}
  const content = <>
    <div className="dv-heading"><div><span className="dv-eyebrow">{dpT("divisions.de_vaste_avond_begint_hier")}</span><h1>{dpT("divisions.speel_je_omhoog")}<span>.</span></h1><p>{dpT("divisions.een_seizoen_lang_dezelfde_rivalen_elke_leg_brengt")}</p></div><label className="dv-season-select"><CalendarDays size={16}/><span className="sr-only">{dpT("divisions.kies_een_seizoen")}</span><select value={season?.id ?? ""} onChange={e => selectSeason(e.target.value)}>{seasons.map(s => <option key={s.id} value={s.id}>{s.name} · {seasonLabels[s.status]}</option>)}</select></label></div>
    {season && division ? <>
      <section className="dv-season-hero"><div className="dv-hero-main"><span className={`dv-status ${season.status}`}><i/>{seasonLabels[season.status]}</span><h2>{season.name}</h2><p>{season.description || dpT("divisions.een_seizoen_lang_strijden_om_promotie_en_je")}</p><div className="dv-hero-tags"><span><CalendarDays size={13}/>{dpT("divisions.vanaf")} {divisionDate(season.startsOn)}</span><span>{dpT("divisions.501_double_out_bo")} {season.bestOf}</span><span><Users size={13}/>{season.members.length} {season.members.length === 1 ? dpT("divisions.speler") : dpT("divisions.spelers")}</span></div></div><div className="dv-season-progress"><span>{ownStanding ? dpT("divisions.jouw_seizoen") : dpT("divisions.gespeelde_wedstrijden")}</span><strong>{ownStanding ? ownStanding.points : completed}<small>{ownStanding ? dpT("divisions.punten") : `/ ${total}`}</small></strong><div><i style={{width:`${total ? completed/total*100 : 0}%`}}/></div><p>{ownStanding ? dpT("divisions.gewonnen_verloren_legs",{won:ownStanding.won,lost:ownStanding.lost,value2:ownStanding.legDifference >= 0 ? "+" : "",legDifference:ownStanding.legDifference}) : dpT("divisions.een_gedeelde_club",{length:season.divisions.length,value1:season.divisions.length === 1 ? "divisie" : "divisies"})}</p></div></section>
      <div className="dv-layout"><aside className="dv-division-list" aria-label={dpT("divisions.kies_een_divisie")}>{season.divisions.slice().sort((a,b)=>a.level-b.level).map(d => <button className={d.id===division.id?"selected":""} key={d.id} aria-pressed={d.id===division.id} onClick={()=>{setDivisionId(d.id);setRound("all");setTab("ladder");}}><Emblem division={d}/><span><strong>{d.name}</strong><small>{season.members.filter(m=>m.divisionId===d.id).length} {season.members.filter(m=>m.divisionId===d.id).length === 1 ? dpT("divisions.speler") : dpT("divisions.spelers")}{nick?.divisionId===d.id?dpT("divisions.jouw_divisie"):""}</small></span><ChevronRight size={14}/></button>)}</aside>
      <section className="dv-competition"><div className="dv-competition-heading"><div><Emblem division={division} large/><span className="dv-division-title"><small>{dpT("divisions.divisie_2")} {division.level}</small><h2>{division.name}</h2></span></div><span className="dv-standing-label">{dpT("divisions.winst_3_punten")}</span></div><nav className="dv-tabs" aria-label={dpT("divisions.divisieweergave")}><button className={tab==="ladder"?"active":""} onClick={()=>{setTab("ladder");setRound("all");}}><Trophy size={15}/>{dpT("divisions.divisieladder")}</button><button className={tab==="fixtures"?"active":""} onClick={()=>{setTab("fixtures");setRound("all");}}><CalendarDays size={15}/>{dpT("divisions.speelrondes")}</button><button className={tab==="mine"?"active":""} onClick={()=>{setTab("mine");setRound("all");}}><Flag size={15}/>{dpT("divisions.mijn_wedstrijden")}</button></nav>
      {tab === "ladder" ? <><div className="dv-table-wrap"><table className="dv-ladder"><thead><tr><th scope="col">#</th><th scope="col">{dpT("divisions.speler_2")}</th><th scope="col" title={dpT("divisions.gespeeld")}>G</th><th scope="col" title={dpT("divisions.gewonnen")}>W</th><th scope="col" title={dpT("divisions.verloren")}>V</th><th scope="col">{dpT("divisions.legs")}</th><th scope="col" title={dpT("divisions.legsaldo")}>+/−</th><th scope="col">{dpT("divisions.ptn")}</th></tr></thead><tbody>{standings.map((row)=>{const movement=movements.find(m=>m.memberId===row.memberId);const up=movement?.direction==="up";const down=movement?.direction==="down";return <tr key={row.memberId} className={`${row.name===selfName()?"you":""} ${up?"zone-up":down?"zone-down":""}`}><td><span className="dv-rank">{row.rank}</span></td><td><span className="dv-ladder-player"><span className="dv-avatar">{initials(row.name)}</span><span><PlayerName name={row.name}/>{row.name===selfName()&&<small>{dpT("divisions.jij")}</small>}</span>{up?<ArrowUpRight className="dv-up" size={13}/>:down?<ArrowDownRight className="dv-down" size={13}/>:null}</span></td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.legsFor}–{row.legsAgainst}</td><td className={row.legDifference>0?"dv-up":row.legDifference<0?"dv-down":""}>{row.legDifference>0?"+":""}{row.legDifference}</td><td><b>{row.points}</b></td></tr>;})}</tbody></table></div>{!standings.length&&<Empty>{dpT("divisions.er_zijn_nog_geen_spelers_ingedeeld_in_deze")}</Empty>}<footer className="dv-ladder-footer"><span><i className="up"/>{dpT("divisions.promotiezone")}</span><span><i className="down"/>{dpT("divisions.degradatiezone")}</span><small>{dpT("divisions.stand_punten_legsaldo_gewonnen_legs_en_bij_twee")}</small></footer><p className="dv-note">{dpT("divisions.je_verzamelt_punten_voor_de_divisieladder_je_dp")}</p></> : <><div className="dv-fixture-toolbar"><span>{tab==="mine"?dpT("divisions.voor_jou",{length:ownFixtures.length,value1:ownFixtures.length === 1 ? "wedstrijd" : "wedstrijden"}):dpT("divisions.label",{length:fixtures.length,value1:fixtures.length === 1 ? "wedstrijd" : "wedstrijden"})}</span><label><span className="sr-only">{dpT("divisions.filter_op_speelronde")}</span><select value={round} onChange={e=>setRound(e.target.value)}><option value="all">{dpT("divisions.alle_speelrondes")}</option>{[...new Set((tab==="mine"?ownFixtures:season.fixtures.filter(f=>f.divisionId===division.id)).map(f=>f.matchday))].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{dpT("divisions.speelronde")} {n}</option>)}</select></label></div><div className="dv-fixture-list">{fixtures.map(f=><Fixture key={f.id} fixture={f} season={season} mine={!!nick&&f.players.includes(nick.id)} canPlay={season.status==="live"&&f.id===nextFixture?.id&&!!nextAccess?.canPlay} onPlay={()=>playFixture(f)}/>)}</div>{!fixtures.length&&<Empty>{tab==="mine"&&!nick?dpT("divisions.je_bent_nog_niet_ingedeeld_in_dit_seizoen"):dpT("divisions.er_staan_geen_wedstrijden_in_dit_overzicht_kies")}</Empty>}</>}
      </section></div>
      {nextFixture && nextAccess?.canPlay && season.status === "live" && tab === "ladder" && <section className="dv-next"><span className="dv-next-icon"><Play size={22}/></span><div><span className="dv-eyebrow">{dpT("divisions.jouw_volgende_wedstrijd")}</span><h3>{selfName()} <span>{dpT("divisions.tegen")}</span> {season.members.find(m=>m.id===nextFixture.players.find(id=>id!==nick?.id))?.name}</h3><p>{dpT("divisions.speelronde")} {nextFixture.matchday} {dpT("divisions.voor_2")} {divisionDate(nextFixture.dueOn)} {dpT("divisions.best_of")} {season.bestOf}</p></div><button className="dv-button primary" onClick={()=>playFixture(nextFixture)}>{dpT("divisions.naar_het_bord")}<ArrowUpRight size={15}/></button></section>}
    </> : <Empty>{dpT("divisions.er_staat_nog_geen_divisie_klaar_je_kunt")}</Empty>}
    {message&&<div className={`dv-toast ${failed?"error":""}`} role={failed?"alert":"status"}>{failed?<CircleAlert size={16}/>:<Check size={16}/>}<span>{message}</span><button aria-label={dpT("divisions.melding_sluiten")} onClick={()=>setMessage("")}><X size={14}/></button></div>}
  </>;
  if (activeFixture && season && nick && activeFixture.players[1]) {
    const nickIndex = activeFixture.players[0]===nick.id?0:1;
    const opponent = season.members.find(m=>m.id===activeFixture.players[1-nickIndex])?.name ?? "Tegenstander";
    return <div className="dv-game"><CompetitionGame key={`division-${season.id}-${activeFixture.id}`} gameId={`division-${season.id}-${activeFixture.id}`} opponentName={opponent} startScore={501} doubleOut bestOf={season.bestOf} canPlay={getDivisionFixtureAccess(season,activeFixture.id,selfName()).canPlay} onClose={()=>setPlaying(null)} onComplete={async score=>{try{await submitDivisionPlayedResult(season.id,activeFixture.id,selfName(),nickIndex===0?score:[score[1],score[0]]);setPlaying(null);setMessage(dpT("divisions.je_uitslag_is_opgeslagen_en_de_divisieladder_is"));setFailed(false);}catch(error){setMessage(error instanceof Error?error.message:dpFeedback("feedback.je_uitslag_kon_niet_worden_opgeslagen_probeer_het"));setFailed(true);throw error;}}}/></div>;
  }
  if (embedded) return <div className="dv-page dv-embedded">{content}</div>;
  return <main className="dv-page"><header className="dv-header"><a href="/lobby" className="dv-back"><ArrowLeft size={17}/><span>{dpT("divisions.lobby")}</span></a><a href="/lobby" aria-label={dpT("divisions.dartspoint_lobby")}><Brand/></a><span className="dv-header-tag"><Shield size={12}/>{dpT("divisions.divisies_2")}</span></header><div className="dv-content">{content}</div></main>;
}

const dpStaticCopyKeys={
  "Binnenkort": "divisions.copy_binnenkort",
  "Seizoen actief": "divisions.copy_seizoen_actief",
  "Afgerond": "divisions.copy_afgerond"
};
