"use client";
import {SupportQuickLinks} from "./darts-support-links";
import {DartsLegalAcceptance} from "./darts-legal-acceptance";
import {ChatBadge} from "./chat-badge";
import {DesktopCommunity,RoomCommunity,useDesktopWorkspace} from "./darts-workspace";
import {invitationReason} from "@/lib/darts-social";
import {canManageRoom} from "@/lib/darts-social";
import {unreadCount} from "@/lib/chat-unread";
import {DartsNotifications} from "./darts-notifications";
import {selfName,getPlatform,usePlatform,mutate,playerId} from "@/lib/platform-client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleHelp, Heart, House, LogOut, MessageCircle, Search, Settings2, ShieldCheck, Target, Trophy, UserRound, Users, X } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { ChatPanel, FriendsPanel, ProfileView, RankingPanel, openPrivateChatTab, usePrivateChatInbox } from "@/components/darts-community";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { playerByName } from "@/lib/darts-data";
import { getAdminOperations, useAdminOperations } from "@/lib/darts-admin-operations";
import { useAdminSettings } from "@/lib/darts-admin-settings";
import { PublishedTournaments } from "@/components/admin/darts-tournaments";
import { endDemoSession } from "@/lib/darts-session";
import { useDartsPreferences,updateDartsPreferences } from "@/lib/darts-preferences";
import { useDartsSocial, isBlocked, getPlayerPresence } from "@/lib/darts-social";
import { PlayerActionMenu } from "@/components/darts-player-menu";
import { MatchInviteDialog } from "@/components/darts-match-invite";
import { MATCH_AUTO_START_KEY, selectMatchSetup, type MatchSetup } from "@/lib/darts-match-setup";
import { DartsPreferencesPanel } from "@/components/darts-preferences-panel";
import { ModeratorPanel } from "@/components/darts-social-tools";
import { tournamentRoomDestination } from "@/lib/darts-tournament-navigation";
import "./darts-app.css";
import "./darts-lobby.css";

type View = "home" | "friends" | "messages" | "profile" | "support";
const roomCategories = { social: "Sociaal", ranked: "Competitief", beginners: "Ontspannen", tournament: "Toernooi" };
const roomSymbols = { social: "🎯", ranked: "⚡", beginners: "✨", tournament: "🏆" };
const navigation = [
  { id: "home", label: "Lobby", icon: House },
  { id: "friends", label: "Vrienden", icon: Heart },
  { id: "messages", label: "Berichten", icon: MessageCircle },
  { id: "support", label: "Support", icon: CircleHelp },
  { id: "profile", label: "Profiel", icon: UserRound },
] as const;

function Avatar({ name, online = true }: { name: string; online?: boolean }) {
  const player = playerByName(name);
  const role = useAdminOperations().members.find(member => member.name === name)?.role ?? player.role;
  return <span className={`lobby-avatar lobby-role-${role} ${online ? "is-online" : "is-offline"}`} aria-hidden="true">{player.initials}<i/></span>;
}

