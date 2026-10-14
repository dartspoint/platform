"use client";
import {api,mutate,getPlatform,playerId,selfName,usePlatform} from "@/lib/platform-client";
import {publicGameLabel} from '@/lib/public-game-label';

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Check, Eye, Flag, MessageCircle, ShieldCheck, Target, UserMinus, UserPlus, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerName } from "@/components/player-identity";
import { acceptFriendRequest, cancelFriendRequest, invitationReason, moderationAction, rejectFriendRequest, removeFriend, reportPlayer, revokeModeration, sendFriendRequest, toggleBlocked, togglePersonalMute, useDartsSocial, type ModerationKind, type SocialResult } from "@/lib/darts-social";
import "./darts-player-menu.css";

type PlayerActionMenuProps = {
  name: string;
  userId?:string;
  roomId?:string;
  channelId?:string;
  messageId?:string;
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
export function PlayerActionMenu({ name:providedName, userId, roomId, channelId, messageId, roomName = "", gameId = "", viewerName = selfName(), className = "", children, onInvite, onProfile, onMessage, onSpectate, onToast }: PlayerActionMenuProps) {
  const platform=usePlatform(),targetId=userId??playerId(providedName),name=platform.players.find(p=>p.id===targetId)?.name??providedName;
  const social = useDartsSocial();
  const status = social.friendStatus(targetId??name);
  const self = userId?userId===getPlatform().actor?.id:name === viewerName;
  const blocked = social.isBlocked(targetId??name);
  const muted = social.isMuted(targetId??name);
  const reportMatchId=gameId&&platform.matches.some(m=>m.id===gameId&&m.players?.some((p:any)=>p.id===targetId))?gameId:'';
  const contextId=roomId??platform.rooms.find(room=>room.name===roomName)?.id;
  const [capabilities,setCapabilities]=useState({canWarn:false,canMute:false,canRemove:false,canModerateMessage:false});
  const canModerate=!self&&!!contextId&&(capabilities.canWarn||capabilities.canMute||capabilities.canRemove);
  const inviteReason=invitationReason(targetId??name);
  const trigger = useRef<HTMLButtonElement>(null);
  const externalAction = useRef(false);
  const [menuOpen,setMenuOpen]=useState(false);
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
  function runExternal(action: (name: string) => void) { externalAction.current = true; if(targetId)action(targetId); }
  const activeModeration = social.moderation.filter(entry => entry.name === name && entry.room === roomName && entry.kind !== "warn" && entry.until > Date.now());

  return <>
    <DropdownMenu open={menuOpen} modal={false} onOpenChange={open=>{setMenuOpen(open);if(!open)return;setCapabilities({canWarn:false,canMute:false,canRemove:false,canModerateMessage:false});if(targetId&&(channelId||contextId))void api('moderation/capabilities?targetId='+encodeURIComponent(targetId)+(channelId?'&channelId='+encodeURIComponent(channelId):'&roomId='+encodeURIComponent(contextId!))).then(setCapabilities).catch(()=>{});}}>
      <DropdownMenuTrigger asChild><button ref={trigger} type="button" className={`dp-player-menu-trigger ${className}`} aria-label={`Acties voor ${name}`}>{children ?? <PlayerName name={name}/>}</button></DropdownMenuTrigger>
      <DropdownMenuContent data-sheet-nested-menu="true" align="start" sideOffset={8} className="dp-player-menu" onEscapeKeyDown={event=>{event.preventDefault();setMenuOpen(false);}} onCloseAutoFocus={event => { if (dialog || externalAction.current) event.preventDefault(); externalAction.current = false; }}>
        <DropdownMenuLabel className="dp-player-menu-title"><PlayerName name={name}/><small>{self ? "Dit ben jij" : status === "friends" ? "In je vriendenlijst" : status === "incoming" ? "Heeft je een vriendschapsverzoek gestuurd" : status === "outgoing" ? "Vriendschapsverzoek verstuurd" : "Speler in DartsPoint"}</small></DropdownMenuLabel>
        {onProfile && <DropdownMenuItem onSelect={() => runExternal(onProfile)}><UserRound/>Profiel bekijken</DropdownMenuItem>}
        {!self && <>
          {onInvite && <DropdownMenuItem disabled={!targetId||blocked||!!inviteReason} onSelect={() => runExternal(onInvite)}><Target/>{inviteReason||'Uitnodigen voor een wedstrijd'}</DropdownMenuItem>}
          {onMessage && <DropdownMenuItem disabled={!targetId||blocked} onSelect={() => runExternal(onMessage)}><MessageCircle/>Privébericht</DropdownMenuItem>}
          {onSpectate && <DropdownMenuItem onSelect={() => runExternal(onSpectate)}><Eye/>Toeschouwen</DropdownMenuItem>}
          <DropdownMenuSeparator/>
          {status === "friends" ? <DropdownMenuItem onSelect={async () => apply(await removeFriend(targetId!), `${name} is uit je vriendenlijst verwijderd.`)}><UserMinus/>Vriendschap verwijderen</DropdownMenuItem> : status === "incoming" ? <>
            <DropdownMenuItem disabled={!targetId||blocked} onSelect={async () => apply(await acceptFriendRequest(targetId!), `Jij en ${name} zijn nu vrienden.`)}><Check/>Vriendschap accepteren</DropdownMenuItem>
            <DropdownMenuItem onSelect={async () => apply(await rejectFriendRequest(targetId!), "Vriendschapsverzoek afgewezen.")}><X/>Verzoek afwijzen</DropdownMenuItem>
          </> : status === "outgoing" ? <DropdownMenuItem onSelect={async () => apply(await cancelFriendRequest(targetId!), "Vriendschapsverzoek ingetrokken.")}><X/>Verzoek intrekken</DropdownMenuItem> : <DropdownMenuItem disabled={!targetId||blocked} onSelect={async () => apply(await sendFriendRequest(targetId!), `Vriendschapsverzoek aan ${name} verstuurd.`)}><UserPlus/>Vriend toevoegen</DropdownMenuItem>}
          <DropdownMenuItem onSelect={async () => apply(await togglePersonalMute(targetId!), muted ? `Berichten van ${name} zijn weer zichtbaar.` : `Berichten van ${name} zijn voor jou verborgen.`)}>{muted ? <Volume2/> : <VolumeX/>}{muted ? "Mute opheffen" : "Mute voor mij"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => { await toggleBlocked(targetId!); notify(blocked ? `${name} is gedeblokkeerd.` : `${name} is geblokkeerd.`); }}><Ban/>{blocked ? "Deblokkeren" : "Blokkeren"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog("report")}><Flag/>Speler melden</DropdownMenuItem>
          {canModerate && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => openDialog("moderation")}><ShieldCheck/>Modereren in deze kamer</DropdownMenuItem></>}
          {messageId&&capabilities.canModerateMessage&&<DropdownMenuItem onSelect={async()=>{const reason=window.prompt('Reden om dit bericht te verbergen (minimaal 5 tekens)');if(reason&&reason.trim().length>=5){try{await mutate('moderation/message',{messageId,reason});notify('Bericht verborgen.');}catch{}}}}><ShieldCheck/>Dit bericht verbergen</DropdownMenuItem>}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    {feedback && <div className="dp-player-menu-feedback" role="status"><Check size={15}/>{feedback}</div>}
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent className="dp-player-action-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
        <DialogHeader><span className="dp-player-action-emblem">{dialog === "report" ? <Flag size={24}/> : <ShieldCheck size={24}/>}</span><DialogTitle>{dialog === "report" ? `${name} melden` : `${name} modereren`}</DialogTitle><DialogDescription>{dialog === "report" ? "Je melding krijgt de kamer en wedstrijd mee als context." : `Kamermaatregel in ${roomName}. Persoonlijke mute staat hier los van.`}</DialogDescription></DialogHeader>
        <form onSubmit={async event => {
          event.preventDefault();
          if (dialog === "report") {
            try{await reportPlayer({ name, targetId, roomId:contextId, channelId, room: roomName, gameId:reportMatchId, messageId, reason: reportReason, detail: reason, context: "Melding via het spelersmenu." });setDialog(null); notify('Je melding is opgeslagen.');}catch(e){setError(e instanceof Error?e.message:'Melding opslaan mislukt.');}
          } else if (canModerate && await moderationAction({ name, targetId, room:contextId!, channelId, messageId, matchId:reportMatchId||undefined, kind, minutes, reason, actor: viewerName })) {
            setDialog(null); notify(`${name}: ${kind === "warn" ? "waarschuwing opgeslagen" : kind === "mute" ? `${minutes} minuten kamermute` : `${minutes} minuten uit de kamer verwijderd`}.`);
          } else setError("Controleer je rechten en geef een reden van minimaal 5 tekens.");
        }}>
          {dialog === "report" ? <label>Reden<select value={reportReason} onChange={event => setReportReason(event.target.value)}>{["Onvriendelijk gedrag", "Spam of ongewenste berichten", "Vermoeden van valsspelen", "Ongepaste gebruikersnaam", "Anders"].map(value => <option key={value}>{value}</option>)}</select></label> : <div className="dp-player-action-fields"><label>Actie<select value={kind} onChange={event => setKind(event.target.value as ModerationKind)}><option value="warn">Waarschuwen</option><option value="mute">Tijdelijk muten in kamer</option><option value="remove">Uit kamer verwijderen</option></select></label>{kind !== "warn" && <label>Duur<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 30, 60].map(value => <option key={value} value={value}>{value} minuten</option>)}</select></label>}</div>}
          <label>{dialog === "report" ? "Toelichting · optioneel" : "Reden"}<textarea rows={3} maxLength={dialog === "report" ? 600 : 300} required={dialog === "moderation"} minLength={dialog === "moderation" ? 5 : undefined} placeholder={dialog === "report" ? "Wat gebeurde er?" : "Leg kort uit waarom je ingrijpt…"} value={reason} onChange={event => setReason(event.target.value)}/></label>
          {error && <p className="dp-player-action-error" role="alert">{error}</p>}
          <span className="dp-player-action-context">{roomName||'Privégesprek'}{gameId&&` · Wedstrijd ${publicGameLabel(platform,gameId)}`}</span>
          <button type="submit" className="dp-social-primary" disabled={dialog === "moderation" && reason.trim().length < 5}>{dialog === "report" ? "Melding opslaan" : "Maatregel toepassen"}</button>
          <small>Je actie wordt op de server gecontroleerd en vastgelegd.</small>
        </form>
        {dialog === "moderation" && canModerate && activeModeration.length > 0 && <div className="dp-player-active-actions"><strong>Actieve kamermaatregelen</strong>{activeModeration.map(entry => <div key={entry.id}><span>{entry.kind === "mute" ? "Kamermute" : "Verwijderd"}<small>{entry.reason}</small></span><button type="button" onClick={async () => { if (await revokeModeration(entry.id, viewerName)) notify("Kamermaatregel opgeheven."); }}>Opheffen</button></div>)}</div>}
      </DialogContent>
    </Dialog>
  </>;
}
