"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";

import {playerStatusLabel} from "../../../packages/i18n/src/player-status";
import {fixedCopyText,FixedCopy} from "@/components/fixed-copy";
import {renderSystemEvent} from "../../../packages/i18n/src/system-events";
import {localiseStaticCopy} from "../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {RoomBadge,RoomMetadataFilters,matchesRoomMetadata,EMPTY_ROOM_FILTER} from "./room-metadata";
import {ChatBadge} from "./chat-badge";
import {selfName,getPlatform,usePlatform} from "@/lib/platform-client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUpDown, ArrowUpRight, Check, ChevronRight, Clock3, Crown, Eye, Flag, Gamepad2, Medal, MessageCircle, Search, Send, ShieldCheck, Smile, Sparkles, Target, Trophy, UserPlus, Users, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
 const {formatLocale:dpFormatLocale}=useI18n();

 const {t:dpT,locale}=useI18n("community");

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
  return <section className={`players-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} data-variant={variant} aria-label={dpT("community.spelers_in_de_kamer")}>
    <SectionHeading title={compact ? dpT("community.spelers") : dpT("community.spelers_in_de_kamer")} right={<span className="community-count"><span className="online-dot"/>{operations.rooms.find(room => room.name === roomName)?.count ?? visible.length} {dpT("community.online")}</span>}/>
    <div className="players-toolbar"><label className="community-search"><Search size={14}/><Input placeholder={dpT("community.zoek_speler")} aria-label={dpT("community.zoek_een_speler")} value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label={dpT("community.filter_spelers")} value={filter} onChange={e => setFilter(e.target.value)}><option value="Alle spelers">{dpT("community.alle_spelers")}</option><option value="Beschikbaar">{dpT("community.beschikbaar")}</option><option value="Speelt">{dpT("community.speelt")}</option><option value="Kijkt mee">{dpT("community.kijkt_mee")}</option></select></div>
    <Table className="players-table"><TableHeader><TableRow><TableHead><button onClick={() => setSorting("name")}>{dpT("community.speler")} <ArrowUpDown size={11}/></button></TableHead><TableHead className="numeric"><button onClick={() => setSorting("rating")}>{dpT("community.dp")} <ArrowDown size={11} className={sort === "rating" && !descending ? "sort-reversed" : ""}/></button></TableHead><TableHead className="numeric score-column">{dpT("community.score")}</TableHead><TableHead className="numeric average-column">{dpT("community.gem")}</TableHead><TableHead className="status-column">{dpT("community.status")}</TableHead><TableHead className="action-column"><span className="sr-only">{dpT("community.actie")}</span></TableHead></TableRow></TableHeader>
      <TableBody>{visible.map(p => <TableRow key={p.id??p.name} className={p.name === selfName() ? "self-player" : ""}>
        <TableCell><PlayerActionMenu userId={p.id} name={p.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onSpectate={p.status === "Speelt" ? onSpectate : undefined} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="player-identity"><Avatar player={p} small/><span className="player-name"><PlayerName name={p.name}/>{p.name === selfName() && <small>{dpT("community.jij")}</small>}{social.isMuted(p.name) && <VolumeX size={11} aria-label={dpT("community.gedempt")}/>}</span></PlayerActionMenu></TableCell>
        <TableCell className="numeric rating-value"><RatingValue player={p}/></TableCell><TableCell className={`numeric player-score score-column ${p.status === "Speelt" ? "active-score" : ""}`}>{score(p)}</TableCell><TableCell className="numeric average-column">{new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(p.average)}</TableCell>
        <TableCell className="status-column"><span className={`player-status ${p.status === "Speelt" ? "is-playing" : p.status === "Beschikbaar" ? "is-available" : "is-watching"}`}><span/>{playerStatusLabel(p.status,locale)}</span></TableCell>
        <TableCell className="action-column"><div className="player-actions">{p.name === selfName() ? <span className="self-check" title={dpT("community.dit_ben_jij")}><Check size={14}/></span> : <>{!compact && onMessage && <Button className="player-action player-message" variant="ghost" size="icon-sm" title={dpT("community.privechat_met",{name:p.name})} aria-label={dpT("community.privechat_met",{name:p.name})} disabled={social.isBlocked(p.name)} onClick={() => onMessage(p.id??p.name)}><MessageCircle size={16}/></Button>}{p.status === "Speelt" ? <Button className="player-action" variant="ghost" size="icon-sm" title={dpT("community.kijk_mee_bij",{name:p.name})} aria-label={dpT("community.kijk_mee_bij",{name:p.name})} onClick={() => onSpectate(p.id??p.name)}><Eye size={16}/></Button> : <Button className="player-action" variant="ghost" size="icon-sm" title={invitationReason(p.name)||dpT("community.nodig_uit_voor_een_wedstrijd",{name:p.name})} aria-label={invitationReason(p.name)||dpT("community.nodig_uit_voor_een_wedstrijd",{name:p.name})} disabled={social.isBlocked(p.name)||!!invitationReason(p.name)} onClick={() => onInvite(p.id??p.name)}><UserPlus size={16}/></Button>}</>}</div></TableCell>
      </TableRow>)}</TableBody></Table>
    {visible.length === 0 && <div className="community-empty"><Search size={22}/><p>{dpT("community.geen_spelers_gevonden")}</p><button onClick={() => { setQuery(""); setFilter("Alle spelers"); }}>{dpT("community.wis_je_filters")}</button></div>}
    <div className="players-footer"><span>{visible.length} {visible.length === 1 ? dpT("community.speler_2") : dpT("community.spelers_2")}</span><div className="rating-legend" aria-label={dpT("community.rating_wit_plaatsingsfase_rood_onder_1450_geel_1450")}><span><i className="rating-white"/> {dpT("community.plaatsing")}</span><span><i className="rating-red"/> &lt;1450</span><span><i className="rating-amber"/> 1450–1549</span><span><i className="rating-green"/> ≥1550</span></div></div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label={dpT("community.melding_sluiten")} onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

type MessageRowProps={message:ChatMessage;authorName:string;authorRole:DartsPlayer['role'];authorInitials:string;own:boolean;roomId?:string;roomName:string;channelId?:string;gameId:string;onInvite?:PlayerAction;onProfile?:PlayerAction;onMessage?:PlayerAction;onSpectate?:PlayerAction;onToast:(text:string)=>void;onEdit:(text:string)=>void;channelKey:string};
/** Existing history stays mounted when only a draft or one pending message changes. */
const ChatMessageRow=memo(function ChatMessageRow({message,authorName,authorRole,authorInitials,own,roomId,roomName,channelId,gameId,onInvite,onProfile,onMessage,onSpectate,onToast,onEdit,channelKey}:MessageRowProps){
 const {t:dpT,locale}=useI18n("community");

 const menu={userId:message.senderId,name:authorName,roomId,roomName,channelId,messageId:message.messageId,gameId,onInvite,onProfile,onMessage,onSpectate,onToast};
 return <div data-message-seq={message.id} data-client-message-id={message.clientMessageId} data-send-status={message.status??'sent'} className={`chat-message ${own?'own-message':''}`}><PlayerActionMenu {...menu} className="chat-avatar-menu"><Avatar player={{role:authorRole,initials:authorInitials}} small/></PlayerActionMenu><div><div className="chat-message-meta"><PlayerActionMenu {...menu} className="chat-name-menu"><PlayerName name={authorName}/></PlayerActionMenu><time>{message.time}</time></div><p>{message.text}</p>{message.status==='pending'&&<small className="chat-send-status" role="status">{dpT("community.wordt_verzonden")}</small>}{message.status==='failed'&&<div className="chat-send-failed" role="alert"><span>{dpT("community.niet_verzonden")} {message.error}</span><button type="button" onClick={()=>{void retryChatMessage(channelKey,message).catch(()=>{});}}>{dpT("community.opnieuw_proberen")}</button><button type="button" onClick={()=>onEdit(message.text)}>{dpT("community.tekst_aanpassen")}</button></div>}</div></div>;
});

export function ChatPanel({ roomId, roomName = "", gameId = "", opponentName = "", className = "", compact = false, embedded = false, lobby = false, quiet = false, readEnabled = true, activeTab, onTabChange, onClosePrivateTab, onInvite, onProfile, onMessage, onSpectate }: {
  roomId?:string; roomName?: string; gameId?: string; opponentName?: string; className?: string; compact?: boolean; embedded?: boolean; lobby?: boolean; quiet?: boolean; readEnabled?:boolean;
  activeTab?: string; onTabChange?: (tab: string) => void; onClosePrivateTab?: (name: string, nextTab: string) => void; privatePlayers?: string[];
  onInvite?:PlayerAction;onProfile?:PlayerAction;onMessage?:PlayerAction;onSpectate?:PlayerAction;
}) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const {t:dpT,locale}=useI18n("community");

  const [localTab, setLocalTab] = useState(lobby ? "" : "room");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [presetsOpen,setPresetsOpen]=useState(false),[newBelow,setNewBelow]=useState(0);
  const [joinNotice,setJoinNotice]=useState<{key:string;message:ChatMessage}|null>(null),[joinTick,setJoinTick]=useState(0);
  const pendingJoin=useRef<string|null>(null),seenJoins=useRef(new Set<string>()),joinTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const draftInput=useRef<HTMLInputElement>(null),presetFocus=useRef(false),forceBottom=useRef(false),historyBoundary=useRef(0),historyBoundaries=useRef(new Map<string,number>()),scrollActor=useRef<string|undefined>(undefined);
  const [playerTools, setPlayerTools] = useState(false);
  const [privacyFeedback, setPrivacyFeedback] = useState("");
  const actions=useRef({onInvite,onProfile,onMessage,onSpectate});actions.current={onInvite,onProfile,onMessage,onSpectate};
  const rowActions=useMemo(()=>({onInvite:(id:string)=>actions.current.onInvite?.(id),onProfile:(id:string)=>actions.current.onProfile?.(id),onMessage:(id:string)=>actions.current.onMessage?.(id),onSpectate:(id:string)=>actions.current.onSpectate?.(id)}),[]);
  const social = useDartsSocial();
  const adminRooms = useAdminOperations().rooms;
  const preferences = useDartsPreferences();
  const scroll = useRef<HTMLDivElement>(null);
  const panelRoot=useRef<HTMLElement>(null),atBottom=useRef(true),previousKey=useRef(""),previousQuiet=useRef(quiet),quietPinHold=useRef<{key:string;top:number}|null>(null),sendGuard=useRef({key:'',at:0});
  const [visibilityTick,setVisibilityTick]=useState(0);
  const tabList = useRef<HTMLDivElement>(null);
  const emptyState = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const chatReady = useChatHydrated();
  const platform=usePlatform();
  const slowModeSeconds=Number(platform.settings?.platform?.chatSlowMode);
  const openPrivateNames = useOpenPrivateChatTabs();
  const privateNames = openPrivateNames.filter(id => !social.isBlocked(platform.channels.find(c=>c.id===id)?.userId??''));
  const requestedTab = activeTab ?? localTab;
  const hasMatch=/^[a-f0-9-]{36}$/i.test(gameId);
  const tab = resolveChatTab(!hasMatch&&requestedTab==="match"?"room":requestedTab, privateNames, lobby);
  const unreadFor=(kind:string,target:string)=>platform.chatChannels?.find(c=>c.kind===kind&&(kind==="private"?c.id===target:kind==="community"?c.name===target:c.matchId===target))?.unread??0;
  const messagePlayer=(message:{senderId?:string;name:string})=>platform.players.find(p=>p.id===message.senderId)??{...playerByName(message.senderId??''),name:message.name,initials:message.name.slice(0,2).toUpperCase()};
  const systemText=(event:ChatMessage)=>renderSystemEvent(event.systemEvent,locale,event.text);
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
  const visible = unblockedMessages.filter(message => !message.system&&(!quiet || message.senderId === platform.actor?.id || message.id <= quietBoundary));
  const visibleCursor=visible.reduce((cursor,message)=>Math.max(cursor,message.id),0);
  const roomChannelId=platform.chatChannels?.find(channel=>channel.kind==='community'&&(roomId?channel.roomId===roomId:channel.name===roomName))?.id;
  useEffect(()=>{
   pendingJoin.current=null;seenJoins.current.clear();setJoinNotice(null);clearTimeout(joinTimer.current);
   if(!channelKey.startsWith('room:')||!roomChannelId)return;
   const joined=(event:Event)=>{const detail=(event as CustomEvent).detail;
    if(detail?.channelId!==roomChannelId||detail.redacted||(detail.kind??detail.message?.kind)!=='room.member_joined'||typeof detail.messageId!=='string'||seenJoins.current.has(detail.messageId))return;
    seenJoins.current.add(detail.messageId);if(seenJoins.current.size>32)seenJoins.current.delete(seenJoins.current.values().next().value!);
    clearTimeout(joinTimer.current);setJoinNotice(null);
    pendingJoin.current=detail.messageId;setJoinTick(value=>value+1);
   };
   window.addEventListener('dartspoint:chat-changed',joined);return()=>{window.removeEventListener('dartspoint:chat-changed',joined);clearTimeout(joinTimer.current);};
  },[channelKey,roomChannelId,platform.actor?.id]);
  useEffect(()=>{
   const message=current.find(value=>value.system&&value.messageId===pendingJoin.current);if(!message)return;
   pendingJoin.current=null;clearTimeout(joinTimer.current);setJoinNotice({key:channelKey,message});joinTimer.current=setTimeout(()=>setJoinNotice(null),2000);
  },[current,joinTick,channelKey]);
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
    setLocalTab(allowed); onTabChange?.(allowed); setEmojiOpen(false);setPresetsOpen(false); setPlayerTools(false); setPrivacyFeedback("");
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
  useLayoutEffect(() => {
    if(scrollActor.current!==platform.actor?.id){scrollActor.current=platform.actor?.id;historyBoundaries.current.clear();previousKey.current='';quietPinHold.current=null;}
    const changed=previousKey.current!==channelKey;previousKey.current=channelKey;
    // Revealing quiet-turn rows retains the viewport the player was reading.
    // Selecting the channel again, sending or opening new messages resumes pinning.
    if(!changed&&previousQuiet.current&&!quiet)quietPinHold.current={key:channelKey,top:scroll.current?.scrollTop??0};
    previousQuiet.current=quiet;
    if(changed){quietPinHold.current=null;const saved=getChatScroll(channelKey);atBottom.current=saved.bottom;historyBoundary.current=historyBoundaries.current.get(channelKey)??visibleCursor;forceBottom.current=false;if(!saved.bottom)scroll.current?.scrollTo({top:saved.top,behavior:'instant'});}
    if(forceBottom.current){atBottom.current=true;forceBottom.current=false;quietPinHold.current=null;}
    if(atBottom.current&&!quietPinHold.current)scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});
    if(atBottom.current&&!quietPinHold.current)historyBoundary.current=visibleCursor;
    historyBoundaries.current.set(channelKey,historyBoundary.current);
    setNewBelow(atBottom.current&&!quietPinHold.current?0:visible.filter(message=>message.id>historyBoundary.current&&message.senderId!==platform.actor?.id).length);
    if(scroll.current)saveChatScroll(channelKey,{top:scroll.current.scrollTop,bottom:atBottom.current});
  },[current,channelKey,quiet,visibleCursor,visible.length,platform.actor?.id,releasedCount,privacyFeedback,slowModeSeconds]);
  useEffect(()=>{const container=scroll.current;if(!container)return;const observer=new ResizeObserver(()=>{if(atBottom.current&&!quietPinHold.current)container.scrollTop=container.scrollHeight;setVisibilityTick(value=>value+1);});observer.observe(container);return()=>observer.disconnect();},[channelKey]);
  function showLatest(){quietPinHold.current=null;atBottom.current=true;historyBoundary.current=visibleCursor;historyBoundaries.current.set(channelKey,visibleCursor);setNewBelow(0);scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});setVisibilityTick(value=>value+1);}
  async function send(text = draft) {
    if (!channelKey || !text.trim() || blocked || (!privateName && (isRoomMuted(selfName(), roomName) || isRoomRemoved(selfName(), roomName)))) return;
    const concept=channelKey+'\u0000'+text.trim(),now=performance.now();if(sendGuard.current.key===concept&&now-sendGuard.current.at<250)return;sendGuard.current={key:concept,at:now};
    const time = new Date().toLocaleTimeString(dpFormatLocale, { hour: "2-digit", minute: "2-digit" });
    forceBottom.current=true;setEmojiOpen(false);setPresetsOpen(false);setPrivacyFeedback('');
    try { await appendChatMessage(channelKey, { id: 0, name: selfName(), text: text.trim().slice(0, 500), time }); } catch(e) { setPrivacyFeedback(e instanceof Error ? e.message : "Je bericht is niet verstuurd. Probeer het opnieuw; je tekst staat er nog."); }
  }
  async function tryNewPrivateChat(){const name=getDartsSocial().friends.find(name=>!getDartsSocial().blocked.includes(name));if(!name){setPrivacyFeedback("Kies een speler in de kamer of je vriendenlijst om een gesprek te openen.");return;}const channelId=await openPrivateChatTab(name);if(channelId)selectTab("private:"+channelId);}
  return <section ref={panelRoot} className={`chat-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""} ${className}`}>
    <div className="chat-top"><MessageCircle size={16}/><span>{lobby ? dpT("community.berichten") : roomName}</span>{!lobby && <span className="chat-online"><span className="online-dot"/>{adminRooms.find(room => room.name === roomName)?.count ?? 0}</span>}</div>
    {(!lobby || privateNames.length > 0) && <Tabs className="chat-tab-container" value={tab} onValueChange={selectTab}><TabsList ref={tabList} className="chat-tabs" aria-label={lobby ? dpT("community.privegesprekken") : dpT("community.chatgesprek")}>{!lobby && <>{hasMatch&&<TabsTrigger data-chat-tab="match" value="match">{dpT("community.spelchat")}<ChatBadge count={unreadFor("match",gameId)}/></TabsTrigger>}<TabsTrigger data-chat-tab="room" value="room">{dpT("community.kamerchat")}<ChatBadge count={unreadFor("community",roomName)}/></TabsTrigger></>}{privateNames.map(id => {const contact=platform.channels.find(c=>c.id===id),name=contact?.name??'Speler';return <div className={`chat-private-tab-wrap ${tab === `private:${id}` ? "is-active" : ""}`} key={id}><TabsTrigger className="chat-private-tab" data-chat-tab={`private:${id}`} value={`private:${id}`} onKeyDown={event => { if (event.key === "Delete") { event.preventDefault(); closePrivate(id); } }}><Avatar player={playerByName(contact?.userId??name)} small/><PlayerName name={name}/><ChatBadge count={unreadFor("private",id)}/></TabsTrigger><button type="button" className="chat-tab-close" aria-label={dpT("community.privegesprek_met_sluiten",{name:name})} title={dpT("community.gesprek_sluiten")} onClick={() => closePrivate(id)}><X size={13}/></button></div>;})}</TabsList></Tabs>}
    {!tab ? <div ref={emptyState} tabIndex={-1} className="chat-empty-state" role="region" aria-label={dpT("community.geen_privegesprek_geopend")}><span><MessageCircle size={25}/></span><h3>{dpT("community.je_gesprekken_beginnen_hier")}</h3><p>{dpT("community.open_een_privegesprek_via_je_vrienden_of_berichten")}</p></div> : <>
    {quiet && <div className="chat-quiet-note"><Target size={12}/>{deferredCount ? dpT("community.na_je_beurt",{deferredCount}) : dpT("community.rustige_beurt_nieuwe_berichten_blijven_bewaard")}</div>}{!quiet && releasedCount > 0 && <div className="chat-quiet-note" role="status"><MessageCircle size={12}/>{releasedCount} {releasedCount === 1 ? dpT("community.bewaard_bericht_staat") : dpT("community.bewaarde_berichten_staan")} {dpT("community.voor_je_klaar")}</div>}
    {privateName && <div className="chat-person-tools"><span>{blocked ? dpT("community.geblokkeerd_gesprek") : muted ? dpT("community.gedempt_gesprek") : dpT("community.privegesprek")}</span><PlayerActionMenu userId={contact?.userId} name={privateName} channelId={chatChannelId(channelKey)} onProfile={onProfile} onInvite={onInvite} onMessage={onMessage} onToast={setPrivacyFeedback} className="chat-contact-menu"><PlayerName name={privateName}/></PlayerActionMenu></div>}
    <div className="chat-messages" ref={scroll} onScroll={()=>{const el=scroll.current;if(el){const hold=quietPinHold.current;if(!hold||hold.key!==channelKey||Math.abs(el.scrollTop-hold.top)>1){quietPinHold.current=null;const wasBottom=atBottom.current;atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<24;if(wasBottom&&!atBottom.current)historyBoundary.current=visibleCursor;if(atBottom.current){historyBoundary.current=visibleCursor;setNewBelow(0);}}historyBoundaries.current.set(channelKey,historyBoundary.current);saveChatScroll(channelKey,{top:el.scrollTop,bottom:atBottom.current});setVisibilityTick(n=>n+1);}}} role="log" aria-live={quiet ? "off" : "polite"} aria-label={privateName ? dpT("community.priveberichten_met",{privateName:privateName}) : tab === "room" ? dpT("community.kamerberichten") : dpT("community.spelberichten")}>
      <span className="chat-date">{dpT("community.vandaag")}</span>{visible.map(message => <ChatMessageRow key={message.clientMessageId??message.messageId??`${channelKey}:${message.id}`} message={message} authorName={messagePlayer(message).name} authorRole={messagePlayer(message).role} authorInitials={messagePlayer(message).initials} own={message.senderId===platform.actor?.id} roomId={privateName?undefined:roomId} roomName={privateName?'':roomName} channelId={chatChannelId(channelKey)} gameId={tab==='match'?gameId:''} onInvite={onInvite?rowActions.onInvite:undefined} onProfile={onProfile?rowActions.onProfile:undefined} onMessage={onMessage?rowActions.onMessage:undefined} onSpectate={onSpectate?rowActions.onSpectate:undefined} onToast={setPrivacyFeedback} onEdit={setDraft} channelKey={channelKey}/>)}
      {!privateName && social.moderation.filter(entry => entry.room === roomName).slice(-3).map(entry => <div className="chat-system" key={entry.id}><ShieldCheck size={13}/>{entry.name}: {entry.kind === "warn" ? dpT("community.waarschuwing") : entry.kind === "mute" ? dpT("community.tijdelijke_mute") : dpT("community.uit_de_kamer_verwijderd")} · {entry.reason}</div>)}
      {blocked && <p className="chat-system">{dpT("community.berichten_van")} {privateName} {dpT("community.zijn_verborgen_deblokkeer_deze_speler_om_het_gesprek")}</p>}{muted && !blocked && <p className="chat-system"><VolumeX size={13}/>{dpT("community.je_hebt")} {privateName} {dpT("community.gedempt_klik_bovenaan_op_de_naam_om_berichten")}</p>}
    </div>
    <div className="chat-compose-wrap"><div className="chat-composer-notices">
      {newBelow>0&&<button type="button" className="chat-new-messages" onClick={showLatest}><ArrowDown size={13}/>{newBelow} {newBelow===1?dpT("community.nieuw_bericht"):dpT("community.nieuwe_berichten")}</button>}
      {joinNotice?.key===channelKey&&<div key={joinNotice.message.messageId} className="chat-join-notice" role="status" aria-live="polite"><Users size={13}/><span>{systemText(joinNotice.message)}</span></div>}
      </div>{emojiOpen && <div className="chat-emoji-picker" aria-label={dpT("community.kies_een_emoji")}>{["🎯", "👏", "🔥", "👋", "😂", "🏆", "💪", "🍻"].map(emoji => <button key={emoji} aria-label={dpT("community.voeg_toe",{emoji:emoji})} onClick={() => { setDraft(draft + emoji); setEmojiOpen(false);draftInput.current?.focus(); }}>{emoji}</button>)}</div>}
      <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}><Button variant="ghost" size="icon-sm" type="button" className="emoji-button" disabled={blocked} aria-label={dpT("community.emoji_kiezen")} aria-expanded={emojiOpen} onClick={() => {setPresetsOpen(false);setEmojiOpen(value => !value);}}><Smile size={18}/></Button>
       <DropdownMenu modal={false} open={presetsOpen} onOpenChange={open=>{setPresetsOpen(open);if(open)setEmojiOpen(false);}}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" type="button" className="preset-button" disabled={blocked} aria-label={dpT("community.snelle_chattekst_kiezen")}><MessageCircle size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent data-sheet-nested-menu="" className="chat-presets-menu" side="top" align="start" sideOffset={8} aria-label={dpT("community.snelle_chatzinnen")} onEscapeKeyDown={event=>{event.preventDefault();setPresetsOpen(false);}} onCloseAutoFocus={event=>{if(presetFocus.current){event.preventDefault();presetFocus.current=false;draftInput.current?.focus();}}}>{["Succes! 🎯", "Mooie finish! 👏", "Goed gespeeld!", "Revanche?"].map(text=><DropdownMenuItem key={text} onSelect={()=>{presetFocus.current=true;void send(fixedCopyText(text,locale));}}><FixedCopy value={text}/></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
       <Input ref={draftInput} value={draft} disabled={blocked} onChange={e => setDraft(e.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!event.repeat&&!event.nativeEvent.isComposing&&!event.shiftKey)void send();}}} placeholder={blocked ? dpT("community.deze_speler_is_geblokkeerd") : privateName ? dpT("community.bericht_aan",{privateName:privateName}) : tab === "room" ? dpT("community.praat_mee_in_de_kamer") : dpT("community.bericht_in_het_spel")} aria-label={privateName ? dpT("community.privebericht_aan",{privateName:privateName}) : dpT("community.chatbericht")} maxLength={500}/><Button type="submit" size="icon-sm" className="chat-send" disabled={!draft.trim() || blocked} aria-label={dpT("community.verstuur_bericht")}><Send size={17}/></Button></form>
      {slowModeSeconds>0&&<p className="chat-footnote chat-slow-mode" role="status" style={{display:'block',opacity:1}}>{dpT("community.langzame_chat_actief_maximaal_een_nieuw_bericht_per")} {slowModeSeconds} {slowModeSeconds===1?dpT("community.seconde"):dpT("community.seconden")}.</p>}
      <p className="chat-footnote">{dpT("community.speel_sportief_houd_het_gezellig_voor_iedereen")}</p>
      {lobby && <div className="chat-privacy-preview"><span>{dpT("community.nieuwe_chats")} {preferences.privateMessages === "everyone" ? dpT("community.iedereen") : preferences.privateMessages === "friends" ? dpT("community.alleen_vrienden") : dpT("community.niemand")}</span><button type="button" onClick={tryNewPrivateChat}>{dpT("community.nieuw_gesprek")}</button></div>}
      {privacyFeedback && <p className="chat-privacy-feedback" role="status">{privacyFeedback}</p>}
    </div>
    </>}
  </section>;
}

export function RoomList({ currentRoom, onSelect }: { currentRoom: string; onSelect: (room: string) => void }) {
 const {t:dpT,locale}=useI18n("community");

  const [query, setQuery] = useState("");
  const [metadataFilter,setMetadataFilter]=useState(EMPTY_ROOM_FILTER);
  const events = useTournaments().tournaments.filter(event => event.published && !["draft", "cancelled", "completed"].includes(event.status) && `${event.name} ${event.settings.room}`.toLowerCase().includes(query.toLowerCase()));
  const operations = useAdminOperations();
  const categoryLabels = { social: dpT("community.copy_sociaal"), ranked: dpT("community.copy_competitief"), beginners: dpT("community.copy_ontspannen"), tournament: dpT("community.copy_toernooi") };
  const categorySymbols = { social: "🎯", ranked: "⚡", beginners: "✨", tournament: "🏆" };
  const visible = operations.rooms.filter(room=>matchesRoomMetadata(room,metadataFilter)).filter(room => `${room.name} ${categoryLabels[room.category]}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="room-list-panel" aria-label={dpT("community.alle_kamers")}>
    <label className="community-search room-list-search"><Search size={16}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={dpT("community.zoek_een_kamer")} aria-label={dpT("community.zoek_een_kamer_2")}/></label>
    <RoomMetadataFilters rooms={operations.rooms} value={metadataFilter} onChange={setMetadataFilter}/>
    <div className="room-list">{visible.map(room => <button type="button" key={room.id} className={`room-list-row ${currentRoom === room.name ? "is-current" : ""}`} disabled={room.category !== "tournament" && (room.status === "closed" || room.count >= room.capacity)} aria-current={currentRoom === room.name ? "true" : undefined} onClick={() => onSelect(room.id)}>
      <span className="room-list-emoji" aria-hidden="true">{room.region?<RoomBadge room={{region:room.region}}/>:categorySymbols[room.category]}</span><span className="room-list-name"><strong>{room.name} <RoomBadge room={{primaryLanguage:room.primaryLanguage}}/></strong><small>{room.category === "tournament" ? dpT("community.dartspoint_events_toeschouwers_welkom") : room.status === "closed" ? dpT("community.gesloten_voor_nieuwe_spelers") : currentRoom === room.name ? dpT("community.je_bent_hier") : room.count >= room.capacity ? dpT("community.kamer_vol") : room.status === "private" ? dpT("community.privekamer_eigenaarstoegang") : categoryLabels[room.category]}</small></span><span className="room-list-count"><Users size={14}/><strong>{room.count}</strong><span>/ {room.capacity}</span></span>{currentRoom === room.name ? <Check size={17}/> : <ChevronRight size={17}/>}</button>)}</div>
    {events.length > 0 && <div className="room-list"><h4 className="room-event-heading">{dpT("community.dartspoint_toernooikamers")}</h4>{events.map(event => <a key={event.id} className="room-list-row" href={`/toernooi/${encodeURIComponent(event.id)}`}><span className="room-list-emoji"><Trophy size={22}/></span><span className="room-list-name"><strong>{event.name}</strong><small>{event.settings.room} {dpT("community.toeschouwers_welkom")}</small></span><span className="room-list-count"><Users size={14}/><strong>{event.participants.filter(player => ["confirmed", "checkedin"].includes(player.status)).length}</strong><span>/ {event.settings.maxPlayers}</span></span><ChevronRight size={17}/></a>)}</div>}
    {visible.length === 0 && events.length === 0 && <div className="community-empty"><Search size={22}/><p>{dpT("community.geen_kamers_gevonden")}</p><button onClick={() => {setQuery("");setMetadataFilter(EMPTY_ROOM_FILTER);}}>{dpT("community.wis_je_zoekopdracht")}</button></div>}
  </section>;
}

