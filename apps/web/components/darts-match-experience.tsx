"use client";
import {useI18n} from '@/lib/i18n/provider';

import {selfName,usePlatform,api,mutate} from "@/lib/platform-client";
import {publicGameLabel} from '@/lib/public-game-label';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, HeartHandshake, History, LoaderCircle, RefreshCw, ShieldCheck, Target, Trophy, Wifi, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName, RatingValue } from "./player-identity";
import { playerByName } from "@/lib/darts-data";
import { useRatingProfile } from "@/lib/darts-ratings";
import { expectedRatingChange } from "@/lib/darts-elo";
import { matchFormatLabel, matchRulesLabel } from "@/lib/darts-match-setup";
import type { DartsGame } from "./darts-game";
import "./darts-match-experience.css";

function positive(value: number) { const rounded = Math.round(value); return rounded > 0 ? `+${rounded}` : String(rounded); }
export function MatchExperience({ game, lessMotion, hidden }: { game: DartsGame; lessMotion: boolean; hidden: boolean }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpT = useI18n("matchExperience").t;

  const gameLabel=publicGameLabel(usePlatform(),game.id,game.publicGameId??game.gameNumber);
  const [endOpen, setEndOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rematchId,setRematchId]=useState<string|null>(null),[resultBusy,setResultBusy]=useState(false),[resultError,setResultError]=useState('');
  const [moment, setMoment] = useState<"180" | "checkout" | null>(null);
  const nick = useRatingProfile(selfName());
  const opponent = useRatingProfile(game.opponentName);
  const expected = expectedRatingChange(nick.rating, opponent.rating);
  const visits = useMemo(() => {
    const grouped = new Map<number, typeof game.events>();
    for (const dart of game.events) grouped.set(dart.visit, [...(grouped.get(dart.visit) || []), dart]);
    return [...grouped.entries()].reverse();
  }, [game.events]);
  useEffect(() => { setEndOpen(true); setRematchId(null); setResultBusy(false); setResultError(""); setHistoryOpen(false); setDetailsOpen(false); }, [game.id]);
  useEffect(() => {
    if (!game.celebration) { setMoment(null); return; }
    setMoment(game.celebration);
    const timer = setTimeout(() => setMoment(null), game.celebration === "180" ? 1600 : 1000);
    return () => clearTimeout(timer);
  }, [game.events.length, game.celebration]);
  const closeFlight=useRef<Promise<void>|null>(null);
  const closeResult=useCallback(()=>{
    if(closeFlight.current)return closeFlight.current;
    const task=(async()=>{
    setResultBusy(true);setResultError('');
    try{
      if(rematchId){
        const status=await api<{state:string;match_id:string|null}>('invite/'+rematchId);
        if(status.state==='accepted'&&status.match_id){window.location.assign('/spelen?match='+status.match_id);return;}
        if(status.state==='pending'){
          try{await mutate('invite/respond',{inviteId:rematchId,action:'cancel'});}
          catch(error){const latest=await api<{state:string;match_id:string|null}>('invite/'+rematchId);if(latest.state==='accepted'&&latest.match_id){window.location.assign('/spelen?match='+latest.match_id);return;}if(latest.state==='pending')throw error;}
        }
      }
      await game.closeCompletedMatch();
    }catch(error){setResultError(error instanceof Error?error.message:'Afsluiten lukt nu niet. Probeer het opnieuw.');}
    finally{setResultBusy(false);}
    })();closeFlight.current=task.finally(()=>{closeFlight.current=null;});return closeFlight.current;
  },[game.closeCompletedMatch,rematchId]);
  useEffect(()=>{
    if(!rematchId)return;let disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const check=async()=>{
      try{const status=await api<{state:string;match_id:string|null}>('invite/'+rematchId);if(disposed)return;
        if(status.state==='accepted'&&status.match_id){window.location.assign('/spelen?match='+status.match_id);return;}
        if(['rejected','cancelled','expired'].includes(status.state)){await closeResult();return;}
        setResultError('');
      }catch(error){if(!disposed)setResultError(error instanceof Error?error.message:'Je uitnodiging kan nu niet worden bijgewerkt. We proberen het opnieuw.');}
      if(!disposed)timer=setTimeout(check,1500);
    };void check();return()=>{disposed=true;clearTimeout(timer);};
  },[rematchId,closeResult]);
  async function inviteAgain(){
    setResultBusy(true);setResultError('');
    try{const invitation=await game.rematch();setRematchId(invitation.id);}
    catch(error){setResultError(error instanceof Error?error.message:'Uitnodigen lukt nu niet. Probeer het opnieuw.');}
    finally{setResultBusy(false);}
  }
  const over = game.phase === "won";
  useEffect(() => { if (!over) { setEndOpen(false); return; } const timer = setTimeout(() => setEndOpen(true), lessMotion ? 0 : 950); return () => clearTimeout(timer); }, [over, lessMotion]);
  const showPre = !!game.matchId && game.seat!==null && !game.ready && !game.preparing && !hidden;
  const showEnd = over && endOpen && !hidden;
  return <>
    {game.ready && !hidden && <div className="dp-match-tools">
      <button onClick={() => setDetailsOpen(value => !value)} aria-expanded={detailsOpen} aria-label={dpT("matchExperience.wedstrijdinformatie_en_verbinding")}><span className={`dp-verification-dot ${game.verification}`}/>{game.modeLabel}<ChevronDown size={11}/></button>
      {over && <button onClick={() => setEndOpen(true)}><Trophy size={12}/>{dpT("matchExperience.uitslag")}</button>}
      {detailsOpen && <div className="dp-match-tool-menu">
        <strong>{dpT("matchExperience.game")} {gameLabel}</strong>
        <button onClick={() => { setHistoryOpen(true); setDetailsOpen(false); }}><History size={14}/>{dpT("matchExperience.bekijk_alle_worpen")}</button>
        {!over && <button onClick={() => { game.simulateDisconnect(); setDetailsOpen(false); }}><WifiOff size={14}/>{dpT("matchExperience.opnieuw_verbinden")}</button>}
        <a href="/clubhuis"><Trophy size={14}/>{dpT("matchExperience.records_geschiedenis")}</a>
      </div>}
    </div>}
    <AnimatePresence>{!hidden && game.bustReason && <motion.div key={game.events.at(-1)?.id} className="dp-bust-feedback" role="status" initial={lessMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><strong>{dpT("matchExperience.bust")}</strong><span>{game.bustReason}</span></motion.div>}</AnimatePresence>
    <AnimatePresence>{moment && !hidden && <motion.div className={`dp-game-moment ${moment === "180" ? "is-180" : "is-checkout"}`} key={`${game.events.length}-${moment}`} aria-live="polite" initial={lessMotion ? false : { opacity: 0, scale: .82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><span>{moment === "180" ? dpT("matchExperience.one_hundred_and_eighty") : dpT("matchExperience.game_shot")}</span><strong>{moment === "180" ? "180" : game.events.at(-1)?.hit.label}</strong></motion.div>}</AnimatePresence>
    {game.reconnected && !hidden && <div className="dp-reconnect-toast" role="status"><Wifi size={14}/>{dpT("matchExperience.je_partij_staat_precies_waar_je_was")}</div>}
    {game.connectionMessage && !game.offlineUntil && !hidden && <div className="dp-connection-note" role="status">{game.connectionMessage}</div>}
    <Dialog open={!!game.preparing&&!hidden} onOpenChange={()=>{}}><DialogContent className="dp-dialog dp-match-dialog" showCloseButton={false}><DialogHeader><DialogTitle>{dpT("matchExperience.je_partij_wordt_geopend")}</DialogTitle><DialogDescription>{game.connectionMessage||dpT("matchExperience.even_geduld_je_wedstrijd_wordt_klaargezet")}</DialogDescription></DialogHeader><LoaderCircle className="dp-loading-spin" size={24}/><a className="dp-match-back" href="/lobby">{dpT("matchExperience.terug_naar_de_lobby")}</a></DialogContent></Dialog>

    <Dialog open={showPre} onOpenChange={() => {}}><DialogContent className="dp-dialog dp-match-dialog" showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
      <DialogHeader><span className="dp-match-eyebrow"><Target size={14}/>{dpT("matchExperience.klaar_aan_de_oche")}</span><DialogTitle>{dpT("matchExperience.een_mooie_partij_begint_hier")}</DialogTitle><DialogDescription>{matchRulesLabel(game.rules)}<br/>{matchFormatLabel(game.rules)}</DialogDescription></DialogHeader>
      <div className="dp-versus-card"><div><span className="dp-match-avatar">{selfName().slice(0,2).toUpperCase()}</span><PlayerName name={selfName()}/><RatingValue player={playerByName(selfName())} brackets/></div><span>{dpT("matchExperience.vs")}</span><div><span className="dp-match-avatar">{game.opponentName.slice(0,2).toUpperCase()}</span><PlayerName name={game.opponentName}/><RatingValue player={playerByName(game.opponentName)} brackets/></div></div>
      <div className="dp-match-rules"><span>{dpT("matchExperience.spelvorm")}<strong>{game.modeLabel}</strong></span><span>{dpT("matchExperience.eerste_leg")}<strong>{game.starter === 0 ? dpT("matchExperience.jij_begint") : dpT("matchExperience.begint",{opponentName:game.opponentName})}</strong></span><span>{dpT("matchExperience.daarna")}<strong>{dpT("matchExperience.om_de_beurt_starten")}</strong></span></div>
      {game.mode === "ranked-demo" ? <div className="dp-elo-preview"><div><span>{dpT("matchExperience.bij_winst")}</span><strong>{positive(expected.win)}</strong></div><div><span>{dpT("matchExperience.bij_verlies")}</span><strong>{positive(expected.loss)}</strong></div><p>{dpT("matchExperience.dit_is_een_indicatie_op_basis_van_jullie")}</p></div> : <p className="dp-match-mode-note">{dpT("matchExperience.speel_ontspannen_deze_partij_verandert_je_rating_niet")}</p>}
      <button className="dp-match-primary" disabled={game.sending||game.waitingForOpponent} onClick={() => void game.beginMatch()}>{game.sending ? <LoaderCircle className="dp-loading-spin" size={17}/> : <ArrowRight size={17}/>} {game.sending ? dpT("matchExperience.wedstrijd_voorbereiden") : game.waitingForOpponent?dpT("matchExperience.wachten_op_je_tegenstander"):dpT("matchExperience.begin_de_wedstrijd")}</button><a className="dp-match-back" href="/lobby">{dpT("matchExperience.terug_naar_de_lobby")}</a>
    </DialogContent></Dialog>

    <Dialog open={!!game.offlineUntil && !hidden} onOpenChange={() => {}}><DialogContent className="dp-dialog dp-match-dialog dp-reconnect-dialog" showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}><DialogHeader><WifiOff className="dp-reconnect-icon" size={30}/><DialogTitle>{dpT("matchExperience.even_opnieuw_verbinden")}</DialogTitle><DialogDescription>{dpT("matchExperience.je_worpen_en_score_zijn_er_nog_verbind")}</DialogDescription></DialogHeader><strong className="dp-reconnect-clock">{game.remainingReconnect}<small>{dpT("matchExperience.sec")}</small></strong><button className="dp-match-primary" onClick={game.reconnect}><RefreshCw size={16}/>{dpT("matchExperience.verbinding_herstellen")}</button><p className="dp-match-mode-note">{dpT("matchExperience.verbind_opnieuw_voordat_de_teller_op_nul_staat")}</p></DialogContent></Dialog>

    <Dialog open={showEnd} onOpenChange={()=>{}}><DialogContent className="dp-dialog dp-match-dialog" showCloseButton={false} onEscapeKeyDown={event=>event.preventDefault()} onPointerDownOutside={event=>event.preventDefault()}><DialogHeader><span className="dp-match-eyebrow"><Trophy size={14}/>{dpT("matchExperience.game_2")} {gameLabel}</span><DialogTitle>{dpT("matchExperience.wedstrijdoverzicht")}</DialogTitle><DialogDescription>{game.forfeit ? dpT("matchExperience.de_wedstrijd_is_beeindigd_door_opgave") : dpT("matchExperience.wint_de_wedstrijd",{opponentName:game.winner === 0 ? selfName() : game.opponentName})} {game.rules.format === "sets" ? dpT("matchExperience.uitslag_in_sets") : dpT("matchExperience.uitslag_in_legs")}</DialogDescription></DialogHeader><div className="dp-final-score"><span>{selfName()}</span><strong>{game.rules.format === "sets" ? game.sets[0] : game.legs[0]}<i>–</i>{game.rules.format === "sets" ? game.sets[1] : game.legs[1]}</strong><span>{game.opponentName}</span></div>
      {game.rules.format === "sets" && <p className="dp-match-mode-note">{dpT("matchExperience.totaal_gewonnen_legs")} {game.totalLegs[0]}–{game.totalLegs[1]} · {matchFormatLabel(game.rules)}</p>}
      <div className="dp-result-stats"><div><span>{dpT("matchExperience.gemiddelde")}</span><strong>{new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(game.averages[0])}</strong><small>{game.opponentName}: {new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(game.averages[1])}</small></div><div><span>{dpT("matchExperience.hoogste_beurt")}</span><strong>{game.highestVisit[0]}</strong><small>{game.opponentName}: {game.highestVisit[1]}</small></div><div><span>{dpT("matchExperience.hoogste_finish")}</span><strong>{game.highestCheckout[0] || "—"}</strong><small>{game.opponentName}: {game.highestCheckout[1] || "—"}</small></div></div>
      <div className={`dp-result-rating ${(game.ratingChange?.deltaA ?? 0) >= 0 ? "is-positive" : "is-negative"}`}><ShieldCheck size={17}/><span>{game.mode === "ranked-demo" && game.ratingChange ? <>{dpT("matchExperience.rating")} <strong>{Math.round(game.ratingChange.beforeA)} → {Math.round(game.ratingChange.afterA)}</strong></> : dpT("matchExperience.vrij_gespeeld_rating_ongewijzigd")}</span>{game.mode === "ranked-demo" && game.ratingChange && <b>{positive(game.ratingChange.deltaA)}</b>}</div>
      {rematchId&&<p className="dp-result-wait" role="status"><LoaderCircle className="dp-loading-spin" size={18}/>{dpT("matchExperience.wachten_tot")} {game.opponentName} {dpT("matchExperience.je_uitnodiging_accepteert_of_weigert")}</p>}
      {resultError&&<p className="dp-login-error" role="alert">{resultError}</p>}
      {!game.canRematch&&<p className="dp-match-mode-note">{dpT("matchExperience.een_toernooi_of_divisiewedstrijd_kun_je_niet_opnieuw")}</p>}
      <button className="dp-match-primary" disabled={resultBusy||!!rematchId||!game.canRematch} onClick={()=>void inviteAgain()}><RefreshCw size={17}/>{rematchId?dpT("matchExperience.uitnodiging_verstuurd"):dpT("matchExperience.nodig_opnieuw_uit")}</button>
      <button className="dp-match-back dp-result-close" disabled={resultBusy} onClick={()=>void closeResult()}>{resultBusy?dpT("matchExperience.even_wachten"):dpT("matchExperience.afsluiten")}</button>
    </DialogContent></Dialog>

    <Dialog open={historyOpen && !hidden} onOpenChange={setHistoryOpen}><DialogContent className="dp-dialog dp-match-dialog dp-history-dialog"><DialogHeader><DialogTitle>{dpT("matchExperience.elke_pijl_telt")}</DialogTitle><DialogDescription>{dpT("matchExperience.game")} {gameLabel} · {game.events.length} {dpT("matchExperience.worpen")}</DialogDescription></DialogHeader><div className="dp-visit-history">{visits.length === 0 ? <p>{dpT("matchExperience.je_eerste_worp_verschijnt_hier_zodra_de_pijl")}</p> : visits.map(([visit, darts]) => <div key={visit}><header><strong>{darts[0].player === 0 ? selfName() : game.opponentName}</strong><span>{dpT("matchExperience.leg")} {darts[0].leg} {dpT("matchExperience.beurt")} {visit}</span></header><div className="dp-visit-darts">{darts.map(dart => <span key={dart.id} title={dart.ignoredOnEntry ? dpT("matchExperience.nog_niet_geopend_alleen_een_dubbel_telt_als") : undefined} className={dart.checkout ? "is-finish" : dart.bust ? "is-bust" : ""}>{dart.hit.label}<small>{dart.ignoredOnEntry ? dpT("matchExperience.0_in") : dart.credited ?? dart.hit.score}</small></span>)}<b>{darts.at(-1)!.bust ? dpT("matchExperience.bust") : darts[0].before - darts.at(-1)!.after}</b></div><footer>{darts[0].before} → {darts.at(-1)!.after}{darts.at(-1)!.checkout ? dpT("matchExperience.uit") : dpT("matchExperience.over")}</footer></div>)}</div></DialogContent></Dialog>
  </>;
}
