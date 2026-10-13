"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { acceptFriendRequest, cancelFriendRequest, getPlayerPresence, isBlocked, isPersonallyMuted, isRoomMuted, isRoomRemoved, rejectFriendRequest, simulateFriendAcceptance, useDartsSocial } from "@/lib/darts-social";
import { useDartsPreferences } from "@/lib/darts-preferences";
import { useRatingProfiles, useRatingProfile } from "@/lib/darts-ratings";
import { PlayerSocialActions } from "@/components/darts-social-tools";
import { appendChatMessage, closePrivateChatTab, getChatChannel, getChatDraft, getInitialChatChannel, hydrateChat, openPrivateChatTab, receivePrivateMessage, resolveChatTab, subscribeChat, updateChatDraft, useChatHydrated, useOpenPrivateChatTabs } from "@/lib/darts-chat-state";
export { openPrivateChatTab, usePrivateChatInbox, usePrivateChatPreview, receivePrivateMessage, sendQuickChat } from "@/lib/darts-chat-state";
export type { PrivateChatPreview } from "@/lib/darts-chat-state";
import { PlayerActionMenu } from "@/components/darts-player-menu";
import "./darts-community.css";

type PlayerAction = (name: string) => void;

function Avatar({ player, small = false }: { player: DartsPlayer; small?: boolean }) {
  return <span className={`dp-avatar ${small ? "dp-avatar-small" : ""} dp-role-${player.role}`} aria-hidden="true">{player.initials}</span>;
}

