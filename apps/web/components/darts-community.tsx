"use client";
import {ChatBadge} from "./chat-badge";
import {selfName,getPlatform,usePlatform} from "@/lib/platform-client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUpDown, ArrowUpRight, Check, ChevronRight, Clock3, Crown, Eye, Flag, Gamepad2, Medal, MessageCircle, Search, Send, ShieldCheck, Smile, Sparkles, Target, Trophy, UserPlus, Users, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { playerByName, players, rooms, type DartsPlayer } from "@/lib/darts-data";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { useTournaments } from "@/lib/darts-tournament-store";
import { useAdminOperations } from "@/lib/darts-admin-operations";
import { acceptFriendRequest, cancelFriendRequest, invitationReason, getDartsSocial, getPlayerPresence, isBlocked, isPersonallyMuted, isRoomMuted, isRoomRemoved, rejectFriendRequest, useDartsSocial } from "@/lib/darts-social";
import { useDartsPreferences } from "@/lib/darts-preferences";
import { useRatingProfiles, useRatingProfile } from "@/lib/darts-ratings";
import { PlayerSocialActions } from "@/components/darts-social-tools";
import { type ChatMessage, chatChannelId, getChatScroll, saveChatScroll, retryChatMessage, markChatRead, watchChatChannel, appendChatMessage, closePrivateChatTab, getChatChannel, getChatDraft, getInitialChatChannel, hydrateChat, openPrivateChatTab, receivePrivateMessage, resolveChatTab, subscribeChat, updateChatDraft, useChatHydrated, useOpenPrivateChatTabs } from "@/lib/darts-chat-state";
export { openPrivateChatTab, usePrivateChatInbox, usePrivateChatPreview, receivePrivateMessage, sendQuickChat } from "@/lib/darts-chat-state";
export type { PrivateChatPreview } from "@/lib/darts-chat-state";
import { PlayerActionMenu } from "@/components/darts-player-menu";
import "./darts-community.css";

type PlayerAction = (name: string) => void;

function Avatar({ player, small = false }: { player: Pick<DartsPlayer,"role"|"initials">; small?: boolean }) {
  return <span className={`dp-avatar ${small ? "dp-avatar-small" : ""} dp-role-${player.role}`} aria-hidden="true">{player.initials}</span>;
}

