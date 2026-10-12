"use client";
import {selfName} from "@/lib/platform-client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, HeartHandshake, History, LoaderCircle, RefreshCw, ShieldCheck, Target, Trophy, Wifi, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName, RatingValue } from "./player-identity";
import { playerByName } from "@/lib/darts-data";
import { useRatingProfile } from "@/lib/darts-ratings";
import { expectedRatingChange } from "@/lib/darts-elo";
import { matchFormatLabel, matchRulesLabel } from "@/lib/darts-match-setup";
import type { DartsGame } from "./darts-game";
import { sendQuickChat } from "./darts-community";
import "./darts-match-experience.css";

function positive(value: number) { const rounded = Math.round(value); return rounded > 0 ? `+${rounded}` : String(rounded); }
export function MatchExperience({ game, lessMotion, hidden }: { game: DartsGame; lessMotion: boolean; hidden: boolean }) {
  const [endOpen, setEndOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [moment, setMoment] = useState<"180" | "checkout" | null>(null);
  const nick = useRatingProfile(selfName());
  const opponent = useRatingProfile(game.opponentName);
  const expected = expectedRatingChange(nick.rating, opponent.rating);
  const visits = useMemo(() => {
    const grouped = new Map<number, typeof game.events>();
    for (const dart of game.events) grouped.set(dart.visit, [...(grouped.get(dart.visit) || []), dart]);
    return [...grouped.entries()].reverse();
  }, [game.events]);
  useEffect(() => { setEndOpen(true); setReacted(false); setHistoryOpen(false); setDetailsOpen(false); }, [game.id]);
  useEffect(() => {
    if (!game.celebration) { setMoment(null); return; }
    setMoment(game.celebration);
    const timer = setTimeout(() => setMoment(null), game.celebration === "180" ? 1600 : 1000);
    return () => clearTimeout(timer);
  }, [game.events.length, game.celebration]);
  const over = game.phase === "won";
  useEffect(() => { if (!over) { setEndOpen(false); return; } const timer = setTimeout(() => setEndOpen(true), lessMotion ? 0 : 950); return () => clearTimeout(timer); }, [over, lessMotion]);
  const showPre = !!game.matchId && game.seat!==null && !game.ready && !game.preparing && !hidden;
  const showEnd = over && endOpen && !hidden;
  return <>
    {game.ready && !hidden && <div className="dp-match-tools">
      <button onClick={() => setDetailsOpen(value => !value)} aria-expanded={detailsOpen} aria-label="Wedstrijdinformatie en verbinding"><span className={`dp-verification-dot ${game.verification}`}/>{game.modeLabel}<ChevronDown size={11}/></button>
      {over && <button onClick={() => setEndOpen(true)}><Trophy size={12}/>Uitslag</button>}
      {detailsOpen && <div className="dp-match-tool-menu">
        <strong>Game #{game.id}</strong><span>{game.verification === "server" ? "Worpen gecontroleerd op de server" : "Lokale demowedstrijd"}</span>
        <button onClick={() => { setHistoryOpen(true); setDetailsOpen(false); }}><History size={14}/>Bekijk alle worpen</button>
        {!over && <button onClick={() => { game.simulateDisconnect(); setDetailsOpen(false); }}><WifiOff size={14}/>Test verbinding herstellen</button>}
        <a href="/clubhuis"><Trophy size={14}/>Records & geschiedenis</a>
      </div>}
    </div>}
    <AnimatePresence>{!hidden && game.bustReason && <motion.div key={game.events.at(-1)?.id} className="dp-bust-feedback" role="status" initial={lessMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><strong>BUST</strong><span>{game.bustReason}</span></motion.div>}</AnimatePresence>
    <AnimatePresence>{moment && !hidden && <motion.div className={`dp-game-moment ${moment === "180" ? "is-180" : "is-checkout"}`} key={`${game.events.length}-${moment}`} aria-live="polite" initial={lessMotion ? false : { opacity: 0, scale: .82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><span>{moment === "180" ? "ONE HUNDRED AND EIGHTY" : "GAME SHOT"}</span><strong>{moment === "180" ? "180" : game.events.at(-1)?.hit.label}</strong></motion.div>}</AnimatePresence>
    {game.reconnected && !hidden && <div className="dp-reconnect-toast" role="status"><Wifi size={14}/>Je partij staat precies waar je was.</div>}
    {game.connectionMessage && !game.offlineUntil && !hidden && <div className="dp-connection-note" role="status">{game.connectionMessage}</div>}
    <Dialog open={!!game.preparing&&!hidden} onOpenChange={()=>{}}><DialogContent className="dp-dialog dp-match-dialog" showCloseButton={false}><DialogHeader><DialogTitle>Je partij wordt geopend.</DialogTitle><DialogDescription>{game.connectionMessage||'De server haalt je bevestigde wedstrijd op.'}</DialogDescription></DialogHeader><LoaderCircle className="dp-loading-spin" size={24}/><a className="dp-match-back" href="/lobby">Terug naar de lobby</a></DialogContent></Dialog>

    <Dialog open={showPre} onOpenChange={() => {}}><DialogContent className="dp-dialog dp-match-dialog" showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
      <DialogHeader><span className="dp-match-eyebrow"><Target size={14}/>KLAAR AAN DE OCHE</span><DialogTitle>Een mooie partij begint hier.</DialogTitle><DialogDescription>{matchRulesLabel(game.rules)}<br/>{matchFormatLabel(game.rules)}</DialogDescription></DialogHeader>
      <div className="dp-versus-card"><div><span className="dp-match-avatar">{selfName().slice(0,2).toUpperCase()}</span><PlayerName name={selfName()}/><RatingValue player={playerByName(selfName())} brackets/></div><span>VS</span><div><span className="dp-match-avatar">{game.opponentName.slice(0,2).toUpperCase()}</span><PlayerName name={game.opponentName}/><RatingValue player={playerByName(game.opponentName)} brackets/></div></div>
      <div className="dp-match-rules"><span>Spelvorm<strong>{game.modeLabel}</strong></span><span>Eerste leg<strong>{game.starter === 0 ? "Jij begint" : `${game.opponentName} begint`}</strong></span><span>Daarna<strong>Om de beurt starten</strong></span></div>
      {game.mode === "ranked-demo" ? <div className="dp-elo-preview"><div><span>Bij winst</span><strong>{positive(expected.win)}</strong></div><div><span>Bij verlies</span><strong>{positive(expected.loss)}</strong></div><p>Dit is een indicatie op basis van jullie huidige Elo. De definitieve wijziging volgt na de uitslag.</p></div> : <p className="dp-match-mode-note">Speel ontspannen. Deze partij verandert je rating niet.</p>}
      <button className="dp-match-primary" disabled={game.sending||game.waitingForOpponent} onClick={() => void game.beginMatch()}>{game.sending ? <LoaderCircle className="dp-loading-spin" size={17}/> : <ArrowRight size={17}/>} {game.sending ? "Wedstrijd voorbereiden…" : game.waitingForOpponent?'Wachten op je tegenstander…':"Begin de wedstrijd"}</button><a className="dp-match-back" href="/lobby">Terug naar de lobby</a>
    </DialogContent></Dialog>

    <Dialog open={!!game.offlineUntil && !hidden} onOpenChange={() => {}}><DialogContent className="dp-dialog dp-match-dialog dp-reconnect-dialog" showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}><DialogHeader><WifiOff className="dp-reconnect-icon" size={30}/><DialogTitle>Even opnieuw verbinden.</DialogTitle><DialogDescription>Je bevestigde worpen en score blijven bewaard. Herstel binnen je resterende hersteltijd om verder te spelen.</DialogDescription></DialogHeader><strong className="dp-reconnect-clock">{game.remainingReconnect}<small>sec</small></strong><button className="dp-match-primary" onClick={game.reconnect}><RefreshCw size={16}/>Verbinding herstellen</button><p className="dp-match-mode-note">Je resterende hersteltijd wordt door de server bewaakt. Na afloop handelt de server de partij af.</p></DialogContent></Dialog>

    <Dialog open={showEnd} onOpenChange={setEndOpen}><DialogContent className="dp-dialog dp-match-dialog"><DialogHeader><span className="dp-match-eyebrow"><Trophy size={14}/>GAME #{game.id}</span><DialogTitle>{game.winner === 0 ? "Deze is van jou." : "Een mooie strijd."}</DialogTitle><DialogDescription>{game.forfeit ? "De wedstrijd is beëindigd door opgave." : `${game.winner === 0 ? selfName() : game.opponentName} wint de wedstrijd.`} {game.rules.format === "sets" ? "Uitslag in sets." : "Uitslag in legs."}</DialogDescription></DialogHeader><div className="dp-final-score"><span>{selfName()}</span><strong>{game.rules.format === "sets" ? game.sets[0] : game.legs[0]}<i>–</i>{game.rules.format === "sets" ? game.sets[1] : game.legs[1]}</strong><span>{game.opponentName}</span></div>
      {game.rules.format === "sets" && <p className="dp-match-mode-note">Totaal gewonnen legs: {game.totalLegs[0]}–{game.totalLegs[1]} · {matchFormatLabel(game.rules)}</p>}
      <div className="dp-result-stats"><div><span>Gemiddelde</span><strong>{game.averages[0].toFixed(1)}</strong><small>{game.opponentName}: {game.averages[1].toFixed(1)}</small></div><div><span>Hoogste beurt</span><strong>{game.highestVisit[0]}</strong><small>{game.opponentName}: {game.highestVisit[1]}</small></div><div><span>Hoogste finish</span><strong>{game.highestCheckout[0] || "—"}</strong><small>{game.opponentName}: {game.highestCheckout[1] || "—"}</small></div></div>
      <div className={`dp-result-rating ${(game.ratingChange?.deltaA ?? 0) >= 0 ? "is-positive" : "is-negative"}`}><ShieldCheck size={17}/><span>{game.mode === "ranked-demo" && game.ratingChange ? <>Demorating <strong>{Math.round(game.ratingChange.beforeA)} → {Math.round(game.ratingChange.afterA)}</strong></> : "Vrij gespeeld · rating ongewijzigd"}</span>{game.mode === "ranked-demo" && game.ratingChange && <b>{positive(game.ratingChange.deltaA)}</b>}</div>
      <button className="dp-match-primary" onClick={game.rematch}><RefreshCw size={17}/>Revanche · {game.starter === 0 ? game.opponentName : "jij"} begint</button><div className="dp-match-secondary-row"><button onClick={async () => { setReacted(await sendQuickChat("Goed gespeeld!", { gameId: game.id, opponentName: game.opponentName, roomName: sessionStorage.getItem("dartspoint-room-v1") || "Nederland 1", channel: "match" })); }} disabled={reacted}>{reacted ? <Check size={15}/> : <HeartHandshake size={15}/>} {reacted ? "Verstuurd" : "Goed gespeeld!"}</button><button onClick={() => { setEndOpen(false); setHistoryOpen(true); }}><History size={15}/>Alle worpen</button></div><a className="dp-match-back" href="/lobby">Terug naar de lobby</a>
    </DialogContent></Dialog>

    <Dialog open={historyOpen && !hidden} onOpenChange={setHistoryOpen}><DialogContent className="dp-dialog dp-match-dialog dp-history-dialog"><DialogHeader><DialogTitle>Elke pijl telt.</DialogTitle><DialogDescription>Game #{game.id} · {game.events.length} worpen</DialogDescription></DialogHeader><div className="dp-visit-history">{visits.length === 0 ? <p>Je eerste worp verschijnt hier zodra de pijl het bord raakt.</p> : visits.map(([visit, darts]) => <div key={visit}><header><strong>{darts[0].player === 0 ? selfName() : game.opponentName}</strong><span>Leg {darts[0].leg} · beurt {visit}</span></header><div className="dp-visit-darts">{darts.map(dart => <span key={dart.id} title={dart.ignoredOnEntry ? "Nog niet geopend: alleen een dubbel telt als eerste worp." : undefined} className={dart.checkout ? "is-finish" : dart.bust ? "is-bust" : ""}>{dart.hit.label}<small>{dart.ignoredOnEntry ? "0 · IN" : dart.credited ?? dart.hit.score}</small></span>)}<b>{darts.at(-1)!.bust ? "BUST" : darts[0].before - darts.at(-1)!.after}</b></div><footer>{darts[0].before} → {darts.at(-1)!.after}{darts.at(-1)!.checkout ? " · Uit!" : " over"}</footer></div>)}</div></DialogContent></Dialog>
  </>;
}
