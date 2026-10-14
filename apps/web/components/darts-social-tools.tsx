"use client";
import {selfName,usePlatform,mutate} from "@/lib/platform-client";
import {publicGameLabel} from '@/lib/public-game-label';

import { useEffect, useState } from "react";
import { Ban, Check, ChevronDown, Flag, ListOrdered, MessageCircle, ShieldCheck, UserMinus, UserPlus, UserRoundCheck, Volume2, VolumeX, X } from "lucide-react";
import { players } from "@/lib/darts-data";
import { canManageRoom,canModeratePlayer,acceptFriendRequest, advanceQueue, cancelFriendRequest, moderationAction, rejectFriendRequest, removeFriend, reportPlayer, revokeModeration, sendFriendRequest, toggleBlocked, togglePersonalMute, toggleQueue, useDartsSocial, type ModerationKind, type SocialResult } from "@/lib/darts-social";
import { PlayerName } from "@/components/player-identity";
import "./darts-social-tools.css";

export function PlayerSocialActions({ userId, name, room = "", gameId = "", context = "", messageId, compact = false }: { userId?:string; name: string; room?: string; gameId?: string; context?: string; messageId?: string; compact?: boolean }) {
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
      {friendStatus === "friends" ? <button type="button" onClick={async () => friendship(await removeFriend(target), `${name} staat niet meer in je vriendenlijst.`)}><UserMinus size={15}/>Vriendschap verwijderen</button> : friendStatus === "incoming" ? <><button type="button" disabled={isBlocked(name)} onClick={async () => friendship(await acceptFriendRequest(target), `Jij en ${name} zijn nu vrienden.`)}><Check size={15}/>Vriendschap accepteren</button><button type="button" onClick={async () => friendship(await rejectFriendRequest(target), "Vriendschapsverzoek afgewezen.")}><X size={15}/>Afwijzen</button></> : friendStatus === "outgoing" ? <button type="button" onClick={async () => friendship(await cancelFriendRequest(target), "Vriendschapsverzoek ingetrokken.")}><X size={15}/>Verzoek intrekken</button> : <button type="button" disabled={isBlocked(name)} onClick={async () => friendship(await sendFriendRequest(target), "Vriendschapsverzoek verstuurd.")}><UserPlus size={15}/>Vriend toevoegen</button>}
      <button type="button" aria-pressed={social.isMuted(name)} onClick={async () => await togglePersonalMute(target)}>{social.isMuted(name) ? <Volume2 size={15}/> : <VolumeX size={15}/>} {social.isMuted(name) ? "Mute opheffen" : "Mute voor mij"}</button>
      <button type="button" onClick={async () => await toggleBlocked(target)} aria-pressed={isBlocked(name)}>{isBlocked(name) ? <UserRoundCheck size={15}/> : <Ban size={15}/>} {isBlocked(name) ? "Deblokkeren" : "Blokkeren"}</button><button type="button" onClick={() => { setReportOpen(value => !value); setSaved(""); }} aria-expanded={reportOpen}><Flag size={15}/>Speler melden</button></div>
    {feedback && <p role="status" className="dp-social-status">{feedback}</p>}
    {social.isMuted(name) && !isBlocked(name) && <p className="dp-social-status">Berichten van {name} zijn alleen voor jou verborgen. De speler kan blijven spelen.</p>}
    {isBlocked(name) && <p className="dp-social-status">Berichten van {name} zijn verborgen. Je kunt elkaar  niet uitnodigen of een privégesprek beginnen.</p>}
    {reportOpen && <form className="dp-report-form" onSubmit={async event => { event.preventDefault(); setSaved(await reportPlayer({ name, targetId:userId, room, gameId, reason, detail, context, messageId })); setReportOpen(false); setDetail(""); }}>
      <div className="dp-social-form-title"><strong>Wat wil je melden?</strong><button type="button" aria-label="Melding sluiten" onClick={() => setReportOpen(false)}><X size={16}/></button></div>
      <label>Reden<select value={reason} onChange={event => setReason(event.target.value)}><option>Onvriendelijk gedrag</option><option>Spam of ongewenste berichten</option><option>Vermoeden van valsspelen</option><option>Ongepaste gebruikersnaam</option><option>Anders</option></select></label>
      <label>Toelichting <small>optioneel</small><textarea value={detail} maxLength={600} onChange={event => setDetail(event.target.value)} placeholder="Wat gebeurde er?" rows={3}/></label>
      <span className="dp-social-context">{room}{gameId&&` · Game ${publicGameLabel(platform,gameId)}`}{context && " · Gesprekscontext toegevoegd"}</span>
      <button className="dp-social-primary" type="submit"><Flag size={14}/>Melding opslaan</button>
      <small>Je melding wordt door de moderatoren beoordeeld.</small>
    </form>}
    {saved && <p className="dp-social-status is-success" role="status"><Check size={15}/>Melding {saved} opgeslagen met de wedstrijdgegevens.</p>}
  </div>;
}

