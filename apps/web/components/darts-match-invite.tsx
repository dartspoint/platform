"use client";
import {selfName} from "@/lib/platform-client";

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
  const [setup, setSetup] = useState<MatchSetup>(DEFAULT_MATCH_SETUP);
  const [error, setError] = useState("");
  const [sending,setSending]=useState(false);
  const nick = useRatingProfile(selfName()), rival = useRatingProfile(opponent || "");
  const expected = expectedRatingChange(nick.rating, rival.rating);
  useEffect(() => {
    if (!opponent) return;
    const previous = readMatchSetup();
    setSetup({ ...previous, ranked: initialRanked ?? previous.ranked }); setError("");
  }, [opponent, initialRanked]);
  function updateRules(patch: Partial<MatchSetup["rules"]>) { setSetup(value => ({ ...value, rules: { ...value.rules, ...patch } })); }
  async function start() {
    if(sending)return;setSending(true);setError("");
    try { await onStart(normalizeMatchSetup(setup)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "De partij kon niet worden gestart."); }
    finally{setSending(false); }
  }
  return <Dialog open={!!opponent} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="dp-dialog dpi-dialog">
      <DialogHeader><span className="dpi-eyebrow"><Swords size={14}/>NIEUWE UITDAGING</span><DialogTitle>Klaar voor een partij?</DialogTitle><DialogDescription>Kies jullie spel en de lengte van de wedstrijd.</DialogDescription></DialogHeader>
      <div className="dpi-opponent"><span className="dpi-avatar">{opponent?.slice(0, 2).toUpperCase()}</span><div><PlayerName name={opponent || ""}/><span>Je tegenstander</span></div><RatingValue player={playerByName(opponent || "")} brackets/></div>
      <fieldset className="dpi-fieldset"><legend>Speltype</legend><div className="dpi-game-types">{([301, 501, 701] as const).map(startScore => <button type="button" key={startScore} aria-pressed={setup.rules.startScore === startScore} onClick={() => updateRules({ startScore, doubleIn: startScore === 301, doubleOut: true })}><strong>{startScore}</strong><span>{startScore === 301 ? "Dubbel in + uit" : "Dubbel uit"}</span>{setup.rules.startScore === startScore && <Check size={13}/>}</button>)}</div></fieldset>
      <fieldset className="dpi-fieldset"><legend>Wedstrijdvorm</legend><div className="dpi-format">{(["legs", "sets"] as const).map(format => <button type="button" key={format} aria-pressed={setup.rules.format === format} onClick={() => updateRules({ format })}>{format === "legs" ? <Swords size={16}/> : <Layers3 size={16}/>} {format === "legs" ? "Legs" : "Sets"}</button>)}</div></fieldset>
      <div className="dpi-select-row">{setup.rules.format === "sets" && <label>Aantal sets<span><select value={setup.rules.bestOfSets} onChange={event => updateRules({ bestOfSets: Number(event.target.value) })}>{[1, 3, 5, 7].map(value => <option key={value} value={value}>Best of {value} {value === 1 ? "set" : "sets"}</option>)}</select><ChevronDown size={14}/></span></label>}<label>{setup.rules.format === "sets" ? "Legs per set" : "Aantal legs"}<span><select value={setup.rules.bestOf} onChange={event => updateRules({ bestOf: Number(event.target.value) })}>{[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map(value => <option key={value} value={value}>Best of {value} {value === 1 ? "leg" : "legs"}</option>)}</select><ChevronDown size={14}/></span></label></div>
      <div className="dpi-ranked"><div><Trophy size={17}/><span><strong>Spelen voor ranking</strong><small>{setup.ranked ? "Officiële Elo-partij" : "Vrij spelen zonder ratingwijziging"}</small></span></div><button type="button" role="switch" aria-label="Spelen voor ranking" aria-checked={setup.ranked} onClick={() => setSetup(value => ({ ...value, ranked: !value.ranked }))}><span/>{setup.ranked ? "Ja" : "Nee"}</button></div>
      {setup.ranked && <div className="dpi-elo-preview"><span>Bij winst <b>+{Math.round(expected.win)}</b></span><span>Bij verlies <b>{Math.round(expected.loss)}</b></span></div>}
      <div className="dpi-summary"><strong>{matchFormatLabel(setup.rules)}</strong><span>{setup.rules.format === "sets" ? `Eerst ${(setup.rules.bestOfSets + 1) / 2} ${setup.rules.bestOfSets === 1 ? "set" : "sets"} winnen` : `Eerst ${(setup.rules.bestOf + 1) / 2} ${setup.rules.bestOf === 1 ? "leg" : "legs"} winnen`} · om de beurt beginnen</span></div>
      <p className="dpi-demo-note">Je tegenstander ontvangt een uitnodiging en kiest zelf of die meedoet.{setup.ranked ? " Elo verandert na de definitieve uitslag." : ""}</p>
      {error && <p className="dpi-error" role="alert">{error}</p>}
      <button className="dpi-start" disabled={sending} onClick={start}>Uitnodigen & spelen<ArrowUpRight size={19}/></button>
    </DialogContent>
  </Dialog>;
}
