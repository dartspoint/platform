"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Check, Eye, Flag, MessageCircle, ShieldCheck, Target, UserMinus, UserPlus, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName } from "@/components/player-identity";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import { acceptFriendRequest, cancelFriendRequest, canModeratePlayer, moderationAction, rejectFriendRequest, removeFriend, reportPlayer, revokeModeration, sendFriendRequest, toggleBlocked, togglePersonalMute, useDartsSocial, type ModerationKind, type SocialResult } from "@/lib/darts-social";
import "./darts-player-menu.css";

type PlayerActionMenuProps = {
  name: string;
  roomName?: string;
  gameId?: string;
  viewerName?: string;
  className?: string;
  children?: ReactNode;
  onInvite?: (name: string) => void;
  onProfile?: (name: string) => void;
  onMessage?: (name: string) => void;
  onSpectate?: (name: string) => void;
  onToast?: (text: string) => void;
};

/** One consistent name menu across the room, friends and lobby lists. */
export function PlayerActionMenu({ name, roomName = "Nederland 1", gameId = "83626", viewerName = "Nick", className = "", children, onInvite, onProfile, onMessage, onSpectate, onToast }: PlayerActionMenuProps) {
  const social = useDartsSocial();
  const operations = useAdminOperations();
  const status = social.friendStatus(name);
  const self = name === viewerName;
  const blocked = social.isBlocked(name);
  const muted = social.isMuted(name);
  const viewer = operations.members.find(member => member.name === viewerName);
  const target = operations.members.find(member => member.name === name);
  const canModerate = !self && target?.role !== "owner" && !!viewer && (viewer.role === "owner" || viewer.role === "admin" || operations.rooms.some(room => room.name === roomName && room.moderator === viewerName));
  const trigger = useRef<HTMLButtonElement>(null);
  const externalAction = useRef(false);
  const [dialog, setDialog] = useState<"report" | "moderation" | null>(null);
  const [reason, setReason] = useState("");
  const [reportReason, setReportReason] = useState("Onvriendelijk gedrag");
  const [kind, setKind] = useState<ModerationKind>("warn");
  const [minutes, setMinutes] = useState(10);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!feedback) return; const timer = window.setTimeout(() => setFeedback(""), 4200); return () => window.clearTimeout(timer); }, [feedback]);
  function notify(message: string) { if (onToast) onToast(message); else setFeedback(message); }
  function apply(result: SocialResult, message: string) { notify(result.ok ? message : result.error); }
  function openDialog(next: "report" | "moderation") { setReason(""); setError(""); setDialog(next); }
  function runExternal(action: (name: string) => void) { externalAction.current = true; action(name); }
  const activeModeration = social.moderation.filter(entry => entry.name === name && entry.room === roomName && entry.kind !== "warn" && entry.until > Date.now());

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button ref={trigger} type="button" className={`dp-player-menu-trigger ${className}`} aria-label={`Acties voor ${name}`}>{children ?? <PlayerName name={name}/>}</button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="dp-player-menu" onCloseAutoFocus={event => { if (dialog || externalAction.current) event.preventDefault(); externalAction.current = false; }}>
        <DropdownMenuLabel className="dp-player-menu-title"><PlayerName name={name}/><small>{self ? "Dit ben jij" : status === "friends" ? "In je vriendenlijst" : status === "incoming" ? "Heeft je een vriendschapsverzoek gestuurd" : status === "outgoing" ? "Vriendschapsverzoek verstuurd" : "Speler in DartsPoint"}</small></DropdownMenuLabel>
        {onProfile && <DropdownMenuItem onSelect={() => runExternal(onProfile)}><UserRound/>Profiel bekijken</DropdownMenuItem>}
        {!self && <>
          {onInvite && <DropdownMenuItem disabled={blocked} onSelect={() => runExternal(onInvite)}><Target/>Uitnodigen voor een wedstrijd</DropdownMenuItem>}
          {onMessage && <DropdownMenuItem disabled={blocked} onSelect={() => runExternal(onMessage)}><MessageCircle/>Privébericht</DropdownMenuItem>}
          {onSpectate && <DropdownMenuItem onSelect={() => runExternal(onSpectate)}><Eye/>Toeschouwen</DropdownMenuItem>}
          <DropdownMenuSeparator/>
          {status === "friends" ? <DropdownMenuItem onSelect={() => apply(removeFriend(name), `${name} is uit je vriendenlijst verwijderd.`)}><UserMinus/>Vriendschap verwijderen</DropdownMenuItem> : status === "incoming" ? <>
            <DropdownMenuItem disabled={blocked} onSelect={() => apply(acceptFriendRequest(name), `Jij en ${name} zijn nu vrienden in deze demo.`)}><Check/>Vriendschap accepteren</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => apply(rejectFriendRequest(name), "Vriendschapsverzoek afgewezen.")}><X/>Verzoek afwijzen</DropdownMenuItem>
          </> : status === "outgoing" ? <DropdownMenuItem onSelect={() => apply(cancelFriendRequest(name), "Vriendschapsverzoek ingetrokken.")}><X/>Verzoek intrekken</DropdownMenuItem> : <DropdownMenuItem disabled={blocked} onSelect={() => apply(sendFriendRequest(name), `Vriendschapsverzoek aan ${name} opgeslagen. Lokale demo.`)}><UserPlus/>Vriend toevoegen</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => apply(togglePersonalMute(name), muted ? `Berichten van ${name} zijn weer zichtbaar.` : `Berichten van ${name} zijn voor jou verborgen.`)}>{muted ? <Volume2/> : <VolumeX/>}{muted ? "Mute opheffen" : "Mute voor mij"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { toggleBlocked(name); notify(blocked ? `${name} is gedeblokkeerd.` : `${name} is geblokkeerd.`); }}><Ban/>{blocked ? "Deblokkeren" : "Blokkeren"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog("report")}><Flag/>Speler melden</DropdownMenuItem>
          {canModerate && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => openDialog("moderation")}><ShieldCheck/>Modereren in deze kamer</DropdownMenuItem></>}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    {feedback && <div className="dp-player-menu-feedback" role="status"><Check size={15}/>{feedback}</div>}
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent className="dp-player-action-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
        <DialogHeader><span className="dp-player-action-emblem">{dialog === "report" ? <Flag size={24}/> : <ShieldCheck size={24}/>}</span><DialogTitle>{dialog === "report" ? `${name} melden` : `${name} modereren`}</DialogTitle><DialogDescription>{dialog === "report" ? "Je melding krijgt de kamer en wedstrijd mee als context." : `Kamermaatregel in ${roomName}. Persoonlijke mute staat hier los van.`}</DialogDescription></DialogHeader>
        <form onSubmit={event => {
          event.preventDefault();
          if (dialog === "report") {
            const id = reportPlayer({ name, room: roomName, gameId, reason: reportReason, detail: reason, context: "Melding via het spelersmenu." });
            setDialog(null); notify(`Melding ${id} lokaal opgeslagen.`);
          } else if (canModeratePlayer(name, roomName, viewerName) && moderationAction({ name, room: roomName, kind, minutes, reason, actor: viewerName })) {
            setDialog(null); notify(`${name}: ${kind === "warn" ? "waarschuwing opgeslagen" : kind === "mute" ? `${minutes} minuten kamermute` : `${minutes} minuten uit de kamer verwijderd`}.`);
          } else setError("Controleer je rechten en geef een reden van minimaal 5 tekens.");
        }}>
          {dialog === "report" ? <label>Reden<select value={reportReason} onChange={event => setReportReason(event.target.value)}>{["Onvriendelijk gedrag", "Spam of ongewenste berichten", "Vermoeden van valsspelen", "Ongepaste gebruikersnaam", "Anders"].map(value => <option key={value}>{value}</option>)}</select></label> : <div className="dp-player-action-fields"><label>Actie<select value={kind} onChange={event => setKind(event.target.value as ModerationKind)}><option value="warn">Waarschuwen</option><option value="mute">Tijdelijk muten in kamer</option><option value="remove">Uit kamer verwijderen</option></select></label>{kind !== "warn" && <label>Duur<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 30, 60].map(value => <option key={value} value={value}>{value} minuten</option>)}</select></label>}</div>}
          <label>{dialog === "report" ? "Toelichting · optioneel" : "Reden"}<textarea rows={3} maxLength={dialog === "report" ? 600 : 300} required={dialog === "moderation"} minLength={dialog === "moderation" ? 5 : undefined} placeholder={dialog === "report" ? "Wat gebeurde er?" : "Leg kort uit waarom je ingrijpt…"} value={reason} onChange={event => setReason(event.target.value)}/></label>
          {error && <p className="dp-player-action-error" role="alert">{error}</p>}
          <span className="dp-player-action-context">{roomName} · Game ID: #{gameId.replace(/^#/, "")}</span>
          <button type="submit" className="dp-social-primary" disabled={dialog === "moderation" && reason.trim().length < 5}>{dialog === "report" ? "Melding opslaan" : "Maatregel toepassen"}</button>
          <small>Prototype: wijzigingen blijven op dit apparaat.</small>
        </form>
        {dialog === "moderation" && canModerate && activeModeration.length > 0 && <div className="dp-player-active-actions"><strong>Actieve kamermaatregelen</strong>{activeModeration.map(entry => <div key={entry.id}><span>{entry.kind === "mute" ? "Kamermute" : "Verwijderd"}<small>{entry.reason}</small></span><button type="button" onClick={() => { if (canModeratePlayer(name, roomName, viewerName)) { revokeModeration(entry.id, viewerName); notify("Kamermaatregel opgeheven."); } }}>Opheffen</button></div>)}</div>}
      </DialogContent>
    </Dialog>
  </>;
}
