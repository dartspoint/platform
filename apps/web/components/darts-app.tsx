"use client";
import {SupportQuickLinks} from "./darts-support-links";
import {ChatBadge} from "./chat-badge";
import {DesktopCommunity,RoomCommunity} from "./darts-workspace";
import {invitationReason} from "@/lib/darts-social";
import {unreadCount} from "@/lib/chat-unread";
import {canManageRoom} from "@/lib/darts-social";
import {DartsNotifications} from "./darts-notifications";
import {getPlatform,usePlatform,mutate,selfName,playerId} from "@/lib/platform-client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Eye, LogOut, MessageCircle, Settings2, ShieldCheck, Target, Trophy, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GamePanel, SpectatorGame, useDartsGame } from "@/components/darts-game";
import { MatchInviteDialog } from "@/components/darts-match-invite";
import { type MatchSetup } from "@/lib/darts-match-setup";
import { Brand } from "@/components/design-studio";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { ChatPanel, FriendsPanel, LiveMatches, PlayersTable, ProfileView, RankingPanel, RoomList, openPrivateChatTab } from "@/components/darts-community";
import { type DesignId } from "@/lib/designs";
import { playerByName, players } from "@/lib/darts-data";
import { getAdminOperations, useAdminOperations } from "@/lib/darts-admin-operations";
import { endDemoSession } from "@/lib/darts-session";
import { useDartsPreferences } from "@/lib/darts-preferences";
import { useDartsSocial, isBlocked } from "@/lib/darts-social";
import { DartsPreferencesPanel } from "@/components/darts-preferences-panel";
import { ModeratorPanel, MatchQueue } from "@/components/darts-social-tools";
import { PublishedTournaments } from "@/components/admin/darts-tournaments";
import { tournamentRoomDestination } from "@/lib/darts-tournament-navigation";
import "./darts-app.css";
import "./darts-play-shell.css";
import "./darts-desktop.css";

type SocialPanel = "room" | "chat" | "ladder" | "profile" | "friends" | "tournaments";
type Section = "play" | "rooms" | "rankings" | "tournaments" | "friends";

type SpectatorAdmission={matchId:string;publicGameId:number;roomId:string;channelId:string};
function SpectatorView({ matchId, variant, lessMotion, onInvite, onProfile, onMessage, onSpectate, onPlayNext }: { matchId?:string; variant:DesignId; lessMotion:boolean; onInvite:(id:string)=>void; onProfile:(id:string)=>void; onMessage:(id:string)=>void; onSpectate:(id:string)=>void; onPlayNext:()=>void }) {
  const platform=usePlatform();
  const [admission,setAdmission]=useState<SpectatorAdmission|null>(null),[message,setMessage]=useState(''),[tab,setTab]=useState('match');
  useEffect(()=>{
    let cancelled=false;setAdmission(null);setMessage('');setTab('match');
    if(!matchId){setMessage('Deze speler speelt op dit moment geen wedstrijd.');return;}
    void mutate<SpectatorAdmission>('match/spectate',{matchId}).then(value=>{
      if(cancelled)return;
      if(value.matchId!==matchId){setMessage('Meekijken lukt nu niet. Probeer het opnieuw.');return;}
      setAdmission(value);
    }).catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:'Je kunt bij deze wedstrijd niet meekijken.');});
    return()=>{cancelled=true;};
  },[matchId]);
  const roomName=platform.rooms.find(room=>room.id===admission?.roomId)?.name??'';
  return <div className="spectator-view">
    <div className="spectator-status"><span className="live-pill"><i/> LIVE</span><span><Eye size={14}/>Meekijken{admission?` · #${admission.publicGameId}`:''}</span></div>
    {message?<p className="spectator-note" role="status">{message}</p>:!admission?<p className="spectator-note" role="status">Even geduld, je kijkt zo mee…</p>:<SpectatorGame matchId={admission.matchId} variant={variant} lessMotion={lessMotion}>
      <ChatPanel gameId={admission.matchId} roomId={admission.roomId} roomName={roomName} activeTab={tab} onTabChange={setTab} embedded compact readEnabled quiet={false} onInvite={onInvite} onProfile={onProfile} onMessage={onMessage} onSpectate={onSpectate}/>
      <MatchQueue matchId={admission.matchId} onPlayNext={onPlayNext}/>
    </SpectatorGame>}
  </div>;
}