export function DartsLobby({supportContent}:{supportContent?:ReactNode}) {
  const desktop=useDesktopWorkspace();
  const [selectingRoom,setSelectingRoom]=useState(false);
  const [view, setView] = useState<View>(supportContent ? "support" : "home");
  const platform=usePlatform();
  const operations = useAdminOperations();
  const { settings } = useAdminSettings();
  const isOwner = operations.members.find(member => member.name === selfName())?.role === "owner";
  const rooms = operations.rooms.map(room => ({ ...room, categoryLabel: roomCategories[room.category], emoji: room.name.startsWith("Nederland") ? "🇳🇱" : room.name === "Afterhours" ? "🌙" : roomSymbols[room.category] }));
  const [roomQuery, setRoomQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("Alle kamers");
  const [currentRoom, setCurrentRoom] = useState("");
  const [currentOpponent, setCurrentOpponent] = useState("");
  const [resumeMatch, setResumeMatch] = useState<{ room: string; opponent: string; mode: string; id: string; gameNumber: number } | null>(null);
  const preferences = useDartsPreferences();
  const favoriteRooms=preferences.favoriteRooms??[];
  const social = useDartsSocial();
  const visibleFriends = social.friends.filter(name => !social.blocked.includes(name)).map(name => ({ name, ...getPlayerPresence(name) }));
  const pendingFriends = social.friendRequests.filter(request => request.direction === "incoming" && !social.blocked.includes(request.name));

  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [extra, setExtra] = useState<"ladder" | "tournament" | "notifications" | "settings" | "moderation" | null>(null);
  const [toast, setToast] = useState("");
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('room-unavailable')==='1')setToast('De vorige kamer is niet meer beschikbaar. Kies hier een andere kamer.');},[]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const chatCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(()=>{const own=platform.matches.find(m=>m.players?.some((p:any)=>p.id===platform.actor?.id));if(own){const r=platform.rooms.find(r=>r.id===own.room_id);setResumeMatch({room:r?.name??"",opponent:own.players.find((p:any)=>p.id!==platform.actor.id)?.name??"",mode:own.mode,id:own.id,gameNumber:Number(own.gameNumber??own.game_number)});}else setResumeMatch(null);},[platform.matches,platform.rooms,platform.actor]);
  const confirmedRoom=platform.rooms.find(r=>r.id===platform.players.find(p=>p.id===platform.actor?.id)?.presence.roomId);
  const previousMembership=useRef<string|undefined>(undefined);
  useEffect(()=>{if(previousMembership.current!==confirmedRoom?.id){previousMembership.current=confirmedRoom?.id;setCurrentRoom(confirmedRoom?.name??'');setChatTab(confirmedRoom?'room':'');setSelectingRoom(false);}},[confirmedRoom?.id,confirmedRoom?.name]);
  const nick = playerByName(selfName());
  const inbox = usePrivateChatInbox();
  const unread = platform.channels.filter(c=>c.unread>0).map(c=>c.id);
  const unreadTotal=unreadCount(platform.chatChannels??platform.channels);
  const orderedConversations = inbox.filter(item => !social.blocked.includes(item.name) && !social.muted.includes(item.name)).sort((a, b) => b.lastId - a.lastId);
  const openChannelId = chatTab.startsWith("private:") ? chatTab.slice(8) : "";
  const openLastId = inbox.find(item => item.channelId === openChannelId)?.lastId ?? 0;

  useEffect(() => {
    try {
      const liveRooms = getAdminOperations().rooms;
      if (window.location.hash === "#events") requestAnimationFrame(() => document.getElementById("events")?.scrollIntoView({ block: "start" }));
      const selected = sessionStorage.getItem("dartspoint-room-v1");
      if (liveRooms.some(room => room.name === selected)) setCurrentRoom(selected!);
      else if (!liveRooms.some(room => room.name === "Nederland 1") && liveRooms[0]) setCurrentRoom((liveRooms.find(room => room.status === "active" && room.count < room.capacity) ?? liveRooms[0]).name);
      const opponent = sessionStorage.getItem("dartspoint-opponent-v1");
      if (opponent && opponent !== selfName()) setCurrentOpponent(opponent);

    } catch { /* Storage is optional for this local prototype. */ }
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--lobby-height", `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty("--lobby-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); root.style.removeProperty("--lobby-height"); root.style.removeProperty("--lobby-top"); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function navigate(next: View) {
    if(next === "support" && !supportContent){window.location.assign("/mijn-tickets");return;}
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }
  async function toggleFavorite(name:string){const next=favoriteRooms.includes(name)?favoriteRooms.filter(value=>value!==name):[...favoriteRooms,name];await updateDartsPreferences({favoriteRooms:next});}
  async function enterGame(room = currentRoom, opponent = currentOpponent, openRoom = true, spectate?: string, newMatch = false, setup?: MatchSetup) {
    if (opponent === selfName()) { setToast("Kies een andere speler om een wedstrijd te starten."); return; }
    if ((newMatch || spectate) && isBlocked(spectate || opponent)) { setToast("Deze speler is geblokkeerd. Deblokkeer via het profiel om contact te maken."); return; }
    const selectedRoom = getAdminOperations().rooms.find(value => value.name === room);
    if (!selectedRoom) { setToast("Deze kamer is niet meer beschikbaar. Kies een andere kamer."); return; }
    try{await mutate("room",{roomId:selectedRoom.id});}catch{return;}
    const eventDestination = tournamentRoomDestination(room, selectedRoom.category === "tournament");
    if (eventDestination) { window.location.assign(eventDestination); return; }
    if (selectedRoom.status === "closed") { setToast("Deze kamer is gesloten voor nieuwe spelers."); return; }


    try {
      sessionStorage.setItem("dartspoint-room-v1", room);
      sessionStorage.setItem("dartspoint-opponent-v1", opponent);
      sessionStorage.setItem("dartspoint-match-mode-v1", selectedRoom.category === "ranked" ? "ranked-demo" : "casual");
      if (newMatch) sessionStorage.setItem("dartspoint-new-match-v1", "1");
      sessionStorage.setItem("dartspoint-open-room-v1", openRoom ? "1" : "0");
      if (spectate) sessionStorage.setItem("dartspoint-spectate-v1", spectate);
      else sessionStorage.removeItem("dartspoint-spectate-v1");
      if (setup) selectMatchSetup(opponent, setup);
      else sessionStorage.removeItem(MATCH_AUTO_START_KEY);
    } catch {
      if (setup) throw new Error("Je spelinstellingen zijn niet opgeslagen. Probeer het nog eens.");
    }
    if(newMatch&&setup&&opponent)await mutate("invite",{targetId:playerId(opponent),roomId:selectedRoom.id,rules:setup.rules,ranked:setup.ranked});
    if(desktop&&!newMatch&&!spectate){setCurrentRoom(room);setSelectingRoom(false);setChatTab("room");setView("home");return;}
    window.location.assign("/spelen");
  }
  function resumeActiveMatch() {
    if (!resumeMatch) return;
    try {
      sessionStorage.setItem("dartspoint-room-v1", resumeMatch.room);
      sessionStorage.setItem("dartspoint-opponent-v1", resumeMatch.opponent);
      sessionStorage.setItem("dartspoint-match-mode-v1", resumeMatch.mode);
      sessionStorage.setItem("dartspoint-open-room-v1", "0");
      sessionStorage.removeItem("dartspoint-new-match-v1");
      sessionStorage.removeItem(MATCH_AUTO_START_KEY);
      sessionStorage.removeItem("dartspoint-spectate-v1");
    } catch { /* Existing local game can still be opened. */ }
    window.location.assign("/spelen?match="+resumeMatch.id);
  }
  async function openChat(name: string) {
    if (playerId(name) === platform.actor?.id) return;
    if (isBlocked(name)) { setToast("Deze speler is geblokkeerd. Deblokkeer via het profiel om een bericht te sturen."); return; }
    const channelId=await openPrivateChatTab(name);if(!channelId)return; setChatTab(`private:${channelId}`); setProfile(null); if(!desktop)setChatOpen(true);
  }
  function invitePlayer(name: string) {
    if (playerId(name) === platform.actor?.id) { navigate("profile"); setProfile(null); return; }
    if (isBlocked(name)) { setToast("Deze speler is geblokkeerd. Deblokkeer via het profiel om uit te dagen."); return; }
    const busy=invitationReason(name);if(busy){setToast(busy);return;}setInvite(playerId(name)??name);
  }
  function openProfile(identifier:string){const id=playerId(identifier);if(id)setProfile(id);}
  const profileLabel=profile?playerByName(profile).name:'';
  async function signOut() { await endDemoSession(); window.location.assign("/inloggen"); }

  const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(roomQuery.toLowerCase()) && (roomFilter === "Alle kamers" || roomFilter === "Favorieten" ? roomFilter !== "Favorieten" || favoriteRooms.includes(room.name) : room.categoryLabel === roomFilter));
  const totalOnline = rooms.reduce((sum, room) => sum + room.count, 0);

  function conversationRow(item: ReturnType<typeof usePrivateChatInbox>[number]) {
    return <div className="lobby-conversation" key={item.channelId}>
      <PlayerActionMenu userId={item.userId} name={item.name} channelId={item.channelId} onInvite={invitePlayer} onProfile={openProfile} onMessage={openChat} onToast={setToast} className="lobby-person-avatar"><Avatar name={item.name}/></PlayerActionMenu><span><strong><PlayerActionMenu userId={item.userId} name={item.name} channelId={item.channelId} onInvite={invitePlayer} onProfile={openProfile} onMessage={openChat} onToast={setToast}/><time>{item.time}</time></strong><button className="lobby-conversation-preview" onClick={() => openChat(item.userId)} aria-label={`Gesprek met ${item.name} openen`}>{item.text}</button></span><button className="lobby-icon-button" onClick={() => openChat(item.userId)} aria-label={`Bericht aan ${item.name}`}>{unread.includes(item.channelId) ? <ChatBadge count={platform.channels.find(c=>c.id===item.channelId)?.unread??0}/> : <ChevronRight size={16}/>}</button>
    </div>;
  }

  return <MotionConfig reducedMotion={preferences.lessMotion ? "always" : "user"}><div className={`darts-lobby ${desktop?"dp-lobby-fixed":""} ${view==="support"?"dp-lobby-support":""}`}>
    <header className="lobby-header"><div className="lobby-header-inner">
      <a href="/lobby" className="lobby-brand" aria-label="DartsPoint lobby"><Brand/></a>
      <nav className="lobby-desktop-nav" aria-label="Hoofdnavigatie">{navigation.filter(item => item.id !== "profile").map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>{item.label}{item.id === "messages" && unread.length > 0 && <ChatBadge count={unreadTotal}/>}{item.id === "friends" && pendingFriends.length > 0 && <b>{pendingFriends.length}</b>}</button>)}</nav>
      <div className="lobby-header-actions"><span className="lobby-demo-label">ONLINE</span><button className="lobby-icon-button lobby-bell" onClick={() => setExtra("notifications")} aria-label="Meldingen"><Bell size={21}/>{(pendingFriends.length > 0 || unread.length > 0 || platform.notifications.some(notification=>notification.kind==='support'&&!notification.read_at)) && <i/>}</button><button className="lobby-header-profile" onClick={() => navigate("profile")} aria-label="Mijn profiel"><Avatar name={selfName()}/><span><PlayerName name={selfName()}/><small><RatingValue player={nick} interactive={false}/></small></span></button></div>
    </div></header>

    <div className={desktop?"dp-workspace dp-lobby-workspace":undefined}><main className="lobby-main" id="main-content">
      {view!=="support"&&<DartsLegalAcceptance activeMatch={platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id))||extra==="settings"}/>}
      {resumeMatch&&<a className="lobby-resume-card" href={'/spelen?match='+resumeMatch.id} onClick={event=>{event.preventDefault();resumeActiveMatch();}} aria-label={'Je wedstrijd is nog bezig. Hervat wedstrijd '+resumeMatch.gameNumber+' tegen '+resumeMatch.opponent}>
        <span className="lobby-resume-icon"><Target size={26}/></span><span><strong>Je wedstrijd is nog bezig</strong><small>Tegen {resumeMatch.opponent} · {resumeMatch.room} · Game {resumeMatch.gameNumber}</small><span className="lobby-resume-explanation">Je tegenstander kan doorspelen. Hervat je wedstrijd wanneer je klaar bent.</span><span className="lobby-resume-action">Wedstrijd hervatten <ArrowUpRight size={18}/></span></span>
      </a>}
      {(settings.platform.announcementActive || settings.platform.maintenance) && <div className="lobby-platform-banners" role="status">{settings.platform.maintenance && <div className="lobby-platform-banner maintenance"><Settings2 size={18}/><span><strong>Onderhoudsbericht</strong>{settings.platform.maintenanceMessage}<small>Er is op dit moment onderhoud.</small></span>{isOwner && <a href="/beheer">Beheren<ArrowUpRight size={14}/></a>}</div>}{settings.platform.announcementActive && <div className="lobby-platform-banner"><Bell size={18}/><span>{settings.platform.announcement}</span></div>}</div>}
      {supportContent&&<div hidden={view!=="support"}>{supportContent}</div>}
      {desktop&&confirmedRoom&&view==="home"&&!selectingRoom&&<RoomCommunity roomId={confirmedRoom.id} onChooseRoom={()=>setSelectingRoom(true)}/>}
      {view!=="support"&&!(desktop&&confirmedRoom&&view==="home"&&!selectingRoom)&&<div className="lobby-page-heading lobby-overview-heading">
        <div><span className="lobby-eyebrow">DARTSPOINT</span>{view!=="home"&&<button className="lobby-screen-back" onClick={()=>navigate("home")} aria-label="Terug naar de lobby"><ChevronRight size={20} style={{transform:"rotate(180deg)"}}/></button>}<h1 ref={headingRef} tabIndex={-1}>{view === "home" ? "Alle kamers." : view === "friends" ? "Vrienden." : view === "messages" ? "Privéberichten." : "Jouw profiel."}</h1><p>{view === "home" ? "Kies een kamer en schuif aan." : view === "friends" ? "Je vrienden en vriendschapsverzoeken, op één plek." : view === "messages" ? "Je persoonlijke gesprekken, ook buiten een kamer." : "Je prestaties, speelvoorkeuren en account."}</p></div>
        {view === "home" && <span className="lobby-room-total"><span className="lobby-online-dot"/>{rooms.length} kamers <i/> {totalOnline} {totalOnline === 1 ? "speler" : "spelers"} <small>online</small></span>}
      </div>}

      {view === "home" && !(desktop&&confirmedRoom&&!selectingRoom) && <div className="lobby-room-overview">
        <section className="lobby-rooms-section" aria-label="Alle kamers">
          <div className="lobby-room-controls"><label className="lobby-search"><Search size={18}/><input aria-label="Zoek een kamer" value={roomQuery} onChange={event => setRoomQuery(event.target.value)} placeholder="Zoek een kamer…"/></label><div className="lobby-filter-pills" aria-label="Filter kamers">{["Alle kamers", "Favorieten", "Sociaal", "Competitief", "Ontspannen", "Toernooi"].map(filter => <button key={filter} className={roomFilter === filter ? "active" : ""} onClick={() => setRoomFilter(filter)} aria-pressed={roomFilter === filter}>{filter}</button>)}</div></div>
          <div className="lobby-room-grid">{filteredRooms.map(room => <article className={`lobby-room-card ${room.count >= room.capacity || room.status === "closed" ? "room-is-full" : ""}`} key={room.id}>
            <div className="lobby-room-top"><span className="lobby-room-symbol">{room.emoji}</span><span className="lobby-room-category">{room.status === "private" ? "Privé" : room.status === "closed" ? "Gesloten" : room.categoryLabel}</span><button onClick={() => toggleFavorite(room.name)} className={`lobby-room-favorite ${favoriteRooms.includes(room.name) ? "is-favorite" : ""}`} aria-label={`${room.name} ${favoriteRooms.includes(room.name) ? "uit favorieten verwijderen" : "als favoriet bewaren"}`} aria-pressed={favoriteRooms.includes(room.name)}><Heart size={17} fill={favoriteRooms.includes(room.name) ? "currentColor" : "none"}/></button></div>
            <h2>{room.name}</h2><p>{room.subtitle}</p><div className="lobby-room-numbers"><span><Users size={14}/><strong>{room.count}</strong> / {room.capacity}</span><small>{room.matches} {room.matches === 1 ? "wedstrijd" : "wedstrijden"}</small></div><div className="lobby-occupancy" aria-label={`${room.count} van ${room.capacity} plekken bezet`}><i style={{ width: `${Math.min(100, room.count / room.capacity * 100)}%` }}/></div>
            <button className="lobby-room-enter" onClick={() => enterGame(room.name)} disabled={room.category !== "tournament" && (room.status === "closed" || room.count >= room.capacity)}>{room.category === "tournament" ? "Events & toeschouwen" : room.status === "closed" ? "Kamer gesloten" : room.count >= room.capacity ? "Kamer is vol" : "Stap binnen"}{room.category !== "tournament" && (room.status === "closed" || room.count >= room.capacity) ? <Users size={17}/> : <ArrowUpRight size={18}/>}</button>
          </article>)}</div>
          {filteredRooms.length === 0 && <div className="lobby-empty"><Search size={26}/><h2>Geen kamers gevonden.</h2><p>Probeer een andere naam of bekijk alle kamers.</p><button className="lobby-secondary" onClick={() => { setRoomQuery(""); setRoomFilter("Alle kamers"); }}>Toon alle kamers</button></div>}
        </section>
        <div id="events" className="lobby-event-promotion"><PublishedTournaments activeOnly/></div>
      </div>}

      {view === "friends" && <section className="lobby-card lobby-friends-page"><FriendsPanel roomName={currentRoom} onInvite={invitePlayer} onProfile={openProfile} onMessage={openChat} onSpectate={name => enterGame(getPlayerPresence(name).room || currentRoom, currentOpponent, false, name)}/></section>}
      {view === "messages" && <section className="lobby-card lobby-messages-page"><div className="lobby-card-heading"><h2>Gesprekken</h2>{unread.length > 0 && <span className="lobby-count">{unreadTotal} nieuwe berichten</span>}</div>{orderedConversations.map(conversationRow)}{orderedConversations.length === 0 && <div className="lobby-empty"><MessageCircle size={26}/><h2>Nog geen gesprekken.</h2><p>Open een vriend of speler om een privébericht te sturen.</p><button className="lobby-secondary" onClick={() => navigate("friends")}>Naar je vrienden<ArrowRight size={16}/></button></div>}</section>}
      {view === "profile" && <section className="lobby-card lobby-own-profile"><ProfileView name={selfName()}/><div className="lobby-profile-actions"><SupportQuickLinks className="lobby-secondary" newTab={Boolean(resumeMatch)}/><button className="lobby-secondary" onClick={() => setExtra("ladder")}><Trophy size={17}/>Bekijk de ladder</button><a className="lobby-secondary" href="/clubhuis"><Trophy size={17}/>Mijn wedstrijden en prestaties</a><a className="lobby-secondary" href="/divisies"><Trophy size={17}/>Mijn divisie & ladder</a><a className="lobby-secondary" href="/oefenen"><Target size={17}/>Oefenen</a><a className="lobby-secondary" href="/oefenen?les=1"><CircleHelp size={17}/>Speluitleg</a><button className="lobby-secondary" onClick={() => setExtra("settings")}><Settings2 size={17}/>Instellingen</button>{canManageRoom(currentRoom)&&<button className="lobby-secondary" onClick={() => setExtra("moderation")}><ShieldCheck size={17}/>Kamerbeheer</button>}{isOwner && <a className="lobby-secondary" href="/beheer"><ShieldCheck size={17}/>Platformbeheer</a>}<button className="lobby-text-button" onClick={signOut}><LogOut size={17}/>Uitloggen</button></div></section>}
      <footer className="lobby-footer" style={{flexWrap:"wrap"}}><span><span className="lobby-online-dot"/>DartsPoint · online darten</span><nav aria-label="Informatie" style={{display:"flex",gap:14,flexWrap:"wrap"}}><a href="/handleiding" target="_blank" rel="noopener noreferrer">Hulp</a><a href="/support" target="_blank" rel="noopener noreferrer">Support</a><a href="/algemene-voorwaarden" target="_blank" rel="noopener noreferrer">Voorwaarden</a><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a><a href="/contact" target="_blank" rel="noopener noreferrer">Contact</a></nav><span>Ontwikkeld door <a href="https://dgwebservices.nl" target="_blank" rel="noopener noreferrer">DG Webservices</a></span></footer>
    </main>{desktop&&view!=="support"&&<DesktopCommunity roomId={confirmedRoom?.id} roomName={confirmedRoom?.name} gameId={resumeMatch?.id} opponentName={resumeMatch?.opponent} activeTab={chatTab} onTabChange={setChatTab} onInvite={invitePlayer} onProfile={openProfile} onMessage={openChat} onSpectate={name=>enterGame(confirmedRoom?.name??currentRoom,currentOpponent,false,name)} readEnabled={!extra&&!profile&&!invite}/>}</div>

    <nav className="lobby-mobile-nav" aria-label="Appnavigatie">{navigation.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><span><item.icon size={21}/>{item.id === "messages" && unread.length > 0 && <ChatBadge count={unreadTotal}/>}{item.id === "friends" && pendingFriends.length > 0 && <b>{pendingFriends.length}</b>}</span><small>{item.label}</small></button>)}</nav>

    <Sheet open={!desktop&&chatOpen} onOpenChange={setChatOpen}><SheetContent side="bottom" className="lobby-chat-sheet lobby-chat-fullscreen" showCloseButton={false} onOpenAutoFocus={event => { event.preventDefault(); chatCloseRef.current?.focus({ preventScroll: true }); }}><SheetHeader className="sr-only"><SheetTitle>Berichten</SheetTitle><SheetDescription>Je persoonlijke gesprekken.</SheetDescription></SheetHeader><span className="lobby-sheet-handle"/><button ref={chatCloseRef} className="lobby-chat-close lobby-icon-button" onClick={() => setChatOpen(false)} aria-label="Terug naar berichten"><ChevronRight size={20} style={{transform:"rotate(180deg)"}}/></button><ChatPanel lobby onInvite={invitePlayer} onProfile={openProfile} onMessage={openChat} readEnabled={chatOpen&&!extra&&!profile} roomName={currentRoom} activeTab={chatTab} onTabChange={setChatTab} quiet={false}/></SheetContent></Sheet>
    <Dialog open={!!profile} onOpenChange={open => !open && setProfile(null)}><DialogContent className="dp-dialog profile-dialog lobby-dialog"><DialogHeader className="sr-only"><DialogTitle>Profiel van {profileLabel}</DialogTitle><DialogDescription>Rating, statistieken en contact.</DialogDescription></DialogHeader>{profile && <ProfileView name={profile} roomName={currentRoom}/>}<div className={`lobby-profile-actions ${profileLabel === selfName() ? "lobby-profile-actions-own" : ""}`}>{profileLabel === selfName() ? <><a className="lobby-secondary" href="/clubhuis"><Trophy size={17}/>Mijn prestaties</a>{isOwner && <a className="lobby-secondary" href="/beheer"><ShieldCheck size={17}/>Platformbeheer</a>}<button className="lobby-primary" onClick={() => { setProfile(null); navigate("profile"); }}><UserRound size={17}/>Mijn profiel</button></> : <><button className="lobby-secondary" disabled={!!profile && isBlocked(profile)} onClick={() => profile && openChat(profile)}><MessageCircle size={17}/>Bericht</button><button className="lobby-primary" disabled={!!profile&&(isBlocked(profile)||!!invitationReason(profile))} onClick={() => { if (profile) invitePlayer(profile); setProfile(null); }}><Target size={17}/>{profile&&invitationReason(profile)||'Uitdagen'}</button></>}</div></DialogContent></Dialog>
    <MatchInviteDialog opponent={invite} onClose={() => setInvite(null)} initialRanked={rooms.find(room => room.name === currentRoom)?.category === "ranked"} onStart={async setup => { if (invite) await enterGame(getPlayerPresence(invite).room || currentRoom, invite, false, undefined, true, setup); }}/>

    <Dialog open={!!extra && (extra !== "moderation" || canManageRoom(currentRoom))} onOpenChange={open => !open && setExtra(null)}><DialogContent className={`dp-dialog lobby-dialog ${extra === "tournament" ? "lobby-tournament-dialog" : ""}`}><DialogHeader><DialogTitle>{extra === "ladder" ? "De ladder" : extra === "tournament" ? "DartsPoint-events" : extra === "settings" ? "Jouw speelritme" : extra === "moderation" ? "Kamerbeheer" : "Wat speelt er?"}</DialogTitle><DialogDescription>{extra === "notifications" ? "Uitnodigingen en nieuws uit jouw club." : extra === "settings" ? "Bediening, geluid en sociale voorkeuren." : extra === "moderation" ? `Een fijne kamer voor iedereen · ${currentRoom}` : "DartsPoint community"}</DialogDescription></DialogHeader>{extra === "ladder" && <RankingPanel onProfile={name => { setExtra(null); openProfile(name); }}/>} {extra === "tournament" && <PublishedTournaments/>} {extra === "settings" && <DartsPreferencesPanel/>} {extra === "moderation" && canManageRoom(currentRoom) && <ModeratorPanel room={currentRoom}/>} {extra === "notifications" && <DartsNotifications/>}</DialogContent></Dialog>
    <AnimatePresence>{toast && <motion.div className="lobby-toast" role="status" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={18}/>{toast}<button onClick={() => setToast("")} aria-label="Melding sluiten"><X size={16}/></button></motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
