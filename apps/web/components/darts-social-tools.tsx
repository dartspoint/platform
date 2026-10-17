"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';

import {selfName,usePlatform,mutate} from "@/lib/platform-client";
import {publicGameLabel} from '@/lib/public-game-label';

import { useEffect, useState } from "react";
import { Ban, Check, ChevronDown, Flag, ListOrdered, MessageCircle, ShieldCheck, UserMinus, UserPlus, UserRoundCheck, Volume2, VolumeX, X } from "lucide-react";
import { players } from "@/lib/darts-data";
import { canManageRoom,canModeratePlayer,acceptFriendRequest, advanceQueue, cancelFriendRequest, moderationAction, rejectFriendRequest, removeFriend, reportPlayer, revokeModeration, sendFriendRequest, toggleBlocked, togglePersonalMute, toggleQueue, useDartsSocial, type ModerationKind, type SocialResult } from "@/lib/darts-social";
import { PlayerName } from "@/components/player-identity";
import "./darts-social-tools.css";

export function PlayerSocialActions({ userId, name, room = "", gameId = "", context = "", messageId, compact = false }: { userId?:string; name: string; room?: string; gameId?: string; context?: string; messageId?: string; compact?: boolean }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("socialTools").t;

  const platform=usePlatform();
  const target=userId??name;
  const social = useDartsSocial();
  const { isBlocked } = social;
  const friendStatus = social.friendStatus(name);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("Onvriendelijk gedrag");
  const [detail, setDetail] = useState("");
  const [saved, setSaved] = useState("");
  const [feedback, setFeedback] = useState("");
  const friendship = (result: SocialResult, message: string) => setFeedback(result.ok ? message : result.error);
  if (name === selfName()) return null;
  return <div className={`dp-social-actions ${compact ? "is-compact" : ""}`}>
    <div className="dp-social-action-buttons">
      {friendStatus === "friends" ? <button type="button" onClick={async () => friendship(await removeFriend(target), dpFeedback("feedback.value1_staat_niet_meer_in_je_vriendenlijst",{value1:name}))}><UserMinus size={15}/>{dpT("socialTools.vriendschap_verwijderen")}</button> : friendStatus === "incoming" ? <><button type="button" disabled={isBlocked(name)} onClick={async () => friendship(await acceptFriendRequest(target), dpFeedback("feedback.jij_en_value1_zijn_nu_vrienden",{value1:name}))}><Check size={15}/>{dpT("socialTools.vriendschap_accepteren")}</button><button type="button" onClick={async () => friendship(await rejectFriendRequest(target), "Vriendschapsverzoek afgewezen.")}><X size={15}/>{dpT("socialTools.afwijzen")}</button></> : friendStatus === "outgoing" ? <button type="button" onClick={async () => friendship(await cancelFriendRequest(target), "Vriendschapsverzoek ingetrokken.")}><X size={15}/>{dpT("socialTools.verzoek_intrekken")}</button> : <button type="button" disabled={isBlocked(name)} onClick={async () => friendship(await sendFriendRequest(target), "Vriendschapsverzoek verstuurd.")}><UserPlus size={15}/>{dpT("socialTools.vriend_toevoegen")}</button>}
      <button type="button" aria-pressed={social.isMuted(name)} onClick={async () => await togglePersonalMute(target)}>{social.isMuted(name) ? <Volume2 size={15}/> : <VolumeX size={15}/>} {social.isMuted(name) ? dpT("socialTools.mute_opheffen") : dpT("socialTools.mute_voor_mij")}</button>
      <button type="button" onClick={async () => await toggleBlocked(target)} aria-pressed={isBlocked(name)}>{isBlocked(name) ? <UserRoundCheck size={15}/> : <Ban size={15}/>} {isBlocked(name) ? dpT("socialTools.deblokkeren") : dpT("socialTools.blokkeren")}</button><button type="button" onClick={() => { setReportOpen(value => !value); setSaved(""); }} aria-expanded={reportOpen}><Flag size={15}/>{dpT("socialTools.speler_melden")}</button></div>
    {feedback && <p role="status" className="dp-social-status">{feedback}</p>}
    {social.isMuted(name) && !isBlocked(name) && <p className="dp-social-status">{dpT("socialTools.berichten_van")} {name} {dpT("socialTools.zijn_alleen_voor_jou_verborgen_de_speler_kan")}</p>}
    {isBlocked(name) && <p className="dp-social-status">{dpT("socialTools.berichten_van")} {name} {dpT("socialTools.zijn_verborgen_je_kunt_elkaar_niet_uitnodigen_of")}</p>}
    {reportOpen && <form className="dp-report-form" onSubmit={async event => { event.preventDefault(); setSaved(await reportPlayer({ name, targetId:userId, room, gameId, reason, detail, context, messageId })); setReportOpen(false); setDetail(""); }}>
      <div className="dp-social-form-title"><strong>{dpT("socialTools.wat_wil_je_melden")}</strong><button type="button" aria-label={dpT("socialTools.melding_sluiten")} onClick={() => setReportOpen(false)}><X size={16}/></button></div>
      <label>{dpT("socialTools.reden")}<select value={reason} onChange={event => setReason(event.target.value)}><option value="Onvriendelijk gedrag">{dpT("socialTools.onvriendelijk_gedrag")}</option><option value="Spam of ongewenste berichten">{dpT("socialTools.spam_of_ongewenste_berichten")}</option><option value="Vermoeden van valsspelen">{dpT("socialTools.vermoeden_van_valsspelen")}</option><option value="Ongepaste gebruikersnaam">{dpT("socialTools.ongepaste_gebruikersnaam")}</option><option value="Anders">{dpT("socialTools.anders")}</option></select></label>
      <label>{dpT("socialTools.toelichting")} <small>{dpT("socialTools.optioneel")}</small><textarea value={detail} maxLength={600} onChange={event => setDetail(event.target.value)} placeholder={dpT("socialTools.wat_gebeurde_er")} rows={3}/></label>
      <span className="dp-social-context">{room}{gameId&&dpT("socialTools.game",{value0:publicGameLabel(platform,gameId)})}{context && dpT("socialTools.je_melding_gaat_naar_de_moderators")}</span>
      <button className="dp-social-primary" type="submit"><Flag size={14}/>{dpT("socialTools.melding_opslaan")}</button>
      <small>{dpT("socialTools.je_melding_wordt_door_de_moderatoren_beoordeeld")}</small>
    </form>}
    {saved && <p className="dp-social-status is-success" role="status"><Check size={15}/>{dpT("socialTools.je_melding_is_verstuurd_bedankt_voor_het_doorgeven")}</p>}
  </div>;
}