export function DartsApp({ variant = "club" }: { variant?: DesignId }) {
  const platform=usePlatform();
  const [panel, setPanel] = useState<SocialPanel | null>(null);
  const [desktop, setDesktop] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const desktopChatRef = useRef<HTMLDivElement>(null);
  const operations = useAdminOperations();
  const isOwner = operations.members.find(member => member.name === selfName())?.role === "owner";
  const [roomView, setRoomView] = useState<"players" | "rooms">("players");
  const [room, setRoom] = useState("");const [roomId,setRoomId]=useState("");
  const [opponent, setOpponent] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [spectate, setSpectate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const preferences = useDartsPreferences();
  const social = useDartsSocial();
  const muted = !preferences.sound;
  const lessMotion = preferences.lessMotion;
  const [toast, setToast] = useState("");
  const [chatTab, setChatTab] = useState("match");
  const playButton = useRef<HTMLButtonElement>(null);
  const closePanelButton = useRef<HTMLButtonElement>(null);
  const game = useDartsGame(opponent);
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get('match');
    const match=platform.matches.find(m=>m.id===requested||!requested&&m.players.some((p:any)=>p.id===platform.actor?.id));
    const membership=platform.players.find(p=>p.id===platform.actor?.id)?.presence.roomId;
    const selected=platform.rooms.find(r=>r.id===(match?.room_id??membership));
    if(selected){if(membership===selected.id){setRoom(selected.name);setRoomId(selected.id);}else void mutate('room',{roomId:selected.id}).then(()=>{setRoom(selected.name);setRoomId(selected.id);}).catch(()=>{});}
  },[]);
  useEffect(()=>{if(game.opponentName)setOpponent(game.opponentName);},[game.opponentName]);
  const currentRoom = operations.rooms.find(value => value.id === roomId);
  const hasGame=!!game.matchId;
  const roomContext: "room-selection"|"room-chat"|"active-match" = hasGame?"active-match":room?"room-chat":"room-selection";
  const chatUnread=unreadCount(platform.chatChannels??[],currentRoom?.id,game.matchId);
  const lastMembership=useRef<string|undefined>(undefined),lastMatch=useRef<string|undefined>(undefined);
  useEffect(()=>{const membership=platform.players.find(p=>p.id===platform.actor?.id)?.presence.roomId;const selected=platform.rooms.find(r=>r.id===membership);if(membership!==lastMembership.current){lastMembership.current=membership;setRoom(selected?.name??'');setRoomId(selected?.id??'');if(selected)setChatTab('room');}},[platform.players,platform.rooms,platform.actor]);
  useEffect(()=>{if(game.matchId&&game.matchId!==lastMatch.current)setChatTab('match');lastMatch.current=game.matchId;},[game.matchId]);
  const roomCount = currentRoom?.count ?? 0;
  const roomCapacity = currentRoom?.capacity ?? 50;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Restore local navigation choices; room and match access follow verified server state.
    try {
      const savedRoom = sessionStorage.getItem("dartspoint-room-v1");
      const eventDestination = savedRoom && tournamentRoomDestination(savedRoom);
      if (eventDestination) { window.location.replace(eventDestination); return; }
      const savedOpponent = sessionStorage.getItem("dartspoint-opponent-v1");
      const savedSpectator = sessionStorage.getItem("dartspoint-spectate-v1");
      const activeMatch = JSON.parse(sessionStorage.getItem("dartspoint-active-match-v2") || "null");
      // Displayed room follows the verified server membership, never sessionStorage.
      if (players.some(value => value.name === savedOpponent && value.name !== selfName())) setOpponent(savedOpponent!);
      if (sessionStorage.getItem("dartspoint-open-room-v1") === "1") {
        setChatTab("room");
      }
      sessionStorage.removeItem("dartspoint-open-room-v1");
      if (platform.players.some(value => value.id === savedSpectator && value.playing)) setSpectate(savedSpectator);
      sessionStorage.removeItem("dartspoint-spectate-v1");
    } catch {
      // Storage can be disabled; verified server state still drives the screen.
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // The visual viewport also shrinks when a phone keyboard opens.
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      // CSS zoom magnifies authored pixel lengths; browser zoom already reports
      // the visual viewport in CSS pixels and needs no device-pixel correction.
      const configuredZoom = Number.parseFloat(getComputedStyle(root).zoom);
      const cssZoom = Number.isFinite(configuredZoom) && configuredZoom > 0 ? configuredZoom : 1;
      root.style.setProperty("--dp-root-css-zoom", String(cssZoom));
      const height = (viewport?.height ?? window.innerHeight) / cssZoom;
      root.style.setProperty("--dp-viewport-height", `${height}px`);
      root.style.setProperty("--dp-viewport-top", `${(viewport?.offsetTop ?? 0) / cssZoom}px`);
      root.classList.toggle("dp-short-viewport", height < 560);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--dp-viewport-height");
      root.style.removeProperty("--dp-viewport-top");
      root.style.removeProperty("--dp-root-css-zoom");
      root.classList.remove("dp-short-viewport");
    };
  }, []);

  function navigate(next: Section) {
    if (next === "play") setPanel(null);
    else if (next === "rooms") { setRoomView(desktop ? "rooms" : "players"); setPanel("room"); }
    else setPanel(next === "rankings" ? "ladder" : next);
  }
  function togglePanel(next: SocialPanel) {
    if (next === "room") setRoomView("players");
    setPanel(current => current === next ? null : next);
  }
  async function chooseRoom(next: string) {
    const selected=platform.rooms.find(r=>r.id===next);if(!selected)return;
    try{await mutate('room',{roomId:selected.id});}catch{return;}
    const eventDestination=tournamentRoomDestination(selected.name,selected.category==='tournament');
    if(eventDestination){window.location.assign(eventDestination);return;}
    setRoomId(selected.id);setRoom(selected.name);setRoomView('players');setChatTab('room');
    const active=platform.matches.some(m=>m.players?.some((p:any)=>p.id===platform.actor.id));
    if(!active){game.clearMatchSelection();setPanel(null);}else setPanel('chat');
    try{sessionStorage.setItem('dartspoint-room-v1',selected.name);}catch{}
    setToast(`Welkom in ${selected.name}.`);
  }
  async function leaveGame(destination: "lobby" | "logout") {
    if (destination === "logout") await endDemoSession();
    window.location.assign(destination === "logout" ? "/inloggen" : "/lobby");
  }
  function requestLeave(destination: "lobby" | "logout") {
    leaveGame(destination);
  }
  async function acceptInvite(setup: MatchSetup) {
    if (!invite || isBlocked(invite)) return;
    const eventDestination = tournamentRoomDestination(room);
    if (eventDestination) { window.location.assign(eventDestination); return; }
    try {
      sessionStorage.setItem("dartspoint-opponent-v1", playerByName(invite).name);
      sessionStorage.setItem("dartspoint-match-mode-v1", setup.ranked ? "ranked-demo" : "casual");
    } catch {}
    await game.startNewMatch(invite, setup); setOpponent(playerByName(invite).name); setInvite(null); setPanel(null);
    setChatTab("match");
    setToast("De uitnodiging aan " + playerByName(invite).name + " is verstuurd.");
  }
  async function openPrivateChat(name: string) {
    if (playerId(name) === platform.actor?.id) return;
    if (isBlocked(name)) { setToast("Je hebt deze speler geblokkeerd. Deblokkeer via het profiel om contact te maken."); return; }
    const channelId=await openPrivateChatTab(name);if(!channelId)return;
    setChatTab(`private:${channelId}`); setProfile(null); setPanel("chat");
    if (desktop) requestAnimationFrame(() => desktopChatRef.current?.querySelector<HTMLInputElement>(".chat-compose input")?.focus({ preventScroll: true }));
  }

  function closePrivateChat(_name: string, nextTab: string) {
    setChatTab(nextTab || "match");
  }

  function invitePlayer(name: string) {
    if (playerId(name) === platform.actor?.id) { setToast("Kies een andere speler om een wedstrijd te starten."); return; }
    if (isBlocked(name)) { setToast("Deze speler is geblokkeerd. Deblokkeer via het profiel om een uitnodiging te sturen."); return; }
    const busy=invitationReason(name);if(busy){setToast(busy);return;}setInvite(playerId(name)??name);
  }

  function openProfile(identifier:string){const id=playerId(identifier);if(id)setProfile(id);}
  const profileLabel=profile?playerByName(profile).name:'';
  const commonDialog = "dp-dialog";
  const playerProps = { scores: game.scores, opponentName: opponent, roomName: room, gameId: game.id, onInvite: invitePlayer, onProfile: openProfile, onSpectate: setSpectate, onMessage: openPrivateChat, variant };
  const spectatorMatchId=platform.matches.find(m=>m.players?.some((p:any)=>p.id===playerId(spectate??'')))?.id;
  const panelTitle = panel === "room" ? roomView === "players" ? room : "Alle kamers" : panel === "chat" ? "Chat" : panel === "ladder" ? "De ladder" : panel === "friends" ? "Vrienden" : panel === "tournaments" ? "Toernooien" : "Jouw DartsPoint";
  const overlayPanel = panel !== null && (!desktop || !["chat", "friends"].includes(panel));
  const interactionBlocked = overlayPanel || !!invite || !!profile || !!spectate || settingsOpen || notifications || moderationOpen;
  const chatProps = { lobby:!room, readEnabled: !invite&&!profile&&!spectate&&!settingsOpen&&!notifications&&!moderationOpen&&(desktop? !overlayPanel:!hasGame&&panel===null||panel==="chat"), gameId: game.id, roomId, roomName: room, opponentName: opponent, activeTab: chatTab, onTabChange: setChatTab, onClosePrivateTab: closePrivateChat, onInvite:invitePlayer,onProfile:openProfile,onMessage:openPrivateChat,onSpectate:setSpectate, quiet: preferences.quietTurn && game.ready && game.turn === 0 && game.phase !== "won" };
  const friendProps = { onInvite: invitePlayer, onProfile: openProfile, onMessage: openPrivateChat, onSpectate: setSpectate, roomName: room, gameId: game.id };

  return <MotionConfig reducedMotion={lessMotion ? "always" : "user"}>
    <div data-room-context={roomContext} className={`darts-app dp-fullscreen design-${variant} ${overlayPanel && !desktop ? "has-social-panel" : ""} ${desktop ? "is-desktop-workspace" : ""} ${!hasGame ? "dp-room-mode" : ""} ${lessMotion ? "reduce-motion" : ""}`}>
      <header className="dp-game-header">
        <a className="dp-header-lobby" href="/lobby" onClick={event => { event.preventDefault(); requestLeave("lobby"); }} aria-label="Terug naar de lobby"><ArrowLeft size={18}/><span>Lobby</span></a>
        <a className="dp-header-logo" href="/lobby" onClick={event => { event.preventDefault(); requestLeave("lobby"); }} aria-label="DartsPoint · naar de lobby"><Brand/></a>
        <button className="dp-header-room" onClick={() => navigate("rooms")} aria-label={`Bekijk kamers · ${room}, ${roomCount} van ${roomCapacity} spelers`} aria-expanded={desktop ? roomView === "rooms" : panel === "room"}>
          <span className="dp-header-online" aria-hidden="true"/><span>{room}</span><small>{roomCount}/{roomCapacity}</small><ChevronDown size={14}/>
        </button>
        <div className="dp-desktop-nav" aria-label="Meer in DartsPoint">
          <button onClick={() => togglePanel("ladder")} className={panel === "ladder" ? "active" : ""}><Trophy size={17}/><span>Ladder</span></button>
          <button onClick={() => togglePanel("tournaments")} className={panel === "tournaments" ? "active" : ""}><Target size={17}/><span>Events</span></button>
          <button onClick={() => togglePanel("profile")} className={panel === "profile" ? "active" : ""} aria-label="Spelersmenu openen"><Settings2 size={17}/></button>
        </div>
        <div className="dp-header-actions"><a className="dp-header-notifications dp-header-help" href="/support" target="_blank" rel="noopener noreferrer" aria-label="Hulp en tickets openen in een nieuw tabblad"><CircleHelp size={19}/></a>
          <button className="dp-header-notifications" onClick={() => setNotifications(true)} aria-label="Meldingen bekijken"><Bell size={19}/>{platform.notifications.some(notification=>!notification.read_at)&&<i aria-hidden="true"/>}</button>
          <button className="dp-header-profile" onClick={() => openProfile(selfName())} aria-label="Mijn profiel bekijken">
            <span className="dp-header-avatar" aria-hidden="true">{selfName().slice(0,1).toUpperCase()}<span/></span>
            <span className="dp-header-profile-details"><PlayerName name={selfName()}/><small><RatingValue player={playerByName(selfName())} interactive={false}/></small></span>
          </button>
        </div>
      </header>
      <div className="dp-workspace">
        <main ref={stageRef} tabIndex={-1} className="dp-fullscreen-stage" id="main-content" aria-label="Dartwedstrijd">
          {hasGame?<GamePanel game={game} variant={variant} muted={muted} interactionBlocked={interactionBlocked} lessMotion={lessMotion}/>:room?<div className="dp-room-home"><RoomCommunity roomId={roomId} onChooseRoom={()=>navigate("rooms")} onPlayers={()=>{if(desktop)document.querySelector<HTMLInputElement>(".dp-desktop-players .players-toolbar input")?.focus();else {setRoomView("players");setPanel("room");}}} onTournaments={()=>togglePanel("tournaments")} onProfile={openProfile}/></div>:<div className="dp-room-selection"><RoomList currentRoom="" onSelect={chooseRoom}/></div>}
        </main>
        {desktop && <DesktopCommunity {...chatProps} chatRef={desktopChatRef}/>}
      </div>
      <nav className="dp-play-nav" aria-label="Spelnavigatie">
        <button ref={playButton} className={!panel ? "active" : ""} onClick={() => hasGame?setPanel(null):window.location.assign("/oefenen")} aria-label={hasGame?"Toon de wedstrijd":"Oefenen in deze kamer"} aria-pressed={!panel}><Target size={21}/><span>{hasGame?"Spelen":"Oefenen"}</span></button>
        <button className={panel === "room" ? "active" : ""} onClick={() => togglePanel("room")} aria-expanded={panel === "room"} aria-controls={panel === "room" ? "dp-social-panel" : undefined}><Users size={21}/><span>Kamer</span></button>
        <button className={panel === "chat" ? "active" : ""} onClick={() => togglePanel("chat")} aria-expanded={panel === "chat"} aria-controls={panel === "chat" ? "dp-social-panel" : undefined}><MessageCircle size={21}/><span>Chat</span><ChatBadge count={chatUnread}/></button>
        <button className={panel === "ladder" ? "active" : ""} onClick={() => togglePanel("ladder")} aria-expanded={panel === "ladder"}><Trophy size={21}/><span>Ladder</span></button>
        <button className={panel === "profile" ? "active" : ""} onClick={() => togglePanel("profile")} aria-expanded={panel === "profile"}><Settings2 size={21}/><span>Meer</span></button>
      </nav>

      <Sheet open={overlayPanel} onOpenChange={open => !open && setPanel(null)} modal={false}>
        <SheetContent id="dp-social-panel" data-room-context={roomContext} data-social-panel={panel} side="bottom" className={`dp-social-sheet ${!hasGame?"dp-social-fullscreen":""} ${panel === "chat" ? "dp-social-sheet-chat" : ""} ${lessMotion ? "reduce-motion" : ""}`} showCloseButton={false}
          onInteractOutside={event => event.preventDefault()}
          onOpenAutoFocus={event => { event.preventDefault(); closePanelButton.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={event => { event.preventDefault(); (desktop ? stageRef.current : playButton.current)?.focus({ preventScroll: true }); }}>
          <span className="dp-sheet-handle" aria-hidden="true"/>
          <SheetHeader className={panel === "chat" ? "sr-only" : "dp-social-heading"}>
            {panel === "room" && <button className="dp-room-back" onClick={() => setRoomView(current => current === "players" ? "rooms" : "players")} aria-label={roomView === "players" ? "Bekijk alle kamers" : `Terug naar ${room}`}><ArrowLeft size={20}/></button>}
            <div><SheetTitle>{panelTitle}</SheetTitle><SheetDescription>{panel === "room" ? roomView === "players" ? `${roomCount} / ${roomCapacity} spelers` : "Kies jouw kamer · maximaal 50 spelers" : panel === "chat" ? "Spelchat, kamerchat en privégesprekken" : "Jouw wedstrijd blijft op de achtergrond actief"}</SheetDescription></div>
          </SheetHeader>
          <button ref={closePanelButton} className="dp-social-close" onClick={() => setPanel(null)} aria-label="Paneel sluiten"><X size={20}/></button>
          <div className={`dp-social-body ${panel === "chat" ? "dp-social-body-chat" : ""}`}>
            {panel === "room" && (roomView === "players" ? <PlayersTable {...playerProps}/> : <RoomList currentRoom={room} onSelect={chooseRoom}/>)}
            {!desktop && panel === "chat" && <ChatPanel {...chatProps}/>}
            {panel === "ladder" && <><a className="dp-panel-link" href="/divisies"><Trophy size={17}/>Divisieladder & speelrondes<ArrowUpRight size={16}/></a><RankingPanel onProfile={openProfile}/><button className="dp-panel-link" onClick={() => setPanel("tournaments")}><Trophy size={17}/>Bekijk de toernooien<ArrowUpRight size={16}/></button></>}
            {!desktop && panel === "friends" && <><FriendsPanel {...friendProps}/><LiveMatches onSpectate={setSpectate}/></>}
            {panel === "tournaments" && <PublishedTournaments/>}
            {panel === "profile" && <>
              <div className="dp-profile-menu"><SupportQuickLinks newTab/>
                <button onClick={() => openProfile(selfName())}><UserRound size={18}/>Mijn profiel</button>
                <button onClick={() => setPanel("friends")}><Users size={18}/>Vrienden</button>
                <button onClick={() => setSettingsOpen(true)}><Settings2 size={18}/>Instellingen</button>
                <a href="/oefenen?les=1"><CircleHelp size={18}/>Speluitleg in vijf pijlen</a>
                <a href="/oefenen"><Target size={18}/>Oefenen</a>
                <a href="/clubhuis"><Trophy size={18}/>Mijn wedstrijden en prestaties</a>
                {canManageRoom(currentRoom?.id??"")&&<button onClick={() => setModerationOpen(true)}><ShieldCheck size={18}/>Kamerbeheer</button>}
                {isOwner && <a href="/beheer"><ShieldCheck size={18}/>Platformbeheer</a>}
                <button onClick={() => setNotifications(true)}><Bell size={18}/>Meldingen</button>
                <button onClick={() => setPanel("tournaments")}><Trophy size={18}/>Toernooien</button>
                <a href="/lobby" onClick={event => { event.preventDefault(); requestLeave("lobby"); }}><ArrowLeft size={18}/>Terug naar de lobby</a>
                <button onClick={() => requestLeave("logout")}><LogOut size={18}/>Uitloggen</button>
              </div>
            </>}
          </div>
        </SheetContent>
      </Sheet>
      <AnimatePresence>{toast && <motion.div className="app-toast dp-play-toast" role="status" initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><Check size={17}/><span>{toast}</span><button onClick={() => setToast("")} aria-label="Sluiten"><X size={14}/></button></motion.div>}</AnimatePresence>
    <MatchInviteDialog opponent={invite} onClose={() => setInvite(null)} onStart={acceptInvite} initialRanked={currentRoom?.category === "ranked"}/>
    <Dialog open={!!profile} onOpenChange={open => !open && setProfile(null)}><DialogContent className={`${commonDialog} profile-dialog`}><DialogHeader className="sr-only"><DialogTitle>Profiel van {profileLabel}</DialogTitle><DialogDescription>Spelersprofiel, statistieken en prestaties.</DialogDescription></DialogHeader>{profile && <ProfileView name={profile} roomName={room} gameId={game.id}/>}{profileLabel === selfName() && isOwner && <a href="/beheer" className="dp-panel-link"><ShieldCheck size={16}/>Platformbeheer<ArrowUpRight size={15}/></a>}{profile && profileLabel !== selfName() && <Button className="profile-message-button" variant="outline" disabled={isBlocked(profile)} onClick={() => openPrivateChat(profile)}><MessageCircle size={16}/>Privébericht</Button>}<Button className="dialog-primary profile-invite-button" disabled={!!profile && profileLabel!==selfName()&&(isBlocked(profile)||!!invitationReason(profile))} onClick={() => { if (profileLabel === selfName()) { setProfile(null); navigate("rankings"); } else { invitePlayer(profile!); setProfile(null); } }}>{profileLabel === selfName() ? "Bekijk de ranglijst" : invitationReason(profile??'')||"Nodig uit voor een potje"}<ArrowUpRight size={16}/></Button></DialogContent></Dialog>
    <Dialog open={!!spectate} onOpenChange={open => !open && setSpectate(null)}><DialogContent className={`${commonDialog} spectator-dialog`}><DialogHeader><DialogTitle>Langs de oche</DialogTitle><DialogDescription>Volg de wedstrijd en praat mee. Je eigen partij blijft open.</DialogDescription></DialogHeader>{spectate && <SpectatorView key={spectatorMatchId??spectate} matchId={spectatorMatchId} variant={variant} lessMotion={lessMotion} onInvite={id=>{setSpectate(null);invitePlayer(id);}} onProfile={id=>{setSpectate(null);openProfile(id);}} onMessage={id=>{setSpectate(null);void openPrivateChat(id);}} onSpectate={setSpectate} onPlayNext={()=>{invitePlayer(spectate===selfName()?opponent:spectate);setSpectate(null);}}/>}<Button className="dialog-primary" onClick={() => setSpectate(null)}>Terug naar jouw wedstrijd <ArrowRight size={15}/></Button></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Jouw speelritme</DialogTitle><DialogDescription>Bediening, geluid en sociale voorkeuren.</DialogDescription></DialogHeader><DartsPreferencesPanel/><Button className="dialog-primary" onClick={() => setSettingsOpen(false)}>Helemaal goed <Check size={16}/></Button></DialogContent></Dialog>
    <Dialog open={moderationOpen&&canManageRoom(currentRoom?.id??"")} onOpenChange={setModerationOpen}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Kamerbeheer</DialogTitle><DialogDescription>Houd {room} een fijne plek voor iedereen.</DialogDescription></DialogHeader><ModeratorPanel room={room}/></DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Even bijpraten</DialogTitle><DialogDescription>Wat er speelt in de club.</DialogDescription></DialogHeader><DartsNotifications/></DialogContent></Dialog>
    </div>
  </MotionConfig>;
}
