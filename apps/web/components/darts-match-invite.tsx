"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';

import {selfName,usePlatform} from "@/lib/platform-client";
import {invitationReason} from '@/lib/darts-social';

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Layers3, Swords, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName, RatingValue } from "./player-identity";
import { playerByName } from "@/lib/darts-data";
import { DEFAULT_MATCH_SETUP, matchFormatLabel, normalizeMatchSetup, readMatchSetup, type MatchSetup } from "@/lib/darts-match-setup";
import { expectedRatingChange } from "@/lib/darts-elo";
import { useRatingProfile } from "@/lib/darts-ratings";
import "./darts-match-invite.css";

export function MatchInviteDialog({ opponent, onClose, onStart, initialRanked }: {
  opponent: string | null; onClose: () => void;
  onStart: (setup: MatchSetup) => void | Promise<void>; initialRanked?: boolean;
}) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("matchInvite").t;

  const [setup, setSetup] = useState<MatchSetup>(DEFAULT_MATCH_SETUP);
  const [error, setError] = useState("");
  const [sending,setSending]=useState(false);
  usePlatform();const opponentLabel=opponent?playerByName(opponent).name:'',busyReason=opponent?invitationReason(opponent):'';
  const nick = useRatingProfile(selfName()), rival = useRatingProfile(opponentLabel);
  const expected = expectedRatingChange(nick.rating, rival.rating);
  useEffect(() => {
    if (!opponent) return;
    const previous = readMatchSetup();
    setSetup({ ...previous, ranked: initialRanked ?? previous.ranked }); setError("");
  }, [opponent, initialRanked]);
  function updateRules(patch: Partial<MatchSetup["rules"]>) { setSetup(value => ({ ...value, rules: { ...value.rules, ...patch } })); }
  async function start() {
    if(sending||busyReason){if(busyReason)setError(busyReason);return;}setSending(true);setError("");
    try { await onStart(normalizeMatchSetup(setup)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : dpFeedback("feedback.uitnodigen_lukt_nu_niet_probeer_het_opnieuw")); }
    finally{setSending(false); }
  }
  return <Dialog open={!!opponent} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="dp-dialog dpi-dialog">
      <DialogHeader><span className="dpi-eyebrow"><Swords size={14}/>{dpT("matchInvite.nieuwe_uitdaging")}</span><DialogTitle>{dpT("matchInvite.klaar_voor_een_partij")}</DialogTitle><DialogDescription>{dpT("matchInvite.kies_jullie_spel_en_de_lengte_van_de")}</DialogDescription></DialogHeader>
      <div className="dpi-opponent"><span className="dpi-avatar">{opponentLabel.slice(0, 2).toUpperCase()}</span><div><PlayerName name={opponentLabel}/><span>{dpT("matchInvite.je_tegenstander")}</span></div><RatingValue player={playerByName(opponent || "")} brackets/></div>
      <fieldset className="dpi-fieldset"><legend>{dpT("matchInvite.speltype")}</legend><div className="dpi-game-types">{([301, 501, 701] as const).map(startScore => <button type="button" key={startScore} aria-pressed={setup.rules.startScore === startScore} onClick={() => updateRules({ startScore, doubleIn: startScore === 301, doubleOut: true })}><strong>{startScore}</strong><span>{startScore === 301 ? dpT("matchInvite.dubbel_in_uit") : dpT("matchInvite.dubbel_uit")}</span>{setup.rules.startScore === startScore && <Check size={13}/>}</button>)}</div></fieldset>
      <fieldset className="dpi-fieldset"><legend>{dpT("matchInvite.wedstrijdvorm")}</legend><div className="dpi-format">{(["legs", "sets"] as const).map(format => <button type="button" key={format} aria-pressed={setup.rules.format === format} onClick={() => updateRules({ format })}>{format === "legs" ? <Swords size={16}/> : <Layers3 size={16}/>} {format === "legs" ? dpT("matchInvite.legs") : dpT("matchInvite.sets")}</button>)}</div></fieldset>
      <div className="dpi-select-row">{setup.rules.format === "sets" && <label>{dpT("matchInvite.aantal_sets")}<span><select value={setup.rules.bestOfSets} onChange={event => updateRules({ bestOfSets: Number(event.target.value) })}>{[1, 3, 5, 7].map(value => <option key={value} value={value}>{dpT("matchInvite.best_of")} {value} {value === 1 ? dpT("matchInvite.set") : dpT("matchInvite.sets_2")}</option>)}</select><ChevronDown size={14}/></span></label>}<label>{setup.rules.format === "sets" ? dpT("matchInvite.legs_per_set") : dpT("matchInvite.aantal_legs")}<span><select value={setup.rules.bestOf} onChange={event => updateRules({ bestOf: Number(event.target.value) })}>{[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map(value => <option key={value} value={value}>{dpT("matchInvite.best_of")} {value} {value === 1 ? dpT("matchInvite.leg") : dpT("matchInvite.legs_2")}</option>)}</select><ChevronDown size={14}/></span></label></div>
      <div className="dpi-ranked"><div><Trophy size={17}/><span><strong>{dpT("matchInvite.spelen_voor_ranking")}</strong><small>{setup.ranked ? dpT("matchInvite.officiele_dp_partij") : dpT("matchInvite.vrij_spelen_zonder_ratingwijziging")}</small></span></div><button type="button" role="switch" aria-label={dpT("matchInvite.spelen_voor_ranking")} aria-checked={setup.ranked} onClick={() => setSetup(value => ({ ...value, ranked: !value.ranked }))}><span/>{setup.ranked ? dpT("matchInvite.ja") : dpT("matchInvite.nee")}</button></div>
      {setup.ranked && <div className="dpi-elo-preview"><span>{dpT("matchInvite.bij_winst")} <b>+{Math.round(expected.win)}</b></span><span>{dpT("matchInvite.bij_verlies")} <b>{Math.round(expected.loss)}</b></span></div>}
      <div className="dpi-summary"><strong>{matchFormatLabel(setup.rules)}</strong><span>{setup.rules.format === "sets" ? dpT("matchInvite.eerst_winnen",{value0:(setup.rules.bestOfSets + 1) / 2,value1:setup.rules.bestOfSets === 1 ? "set" : "sets"}) : dpT("matchInvite.eerst_winnen",{value0:(setup.rules.bestOf + 1) / 2,value1:setup.rules.bestOf === 1 ? "leg" : "legs"})} {dpT("matchInvite.om_de_beurt_beginnen")}</span></div>
      <p className="dpi-demo-note">{dpT("matchInvite.je_tegenstander_krijgt_een_uitnodiging_na_accepteren_kunnen")}{setup.ranked ? dpT("matchInvite.na_de_wedstrijd_wordt_jullie_dp_bijgewerkt") : ""}</p>
      {error && <p className="dpi-error" role="alert">{error}</p>}
      {busyReason&&<p className="dpi-error" role="status">{busyReason}</p>}
      <button className="dpi-start" disabled={sending||!!busyReason} onClick={start}>{dpT("matchInvite.uitnodigen_spelen")}<ArrowUpRight size={19}/></button>
    </DialogContent>
  </Dialog>;
}