export function MatchQueue({ matchId = "", onPlayNext }: { matchId?: string; onPlayNext?: (name: string) => void }) {
 const dpT = useI18n("socialTools").t;

  const { queues } = useDartsSocial();
  const queue = queues[matchId] ?? [];
  const index = queue.indexOf(selfName());
  const platform=usePlatform();const invitation=platform.invites.find(i=>i.invitee_id===platform.actor?.id&&i.state==="pending");const ready=!!invitation;
  return <section className="dp-match-queue" aria-label={dpT("socialTools.wachtrij_voor_de_volgende_wedstrijd")}>
    <div className="dp-social-section-heading"><ListOrdered size={18}/><div><strong>{dpT("socialTools.de_volgende_is_voor_jou")}</strong><p>{ready ? dpT("socialTools.het_bord_is_vrij_klaar_voor_een_potje") : queue.length ? dpT("socialTools.op_dit_bord",{length:queue.length,value1:queue.length === 1 ? "speler wacht" : "spelers wachten"}) : dpT("socialTools.schuif_aan_zodra_deze_wedstrijd_klaar_is")}</p></div></div>
    {queue.length > 0 && <ol>{queue.map((name, number) => <li key={name}><span>{number + 1}</span><PlayerName name={name}/>{name === selfName() && <small>{dpT("socialTools.jij")}</small>}</li>)}</ol>}
    {ready ? <button className="dp-social-primary" onClick={async()=>{const result=await mutate("invite/respond",{inviteId:invitation!.id,action:"accept"});window.location.assign("/spelen?match="+result.matchId);}}><UserRoundCheck size={16}/>{dpT("socialTools.speel_de_volgende_wedstrijd")}</button> : <button className={index >= 0 ? "dp-social-secondary" : "dp-social-primary"} onClick={() => toggleQueue(matchId)}>{index >= 0 ? <><Check size={16}/>{dpT("socialTools.plek")} {index + 1} {dpT("socialTools.wachtrij_verlaten")}</> : <><ListOrdered size={16}/>{dpT("socialTools.ik_speel_hierna")}</>}</button>}
    {index >= 0 && <button className="dp-social-demo" onClick={()=>window.location.assign("/spelen?match="+matchId)}>{dpT("socialTools.bekijk_de_wedstrijd")}</button>}
    <small>{dpT("socialTools.na_afloop_ontvangt_de_eerstvolgende_beschikbare_speler_een")}</small>
  </section>;
}