export function RoomGrid({ currentRoom, onSelect }: { currentRoom: string; onSelect: (room: string) => void }) {
 const {t:dpT,locale}=useI18n("community");

  const [filter, setFilter] = useState("Alle kamers");
  const visible = rooms.filter(room => filter === "Alle kamers" || (filter === "Plek beschikbaar" && room.count < 50) || (filter === "Competitief" && ["Competitief", "Toernooi"].includes(room.category)));
  return <section className="rooms-panel"><SectionHeading eyebrow={dpT("community.vind_jouw_mensen")} title={dpT("community.een_kamer_nog_een_potje")} right={<span className="community-count">{getPlatform().rooms.reduce((sum,r)=>sum+r.count,0)} {dpT("community.online")}</span>}/><div className="community-filter-pills">{["Alle kamers", "Plek beschikbaar", "Competitief"].map(value => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}><FixedCopy value={value}/></button>)}</div><div className="room-grid">{visible.map(room => <motion.button whileHover={{ y: -3 }} whileTap={{ scale: .99 }} key={room.name} disabled={room.count >= 50} className={`room-card ${currentRoom === room.name ? "is-current" : ""}`} onClick={() => onSelect(room.id)}><div className="room-card-top"><span className="room-emoji">{room.emoji}</span><span className="room-category">{room.category}</span></div><h3>{room.name}</h3><p>{room.subtitle}</p><div className="room-occupancy"><span><Users size={13}/><strong>{room.count}</strong> / 50</span><span>{room.matches} {room.matches === 1 ? dpT("community.wedstrijd") : dpT("community.wedstrijden")}</span></div><div className="room-capacity"><span style={{ width: `${room.count * 2}%` }}/></div><div className="room-join">{currentRoom === room.name ? <><span className="online-dot"/> {dpT("community.je_bent_hier")}</> : room.count >= 50 ? dpT("community.kamer_vol") : <>{dpT("community.kamer_binnen")} <ArrowUpRight size={15}/></>}</div></motion.button>)}</div></section>;
}