function SectionHeading({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return <div className="community-heading"><div>{eyebrow && <span className="community-eyebrow">{eyebrow}</span>}<h3>{title}</h3></div>{right}</div>;
}

export function PlayersTable({ scores = [381, 401], opponentName = "Bullseye", roomName = "Nederland 1", gameId = "83626", onInvite, onSpectate, onProfile, onMessage, compact = false, embedded = false, variant = "arena" }: { scores?: [number, number]; opponentName?: string; roomName?: string; gameId?: string; onInvite: PlayerAction; onSpectate: PlayerAction; onProfile: PlayerAction; onMessage?: PlayerAction; compact?: boolean; embedded?: boolean; variant?: string }) {
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
    let list = players.filter(p => p.name === "Nick" || p.name === opponentName || (getPlayerPresence(p.name).online && getPlayerPresence(p.name).room === roomName)).filter(p => !social.moderation.some(entry => entry.name === p.name && entry.room === roomName && entry.kind === "remove" && entry.until > now)).map(p => ({ ...p, rating: liveRatings.find(rating => rating.name === p.name)?.rating ?? p.rating, status: (p.name === "Nick" || p.name === opponentName ? "Speelt" : p.name === "Bullseye" ? "Beschikbaar" : p.status) as DartsPlayer["status"] })).filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    if (filter !== "Alle spelers") list = list.filter(p => p.status === filter);
    if (sort === "rating") list = [...list].sort((a, b) => descending ? b.rating - a.rating : a.rating - b.rating);
    if (sort === "name") list = [...list].sort((a, b) => descending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    return list;
  }, [query, filter, sort, descending, opponentName, liveRatings, social.moderation, roomName, now]);
  function setSorting(next: "rating" | "name") { setSort(next); setDescending(sort === next ? !descending : true); }
  function score(player: DartsPlayer) { return player.name === "Nick" ? scores[0] : player.name === opponentName ? scores[1] : player.name === "TripleKim" ? 121 : player.name === "DoubleOut" ? 164 : player.name === "DartMaster" ? 80 : player.name === "Joey180" ? 96 : "—"; }
  return <section className={`players-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} data-variant={variant} aria-label="Spelers in de kamer">
    <SectionHeading title={compact ? "Spelers" : "Spelers in de kamer"} right={<span className="community-count"><span className="online-dot"/>{operations.rooms.find(room => room.name === roomName)?.count ?? visible.length} online</span>}/>
    <div className="players-toolbar"><label className="community-search"><Search size={14}/><Input placeholder="Zoek speler…" aria-label="Zoek een speler" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filter spelers" value={filter} onChange={e => setFilter(e.target.value)}><option>Alle spelers</option><option>Beschikbaar</option><option>Speelt</option><option>Kijkt mee</option></select></div>
    <Table className="players-table"><TableHeader><TableRow><TableHead><button onClick={() => setSorting("name")}>Speler <ArrowUpDown size={11}/></button></TableHead><TableHead className="numeric"><button onClick={() => setSorting("rating")}>Elo <ArrowDown size={11} className={sort === "rating" && !descending ? "sort-reversed" : ""}/></button></TableHead><TableHead className="numeric score-column">Score</TableHead><TableHead className="numeric average-column">Gem.</TableHead><TableHead className="status-column">Status</TableHead><TableHead className="action-column"><span className="sr-only">Actie</span></TableHead></TableRow></TableHeader>
      <TableBody>{visible.map(p => <TableRow key={p.name} className={p.name === "Nick" ? "self-player" : ""}>
        <TableCell><PlayerActionMenu name={p.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onSpectate={p.status === "Speelt" ? onSpectate : undefined} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="player-identity"><Avatar player={p} small/><span className="player-name"><PlayerName name={p.name}/>{p.name === "Nick" && <small>JIJ</small>}{social.isMuted(p.name) && <VolumeX size={11} aria-label="Gedempt"/>}</span></PlayerActionMenu></TableCell>
        <TableCell className="numeric rating-value"><RatingValue player={p}/></TableCell><TableCell className={`numeric player-score score-column ${p.status === "Speelt" ? "active-score" : ""}`}>{score(p)}</TableCell><TableCell className="numeric average-column">{p.average.toFixed(1)}</TableCell>
        <TableCell className="status-column"><span className={`player-status ${p.status === "Speelt" ? "is-playing" : p.status === "Beschikbaar" ? "is-available" : "is-watching"}`}><span/>{p.status}</span></TableCell>
        <TableCell className="action-column"><div className="player-actions">{p.name === "Nick" ? <span className="self-check" title="Dit ben jij"><Check size={14}/></span> : <>{!compact && onMessage && <Button className="player-action player-message" variant="ghost" size="icon-sm" title={`Privéchat met ${p.name}`} aria-label={`Privéchat met ${p.name}`} disabled={social.isBlocked(p.name)} onClick={() => onMessage(p.name)}><MessageCircle size={16}/></Button>}{p.status === "Speelt" ? <Button className="player-action" variant="ghost" size="icon-sm" title={`Kijk mee bij ${p.name}`} aria-label={`Kijk mee bij ${p.name}`} onClick={() => onSpectate(p.name)}><Eye size={16}/></Button> : <Button className="player-action" variant="ghost" size="icon-sm" title={`Nodig ${p.name} uit voor een wedstrijd`} aria-label={`Nodig ${p.name} uit voor een wedstrijd`} disabled={social.isBlocked(p.name)} onClick={() => onInvite(p.name)}><UserPlus size={16}/></Button>}</>}</div></TableCell>
      </TableRow>)}</TableBody></Table>
    {visible.length === 0 && <div className="community-empty"><Search size={22}/><p>Geen spelers gevonden</p><button onClick={() => { setQuery(""); setFilter("Alle spelers"); }}>Wis je filters</button></div>}
    <div className="players-footer"><span>{visible.length} spelers</span><div className="rating-legend" aria-label="Rating: wit plaatsingsfase, rood onder 1450, geel 1450 tot 1549, groen vanaf 1550"><span><i className="rating-white"/> Plaatsing</span><span><i className="rating-red"/> &lt;1450</span><span><i className="rating-amber"/> 1450–1549</span><span><i className="rating-green"/> ≥1550</span></div></div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="Melding sluiten" onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

export function ChatPanel({ roomName = "Nederland 1", gameId = "83626", opponentName = "Bullseye", className = "", compact = false, embedded = false, lobby = false, quiet = false, activeTab, onTabChange, onClosePrivateTab }: {
  roomName?: string; gameId?: string; opponentName?: string; className?: string; compact?: boolean; embedded?: boolean; lobby?: boolean; quiet?: boolean;
  activeTab?: string; onTabChange?: (tab: string) => void; onClosePrivateTab?: (name: string, nextTab: string) => void; privatePlayers?: string[];
}) {
  const [localTab, setLocalTab] = useState(lobby ? "" : "match");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [playerTools, setPlayerTools] = useState(false);
  const [privacyFeedback, setPrivacyFeedback] = useState("");
  const social = useDartsSocial();
  const adminRooms = useAdminOperations().rooms;
  const preferences = useDartsPreferences();
  const scroll = useRef<HTMLDivElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const emptyState = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const chatReady = useChatHydrated();
  const openPrivateNames = useOpenPrivateChatTabs();
  const privateNames = openPrivateNames.filter(name => !social.isBlocked(name));
  const requestedTab = activeTab ?? localTab;
  const tab = resolveChatTab(requestedTab, privateNames, lobby);
  const privateName = tab.startsWith("private:") ? tab.slice(8) : null;
  const channelKey = privateName ? `private:${privateName}` : !tab ? "" : tab === "room" ? `room:${roomName}` : `match:${roomName}:${gameId}:${opponentName}`;
  const current = useSyncExternalStore(subscribeChat, () => getChatChannel(channelKey), () => getInitialChatChannel(channelKey));
  const draft = useSyncExternalStore(subscribeChat, () => getChatDraft(channelKey), () => "");
  const blocked = !!privateName && social.isBlocked(privateName);
  const muted = !!privateName && social.isMuted(privateName);
  const setDraft = (text: string) => updateChatDraft(channelKey, text);
  const maximumId = current.reduce((maximum, message) => Math.max(maximum, message.id), 0);
  const [quietWindow, setQuietWindow] = useState({ key: channelKey, active: quiet, maximumId });
  const [releasedCount, setReleasedCount] = useState(0);
  const lastDeferred = useRef(0);
  const sameQuietWindow = quietWindow.key === channelKey && quietWindow.active === quiet;
  if (!sameQuietWindow) setQuietWindow({ key: channelKey, active: quiet, maximumId });
  const quietBoundary = sameQuietWindow ? quietWindow.maximumId : maximumId;
  const unblockedMessages = current.filter(message => message.system || (!social.isBlocked(message.name) && !social.isMuted(message.name)));
  const deferredCount = quiet ? unblockedMessages.filter(message => !message.system && message.name !== "Nick" && message.id > quietBoundary).length : 0;
  const visible = unblockedMessages.filter(message => !quiet || message.system || message.name === "Nick" || message.id <= quietBoundary);
  useEffect(() => {
    if (!quiet && lastDeferred.current > 0) setReleasedCount(lastDeferred.current);
    lastDeferred.current = deferredCount;
  }, [quiet, deferredCount]);
  useEffect(() => { if (!releasedCount) return; const timer = setTimeout(() => setReleasedCount(0), 4500); return () => clearTimeout(timer); }, [releasedCount]);
  function selectTab(value: string) {
    if (value.startsWith("private:") && !openPrivateChatTab(value.slice(8))) return;
    const allowed = lobby && !value.startsWith("private:") ? "" : value;
    setLocalTab(allowed); onTabChange?.(allowed); setEmojiOpen(false); setPlayerTools(false); setPrivacyFeedback("");
  }
  function closePrivate(name: string) {
    const next = closePrivateChatTab(name, tab, lobby, privateNames);
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
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }, [current, tab]);
  function send(text = draft) {
    if (!channelKey || !text.trim() || blocked || (!privateName && (isRoomMuted("Nick", roomName) || isRoomRemoved("Nick", roomName)))) return;
    const time = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    appendChatMessage(channelKey, { id: Date.now(), name: "Nick", text: text.trim().slice(0, 500), time });
    setDraft(""); setEmojiOpen(false);
    // A local reply also arrives if the drawer has been closed in the meantime.
    setTimeout(() => {
      const sender = privateName ?? (tab === "room" ? "Mila" : opponentName);
      if (isBlocked(sender) || isPersonallyMuted(sender) || (!privateName && (isRoomMuted(sender, roomName) || isRoomRemoved(sender, roomName)))) return;
      const reply = privateName ? "Hey Nick! Zin om zo een potje te spelen? 🎯" : tab === "room" ? "Gezellig dat je er bent, Nick! 🎯" : "Nice! Op naar de volgende triple 🎯";
      if (privateName) receivePrivateMessage(privateName, reply);
      else appendChatMessage(channelKey, { id: Date.now(), name: sender, text: reply, time: new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) });
    }, 1100);
  }
  function tryNewPrivateChat() {
    const received = receivePrivateMessage("NightOwl", "Hé! Leuk je hier te zien. Zin in een wedstrijd?");
    if (received) { selectTab("private:NightOwl"); setPrivacyFeedback("Nieuwe demo-chat ontvangen van NightOwl."); }
    else setPrivacyFeedback(social.isBlocked("NightOwl") ? "NightOwl is geblokkeerd. Er is geen bericht ontvangen." : "Je privacykeuze houdt deze nieuwe chat van een niet-vriend tegen.");
  }
  return <section className={`chat-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""} ${className}`}>
    <div className="chat-top"><MessageCircle size={16}/><span>{lobby ? "Berichten" : roomName}</span>{!lobby && <span className="chat-online"><span className="online-dot"/>{adminRooms.find(room => room.name === roomName)?.count ?? 0}</span>}</div>
    {(!lobby || privateNames.length > 0) && <Tabs className="chat-tab-container" value={tab} onValueChange={selectTab}><TabsList ref={tabList} className="chat-tabs" aria-label={lobby ? "Privégesprekken" : "Chatgesprek"}>{!lobby && <><TabsTrigger data-chat-tab="match" value="match">Spelchat</TabsTrigger><TabsTrigger data-chat-tab="room" value="room">Kamerchat</TabsTrigger></>}{privateNames.map(name => <div className={`chat-private-tab-wrap ${tab === `private:${name}` ? "is-active" : ""}`} key={name}><TabsTrigger className="chat-private-tab" data-chat-tab={`private:${name}`} value={`private:${name}`} onKeyDown={event => { if (event.key === "Delete") { event.preventDefault(); closePrivate(name); } }}><MessageCircle size={12}/><PlayerName name={name}/></TabsTrigger><button type="button" className="chat-tab-close" aria-label={`Privégesprek met ${name} sluiten`} title="Gesprek sluiten" onClick={() => closePrivate(name)}><X size={13}/></button></div>)}</TabsList></Tabs>}
    {!tab ? <div ref={emptyState} tabIndex={-1} className="chat-empty-state" role="region" aria-label="Geen privégesprek geopend"><span><MessageCircle size={25}/></span><h3>Je gesprekken beginnen hier</h3><p>Open een privégesprek via je vrienden of berichten. Gesloten gesprekken blijven bewaard.</p></div> : <>
    {quiet && <div className="chat-quiet-note"><Target size={12}/>{deferredCount ? `${deferredCount} ${deferredCount === 1 ? "nieuw bericht komt" : "nieuwe berichten komen"} na je beurt` : "Rustige beurt · nieuwe berichten blijven bewaard"}</div>}{!quiet && releasedCount > 0 && <div className="chat-quiet-note" role="status"><MessageCircle size={12}/>{releasedCount} {releasedCount === 1 ? "bewaard bericht staat" : "bewaarde berichten staan"} voor je klaar</div>}
    {privateName && <div className="chat-person-tools"><span>{blocked ? "Geblokkeerd gesprek" : muted ? "Gedempt gesprek" : "Privégesprek"}</span><PlayerActionMenu name={privateName} roomName={roomName} gameId={gameId} onToast={setPrivacyFeedback} className="chat-contact-menu"><PlayerName name={privateName}/></PlayerActionMenu><button onClick={() => setPlayerTools(value => !value)} aria-expanded={playerTools}><Flag size={13}/>Melden / blokkeren</button></div>}
    <div className="chat-messages" ref={scroll} role="log" aria-live={quiet ? "off" : "polite"} aria-label={privateName ? `Privéberichten met ${privateName}` : tab === "room" ? "Kamerberichten" : "Spelberichten"}>
      {playerTools && privateName && <PlayerSocialActions compact name={privateName} room={roomName} gameId={gameId} context={current.filter(message => !message.system).slice(-10).map(message => `${message.name}: ${message.text}`).join("\n")}/>}
      <span className="chat-date">VANDAAG</span><AnimatePresence initial={false}>{visible.map(message => message.system ? <div className="chat-system" key={message.id}><Gamepad2 size={13}/>{message.text}</div> : <motion.div key={`${channelKey}:${message.id}`} className={`chat-message ${message.name === "Nick" ? "own-message" : ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}><Avatar player={playerByName(message.name)} small/><div><div className="chat-message-meta"><strong><PlayerName name={message.name}/></strong><time>{message.time}</time></div><p>{message.text}</p></div></motion.div>)}</AnimatePresence>
      {!privateName && social.moderation.filter(entry => entry.room === roomName).slice(-3).map(entry => <div className="chat-system" key={entry.id}><ShieldCheck size={13}/>{entry.name}: {entry.kind === "warn" ? "waarschuwing" : entry.kind === "mute" ? "tijdelijke mute" : "uit de kamer verwijderd"} · {entry.reason}</div>)}
      {blocked && <p className="chat-system">Berichten van {privateName} zijn verborgen. Deblokkeer deze speler om het gesprek te hervatten.</p>}{muted && !blocked && <p className="chat-system"><VolumeX size={13}/>Je hebt {privateName} gedempt. Klik bovenaan op de naam om berichten weer te tonen.</p>}
    </div>
    <div className="chat-compose-wrap">{!blocked && <div className="chat-quick-replies" aria-label="Snelle chatzinnen">{["Succes! 🎯", "Mooie finish! 👏", "Goed gespeeld!", "Revanche?"].map(text => <button key={text} type="button" onClick={() => send(text)}>{text}</button>)}</div>}{emojiOpen && <div className="chat-emoji-picker" aria-label="Kies een emoji">{["🎯", "👏", "🔥", "👋", "😂", "🏆", "💪", "🍻"].map(emoji => <button key={emoji} aria-label={`Voeg ${emoji} toe`} onClick={() => { setDraft(draft + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
      <form className="chat-compose" onSubmit={e => { e.preventDefault(); send(); }}><Button variant="ghost" size="icon-sm" type="button" className="emoji-button" disabled={blocked} aria-label="Emoji kiezen" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(value => !value)}><Smile size={18}/></Button><Input value={draft} disabled={blocked} onChange={e => setDraft(e.target.value)} placeholder={blocked ? "Deze speler is geblokkeerd" : privateName ? `Bericht aan ${privateName}…` : tab === "room" ? "Praat mee in de kamer…" : "Bericht in het spel…"} aria-label={privateName ? `Privébericht aan ${privateName}` : "Chatbericht"} maxLength={500}/><Button type="submit" size="icon-sm" className="chat-send" disabled={!draft.trim() || blocked} aria-label="Verstuur bericht"><Send size={17}/></Button></form>
      <p className="chat-footnote">Speel sportief. <span>Demo · berichten blijven op dit apparaat.</span></p>
      {lobby && <div className="chat-privacy-preview"><span>Nieuwe chats: {preferences.privateMessages === "everyone" ? "iedereen" : preferences.privateMessages === "friends" ? "alleen vrienden" : "niemand"}</span><button type="button" onClick={tryNewPrivateChat}>Test nieuwe chat</button></div>}
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
    <div className="room-list">{visible.map(room => <button type="button" key={room.id} className={`room-list-row ${currentRoom === room.name ? "is-current" : ""}`} disabled={room.category !== "tournament" && (room.status === "closed" || room.count >= room.capacity)} aria-current={currentRoom === room.name ? "true" : undefined} onClick={() => onSelect(room.name)}>
      <span className="room-list-emoji" aria-hidden="true">{room.name.startsWith("Nederland") ? "🇳🇱" : room.name === "Afterhours" ? "🌙" : categorySymbols[room.category]}</span><span className="room-list-name"><strong>{room.name}</strong><small>{room.category === "tournament" ? "DartsPoint-events · toeschouwers welkom" : room.status === "closed" ? "Gesloten voor nieuwe spelers" : currentRoom === room.name ? "Je bent hier" : room.count >= room.capacity ? "Kamer vol" : room.status === "private" ? "Privékamer · eigenaarstoegang" : categoryLabels[room.category]}</small></span><span className="room-list-count"><Users size={14}/><strong>{room.count}</strong><span>/ {room.capacity}</span></span>{currentRoom === room.name ? <Check size={17}/> : <ChevronRight size={17}/>}</button>)}</div>
    {events.length > 0 && <div className="room-list"><h4 className="room-event-heading">DartsPoint · toernooikamers</h4>{events.map(event => <a key={event.id} className="room-list-row" href={`/toernooi/${encodeURIComponent(event.id)}`}><span className="room-list-emoji"><Trophy size={22}/></span><span className="room-list-name"><strong>{event.name}</strong><small>{event.settings.room} · toeschouwers welkom</small></span><span className="room-list-count"><Users size={14}/><strong>{event.participants.filter(player => ["confirmed", "checkedin"].includes(player.status)).length}</strong><span>/ {event.settings.maxPlayers}</span></span><ChevronRight size={17}/></a>)}</div>}
    {visible.length === 0 && events.length === 0 && <div className="community-empty"><Search size={22}/><p>Geen kamers gevonden</p><button onClick={() => setQuery("")}>Wis je zoekopdracht</button></div>}
  </section>;
}

export function RoomGrid({ currentRoom, onSelect }: { currentRoom: string; onSelect: (room: string) => void }) {
  const [filter, setFilter] = useState("Alle kamers");
  const visible = rooms.filter(room => filter === "Alle kamers" || (filter === "Plek beschikbaar" && room.count < 50) || (filter === "Competitief" && ["Competitief", "Toernooi"].includes(room.category)));
  return <section className="rooms-panel"><SectionHeading eyebrow="VIND JOUW MENSEN" title="Een kamer. Nog een potje." right={<span className="community-count">217 online</span>}/><div className="community-filter-pills">{["Alle kamers", "Plek beschikbaar", "Competitief"].map(value => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div><div className="room-grid">{visible.map(room => <motion.button whileHover={{ y: -3 }} whileTap={{ scale: .99 }} key={room.name} disabled={room.count >= 50} className={`room-card ${currentRoom === room.name ? "is-current" : ""}`} onClick={() => onSelect(room.name)}><div className="room-card-top"><span className="room-emoji">{room.emoji}</span><span className="room-category">{room.category}</span></div><h3>{room.name}</h3><p>{room.subtitle}</p><div className="room-occupancy"><span><Users size={13}/><strong>{room.count}</strong> / 50</span><span>{room.matches} wedstrijden</span></div><div className="room-capacity"><span style={{ width: `${room.count * 2}%` }}/></div><div className="room-join">{currentRoom === room.name ? <><span className="online-dot"/> Je bent hier</> : room.count >= 50 ? "Kamer vol" : <>Kamer binnen <ArrowUpRight size={15}/></>}</div></motion.button>)}</div></section>;
}

export function FriendsPanel({ onInvite, onProfile, onMessage, onSpectate, roomName = "Nederland 1", gameId = "83626", compact = false, embedded = false }: { onInvite: PlayerAction; onProfile: PlayerAction; onMessage?: PlayerAction; onSpectate?: PlayerAction; roomName?: string; gameId?: string; compact?: boolean; embedded?: boolean }) {
  const social = useDartsSocial();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const friends = social.friends.filter(name => !social.isBlocked(name)).map(playerByName).sort((a, b) => Number(getPlayerPresence(b.name).online) - Number(getPlayerPresence(a.name).online) || a.name.localeCompare(b.name));
  const visible = friends.filter(friend => friend.name.toLowerCase().includes(query.toLowerCase()));
  const requests = social.friendRequests.filter(request => !social.isBlocked(request.name));
  const incoming = requests.filter(request => request.direction === "incoming");
  function resolveRequest(action: () => { ok: true } | { ok: false; error: string }, success: string) {
    const result = action(); setFeedback(result.ok ? success : result.error);
  }
  return <section className={`friends-panel community-panel ${compact ? "community-compact" : ""} ${embedded ? "community-embedded" : ""}`} aria-label="Vrienden">
    <SectionHeading title="Vrienden" right={<span className="community-count"><span className="online-dot"/>{friends.filter(friend => getPlayerPresence(friend.name).online).length}</span>}/>
    <div className="friends-tabs" role="tablist" aria-label="Vriendschappen"><button type="button" role="tab" aria-selected={tab === "friends"} className={tab === "friends" ? "is-active" : ""} onClick={() => setTab("friends")}>Vrienden <span>{friends.length}</span></button><button type="button" role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "is-active" : ""} onClick={() => setTab("requests")}>Verzoeken{requests.length > 0 && <span className={incoming.length ? "has-incoming" : ""}>{requests.length}</span>}</button></div>
    {tab === "friends" && <label className="community-search friends-search"><Search size={13}/><Input placeholder="Zoek vriend…" aria-label="Zoek een vriend" value={query} onChange={event => setQuery(event.target.value)}/></label>}
    <div className="friends-scroll" role="tabpanel" aria-label={tab === "friends" ? "Mijn vrienden" : "Vriendschapsverzoeken"}>
      {tab === "friends" ? <div className="friends-list">{visible.map(friend => {
        const presence = getPlayerPresence(friend.name);
        return <div className={`friend-row ${presence.online ? "" : "friend-offline"}`} key={friend.name}><PlayerActionMenu name={friend.name} roomName={roomName} gameId={gameId} onInvite={presence.online ? onInvite : undefined} onProfile={onProfile} onMessage={onMessage} onSpectate={presence.online && friend.status === "Speelt" ? onSpectate : undefined} onToast={setFeedback} className="friend-main"><span className="friend-avatar-wrap"><Avatar player={friend} small/><span className={presence.online ? "online-dot" : "offline-dot"}/></span><span><strong><PlayerName name={friend.name}/>{social.isMuted(friend.name) && <VolumeX size={11} aria-label="Gedempt"/>}</strong><small>{presence.online ? presence.status : "Offline"}</small></span></PlayerActionMenu>{onMessage && <Button className="friend-message" variant="ghost" size="icon-sm" onClick={() => onMessage(friend.name)} aria-label={`Privéchat met ${friend.name}`} title={`Privéchat met ${friend.name}`}><MessageCircle size={15}/></Button>}</div>;
      })}{visible.length === 0 && <div className="community-empty"><Users size={20}/><p>{query ? "Geen vrienden gevonden" : "Nog geen vrienden"}</p><small>{query ? "Probeer een andere naam." : "Klik op een speler om een vriendschapsverzoek te sturen."}</small>{query && <button type="button" onClick={() => setQuery("")}>Wis zoekopdracht</button>}</div>}</div>
      : <div className="friend-requests">{requests.map(request => <div className="friend-request" key={request.id}><PlayerActionMenu name={request.name} roomName={roomName} gameId={gameId} onInvite={onInvite} onProfile={onProfile} onMessage={onMessage} onToast={setFeedback} className="friend-main"><Avatar player={playerByName(request.name)} small/><span><strong><PlayerName name={request.name}/></strong><small>{request.direction === "incoming" ? "Wil vrienden worden" : "Verzoek verstuurd"}</small></span></PlayerActionMenu><div className="friend-request-actions">{request.direction === "incoming" ? <><button className="request-accept" type="button" onClick={() => resolveRequest(() => acceptFriendRequest(request.name), `${request.name} is nu je vriend.`)} aria-label={`Accepteer ${request.name}`}><Check size={14}/><span>Accepteren</span></button><button type="button" onClick={() => resolveRequest(() => rejectFriendRequest(request.name), `Verzoek van ${request.name} afgewezen.`)} aria-label={`Wijs ${request.name} af`}><X size={14}/></button></> : <><button type="button" onClick={() => resolveRequest(() => cancelFriendRequest(request.name), `Verzoek aan ${request.name} ingetrokken.`)}>Intrekken</button><button type="button" className="request-demo" onClick={() => resolveRequest(() => simulateFriendAcceptance(request.name), `${request.name} heeft je verzoek geaccepteerd (demo).`)}>Demo: accepteren</button></>}</div></div>)}{requests.length === 0 && <div className="community-empty"><UserPlus size={20}/><p>Geen open verzoeken</p><small>Vriendschapsverzoeken verschijnen hier.</small></div>}</div>}
    </div>
    {feedback && <div className="community-feedback" role="status"><span>{feedback}</span><button type="button" aria-label="Melding sluiten" onClick={() => setFeedback("")}><X size={13}/></button></div>}
  </section>;
}

export function LiveMatches({ onSpectate }: { onSpectate: PlayerAction }) {
  return <section className="live-panel community-panel"><SectionHeading title="Nu op de oche" right={<span className="live-indicator"><i/>LIVE</span>}/><div className="live-match-list">{[{ a: "TripleKim", b: "DoubleOut", x: 121, y: 164, viewers: 12 }, { a: "DartMaster", b: "Joey180", x: 80, y: 96, viewers: 8 }].map((match, i) => <button className="live-match-card" key={match.a} onClick={() => onSpectate(match.a)}><div className="live-match-meta"><span>501 · Best of 3</span><span><Eye size={12}/>{match.viewers}</span></div><div className="live-match-player"><PlayerName name={match.a}/><strong>{match.x}</strong></div><div className="live-match-player"><PlayerName name={match.b}/><strong>{match.y}</strong></div><div className="live-match-bottom"><span>{i === 0 ? "Beslissende leg" : "Leg 1 van 3"}</span><span>Toeschouwen <ArrowUpRight size={13}/></span></div></button>)}</div></section>;
}

export function TournamentPanel({ onToast }: { onToast: (text: string) => void }) {
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState("overzicht");
  return <section className="tournament-panel community-panel"><div className="tournament-hero"><span className="tournament-icon"><Trophy size={28}/></span><span className="tournament-eyebrow">AFTERHOURS SERIES · 01</span><h3>Friday Night<br/><em>Open.</em></h3><p>Eén community. Eén winnaar.<br/>Jouw avond begint hier.</p><div className="tournament-tags"><span><Clock3 size={12}/>Vrijdag · 20:00</span><span><Users size={12}/>{joined ? 25 : 24}/32</span><span>501 · BO3</span></div></div><div className="tournament-inner"><div className="community-filter-pills"><button className={tab === "overzicht" ? "is-active" : ""} onClick={() => setTab("overzicht")}>Overzicht</button><button className={tab === "schema" ? "is-active" : ""} onClick={() => setTab("schema")}>Speelschema</button></div>{tab === "overzicht" ? <div className="tournament-details"><div><Medal size={16}/><span>Open voor iedere rating<small>Gratis meedoen, sportief spelen.</small></span></div><div><Flag size={16}/><span>Knock-out · 32 deelnemers<small>De finale wordt gespeeld als best of 5.</small></span></div><div><ShieldCheck size={16}/><span>Check-in vanaf 19:45<small>We reserveren je plek tot 19:55.</small></span></div></div> : <div className="tournament-schedule">{[{time:"20:00", stage:"Ronde van 32", count:"16 wedstrijden"},{time:"20:30",stage:"Achtste finales",count:"8 wedstrijden"},{time:"21:00",stage:"Kwartfinales",count:"4 wedstrijden"},{time:"21:30",stage:"Halve finales",count:"2 wedstrijden"},{time:"22:00",stage:"De finale",count:"Best of 5"}].map(s => <div key={s.stage}><time>{s.time}</time><span>{s.stage}<small>{s.count}</small></span><ChevronRight size={14}/></div>)}</div>}<Button className={`tournament-join ${joined ? "is-joined" : ""}`} onClick={() => { setJoined(!joined); onToast(joined ? "Je inschrijving is geannuleerd." : "Je staat op de deelnemerslijst voor Friday Night Open."); }}>{joined ? <><Check size={16}/>Ingeschreven · Annuleren</> : <>Ik doe mee <ArrowUpRight size={16}/></>}</Button><p className="tournament-help">{joined ? "Je plek is gereserveerd. Check vrijdag vanaf 19:45 in." : "Nog 8 plekken. Schuif aan."}</p></div></section>;
}

export function RankingPanel({ onProfile }: { onProfile: PlayerAction }) {
  const [period, setPeriod] = useState("Elo");
  const liveRatings = useRatingProfiles(players.map(player => player.name));
  const ranked = players.map(player => ({ ...player, rating: liveRatings.find(rating => rating.name === player.name)?.rating ?? player.rating })).sort((a,b) => period === "Gemiddelde" ? b.average - a.average : period === "Overwinningen" ? b.wins - a.wins : b.rating - a.rating);
  return <section className="ranking-panel community-panel"><SectionHeading eyebrow="THE CLIMB" title="De ladder" right={<Trophy className="ranking-trophy" size={22}/>} /><div className="community-filter-pills">{["Elo", "Gemiddelde", "Overwinningen"].map(p => <button key={p} className={period === p ? "is-active" : ""} onClick={() => setPeriod(p)}>{p}</button>)}</div><div className="ranking-columns"><span>Positie / speler</span><span>{period === "Gemiddelde" ? "Gemiddelde" : period === "Overwinningen" ? "Gewonnen" : "Rating"}</span></div><div className="ranking-list">{ranked.map((player,i) => <button key={player.name} className={`ranking-row ${player.name === "Nick" ? "is-you" : ""}`} onClick={() => onProfile(player.name)}><span className={`ranking-position ${i < 3 ? "top-three" : ""}`}>{i === 0 ? <Crown size={16}/> : String(i+1).padStart(2,"0")}</span><Avatar player={player} small/><span className="ranking-name"><strong><PlayerName name={player.name}/>{player.name === "Nick" && <small>JIJ</small>}</strong><small>{player.played} wedstrijden</small></span><strong className="ranking-points">{period === "Gemiddelde" ? player.average.toFixed(1) : period === "Overwinningen" ? player.wins : <RatingValue player={player} interactive={false}/>}</strong></button>)}</div><div className="ranking-footer"><Sparkles size={13}/>{period === "Gemiddelde" ? "Gerangschikt op gemiddelde per 3 darts" : period === "Overwinningen" ? "Gerangschikt op gewonnen wedstrijden" : "Gerangschikt op de huidige Elo-rating"}</div></section>;
}

export function ProfileView({ name, roomName = "Nederland 1", gameId = "83626" }: { name: string; roomName?: string; gameId?: string }) {
  const player = playerByName(name);
  const rating = useRatingProfile(name);
  const percentage = player.played > 0 ? Math.round(player.wins / player.played * 100) : 0;
  return <div className="profile-view"><div className="profile-cover"><div className="profile-cover-orbit"/><span>DARTSPOINT PLAYER CLUB</span></div><div className="profile-identity"><Avatar player={player}/><div><h2><PlayerName name={player.name}/></h2><p>{player.country} <span>·</span> Lid sinds 2024</p></div><span className="profile-rating"><Target size={14}/><RatingValue player={player}/><small>rating</small></span></div><div className="profile-stats-grid"><div><span>Wedstrijden</span><strong>{player.played}</strong><small>{player.wins} gewonnen</small></div><div><span>Gemiddelde</span><strong>{player.average.toFixed(1)}</strong><small>Per 3 darts</small></div><div><span>180’s</span><strong>{player.oneEighties}</strong><small>Maximums gescoord</small></div><div><span>Winpercentage</span><strong>{percentage}<em>%</em></strong><small>Over alle wedstrijden</small></div></div><div className="profile-section-title"><h3>Vorm van het moment</h3><span>Laatste 5 wedstrijden</span></div><div className="profile-form">{(player.played > 0 ? [true,true,false,true,true] : []).map((win,i) => <div key={i} className={win ? "form-win" : "form-loss"}>{win ? "W" : "V"}<small>{win ? "2–1" : "0–2"}</small></div>)}</div>{player.played === 0 && <p className="profile-unplayed">Je rating blijft wit tijdens de plaatsingsfase: 10 ranked wedstrijden tegen minimaal 5 verschillende tegenstanders.</p>}<div className="profile-badges">{player.oneEighties >= 10 && <span><Target size={18}/>Triple threat<small>10× een 180</small></span>}{player.wins >= 50 && <span><Trophy size={18}/>Winner’s circle<small>50 overwinningen</small></span>}<span><Users size={18}/>Club member<small>Thuis in de kamer</small></span></div>{rating.provisional && <p className="profile-unplayed">Plaatsing: {Math.min(rating.rankedPlayed, 10)}/10 wedstrijden · {Math.min(rating.opponents.length, 5)}/5 tegenstanders</p>}<PlayerSocialActions name={name} room={roomName} gameId={gameId}/></div>;
}