export function ModeratorPanel({ room = "" }: { room?: string }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("socialTools").t;

  const social = useDartsSocial();
  const platform=usePlatform();
  const role=platform.actor?.role;
  const canModerate=canManageRoom(room);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ModerationKind>("warn");
  const [minutes, setMinutes] = useState(10);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const entries = social.moderation.filter(entry => entry.room === room).slice(-8).reverse();
  if(!canModerate)return <p className="dp-social-status">{dpT("socialTools.kamerbeheer_is_beschikbaar_voor_de_beheerders_van_deze")}</p>;
  return <section className="dp-moderation">
    <button className="dp-moderation-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}><ShieldCheck size={18}/><span>{dpT("socialTools.kamerbeheer")}<small>{room} · {selfName()}, {role==="owner"?dpT("socialTools.eigenaar"):role==="admin"?dpT("socialTools.admin"):dpT("socialTools.kamermoderator")}</small></span><ChevronDown size={16} className={open ? "is-open" : ""}/></button>
    {open && <div className="dp-moderation-body"><p>{dpT("socialTools.houd_de_kamer_gezellig_acties_gelden_in_deze")}</p>
      <form onSubmit={async event => { event.preventDefault(); if (await moderationAction({ name, room, kind, reason, minutes })) { setFeedback(kind === "warn" ? dpFeedback("feedback.value0_heeft_een_waarschuwing_gekregen",{value0:name}) : kind === "mute" ? dpFeedback("feedback.value0_is_value1_minuten_gemute_in_value2",{value0:name,value1:minutes,value2:room}) : dpFeedback("feedback.value0_is_value1_minuten_verwijderd_uit_value2",{value0:name,value1:minutes,value2:room})); setReason(""); setNow(Date.now()); } }}>
        <label>{dpT("socialTools.speler")}<select value={name} onChange={event => setName(event.target.value)}>{<option value="">{dpT("socialTools.kies_een_speler")}</option>}{players.filter(player => platform.players.find(p=>p.id===player.id)?.presence.room===room&&canModeratePlayer(player.name,room)).map(player => <option key={player.id}>{player.name}</option>)}</select></label>
        <div className="dp-social-form-grid"><label>{dpT("socialTools.actie")}<select value={kind} onChange={event => setKind(event.target.value as ModerationKind)}><option value="warn">{dpT("socialTools.waarschuwen")}</option><option value="mute">{dpT("socialTools.tijdelijk_muten")}</option><option value="remove">{dpT("socialTools.uit_kamer_verwijderen")}</option></select></label>{kind !== "warn" && <label>{dpT("socialTools.duur")}<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 30, 60].map(value => <option value={value} key={value}>{value} {dpT("socialTools.minuten")}</option>)}</select></label>}</div>
        <label>{dpT("socialTools.reden")}<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={300} minLength={5} rows={2} required placeholder={dpT("socialTools.leg_kort_uit_waarom_je_ingrijpt")}/></label>
        <button className="dp-social-primary" disabled={!name||reason.trim().length < 5} type="submit"><ShieldCheck size={15}/>{dpT("socialTools.actie_toepassen")}</button>
      </form>
      {feedback && <p role="status" className="dp-social-status is-success"><Check size={14}/>{feedback}</p>}
      {entries.length > 0 && <div className="dp-moderation-log"><h4>{dpT("socialTools.acties_in_deze_kamer")}</h4>{entries.map(entry => <article key={entry.id}><div><strong>{entry.name}</strong><span>{entry.kind === "warn" ? dpT("socialTools.waarschuwing") : entry.kind === "mute" ? dpT("socialTools.mute") : dpT("socialTools.verwijderd")}{entry.kind !== "warn" ? entry.until > now ? dpT("socialTools.min",{value0:Math.max(1, Math.ceil((entry.until - now) / 60_000))}) : dpT("socialTools.beeindigd") : ""}</span></div><p>{entry.reason}</p><small>{dpT("socialTools.door")} {entry.moderator} · {new Date(entry.createdAt).toLocaleTimeString(dpFormatLocale, { hour: "2-digit", minute: "2-digit" })}</small>{entry.kind !== "warn" && entry.until > now && <button onClick={async () => await revokeModeration(entry.id)}>{dpT("socialTools.opheffen")}</button>}</article>)}</div>}
      {social.reports.length > 0 && <div className="dp-moderation-log"><h4>{dpT("socialTools.opgeslagen_meldingen")} <span>{social.reports.length}</span></h4>{social.reports.slice(-5).reverse().map(report => <article key={report.id}><div><strong>{report.name}</strong><span>{report.status}</span></div><p>{report.reason}{report.detail ? dpT("socialTools.label",{detail:report.detail}) : ""}</p><small>{report.room} {dpT("socialTools.game_2")} {publicGameLabel(platform,report.gameId)}</small>{report.context && <details><summary>{dpT("socialTools.bijbehorend_bericht")}</summary><p>{report.context}</p></details>}</article>)}</div>}
      {social.blocked.length > 0 && <div className="dp-moderation-log"><h4>{dpT("socialTools.door_jou_geblokkeerd")}</h4>{social.blocked.map(blocked => <article key={blocked}><div><strong>{blocked}</strong><button onClick={async () => await toggleBlocked(blocked)}>{dpT("socialTools.deblokkeren")}</button></div></article>)}</div>}
    </div>}
  </section>;
}