function SectionHeading({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return <div className="community-heading"><div>{eyebrow && <span className="community-eyebrow">{eyebrow}</span>}<h3>{title}</h3></div>{right}</div>;
}

export function PlayersTable({ scores = [0, 0], opponentName = "", roomName = "", gameId = "", onInvite, onSpectate, onProfile, onMessage, compact = false, embedded = false, variant = "arena" }: { scores?: [number, number]; opponentName?: string; roomName?: string; gameId?: string; onInvite: PlayerAction; onSpectate: PlayerAction; onProfile: PlayerAction; onMessage?: PlayerAction; compact?: boolean; embedded?: boolean; variant?: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Alle spelers");
  const [feedback, setFeedback] = useState("");
  const social = useDartsSocial();
  const operations = useAdminOperations();
  const liveRatings = useRatingProfiles(players.map(player => player.name));
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const [sort, setSort] = useState<"status" | "rating" | "name">("status");
  const [descending, setDescending] = useState(true);
  const visible = useMemo(() => {
    let list = players.filter(p => getPlayerPresence(p.name).online && getPlayerPresence(p.name).room === roomName).filter(p => !social.moderation.some(entry => entry.name === p.name && entry.room === roomName && entry.kind === "remove" && entry.until > now)).map(p => ({ ...p, rating: liveRatings.find(rating => rating.name === p.name)?.rating ?? p.rating, status: p.status as DartsPlayer["status"] })).filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    if (filter !== "Alle spelers") list = list.filter(p => p.status === filter);
    if (sort === "rating") list = [...list].sort((a, b) => descending ? b.rating - a.rating : a.rating - b.rating);
    if (sort === "name") list = [...list].sort((a, b) => descending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    return list;
  }, [query, filter, sort, descending, opponentName, liveRatings, social.moderation, roomName, now]);
  function setSorting(next: "rating" | "name") { setSort(next); setDescending(sort === next ? !descending : true); }
  function score(player:DartsPlayer){const match=getPlatform().matches.find(m=>m.players?.some((p:any)=>p.id===player.id));const seat=match?.players.find((p:any)=>p.id===player.id)?.seat;return seat===undefined?"—":match.state.scores[seat];}
  return <section className={`players-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} data-variant={variant} aria-label="Spelers in de kamer">
    <SectionHeading title={compact ? "Spelers" : "Spelers in de kamer"} right={<span className="community-count"><span className="online-dot"/>{operations.rooms.find(room => room.name === roomName)?.count ?? visible.length} online</span>}/>
    <div className="players-toolbar"><label className="community-search"><Search size={14}/><Input placeholder="Zoek speler…" aria-label="Zoek een speler" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filter spelers" value={filter} onChange={e => setFilter(e.target.value)}><option>Alle spelers</option><option>Beschikbaar</option><option>Speelt</option><option>Kijkt mee</option></select></div>
    <Table className="players-table"><TableHeader><TableRow><TableHead><button onClick={() => setSorting("name")}>Speler <ArrowUpDown size={11}/></button></TableHead><TableHead className="numeric"><button onClick={() => setSorting("rating")}>DP <ArrowDown size={11} className={sort === "rating" && !descending ? "sort-reversed" : ""}/></button></TableHead><TableHead className="numeric score-column">Score</TableHead><TableHead className="numeric average-column">Gem.</TableHead><TableHead className="status-column">Status</TableHead><TableHead className="action-column"><span className="sr-only">Actie</span></TableHead></TableRow></TableHeader>
      <TableBody>{visible.map(p => <TableRow key={p.id??p.name} className={p.name === selfName() ? "self-player" : ""}>
        <TableCell><PlayerActionMenu userId={p.id} name={p.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onSpectate={p.status === "Speelt" ? onSpectate : undefined} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="player-identity"><Avatar player={p} small/><span className="player-name"><PlayerName name={p.name}/>{p.name === selfName() && <small>JIJ</small>}{social.isMuted(p.name) && <VolumeX size={11} aria-label="Gedempt"/>}</span></PlayerActionMenu></TableCell>
        <TableCell className="numeric rating-value"><RatingValue player={p}/></TableCell><TableCell className={`numeric player-score score-column ${p.status === "Speelt" ? "active-score" : ""}`}>{score(p)}</TableCell><TableCell className="numeric average-column">{p.average.toFixed(1)}</TableCell>
        <TableCell className="status-column"><span className={`player-status ${p.status === "Speelt" ? "is-playing" : p.status === "Beschikbaar" ? "is-available" : "is-watching"}`}><span/>{p.status}</span></TableCell>
        <TableCell className="action-column"><div className="player-actions">{p.name === selfName() ? <span className="self-check" title="Dit ben jij"><Check size={14}/></span> : <>{!compact && onMessage && <Button className="player-action player-message" variant="ghost" size="icon-sm" title={`Privéchat met ${p.name}`} aria-label={`Privéchat met ${p.name}`} disabled={social.isBlocked(p.name)} onClick={() => onMessage(p.id??p.name)}><MessageCircle size={16}/></Button>}{p.status === "Speelt" ? <Button className="player-action" variant="ghost" size="icon-sm" title={`Kijk mee bij ${p.name}`} aria-label={`Kijk mee bij ${p.name}`} onClick={() => onSpectate(p.id??p.name)}><Eye size={16}/></Button> : <Button className="player-action" variant="ghost" size="icon-sm" title={invitationReason(p.name)||`Nodig ${p.name} uit voor een wedstrijd`} aria-label={invitationReason(p.name)||`Nodig ${p.name} uit voor een wedstrijd`} disabled={social.isBlocked(p.name)||!!invitationReason(p.name)} onClick={() => onInvite(p.id??p.name)}><UserPlus size={16}/></Button>}</>}</div></TableCell>
      </TableRow>)}</TableBody></Table>
    {visible.length === 0 && <div className="community-empty"><Search size={22}/><p>Geen spelers gevonden</p><button onClick={() => { setQuery(""); setFilter("Alle spelers"); }}>Wis je filters</button></div>}
    <div className="players-footer"><span>{visible.length} spelers</span><div className="rating-legend" aria-label="Rating: wit plaatsingsfase, rood onder 1450, geel 1450 tot 1549, groen vanaf 1550"><span><i className="rating-white"/> Plaatsing</span><span><i className="rating-red"/> &lt;1450</span><span><i className="rating-amber"/> 1450–1549</span><span><i className="rating-green"/> ≥1550</span></div></div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="Melding sluiten" onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

type MessageRowProps={message:ChatMessage;authorName:string;authorRole:DartsPlayer['role'];authorInitials:string;own:boolean;roomId?:string;roomName:string;channelId?:string;gameId:string;onInvite?:PlayerAction;onProfile?:PlayerAction;onMessage?:PlayerAction;onSpectate?:PlayerAction;onToast:(text:string)=>void;onEdit:(text:string)=>void;channelKey:string};
/** Existing history stays mounted when only a draft or one pending message changes. */
const ChatMessageRow=memo(function ChatMessageRow({message,authorName,authorRole,authorInitials,own,roomId,roomName,channelId,gameId,onInvite,onProfile,onMessage,onSpectate,onToast,onEdit,channelKey}:MessageRowProps){
 const menu={userId:message.senderId,name:authorName,roomId,roomName,channelId,messageId:message.messageId,gameId,onInvite,onProfile,onMessage,onSpectate,onToast};
 return <div data-message-seq={message.id} data-client-message-id={message.clientMessageId} data-send-status={message.status??'sent'} className={`chat-message ${own?'own-message':''}`}><PlayerActionMenu {...menu} className="chat-avatar-menu"><Avatar player={{role:authorRole,initials:authorInitials}} small/></PlayerActionMenu><div><div className="chat-message-meta"><PlayerActionMenu {...menu} className="chat-name-menu"><PlayerName name={authorName}/></PlayerActionMenu><time>{message.time}</time></div><p>{message.text}</p>{message.status==='pending'&&<small className="chat-send-status" role="status">Wordt verzonden</small>}{message.status==='failed'&&<div className="chat-send-failed" role="alert"><span>Niet verzonden · {message.error}</span><button type="button" onClick={()=>{void retryChatMessage(channelKey,message).catch(()=>{});}}>Opnieuw proberen</button><button type="button" onClick={()=>onEdit(message.text)}>Tekst aanpassen</button></div>}</div></div>;
});

export function ChatPanel({ roomId, roomName = "", gameId = "", opponentName = "", className = "", compact = false, embedded = false, lobby = false, quiet = false, readEnabled = true, activeTab, onTabChange, onClosePrivateTab, onInvite, onProfile, onMessage, onSpectate }: {
  roomId?:string; roomName?: string; gameId?: string; opponentName?: string; className?: string; compact?: boolean; embedded?: boolean; lobby?: boolean; quiet?: boolean; readEnabled?:boolean;
  activeTab?: string; onTabChange?: (tab: string) => void; onClosePrivateTab?: (name: string, nextTab: string) => void; privatePlayers?: string[];
  onInvite?:PlayerAction;onProfile?:PlayerAction;onMessage?:PlayerAction;onSpectate?:PlayerAction;
}) {
  const [localTab, setLocalTab] = useState(lobby ? "" : "room");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [playerTools, setPlayerTools] = useState(false);
  const [privacyFeedback, setPrivacyFeedback] = useState("");
  const actions=useRef({onInvite,onProfile,onMessage,onSpectate});actions.current={onInvite,onProfile,onMessage,onSpectate};
  const rowActions=useMemo(()=>({onInvite:(id:string)=>actions.current.onInvite?.(id),onProfile:(id:string)=>actions.current.onProfile?.(id),onMessage:(id:string)=>actions.current.onMessage?.(id),onSpectate:(id:string)=>actions.current.onSpectate?.(id)}),[]);
  const social = useDartsSocial();
  const adminRooms = useAdminOperations().rooms;
  const preferences = useDartsPreferences();
  const scroll = useRef<HTMLDivElement>(null);
  const panelRoot=useRef<HTMLElement>(null),atBottom=useRef(true),previousKey=useRef(""),sendGuard=useRef({key:'',at:0});
  const [visibilityTick,setVisibilityTick]=useState(0);
  const tabList = useRef<HTMLDivElement>(null);
  const emptyState = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const chatReady = useChatHydrated();
  const platform=usePlatform();
  const openPrivateNames = useOpenPrivateChatTabs();
  const privateNames = openPrivateNames.filter(id => !social.isBlocked(platform.channels.find(c=>c.id===id)?.userId??''));
  const requestedTab = activeTab ?? localTab;
  const hasMatch=/^[a-f0-9-]{36}$/i.test(gameId);
  const tab = resolveChatTab(!hasMatch&&requestedTab==="match"?"room":requestedTab, privateNames, lobby);
  const unreadFor=(kind:string,target:string)=>platform.chatChannels?.find(c=>c.kind===kind&&(kind==="private"?c.id===target:kind==="community"?c.name===target:c.matchId===target))?.unread??0;
  const messagePlayer=(message:{senderId?:string;name:string})=>platform.players.find(p=>p.id===message.senderId)??{...playerByName(message.senderId??''),name:message.name,initials:message.name.slice(0,2).toUpperCase()};
  const systemText=(message:{senderId?:string;text:string})=>{const actor=platform.players.find(p=>p.id===message.senderId);return actor?`${actor.name} komt de kamer binnen.`:message.text;};
  const privateId = tab.startsWith("private:") ? tab.slice(8) : null;
  const contact=platform.channels.find(c=>c.id===privateId),privateName=contact?.name??null;
  const channelKey = privateId ? `private:${privateId}` : !tab ? "" : tab === "room" ? `room:${roomId??roomName}` : `match:${gameId}`;
  const current = useSyncExternalStore(subscribeChat, () => getChatChannel(channelKey), () => getInitialChatChannel(channelKey));
  const draft = useSyncExternalStore(subscribeChat, () => getChatDraft(channelKey), () => "");
  const blocked = !!privateName && social.isBlocked(contact?.userId??privateName);
  const muted = !!privateName && social.isMuted(contact?.userId??privateName);
  const setDraft = useCallback((text: string) => updateChatDraft(channelKey, text),[channelKey]);
  const maximumId = current.reduce((maximum, message) => Math.max(maximum, message.id), 0);
  const [quietWindow, setQuietWindow] = useState({ key: channelKey, active: quiet, maximumId });
  const [releasedCount, setReleasedCount] = useState(0);
  const lastDeferred = useRef(0);
  const sameQuietWindow = quietWindow.key === channelKey && quietWindow.active === quiet;
  if (!sameQuietWindow) setQuietWindow({ key: channelKey, active: quiet, maximumId });
  const quietBoundary = sameQuietWindow ? quietWindow.maximumId : maximumId;
  const unblockedMessages = current.filter(message => message.system || (!social.isBlocked(message.senderId??message.name) && !social.isMuted(message.senderId??message.name)));
  const deferredCount = quiet ? unblockedMessages.filter(message => !message.system && message.senderId !== platform.actor?.id && message.id > quietBoundary).length : 0;
  const visible = unblockedMessages.filter(message => !quiet || message.system || message.senderId === platform.actor?.id || message.id <= quietBoundary);
  const visibleCursor=visible.reduce((cursor,message)=>Math.max(cursor,message.id),0);
  useEffect(()=>watchChatChannel(channelKey),[channelKey]);
  useEffect(()=>{const changed=()=>setVisibilityTick(n=>n+1);document.addEventListener('visibilitychange',changed);window.addEventListener('focus',changed);window.addEventListener('blur',changed);return ()=>{document.removeEventListener('visibilitychange',changed);window.removeEventListener('focus',changed);window.removeEventListener('blur',changed);};},[]);
  useEffect(()=>{
   const frame=requestAnimationFrame(()=>{
    const root=panelRoot.current,container=scroll.current,last=container?.querySelector<HTMLElement>('[data-message-seq="'+visibleCursor+'"]');
    if(!readEnabled||quiet||!atBottom.current||document.visibilityState!=='visible'||!document.hasFocus()||!root||!container||!last)return;
    const outer=root.getBoundingClientRect(),bounds=container.getBoundingClientRect(),message=last.getBoundingClientRect();
    if(outer.height<=0||outer.bottom<=0||outer.top>=innerHeight||message.bottom>bounds.bottom+1||message.bottom<bounds.top)return;
    void markChatRead(channelKey,visibleCursor).catch(()=>{});
   });return ()=>cancelAnimationFrame(frame);
  },[channelKey,visibleCursor,quiet,readEnabled,visibilityTick,current]);
  useEffect(() => {
    if (!quiet && lastDeferred.current > 0) setReleasedCount(lastDeferred.current);
    lastDeferred.current = deferredCount;
  }, [quiet, deferredCount]);
  useEffect(() => { if (!releasedCount) return; const timer = setTimeout(() => setReleasedCount(0), 4500); return () => clearTimeout(timer); }, [releasedCount]);
  async function selectTab(value: string) {
    const allowed = lobby && !value.startsWith("private:") ? "" : value;
    setLocalTab(allowed); onTabChange?.(allowed); setEmojiOpen(false); setPlayerTools(false); setPrivacyFeedback("");
  }
  async function closePrivate(name: string) {
    const next = await closePrivateChatTab(name, tab, lobby, privateNames);
    pendingFocus.current = next;
    selectTab(next);
    onClosePrivateTab?.(name, next);
  }
  useEffect(() => {
    if (chatReady && tab !== requestedTab) { setLocalTab(tab); onTabChange?.(tab); }
  }, [chatReady, tab, requestedTab, onTabChange]);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const target = pendingFocus.current;
    const button = Array.from(tabList.current?.querySelectorAll<HTMLButtonElement>("[data-chat-tab]") ?? []).find(element => element.dataset.chatTab === target);
    if (button) button.focus({ preventScroll: true });
    else if (!target) emptyState.current?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [openPrivateNames, tab]);
  useEffect(hydrateChat, []);
  useEffect(() => {
    const changed=previousKey.current!==channelKey;previousKey.current=channelKey;
    if(changed){const saved=getChatScroll(channelKey);atBottom.current=saved.bottom;if(!saved.bottom)scroll.current?.scrollTo({top:saved.top,behavior:'instant'});}
    if(atBottom.current)scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});
    if(scroll.current)saveChatScroll(channelKey,{top:scroll.current.scrollTop,bottom:atBottom.current});
  },[current,channelKey]);
  async function send(text = draft) {
    if (!channelKey || !text.trim() || blocked || (!privateName && (isRoomMuted(selfName(), roomName) || isRoomRemoved(selfName(), roomName)))) return;
    const concept=channelKey+'\u0000'+text.trim(),now=performance.now();if(sendGuard.current.key===concept&&now-sendGuard.current.at<250)return;sendGuard.current={key:concept,at:now};
    const time = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    setEmojiOpen(false);setPrivacyFeedback('');
    try { await appendChatMessage(channelKey, { id: 0, name: selfName(), text: text.trim().slice(0, 500), time }); } catch(e) { setPrivacyFeedback(e instanceof Error ? e.message : "Je bericht kon niet worden verstuurd. Je concept blijft bewaard."); }
  }
  async function tryNewPrivateChat(){const name=getDartsSocial().friends.find(name=>!getDartsSocial().blocked.includes(name));if(!name){setPrivacyFeedback("Kies een speler in de kamer of je vriendenlijst om een gesprek te openen.");return;}const channelId=await openPrivateChatTab(name);if(channelId)selectTab("private:"+channelId);}
  return <section ref={panelRoot} className={`chat-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""} ${className}`}>
    <div className="chat-top"><MessageCircle size={16}/><span>{lobby ? "Berichten" : roomName}</span>{!lobby && <span className="chat-online"><span className="online-dot"/>{adminRooms.find(room => room.name === roomName)?.count ?? 0}</span>}</div>
    {(!lobby || privateNames.length > 0) && <Tabs className="chat-tab-container" value={tab} onValueChange={selectTab}><TabsList ref={tabList} className="chat-tabs" aria-label={lobby ? "Privégesprekken" : "Chatgesprek"}>{!lobby && <>{hasMatch&&<TabsTrigger data-chat-tab="match" value="match">Spelchat<ChatBadge count={unreadFor("match",gameId)}/></TabsTrigger>}<TabsTrigger data-chat-tab="room" value="room">Kamerchat<ChatBadge count={unreadFor("community",roomName)}/></TabsTrigger></>}{privateNames.map(id => {const contact=platform.channels.find(c=>c.id===id),name=contact?.name??'Speler';return <div className={`chat-private-tab-wrap ${tab === `private:${id}` ? "is-active" : ""}`} key={id}><TabsTrigger className="chat-private-tab" data-chat-tab={`private:${id}`} value={`private:${id}`} onKeyDown={event => { if (event.key === "Delete") { event.preventDefault(); closePrivate(id); } }}><Avatar player={playerByName(contact?.userId??name)} small/><PlayerName name={name}/><ChatBadge count={unreadFor("private",id)}/></TabsTrigger><button type="button" className="chat-tab-close" aria-label={`Privégesprek met ${name} sluiten`} title="Gesprek sluiten" onClick={() => closePrivate(id)}><X size={13}/></button></div>;})}</TabsList></Tabs>}
    {!tab ? <div ref={emptyState} tabIndex={-1} className="chat-empty-state" role="region" aria-label="Geen privégesprek geopend"><span><MessageCircle size={25}/></span><h3>Je gesprekken beginnen hier</h3><p>Open een privégesprek via je vrienden of berichten. Gesloten gesprekken blijven bewaard.</p></div> : <>
    {quiet && <div className="chat-quiet-note"><Target size={12}/>{deferredCount ? `${deferredCount} ${deferredCount === 1 ? "nieuw bericht komt" : "nieuwe berichten komen"} na je beurt` : "Rustige beurt · nieuwe berichten blijven bewaard"}</div>}{!quiet && releasedCount > 0 && <div className="chat-quiet-note" role="status"><MessageCircle size={12}/>{releasedCount} {releasedCount === 1 ? "bewaard bericht staat" : "bewaarde berichten staan"} voor je klaar</div>}
    {privateName && <div className="chat-person-tools"><span>{blocked ? "Geblokkeerd gesprek" : muted ? "Gedempt gesprek" : "Privégesprek"}</span><PlayerActionMenu userId={contact?.userId} name={privateName} channelId={chatChannelId(channelKey)} onProfile={onProfile} onInvite={onInvite} onMessage={onMessage} onToast={setPrivacyFeedback} className="chat-contact-menu"><PlayerName name={privateName}/></PlayerActionMenu></div>}
    <div className="chat-messages" ref={scroll} onScroll={()=>{const el=scroll.current;if(el){atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<24;saveChatScroll(channelKey,{top:el.scrollTop,bottom:atBottom.current});setVisibilityTick(n=>n+1);}}} role="log" aria-live={quiet ? "off" : "polite"} aria-label={privateName ? `Privéberichten met ${privateName}` : tab === "room" ? "Kamerberichten" : "Spelberichten"}>
      <span className="chat-date">VANDAAG</span>{visible.map(message => message.system ? <div className="chat-system" key={message.messageId??message.eventId??message.id} data-message-seq={message.id}><Users size={13}/><span>{systemText(message)}</span><time>{message.time}</time></div> : <ChatMessageRow key={message.clientMessageId??message.messageId??`${channelKey}:${message.id}`} message={message} authorName={messagePlayer(message).name} authorRole={messagePlayer(message).role} authorInitials={messagePlayer(message).initials} own={message.senderId===platform.actor?.id} roomId={privateName?undefined:roomId} roomName={privateName?'':roomName} channelId={chatChannelId(channelKey)} gameId={tab==='match'?gameId:''} onInvite={onInvite?rowActions.onInvite:undefined} onProfile={onProfile?rowActions.onProfile:undefined} onMessage={onMessage?rowActions.onMessage:undefined} onSpectate={onSpectate?rowActions.onSpectate:undefined} onToast={setPrivacyFeedback} onEdit={setDraft} channelKey={channelKey}/>)}
      {!privateName && social.moderation.filter(entry => entry.room === roomName).slice(-3).map(entry => <div className="chat-system" key={entry.id}><ShieldCheck size={13}/>{entry.name}: {entry.kind === "warn" ? "waarschuwing" : entry.kind === "mute" ? "tijdelijke mute" : "uit de kamer verwijderd"} · {entry.reason}</div>)}
      {blocked && <p className="chat-system">Berichten van {privateName} zijn verborgen. Deblokkeer deze speler om het gesprek te hervatten.</p>}{muted && !blocked && <p className="chat-system"><VolumeX size={13}/>Je hebt {privateName} gedempt. Klik bovenaan op de naam om berichten weer te tonen.</p>}
    </div>
    <div className="chat-compose-wrap">{!blocked && <div className="chat-quick-replies" aria-label="Snelle chatzinnen">{["Succes! 🎯", "Mooie finish! 👏", "Goed gespeeld!", "Revanche?"].map(text => <button key={text} type="button" onClick={() => send(text)}>{text}</button>)}</div>}{emojiOpen && <div className="chat-emoji-picker" aria-label="Kies een emoji">{["🎯", "👏", "🔥", "👋", "😂", "🏆", "💪", "🍻"].map(emoji => <button key={emoji} aria-label={`Voeg ${emoji} toe`} onClick={() => { setDraft(draft + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
      <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}><Button variant="ghost" size="icon-sm" type="button" className="emoji-button" disabled={blocked} aria-label="Emoji kiezen" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(value => !value)}><Smile size={18}/></Button><Input value={draft} disabled={blocked} onChange={e => setDraft(e.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!event.repeat&&!event.nativeEvent.isComposing&&!event.shiftKey)void send();}}} placeholder={blocked ? "Deze speler is geblokkeerd" : privateName ? `Bericht aan ${privateName}…` : tab === "room" ? "Praat mee in de kamer…" : "Bericht in het spel…"} aria-label={privateName ? `Privébericht aan ${privateName}` : "Chatbericht"} maxLength={500}/><Button type="submit" size="icon-sm" className="chat-send" disabled={!draft.trim() || blocked} aria-label="Verstuur bericht"><Send size={17}/></Button></form>
      <p className="chat-footnote">Speel sportief. <span>Berichten zijn gekoppeld aan je account.</span></p>
      {lobby && <div className="chat-privacy-preview"><span>Nieuwe chats: {preferences.privateMessages === "everyone" ? "iedereen" : preferences.privateMessages === "friends" ? "alleen vrienden" : "niemand"}</span><button type="button" onClick={tryNewPrivateChat}>Nieuw gesprek</button></div>}
      {privacyFeedback && <p className="chat-privacy-feedback" role="status">{privacyFeedback}</p>}
    </div>
    </>}
  </section>;
}

export function RoomList({ currentRoom, onSelect }: { currentRoom: string; onSelect: (room: string) => void }) {
  const [query, setQuery] = useState("");
  const events = useTournaments().tournaments.filter(event => event.published && !["draft", "cancelled", "completed"].includes(event.status) && `${event.name} ${event.settings.room}`.toLowerCase().includes(query.toLowerCase()));
  const operations = useAdminOperations();
  const categoryLabels = { social: "Sociaal", ranked: "Competitief", beginners: "Ontspannen", tournament: "Toernooi" };
  const categorySymbols = { social: "🎯", ranked: "⚡", beginners: "✨", tournament: "🏆" };
  const visible = operations.rooms.filter(room => `${room.name} ${categoryLabels[room.category]}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="room-list-panel" aria-label="Alle kamers">
    <label className="community-search room-list-search"><Search size={16}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek een kamer…" aria-label="Zoek een kamer"/></label>
    <div className="room-list">{visible.map(room => <button type="button" key={room.id} className={`room-list-row ${currentRoom === room.name ? "is-current" : ""}`} disabled={room.category !== "tournament" && (room.status === "closed" || room.count >= room.capacity)} aria-current={currentRoom === room.name ? "true" : undefined} onClick={() => onSelect(room.id)}>
      <span className="room-list-emoji" aria-hidden="true">{room.name.startsWith("Nederland") ? "🇳🇱" : room.name === "Afterhours" ? "🌙" : categorySymbols[room.category]}</span><span className="room-list-name"><strong>{room.name}</strong><small>{room.category === "tournament" ? "DartsPoint-events · toeschouwers welkom" : room.status === "closed" ? "Gesloten voor nieuwe spelers" : currentRoom === room.name ? "Je bent hier" : room.count >= room.capacity ? "Kamer vol" : room.status === "private" ? "Privékamer · eigenaarstoegang" : categoryLabels[room.category]}</small></span><span className="room-list-count"><Users size={14}/><strong>{room.count}</strong><span>/ {room.capacity}</span></span>{currentRoom === room.name ? <Check size={17}/> : <ChevronRight size={17}/>}</button>)}</div>
    {events.length > 0 && <div className="room-list"><h4 className="room-event-heading">DartsPoint · toernooikamers</h4>{events.map(event => <a key={event.id} className="room-list-row" href={`/toernooi/${encodeURIComponent(event.id)}`}><span className="room-list-emoji"><Trophy size={22}/></span><span className="room-list-name"><strong>{event.name}</strong><small>{event.settings.room} · toeschouwers welkom</small></span><span className="room-list-count"><Users size={14}/><strong>{event.participants.filter(player => ["confirmed", "checkedin"].includes(player.status)).length}</strong><span>/ {event.settings.maxPlayers}</span></span><ChevronRight size={17}/></a>)}</div>}
    {visible.length === 0 && events.length === 0 && <div className="community-empty"><Search size={22}/><p>Geen kamers gevonden</p><button onClick={() => setQuery("")}>Wis je zoekopdracht</button></div>}
  </section>;
}

export function RoomGrid({ currentRoom, onSelect }: { currentRoom: string; onSelect: (room: string) => void }) {
  const [filter, setFilter] = useState("Alle kamers");
  const visible = rooms.filter(room => filter === "Alle kamers" || (filter === "Plek beschikbaar" && room.count < 50) || (filter === "Competitief" && ["Competitief", "Toernooi"].includes(room.category)));
  return <section className="rooms-panel"><SectionHeading eyebrow="VIND JOUW MENSEN" title="Een kamer. Nog een potje." right={<span className="community-count">{getPlatform().rooms.reduce((sum,r)=>sum+r.count,0)} online</span>}/><div className="community-filter-pills">{["Alle kamers", "Plek beschikbaar", "Competitief"].map(value => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div><div className="room-grid">{visible.map(room => <motion.button whileHover={{ y: -3 }} whileTap={{ scale: .99 }} key={room.name} disabled={room.count >= 50} className={`room-card ${currentRoom === room.name ? "is-current" : ""}`} onClick={() => onSelect(room.id)}><div className="room-card-top"><span className="room-emoji">{room.emoji}</span><span className="room-category">{room.category}</span></div><h3>{room.name}</h3><p>{room.subtitle}</p><div className="room-occupancy"><span><Users size={13}/><strong>{room.count}</strong> / 50</span><span>{room.matches} wedstrijden</span></div><div className="room-capacity"><span style={{ width: `${room.count * 2}%` }}/></div><div className="room-join">{currentRoom === room.name ? <><span className="online-dot"/> Je bent hier</> : room.count >= 50 ? "Kamer vol" : <>Kamer binnen <ArrowUpRight size={15}/></>}</div></motion.button>)}</div></section>;
}

export function FriendsPanel({ onInvite, onProfile, onMessage, onSpectate, roomName = "", gameId = "", compact = false, embedded = false }: { onInvite: PlayerAction; onProfile: PlayerAction; onMessage?: PlayerAction; onSpectate?: PlayerAction; roomName?: string; gameId?: string; compact?: boolean; embedded?: boolean }) {
  const social = useDartsSocial();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const friends = social.friends.filter(name => !social.isBlocked(name)).map(playerByName).sort((a, b) => Number(getPlayerPresence(b.name).online) - Number(getPlayerPresence(a.name).online) || a.name.localeCompare(b.name));
  const visible = friends.filter(friend => friend.name.toLowerCase().includes(query.toLowerCase()));
  const requests = social.friendRequests.filter(request => !social.isBlocked(request.name));
  const incoming = requests.filter(request => request.direction === "incoming");
  async function resolveRequest(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    const result = await action(); setFeedback(result.ok ? success : result.error);
  }
  return <section className={`friends-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} aria-label="Vrienden">
    <SectionHeading title="Vrienden" right={<span className="community-count"><span className="online-dot"/>{friends.filter(friend => getPlayerPresence(friend.name).online).length}</span>}/>
    <div className="friends-tabs" role="tablist" aria-label="Vriendschappen"><button type="button" role="tab" aria-selected={tab === "friends"} className={tab === "friends" ? "is-active" : ""} onClick={() => setTab("friends")}>Vrienden <span>{friends.length}</span></button><button type="button" role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "is-active" : ""} onClick={() => setTab("requests")}>Verzoeken{requests.length > 0 && <span className={incoming.length ? "has-incoming" : ""}>{requests.length}</span>}</button></div>
    {tab === "friends" && <label className="community-search friends-search"><Search size={13}/><Input placeholder="Zoek vriend…" aria-label="Zoek een vriend" value={query} onChange={event => setQuery(event.target.value)}/></label>}
    <div className="friends-scroll" role="tabpanel" aria-label={tab === "friends" ? "Mijn vrienden" : "Vriendschapsverzoeken"}>
      {tab === "friends" ? <div className="friends-list">{visible.map(friend => {
        const presence = getPlayerPresence(friend.name);
        return <div className={`friend-row ${presence.online ? "" : "friend-offline"}`} key={friend.id??friend.name}><PlayerActionMenu userId={friend.id} name={friend.name} roomName={roomName} gameId={gameId} onInvite={presence.online ? onInvite : undefined} onProfile={onProfile} onMessage={onMessage} onSpectate={presence.online && friend.status === "Speelt" ? onSpectate : undefined} onToast={setFeedback} className="friend-main"><span className="friend-avatar-wrap"><Avatar player={friend} small/><span className={presence.online ? "online-dot" : "offline-dot"}/></span><span><strong><PlayerName name={friend.name}/>{social.isMuted(friend.name) && <VolumeX size={11} aria-label="Gedempt"/>}</strong><small>{presence.online ? presence.status : "Offline"}</small></span></PlayerActionMenu>{onMessage && <Button className="friend-message" variant="ghost" size="icon-sm" onClick={() => onMessage(friend.id??friend.name)} aria-label={`Privéchat met ${friend.name}`} title={`Privéchat met ${friend.name}`}><MessageCircle size={15}/></Button>}</div>;
      })}{visible.length === 0 && <div className="community-empty"><Users size={20}/><p>{query ? "Geen vrienden gevonden" : "Nog geen vrienden"}</p><small>{query ? "Probeer een andere naam." : "Klik op een speler om een vriendschapsverzoek te sturen."}</small>{query && <button type="button" onClick={() => setQuery("")}>Wis zoekopdracht</button>}</div>}</div>
      : <div className="friend-requests">{requests.map(request => <div className="friend-request" key={request.id}><PlayerActionMenu userId={playerByName(request.name).id} name={request.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="friend-main"><Avatar player={playerByName(request.name)} small/><span><strong><PlayerName name={request.name}/></strong><small>{request.direction === "incoming" ? "Wil vrienden worden" : "Verzoek verstuurd"}</small></span></PlayerActionMenu><div className="friend-request-actions">{request.direction === "incoming" ? <><button className="request-accept" type="button" onClick={() => resolveRequest(async () => await acceptFriendRequest(request.name), `${request.name} is nu je vriend.`)} aria-label={`Accepteer ${request.name}`}><Check size={14}/><span>Accepteren</span></button><button type="button" onClick={() => resolveRequest(async () => await rejectFriendRequest(request.name), `Verzoek van ${request.name} afgewezen.`)} aria-label={`Wijs ${request.name} af`}><X size={14}/></button></> : <><button type="button" onClick={() => resolveRequest(async () => await cancelFriendRequest(request.name), `Verzoek aan ${request.name} ingetrokken.`)}>Intrekken</button><button type="button" className="request-demo" onClick={() => onProfile(playerByName(request.name).id??request.name)}>Profiel bekijken</button></>}</div></div>)}{requests.length === 0 && <div className="community-empty"><UserPlus size={20}/><p>Geen open verzoeken</p><small>Vriendschapsverzoeken verschijnen hier.</small></div>}</div>}
    </div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="Melding sluiten" onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

export function LiveMatches({onSpectate}:{onSpectate:PlayerAction}){
 const p=usePlatform(),matches=p.matches.filter(m=>m.lifecycle==='playing');
 return <section className="live-panel community-panel"><SectionHeading title="Nu op de oche" right={<span className="live-indicator"><i/>LIVE</span>}/><div className="live-match-list">{matches.map(match=><button className="live-match-card" key={match.id} onClick={()=>onSpectate(match.players[0].name)}><div className="live-match-meta"><span>{match.state.rules.startScore} · Best of {match.state.rules.bestOf}</span><span><Eye size={12}/>Meekijken</span></div>{match.players.slice().sort((a:any,b:any)=>a.seat-b.seat).map((player:any)=><div className="live-match-player" key={player.id}><PlayerName name={player.name}/><strong>{match.state.scores[player.seat]}</strong></div>)}<div className="live-match-bottom"><span>{match.state.legs.join(' – ')} legs</span><span>Toeschouwen <ArrowUpRight size={13}/></span></div></button>)}{matches.length===0&&<div className="community-empty"><Eye/><p>Er zijn nu geen actieve wedstrijden in deze kamer.</p></div>}</div></section>;
}

export function TournamentPanel({onToast}:{onToast:(text:string)=>void}){
 const {tournaments}=useTournaments(),event=tournaments.find(t=>['registration','checkin','live'].includes(t.status));
 return <section className="tournament-panel community-panel"><div className="tournament-hero"><span className="tournament-icon"><Trophy size={28}/></span><span className="tournament-eyebrow">OFFICIËLE TOERNOOIEN</span><h3>{event?.name??'De volgende avondcup.'}</h3><p>{event?.description??'De volgende avond wordt voorbereid.'}</p><div className="tournament-tags">{event&&<><span><Users size={12}/>{event.participants.filter(p=>['confirmed','checkedin'].includes(p.status)).length}/{event.settings.maxPlayers}</span><span>{event.settings.startScore} · BO{event.settings.bestOf}</span></>}</div></div><div className="tournament-inner">{event?<a className="tournament-join" href={'/toernooi/'+event.id}>Deelnemers, inschrijven en speelschema <ArrowUpRight size={16}/></a>:<p className="tournament-help">Gepubliceerde toernooien verschijnen hier.</p>}</div></section>;
}

export function RankingPanel({ onProfile }: { onProfile: PlayerAction }) {
  const [period, setPeriod] = useState("DP");
  const liveRatings = useRatingProfiles(players.map(player => player.name));
  const ranked = players.map(player => ({ ...player, rating: liveRatings.find(rating => rating.name === player.name)?.rating ?? player.rating })).sort((a,b) => period === "Gemiddelde" ? b.average - a.average : period === "Overwinningen" ? b.wins - a.wins : b.rating - a.rating);
  return <section className="ranking-panel community-panel"><SectionHeading eyebrow="THE CLIMB" title="De ladder" right={<Trophy className="ranking-trophy" size={22}/>} /><div className="community-filter-pills">{["DP", "Gemiddelde", "Overwinningen"].map(p => <button key={p} className={period === p ? "is-active" : ""} onClick={() => setPeriod(p)}>{p}</button>)}</div><div className="ranking-columns"><span>Positie / speler</span><span>{period === "Gemiddelde" ? "Gemiddelde" : period === "Overwinningen" ? "Gewonnen" : "Rating"}</span></div><div className="ranking-list">{ranked.map((player,i) => <button key={player.name} className={`ranking-row ${player.name === selfName() ? "is-you" : ""}`} onClick={() => onProfile(player.name)}><span className={`ranking-position ${i < 3 ? "top-three" : ""}`}>{i === 0 ? <Crown size={16}/> : String(i+1).padStart(2,"0")}</span><Avatar player={player} small/><span className="ranking-name"><strong><PlayerName name={player.name}/>{player.name === selfName() && <small>JIJ</small>}</strong><small>{player.played} wedstrijden</small></span><strong className="ranking-points">{period === "Gemiddelde" ? player.average.toFixed(1) : period === "Overwinningen" ? player.wins : <RatingValue player={player} interactive={false}/>}</strong></button>)}</div><div className="ranking-footer"><Sparkles size={13}/>{period === "Gemiddelde" ? "Gerangschikt op gemiddelde per 3 darts" : period === "Overwinningen" ? "Gerangschikt op gewonnen wedstrijden" : "Gerangschikt op de huidige DP-rating"}</div></section>;
}

export function ProfileView({ name:identifier, roomName = "", gameId = "" }: { name: string; roomName?: string; gameId?: string }) {
  const platform=usePlatform();
  const player = playerByName(identifier),name=player.name;
  const recent=platform.players.find(p=>p.id===player.id)?.form??[];
  const rating = useRatingProfile(name);
  const percentage = player.played > 0 ? Math.round(player.wins / player.played * 100) : 0;
  return <div className="profile-view"><div className="profile-cover"><div className="profile-cover-orbit"/><span>DARTSPOINT PLAYER CLUB</span></div><div className="profile-identity"><Avatar player={player}/><div><h2><PlayerName name={player.name}/></h2><p>{player.country} <span>·</span> Lid sinds {new Date(platform.players.find(p=>p.name===name)?.joinedAt??Date.now()).getFullYear()}</p></div><span className="profile-rating"><Target size={14}/><RatingValue player={player}/><small>rankingpunten</small></span></div><div className="profile-stats-grid"><div><span>Wedstrijden</span><strong>{player.played}</strong><small>{player.wins} gewonnen</small></div><div><span>Gemiddelde</span><strong>{player.average.toFixed(1)}</strong><small>Per 3 darts</small></div><div><span>180’s</span><strong>{player.oneEighties}</strong><small>Maximums gescoord</small></div><div><span>Winpercentage</span><strong>{percentage}<em>%</em></strong><small>Over alle wedstrijden</small></div></div><div className="profile-section-title"><h3>Vorm van het moment</h3><span>Laatste 5 wedstrijden</span></div><div className="profile-form">{recent.map((result:any,i:number) => <div key={i} className={result.won ? "form-win" : "form-loss"}>{result.won ? "W" : "V"}<small>{result.legs.join("–")}</small></div>)}</div>{player.played === 0 && <p className="profile-unplayed">Je rating blijft wit tijdens de plaatsingsfase: 10 ranked wedstrijden tegen minimaal 5 verschillende tegenstanders.</p>}<div className="profile-badges">{player.oneEighties >= 10 && <span><Target size={18}/>Triple threat<small>10× een 180</small></span>}{player.wins >= 50 && <span><Trophy size={18}/>Winner’s circle<small>50 overwinningen</small></span>}<span><Users size={18}/>Club member<small>Thuis in de kamer</small></span></div>{rating.provisional && <p className="profile-unplayed">Plaatsing: {Math.min(rating.rankedPlayed, 10)}/10 wedstrijden · {Math.min(rating.opponents.length, 5)}/5 tegenstanders</p>}<PlayerSocialActions userId={player.id} name={name} room={roomName}/></div>;
}