export function FriendsPanel({ onInvite, onProfile, onMessage, onSpectate, roomName = "", gameId = "", compact = false, embedded = false }: { onInvite: PlayerAction; onProfile: PlayerAction; onMessage?: PlayerAction; onSpectate?: PlayerAction; roomName?: string; gameId?: string; compact?: boolean; embedded?: boolean }) {
 const dpFeedback=useI18n("feedback").t;

 const {t:dpT,locale}=useI18n("community");

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
  return <section className={`friends-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} aria-label={dpT("community.vrienden")}>
    <SectionHeading title={dpT("community.vrienden")} right={<span className="community-count"><span className="online-dot"/>{friends.filter(friend => getPlayerPresence(friend.name).online).length}</span>}/>
    <div className="friends-tabs" role="tablist" aria-label={dpT("community.vriendschappen")}><button type="button" role="tab" aria-selected={tab === "friends"} className={tab === "friends" ? "is-active" : ""} onClick={() => setTab("friends")}>{dpT("community.vrienden")} <span>{friends.length}</span></button><button type="button" role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "is-active" : ""} onClick={() => setTab("requests")}>{dpT("community.verzoeken")}{requests.length > 0 && <span className={incoming.length ? "has-incoming" : ""}>{requests.length}</span>}</button></div>
    {tab === "friends" && <label className="community-search friends-search"><Search size={13}/><Input placeholder={dpT("community.zoek_vriend")} aria-label={dpT("community.zoek_een_vriend")} value={query} onChange={event => setQuery(event.target.value)}/></label>}
    <div className="friends-scroll" role="tabpanel" aria-label={tab === "friends" ? dpT("community.mijn_vrienden") : dpT("community.vriendschapsverzoeken")}>
      {tab === "friends" ? <div className="friends-list">{visible.map(friend => {
        const presence = getPlayerPresence(friend.name);
        return <div className={`friend-row ${presence.online ? "" : "friend-offline"}`} key={friend.id??friend.name}><PlayerActionMenu userId={friend.id} name={friend.name} roomName={roomName} gameId={gameId} onInvite={presence.online ? onInvite : undefined} onProfile={onProfile} onMessage={onMessage} onSpectate={presence.online && friend.status === "Speelt" ? onSpectate : undefined} onToast={setFeedback} className="friend-main"><span className="friend-avatar-wrap"><Avatar player={friend} small/><span className={presence.online ? "online-dot" : "offline-dot"}/></span><span><strong><PlayerName name={friend.name}/>{social.isMuted(friend.name) && <VolumeX size={11} aria-label={dpT("community.gedempt")}/>}</strong><small>{presence.online ? presence.status : dpT("community.offline")}</small></span></PlayerActionMenu>{onMessage && <Button className="friend-message" variant="ghost" size="icon-sm" onClick={() => onMessage(friend.id??friend.name)} aria-label={dpT("community.privechat_met",{name:friend.name})} title={dpT("community.privechat_met",{name:friend.name})}><MessageCircle size={15}/></Button>}</div>;
      })}{visible.length === 0 && <div className="community-empty"><Users size={20}/><p>{query ? dpT("community.geen_vrienden_gevonden") : dpT("community.nog_geen_vrienden")}</p><small>{query ? dpT("community.probeer_een_andere_naam") : dpT("community.klik_op_een_speler_om_een_vriendschapsverzoek_te")}</small>{query && <button type="button" onClick={() => setQuery("")}>{dpT("community.wis_zoekopdracht")}</button>}</div>}</div>
      : <div className="friend-requests">{requests.map(request => <div className="friend-request" key={request.id}><PlayerActionMenu userId={playerByName(request.name).id} name={request.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="friend-main"><Avatar player={playerByName(request.name)} small/><span><strong><PlayerName name={request.name}/></strong><small>{request.direction === "incoming" ? dpT("community.wil_vrienden_worden") : dpT("community.verzoek_verstuurd")}</small></span></PlayerActionMenu><div className="friend-request-actions">{request.direction === "incoming" ? <><button className="request-accept" type="button" onClick={() => resolveRequest(async () => await acceptFriendRequest(request.name), dpFeedback("feedback.value1_is_nu_je_vriend",{value1:request.name}))} aria-label={dpT("community.accepteer",{name:request.name})}><Check size={14}/><span>{dpT("community.accepteren")}</span></button><button type="button" onClick={() => resolveRequest(async () => await rejectFriendRequest(request.name), dpFeedback("feedback.verzoek_van_value1_afgewezen",{value1:request.name}))} aria-label={dpT("community.wijs_af",{name:request.name})}><X size={14}/></button></> : <><button type="button" onClick={() => resolveRequest(async () => await cancelFriendRequest(request.name), dpFeedback("feedback.verzoek_aan_value1_ingetrokken",{value1:request.name}))}>{dpT("community.intrekken")}</button><button type="button" className="request-demo" onClick={() => onProfile(playerByName(request.name).id??request.name)}>{dpT("community.profiel_bekijken")}</button></>}</div></div>)}{requests.length === 0 && <div className="community-empty"><UserPlus size={20}/><p>{dpT("community.geen_open_verzoeken")}</p><small>{dpT("community.vriendschapsverzoeken_verschijnen_hier")}</small></div>}</div>}
    </div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label={dpT("community.melding_sluiten")} onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

export function LiveMatches({onSpectate}:{onSpectate:PlayerAction}){
 const {t:dpT,locale}=useI18n("community");

 const p=usePlatform(),matches=p.matches.filter(m=>m.lifecycle==='playing');
 return <section className="live-panel community-panel"><SectionHeading title={dpT("community.nu_op_de_oche")} right={<span className="live-indicator"><i/>{dpT("community.live")}</span>}/><div className="live-match-list">{matches.map(match=><button className="live-match-card" key={match.id} onClick={()=>onSpectate(match.players[0].name)}><div className="live-match-meta"><span>{match.state.rules.startScore} {dpT("community.best_of")} {match.state.rules.bestOf}</span><span><Eye size={12}/>{dpT("community.meekijken")}</span></div>{match.players.slice().sort((a:any,b:any)=>a.seat-b.seat).map((player:any)=><div className="live-match-player" key={player.id}><PlayerName name={player.name}/><strong>{match.state.scores[player.seat]}</strong></div>)}<div className="live-match-bottom"><span>{match.state.legs.join(' – ')} {dpT("community.legs")}</span><span>{dpT("community.toeschouwen")} <ArrowUpRight size={13}/></span></div></button>)}{matches.length===0&&<div className="community-empty"><Eye/><p>{dpT("community.er_zijn_nu_geen_actieve_wedstrijden_in_deze")}</p></div>}</div></section>;
}

export function TournamentPanel({onToast}:{onToast:(text:string)=>void}){
 const {t:dpT,locale}=useI18n("community");

 const {tournaments}=useTournaments(),event=tournaments.find(t=>['registration','checkin','live'].includes(t.status));
 return <section className="tournament-panel community-panel"><div className="tournament-hero"><span className="tournament-icon"><Trophy size={28}/></span><span className="tournament-eyebrow">{dpT("community.officiele_toernooien")}</span><h3>{event?.name??dpT("community.de_volgende_avondcup")}</h3><p>{event?.description??dpT("community.de_volgende_avond_wordt_voorbereid")}</p><div className="tournament-tags">{event&&<><span><Users size={12}/>{event.participants.filter(p=>['confirmed','checkedin'].includes(p.status)).length}/{event.settings.maxPlayers}</span><span>{event.settings.startScore} {dpT("community.bo")}{event.settings.bestOf}</span></>}</div></div><div className="tournament-inner">{event?<a className="tournament-join" href={'/toernooi/'+event.id}>{dpT("community.deelnemers_inschrijven_en_speelschema")} <ArrowUpRight size={16}/></a>:<p className="tournament-help">{dpT("community.gepubliceerde_toernooien_verschijnen_hier")}</p>}</div></section>;
}

export function RankingPanel({ onProfile }: { onProfile: PlayerAction }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const {t:dpT,locale}=useI18n("community");

  const [period, setPeriod] = useState("DP");
  const liveRatings = useRatingProfiles(players.map(player => player.name));
  const ranked = players.map(player => ({ ...player, rating: liveRatings.find(rating => rating.name === player.name)?.rating ?? player.rating })).sort((a,b) => period === "Gemiddelde" ? b.average - a.average : period === "Overwinningen" ? b.wins - a.wins : b.rating - a.rating);
  return <section className="ranking-panel community-panel"><SectionHeading eyebrow={dpT("community.the_climb")} title={dpT("community.de_ladder")} right={<Trophy className="ranking-trophy" size={22}/>} /><div className="community-filter-pills">{["DP", "Gemiddelde", "Overwinningen"].map(p => <button key={p} className={period === p ? "is-active" : ""} onClick={() => setPeriod(p)}><FixedCopy value={p}/></button>)}</div><div className="ranking-columns"><span>{dpT("community.positie_speler")}</span><span>{period === "Gemiddelde" ? dpT("community.gemiddelde") : period === "Overwinningen" ? dpT("community.gewonnen") : dpT("community.rating")}</span></div><div className="ranking-list">{ranked.map((player,i) => <button key={player.name} className={`ranking-row ${player.name === selfName() ? "is-you" : ""}`} onClick={() => onProfile(player.name)}><span className={`ranking-position ${i < 3 ? "top-three" : ""}`}>{i === 0 ? <Crown size={16}/> : String(i+1).padStart(2,"0")}</span><Avatar player={player} small/><span className="ranking-name"><strong><PlayerName name={player.name}/>{player.name === selfName() && <small>{dpT("community.jij")}</small>}</strong><small>{player.played} {player.played === 1 ? dpT("community.wedstrijd") : dpT("community.wedstrijden")}</small></span><strong className="ranking-points">{period === "Gemiddelde" ? new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(player.average) : period === "Overwinningen" ? player.wins : <RatingValue player={player} interactive={false}/>}</strong></button>)}</div><div className="ranking-footer"><Sparkles size={13}/>{period === "Gemiddelde" ? dpT("community.gerangschikt_op_gemiddelde_per_3_darts") : period === "Overwinningen" ? dpT("community.gerangschikt_op_gewonnen_wedstrijden") : dpT("community.gerangschikt_op_de_huidige_dp_rating")}</div></section>;
}

export function ProfileView({ name:identifier, roomName = "", gameId = "" }: { name: string; roomName?: string; gameId?: string }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const {t:dpT,locale}=useI18n("community");

  const platform=usePlatform();
  const player = playerByName(identifier),name=player.name;
  const recent=platform.players.find(p=>p.id===player.id)?.form??[];
  const rating = useRatingProfile(name);
  const percentage = player.played > 0 ? Math.round(player.wins / player.played * 100) : 0;
  return <div className="profile-view"><div className="profile-cover"><div className="profile-cover-orbit"/><span>{dpT("community.dartspoint_player_club")}</span></div><div className="profile-identity"><Avatar player={player}/><div><h2><PlayerName name={player.name}/></h2><p>{player.country} <span>·</span> {dpT("community.lid_sinds")} {new Date(platform.players.find(p=>p.name===name)?.joinedAt??Date.now()).getFullYear()}</p></div><span className="profile-rating"><Target size={14}/><RatingValue player={player}/><small>{dpT("community.rankingpunten")}</small></span></div><div className="profile-stats-grid"><div><span>{dpT("community.wedstrijden_2")}</span><strong>{player.played}</strong><small>{player.wins} {dpT("community.gewonnen_2")}</small></div><div><span>{dpT("community.gemiddelde")}</span><strong>{new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(player.average)}</strong><small>{dpT("community.per_3_darts")}</small></div><div><span>180’s</span><strong>{player.oneEighties}</strong><small>{dpT("community.maximums_gescoord")}</small></div><div><span>{dpT("community.winpercentage")}</span><strong>{percentage}<em>%</em></strong><small>{dpT("community.over_alle_wedstrijden")}</small></div></div><div className="profile-section-title"><h3>{dpT("community.vorm_van_het_moment")}</h3><span>{dpT("community.laatste_5_wedstrijden")}</span></div><div className="profile-form">{recent.map((result:any,i:number) => <div key={i} className={result.won ? "form-win" : "form-loss"}>{result.won ? "W" : "V"}<small>{result.legs.join("–")}</small></div>)}</div>{player.played === 0 && <p className="profile-unplayed">{dpT("community.je_rating_blijft_wit_tijdens_de_plaatsingsfase_10")}</p>}<div className="profile-badges">{player.oneEighties >= 10 && <span><Target size={18}/>{dpT("community.triple_threat")}<small>{dpT("community.10_een_180")}</small></span>}{player.wins >= 50 && <span><Trophy size={18}/>{dpT("community.winner_s_circle")}<small>{dpT("community.50_overwinningen")}</small></span>}<span><Users size={18}/>{dpT("community.club_member")}<small>{dpT("community.thuis_in_de_kamer")}</small></span></div>{rating.provisional && <p className="profile-unplayed">{dpT("community.plaatsing_2")} {Math.min(rating.rankedPlayed, 10)}/10 wedstrijden · {Math.min(rating.opponents.length, 5)}/5 tegenstanders</p>}<PlayerSocialActions userId={player.id} name={name} room={roomName}/></div>;
}

const dpStaticCopyKeys={
  "Sociaal": "community.copy_sociaal",
  "Competitief": "community.copy_competitief",
  "Ontspannen": "community.copy_ontspannen",
  "Toernooi": "community.copy_toernooi"
};
