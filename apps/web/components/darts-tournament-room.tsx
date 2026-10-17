"use client";
import {competitionText} from "../../../packages/i18n/src/competition-messages";
import {FixedCopy} from "@/components/fixed-copy";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {selfName,usePlatform} from "@/lib/platform-client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Eye, GitBranch, LayoutGrid, LockKeyhole, Pause, Play, ShieldCheck, Target, Trophy, Users } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { PlayerName } from "@/components/player-identity";
import { CompetitionGame } from "@/components/darts-competition-game";
import { TournamentBracket } from "@/components/admin/darts-tournaments";
import { checkInIsOpen, eligibilityReasons, type Tournament, type TournamentMatch } from "@/lib/darts-tournament-model";
import { getTournamentMatchAccess, getMatchPlanningReasons } from "@/lib/darts-tournament-planning";
import { getTournamentState, recordParticipantTournamentResult, refreshTournamentSchedule, setTournamentReady, startTournamentMatch, updateTournamentParticipant, useTournaments } from "@/lib/darts-tournament-store";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import {useServerGame} from "@/lib/use-server-game";
import type { GameState } from "@/lib/darts-game-state";
import { Dartboard } from "@/components/darts-game";
import { DartsHeroBackground } from "./darts-hero-background";
import "./darts-tournament-room.css";

const statusLabels = { draft: "Concept", registration: "Inschrijving", checkin: "Check-in", live: "In de toernooikamer", completed: "Afgerond", cancelled: "Geannuleerd" };
const statusLabelsStaticSource = statusLabels;
const gameKey = (t: Tournament, m: TournamentMatch) => `tournament-${t.id}-${m.id}-${m.players.join("-")}-${m.startedAt ?? 0}`;
const matchName = (t: Tournament, m: TournamentMatch, side: number) => t.participants.find(p => p.id === m.players[side])?.name ?? competitionText("Nog te bepalen");
const laneName = (m: TournamentMatch) => competitionText(m.bracket === "grand-final" ? "Grote finale" : m.bracket === "reset" ? "Beslissende finale" : `${m.bracket === "losers" ? "Tweede kans" : "Winnaars"} · ronde ${m.round + 1}`);
function SavedBoard({ tournament, match }: { tournament: Tournament; match: TournamentMatch }) {
 const dpT = useI18n("tournamentRoom").t;

  const platform=usePlatform();const assignment=platform.matches.find(m=>m.competition?.id===tournament.id&&m.competition?.nodeId===match.id);
  const game=useServerGame('',assignment?.id??'');const saved=assignment?game:null;
  const nickIndex = match.players.findIndex(pid => tournament.participants.find(p => p.id === pid)?.name === selfName());
  return <div className="tr-watch-board">
    <div className="tr-watch-caption"><span><Eye size={14}/>{dpT("tournamentRoom.toeschouwen")}</span><b>{match.status === "completed" ? dpT("tournamentRoom.uitslag") : saved ? dpT("tournamentRoom.live_bordstand") : match.status === "playing" ? dpT("tournamentRoom.wedstrijd_gestart") : dpT("tournamentRoom.wacht_op_de_start")}</b></div>
    <div className="tr-watch-svg"><Dartboard darts={saved?.landedDarts ?? []} pendingId={null} onLand={() => {}} lessMotion/></div>
    <div className="tr-watch-scores">{match.players.map((pid, side) => { const index = nickIndex === side ? 0 : 1; return <div key={pid ?? side}><PlayerName name={matchName(tournament, match, side)}/><strong>{match.result?.score[side] ?? (saved ? saved.scores[side] : "—")}</strong><small>{match.result ? dpT("tournamentRoom.legs") : saved ? dpT("tournamentRoom.legs_2",{value0:saved.legs[side]}) : dpT("tournamentRoom.wacht_op_de_start")}</small></div>; })}</div>
    <p>{saved ? dpT("tournamentRoom.kijk_live_mee_nieuwe_pijlen_verschijnen_zodra_ze") : dpT("tournamentRoom.hier_volg_je_de_stand_en_de_uitslag")}</p>
  </div>;
}