export function MatchQueue({ matchId = "", onPlayNext }: { matchId?: string; onPlayNext?: (name: string) => void }) {
  const { queues } = useDartsSocial();
  const queue = queues[matchId] ?? [];
  const index = queue.indexOf(selfName());
  const platform=usePlatform();const invitation=platform.invites.find(i=>i.invitee_id===platform.actor?.id&&i.state==="pending");const ready=!!invitation;
  return <section className="dp-match-queue" aria-label="Wachtrij voor de volgende wedstrijd">
    <div className="dp-social-section-heading"><ListOrdered size={18}/><div><strong>De volgende is voor jou.</strong><p>{ready ? "Het bord is vrij. Klaar voor een potje?" : queue.length ? `${queue.length} ${queue.length === 1 ? "speler wacht" : "spelers wachten"} op dit bord` : "Schuif aan zodra deze wedstrijd klaar is."}</p></div></div>
    {queue.length > 0 && <ol>{queue.map((name, number) => <li key={name}><span>{number + 1}</span><PlayerName name={name}/>{name === selfName() && <small>JIJ</small>}</li>)}</ol>}
    {ready ? <button className="dp-social-primary" onClick={async()=>{const result=await mutate("invite/respond",{inviteId:invitation!.id,action:"accept"});window.location.assign("/spelen?match="+result.matchId);}}><UserRoundCheck size={16}/>Speel de volgende wedstrijd</button> : <button className={index >= 0 ? "dp-social-secondary" : "dp-social-primary"} onClick={() => toggleQueue(matchId)}>{index >= 0 ? <><Check size={16}/>Plek {index + 1} · Wachtrij verlaten</> : <><ListOrdered size={16}/>Ik speel hierna</>}</button>}
    {index >= 0 && <button className="dp-social-demo" onClick={()=>window.location.assign("/spelen?match="+matchId)}>Bekijk de wedstrijd</button>}
    <small>Na afloop ontvangt de eerstvolgende beschikbare speler een uitnodiging.</small>
  </section>;
}

export function ModeratorPanel({ room = "" }: { room?: string }) {
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
  if(!canModerate)return <p className="dp-social-status">Kamerbeheer is beschikbaar voor de beheerders van deze kamer.</p>;
  return <section className="dp-moderation">
    <button className="dp-moderation-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}><ShieldCheck size={18}/><span>Kamerbeheer<small>{room} · {selfName()}, {role==="owner"?"eigenaar":role==="admin"?"admin":"kamermoderator"}</small></span><ChevronDown size={16} className={open ? "is-open" : ""}/></button>
    {open && <div className="dp-moderation-body"><p>Houd de kamer gezellig. Acties gelden in deze kamer. Tijdelijke maatregelen kun je opheffen.</p>
      <form onSubmit={async event => { event.preventDefault(); if (await moderationAction({ name, room, kind, reason, minutes })) { setFeedback(kind === "warn" ? `${name} heeft een waarschuwing gekregen.` : kind === "mute" ? `${name} is ${minutes} minuten gemute in ${room}.` : `${name} is ${minutes} minuten verwijderd uit ${room}.`); setReason(""); setNow(Date.now()); } }}>
        <label>Speler<select value={name} onChange={event => setName(event.target.value)}>{<option value="">Kies een speler</option>}{players.filter(player => platform.players.find(p=>p.id===player.id)?.presence.room===room&&canModeratePlayer(player.name,room)).map(player => <option key={player.id}>{player.name}</option>)}</select></label>
        <div className="dp-social-form-grid"><label>Actie<select value={kind} onChange={event => setKind(event.target.value as ModerationKind)}><option value="warn">Waarschuwen</option><option value="mute">Tijdelijk muten</option><option value="remove">Uit kamer verwijderen</option></select></label>{kind !== "warn" && <label>Duur<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 30, 60].map(value => <option value={value} key={value}>{value} minuten</option>)}</select></label>}</div>
        <label>Reden<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={300} minLength={5} rows={2} required placeholder="Leg kort uit waarom je ingrijpt…"/></label>
        <button className="dp-social-primary" disabled={!name||reason.trim().length < 5} type="submit"><ShieldCheck size={15}/>Actie toepassen</button>
      </form>
      {feedback && <p role="status" className="dp-social-status is-success"><Check size={14}/>{feedback}</p>}
      {entries.length > 0 && <div className="dp-moderation-log"><h4>Acties in deze kamer</h4>{entries.map(entry => <article key={entry.id}><div><strong>{entry.name}</strong><span>{entry.kind === "warn" ? "Waarschuwing" : entry.kind === "mute" ? "Mute" : "Verwijderd"}{entry.kind !== "warn" ? entry.until > now ? ` · ${Math.max(1, Math.ceil((entry.until - now) / 60_000))} min` : " · Beëindigd" : ""}</span></div><p>{entry.reason}</p><small>Door {entry.moderator} · {new Date(entry.createdAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</small>{entry.kind !== "warn" && entry.until > now && <button onClick={async () => await revokeModeration(entry.id)}>Opheffen</button>}</article>)}</div>}
      {social.reports.length > 0 && <div className="dp-moderation-log"><h4>Opgeslagen meldingen <span>{social.reports.length}</span></h4>{social.reports.slice(-5).reverse().map(report => <article key={report.id}><div><strong>{report.name}</strong><span>{report.status}</span></div><p>{report.reason}{report.detail ? ` — ${report.detail}` : ""}</p><small>{report.room} · Game {publicGameLabel(platform,report.gameId)} · {report.id}</small>{report.context && <details><summary>Gesprekscontext</summary><p>{report.context}</p></details>}</article>)}</div>}
      {social.blocked.length > 0 && <div className="dp-moderation-log"><h4>Door jou geblokkeerd</h4>{social.blocked.map(blocked => <article key={blocked}><div><strong>{blocked}</strong><button onClick={async () => await toggleBlocked(blocked)}>Deblokkeren</button></div></article>)}</div>}
    </div>}
  </section>;
}