export function DartsTournamentRoom({ tournamentId }: { tournamentId: string }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("tournamentRoom").t;

 const statusLabels=localiseStaticCopy(statusLabelsStaticSource,dpT,dpStaticCopyKeys);



  const { tournaments } = useTournaments();
  const operations = useAdminOperations();
  const tournament = tournaments.find(t => t.id === tournamentId);
  const [tab, setTab] = useState<"boards" | "bracket" | "players" | "rules">("boards");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const owner = operations.members.find(p => p.name === selfName())?.role === "owner";
  useEffect(() => {
    if (tournament?.status !== "live") return;
    const refresh = async () => { setNow(Date.now()); try { await refreshTournamentSchedule(tournamentId); } catch {} };
    refresh(); const timer = setInterval(refresh, 1500); return () => clearInterval(timer);
  }, [tournamentId, tournament?.status]);
  async function act(action: () => unknown, message: string) { try { await action(); setNotice(message); setError(false); return true; } catch (cause) { setNotice(cause instanceof Error ? cause.message : dpFeedback("feedback.dat_lukte_niet_probeer_het_nog_eens")); setError(true); return false; } }
  if (!tournament || (!tournament.published && !owner)) return <main className="tr-room"><header className="tr-header"><a href="/lobby"><Brand/></a></header><div className="tr-not-found"><Trophy size={34}/><h1>{dpT("tournamentRoom.deze_toernooikamer_is_niet_beschikbaar")}</h1><p>{dpT("tournamentRoom.in_de_lobby_vind_je_de_beschikbare_toernooien")}</p><a href="/lobby#events" className="tr-primary">{dpT("tournamentRoom.naar_de_lobby")} <ArrowRight size={15}/></a></div></main>;
  const nick = tournament.participants.find(p => p.name === selfName() && p.status !== "withdrawn");
  const inField = nick && ["confirmed", "checkedin"].includes(nick.status) && !eligibilityReasons(tournament, nick).length;
  const myMatch = nick ? tournament.matches.find(m => m.players.includes(nick.id) && ["ready", "playing"].includes(m.status)) : undefined;
  const myAccess = myMatch ? getTournamentMatchAccess(tournament, myMatch.id, selfName(), now || Date.now()) : null;
  const selected = tournament.matches.find(m => m.id === selectedId);
  const playing = tournament.matches.find(m => m.id === playingId);
  const occupied = tournament.matches.filter(m => m.boardId !== null && ["ready", "playing"].includes(m.status));
  const waiting = tournament.matches.filter(m => m.status === "ready" && m.boardId === null);
  const registered = tournament.participants.filter(p => ["confirmed", "checkedin"].includes(p.status));
  const champion = tournament.participants.find(p => p.id === tournament.championId);
  async function openMatch(match: TournamentMatch) {
    if (!getTournamentMatchAccess(tournament!, match.id, selfName()).canPlay) { setSelectedId(match.id); return; }
    if (match.status === "ready" && !await act(async () => await startTournamentMatch(tournament!.id, match.id, { actorName: selfName() }), dpFeedback("feedback.je_bord_staat_klaar_start_je_partij"))) return;
    setPlayingId(match.id);
  }
  return <main className="tr-room">
    <header className="tr-header"><a href="/lobby" aria-label={dpT("tournamentRoom.dartspoint_lobby")}><Brand/></a><nav aria-label={dpT("tournamentRoom.toernooikamer")}><a href="/lobby"><ArrowLeft size={14}/><span>{dpT("tournamentRoom.lobby")}</span></a>{owner && <a href={`/beheer?tab=tournaments&toernooi=${encodeURIComponent(tournament.id)}`}><ShieldCheck size={14}/><span>{dpT("tournamentRoom.beheer")}</span></a>}<span className="tr-header-avatar">N</span></nav></header>
    <div className="tr-main">
      <div className="tr-breadcrumb"><span><ShieldCheck size={13}/>{dpT("tournamentRoom.dartspoint_presenteert")}</span><span>{statusLabels[tournament.status]}{!tournament.published ? dpT("tournamentRoom.alleen_voor_beheer") : ""}</span></div>
      <section className="tr-hero"><DartsHeroBackground hero={tournament.hero}/><div className="tr-hero-copy"><p className="tr-eyebrow">{tournament.settings.room}</p><h1>{tournament.name}<span>.</span></h1><p>{tournament.description || dpT("tournamentRoom.de_borden_staan_klaar_de_avond_is_van")}</p><div className="tr-event-meta"><span><Users size={14}/>{registered.length}/{tournament.settings.maxPlayers} {dpT("tournamentRoom.spelers")}</span><span><LayoutGrid size={14}/>{tournament.settings.boardCount} {dpT("tournamentRoom.borden")}</span><span><GitBranch size={14}/>{tournament.settings.format === "double-elimination" ? dpT("tournamentRoom.dubbele_eliminatie") : dpT("tournamentRoom.knock_out")}</span></div></div><div className="tr-hero-emblem" aria-hidden="true"><Trophy/><span>{dpT("tournamentRoom.dartspoint")}<br/>{dpT("tournamentRoom.toernooi")}</span></div></section>
      <div className="tr-access-line"><Eye size={15}/><span>{dpT("tournamentRoom.je_bent_welkom_om_mee_te_kijken_als")}</span></div>
      {champion && <div className="tr-champion"><Trophy size={24}/><span>{dpT("tournamentRoom.de_winnaar_van_de_avond")}<strong><PlayerName name={champion.name}/></strong></span></div>}
      {!playing && <section className="tr-my-seat"><div className={`tr-seat-icon ${inField ? "is-member" : ""}`}>{inField ? <Target size={22}/> : <Eye size={22}/>}</div><div><p className="tr-eyebrow">{dpT("tournamentRoom.jouw_plek_in_de_kamer")}</p><h2>{myMatch?.boardId ? dpT("tournamentRoom.je_bent_ingedeeld_op_bord",{boardId:myMatch.boardId}) : inField ? nick?.ready ? dpT("tournamentRoom.je_staat_klaar_voor_je_volgende_partij") : dpT("tournamentRoom.welkom_in_het_spelersveld") : dpT("tournamentRoom.schuif_aan_als_toeschouwer")}</h2><p>{myMatch ? myAccess?.reason || dpT("tournamentRoom.tegen_best_of",{value0:matchName(tournament, myMatch, myMatch.players[0] === nick?.id ? 1 : 0),bestOf:myMatch.bestOf}) : nick?.status === "waiting" ? dpT("tournamentRoom.je_inschrijving_wacht_op_een_vrije_plaats_of") : tournament.status === "completed" ? dpT("tournamentRoom.dit_toernooi_is_afgelopen_bekijk_de_uitslagen_en") : inField ? dpT("tournamentRoom.de_wedstrijdleiding_deelt_borden_in_zodra_beide_spelers") : dpT("tournamentRoom.kijk_mee_aan_de_borden_en_volg_het")}</p></div><div className="tr-seat-actions">{nick?.status === "confirmed" && checkInIsOpen(tournament) && <button className="tr-primary" onClick={async () => await act(async () => await updateTournamentParticipant(tournament.id, nick.id, { status: "checkedin" }, { selfService: true }), dpFeedback("feedback.je_bent_ingecheckt"))}><Check size={15}/>{dpT("tournamentRoom.check_in")}</button>}{inField && tournament.status === "live" && <button className="tr-secondary" disabled={myMatch?.status === "playing"} onClick={async () => await act(async () => await setTournamentReady(tournament.id, nick!.id, !nick!.ready, { actorName: selfName() }), nick!.ready ? dpFeedback("feedback.je_staat_nu_op_pauze") : dpFeedback("feedback.je_bent_klaar_om_ingedeeld_te_worden"))}>{nick?.ready ? <Pause size={14}/> : <Check size={14}/>} {nick?.ready ? dpT("tournamentRoom.even_pauze") : dpT("tournamentRoom.ik_ben_klaar")}</button>}{myMatch && myAccess?.canPlay && <button className="tr-primary" onClick={() => openMatch(myMatch)}><Play size={14}/>{myMatch.status === "playing" ? dpT("tournamentRoom.hervat_mijn_partij") : dpT("tournamentRoom.naar_mijn_bord")}</button>}{!inField && tournament.status === "registration" && <a className="tr-secondary" href="/lobby#events">{dpT("tournamentRoom.inschrijven")} <ArrowRight size={14}/></a>}</div></section>}
      {notice && <div className={`tr-notice ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error ? <LockKeyhole size={15}/> : <Check size={15}/>}<span>{notice}</span><button onClick={() => setNotice("")} aria-label={dpT("tournamentRoom.melding_sluiten")}>×</button></div>}
      {playing && <CompetitionGame key={gameKey(tournament, playing)} gameId={gameKey(tournament, playing)} opponentName={matchName(tournament, playing, playing.players[0] === nick?.id ? 1 : 0)} startScore={tournament.settings.startScore} doubleOut={tournament.settings.doubleOut} bestOf={playing.bestOf} canPlay={playing.status === "playing" && getTournamentMatchAccess(tournament, playing.id, selfName()).canPlay} checkoutHints={tournament.settings.checkoutHints} onClose={() => setPlayingId(null)} onComplete={async score => { const current = getTournamentState().tournaments.find(value => value.id === tournament.id)?.matches.find(value => value.id === playing.id); if (!current || current.startedAt !== playing.startedAt || current.players.join("|") !== playing.players.join("|")) throw new Error(dpFeedback("feedback.deze_wedstrijd_is_opnieuw_ingedeeld_keer_terug_naar")); const ordered: [number, number] = playing.players[0] === nick?.id ? score : [score[1], score[0]]; await recordParticipantTournamentResult(tournament.id, playing.id, { score: ordered, kind: "played", reason: "Gespeelde toernooipartij" }, selfName()); setPlayingId(null); setNotice(dpFeedback("feedback.je_uitslag_is_opgeslagen_het_wedstrijdschema_en_de")); setError(false); }}/>}
      {!playing && <><nav className="tr-tabs" aria-label={dpT("tournamentRoom.in_deze_toernooikamer")}>{([{id:"boards",label:dpFeedback("feedback.borden"),icon:LayoutGrid},{id:"bracket",label:dpFeedback("feedback.schema"),icon:GitBranch},{id:"players",label:dpFeedback("feedback.spelers"),icon:Users},{id:"rules",label:dpFeedback("feedback.spelregels"),icon:ShieldCheck}] as const).map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-pressed={tab === item.id}><item.icon size={15}/>{item.label}</button>)}</nav>
      {tab === "boards" && <><div className="tr-section-title"><div><h2>{dpT("tournamentRoom.langs_de_borden")}</h2><p>{tournament.settings.scheduling === "automatic" ? dpT("tournamentRoom.de_volgende_beschikbare_partij_schuift_automatisch_door_naar") : dpT("tournamentRoom.de_wedstrijdleiding_wijst_iedere_partij_aan_een_bord")}</p></div><span>{occupied.length}/{tournament.settings.boardCount} {dpT("tournamentRoom.bezet")}</span></div><div className="tr-board-grid">{Array.from({ length: tournament.settings.boardCount }, (_, index) => { const match = occupied.find(m => m.boardId === index + 1); const access = match ? getTournamentMatchAccess(tournament, match.id, selfName()) : null; return <article className={`tr-board-card ${match ? "is-occupied" : ""}`} key={index}><header><span>{dpT("tournamentRoom.bord")} {String(index + 1).padStart(2,"0")}</span><b className={match?.status === "playing" ? "is-playing" : ""}>{match?.status === "playing" ? dpT("tournamentRoom.bezig") : match ? dpT("tournamentRoom.startklaar") : dpT("tournamentRoom.vrij")}</b></header>{match ? <><small>{laneName(match)}</small><div className="tr-board-pair"><PlayerName name={matchName(tournament, match, 0)}/><i>{dpT("tournamentRoom.vs")}</i><PlayerName name={matchName(tournament, match, 1)}/></div><p>{tournament.settings.startScore} · {tournament.settings.doubleOut ? dpT("tournamentRoom.double_out") : dpT("tournamentRoom.single_out")} {dpT("tournamentRoom.bo")} {match.bestOf}</p><footer><button onClick={() => setSelectedId(selectedId === match.id ? null : match.id)}><Eye size={14}/>{selectedId === match.id ? dpT("tournamentRoom.sluit_bord") : dpT("tournamentRoom.kijk_mee")}</button>{access?.canPlay && <button className="tr-card-play" onClick={() => openMatch(match)}>{dpT("tournamentRoom.spelen")} <ArrowRight size={14}/></button>}</footer></> : <div className="tr-empty-board"><Target size={40}/><p>{tournament.status === "live" ? dpT("tournamentRoom.klaar_voor_de_volgende_partij") : dpT("tournamentRoom.wacht_op_het_toernooi")}</p></div>}</article>; })}</div>{selected && <section className="tr-selected-board"><div className="tr-section-title"><h2>{selected.boardId ? dpT("tournamentRoom.bord_2",{boardId:selected.boardId}) : dpT("tournamentRoom.wedstrijd")} · {laneName(selected)}</h2><button className="tr-secondary" onClick={() => setSelectedId(null)}>{dpT("tournamentRoom.sluiten")}</button></div><SavedBoard key={gameKey(tournament, selected)} tournament={tournament} match={selected}/></section>}<section className="tr-queue"><div className="tr-section-title"><h2><Clock3 size={18}/>{dpT("tournamentRoom.hierna_aan_de_beurt")}</h2><span>{waiting.length} {dpT("tournamentRoom.partijen")}</span></div>{waiting.length ? waiting.map(match => <div className="tr-queue-row" key={match.id}><div><PlayerName name={matchName(tournament, match, 0)}/><span> {dpT("tournamentRoom.tegen")} </span><PlayerName name={matchName(tournament, match, 1)}/><small>{getMatchPlanningReasons(tournament, match, now || Date.now()).join(" · ") || dpT("tournamentRoom.wacht_op_een_vrij_bord")}</small></div><span>{laneName(match)}</span></div>) : <p className="tr-empty">{tournament.status === "live" ? dpT("tournamentRoom.alle_startklare_partijen_hebben_een_bord_nieuwe_partijen") : dpT("tournamentRoom.de_volgende_partijen_verschijnen_zodra_het_toernooi_live")}</p>}</section></>}
      {tab === "bracket" && <section className="tr-bracket"><div className="tr-section-title"><div><h2>{dpT("tournamentRoom.de_weg_naar_de_finale")}</h2><p>{tournament.settings.format === "double-elimination" ? dpT("tournamentRoom.na_je_eerste_verlies_ga_je_naar_de") : dpT("tournamentRoom.winnaars_gaan_door_na_een_nederlaag_ben_je")}</p></div></div><TournamentBracket tournament={tournament}/></section>}
      {tab === "players" && <section className="tr-players"><div className="tr-section-title"><h2>{dpT("tournamentRoom.het_spelersveld")}</h2><span>{registered.length} {dpT("tournamentRoom.toegelaten_spelers")}</span></div><div className="tr-table-wrap"><table><thead><tr><th>{dpT("tournamentRoom.speler")}</th><th>{dpT("tournamentRoom.dp")}</th><th>{dpT("tournamentRoom.status")}</th><th>{dpT("tournamentRoom.bord_3")}</th></tr></thead><tbody>{tournament.participants.filter(p => p.status !== "withdrawn").map(player => { const match = occupied.find(m => m.players.includes(player.id)); return <tr key={player.id}><td><PlayerName name={player.name}/>{player.name === selfName() && <small className="tr-you">{dpT("tournamentRoom.jij")}</small>}</td><td>{Math.round(player.rating)}</td><td><span className={`tr-player-state ${player.ready ? "is-ready" : ""}`}>{player.status === "waiting" ? dpT("tournamentRoom.wachtlijst") : match?.status === "playing" ? dpT("tournamentRoom.speelt") : player.ready ? dpT("tournamentRoom.klaar") : player.status === "checkedin" ? dpT("tournamentRoom.pauze") : dpT("tournamentRoom.aangemeld")}</span></td><td>{match?.boardId ? <button onClick={() => { setSelectedId(match.id); setTab("boards"); }}>{dpT("tournamentRoom.bord_3")} {match.boardId} <Eye size={12}/></button> : "—"}</td></tr>; })}</tbody></table></div><p className="tr-footnote">{dpT("tournamentRoom.als_toeschouwer_kun_je_vrij_meekijken_wil_je")}</p></section>}
      {tab === "rules" && <section className="tr-rules"><h2>{dpT("tournamentRoom.zo_spelen_we_vanavond")}</h2><div className="tr-rules-grid">{[["Organisator","DartsPoint"],["Spel",`${tournament.settings.startScore} · ${tournament.settings.doubleOut ? "Double-out" : "Single-out"}`],["Rondes / finale",`Best of ${tournament.settings.bestOf} / ${tournament.settings.finalBestOf}`],["Vorm",tournament.settings.format === "double-elimination" ? "Dubbele eliminatie" : "Knock-out"],["Planning",dpFeedback("feedback.boardScheduling",{count:tournament.settings.boardCount,mode:tournament.settings.scheduling})],["Rust tussen partijen",`${tournament.settings.restSeconds} seconden`],["Check-in",tournament.settings.requireCheckIn ? dpFeedback("feedback.verplicht") : "Optioneel"],["Toeschouwers","Altijd welkom"]].map(([label,value]) => <div key={label}><span><FixedCopy value={label}/></span><strong>{value}</strong></div>)}</div>{tournament.settings.format === "double-elimination" && <p>{dpT("tournamentRoom.de_ongeslagen_finalist_heeft_nog_geen_verliespartij_wint")}</p>}<p>{dpT("tournamentRoom.in_deze_kamer_speel_je_de_wedstrijden_van")}</p></section>}</>}
      <footer className="tr-footer"><ShieldCheck size={13}/><p>{dpT("tournamentRoom.veel_plezier_aan_het_bord_en_langs_de")}</p></footer>
    </div>
  </main>;
}

const dpStaticCopyKeys={
  "Concept": "tournamentRoom.copy_concept",
  "Inschrijving": "tournamentRoom.copy_inschrijving",
  "In de toernooikamer": "tournamentRoom.copy_in_de_toernooikamer",
  "Afgerond": "tournamentRoom.copy_afgerond",
  "Geannuleerd": "tournamentRoom.copy_geannuleerd"
};
