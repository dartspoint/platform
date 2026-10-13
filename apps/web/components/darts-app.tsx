"use client";
import {ChatBadge} from "./chat-badge";
import {unreadCount} from "@/lib/chat-unread";
import {canManageRoom} from "@/lib/darts-social";
import {DartsNotifications} from "./darts-notifications";
import {getPlatform,usePlatform,mutate,selfName} from "@/lib/platform-client";
import {useServerGame} from "@/lib/use-server-game";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, Eye, LogOut, MessageCircle, Radio, Settings2, ShieldCheck, Target, Trophy, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GamePanel, useDartsGame } from "@/components/darts-game";
import { MatchInviteDialog } from "@/components/darts-match-invite";
import { matchFormatLabel, matchRulesLabel, type MatchSetup } from "@/lib/darts-match-setup";
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

function SpectatorView({ name, linkedScores, linkedOpponent, linkedTurn, matchLabel = "501 · Best of 3 legs" }: { name: string; linkedScores?: [number,number]; linkedOpponent?: string; linkedTurn?: number; matchLabel?: string }) {
  const platform=usePlatform();const match=platform.matches.find(m=>m.players?.some((p:any)=>p.name===name));
  const live=useServerGame("",match?.id);
  const opponent=match?.players.find((p:any)=>p.name!==name)?.name??linkedOpponent??"";
  const index=match?.players.find((p:any)=>p.name===name)?.seat??0;
  const shownScores=match?index===0?live.scores:[live.scores[1],live.scores[0]]:linkedScores??[0,0];
  const shownTurn=index===0?live.turn:1-live.turn;
  const last=live.lastResult;
  return <div className="spectator-view"><div className="spectator-status"><span className="live-pill"><i/> LIVE</span><span><Eye size={14}/>Meekijken</span></div><div className="spectator-board"><img src="/brand/icon.svg" alt="DartsPoint"/><span>{matchLabel}</span></div><div className="spectator-scores"><div className={shownTurn === 0 ? "active" : ""}><PlayerName name={name}/><strong>{shownScores[0]}</strong></div><span>VS</span><div className={shownTurn === 1 ? "active" : ""}><PlayerName name={opponent}/><strong>{shownScores[1]}</strong></div></div><p className="spectator-last"><Radio size={14}/>{linkedScores ? "Actuele officiële scores" : last}</p><p className="spectator-note">De server verwerkt de worpen van beide spelers.</p></div>;
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
  const roomCount = currentRoom?.count ?? 0;
  const roomCapacity = currentRoom?.capacity ?? 50;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // The lobby passes a local demo selection, never an authoritative match result.
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
      if (players.some(value => value.name === savedSpectator && value.status === "Speelt")) setSpectate(savedSpectator);
      sessionStorage.removeItem("dartspoint-spectate-v1");
    } catch {
      // Storage can be disabled; the default demo remains playable.
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
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--dp-viewport-height", `${height}px`);
      root.style.setProperty("--dp-viewport-top", `${viewport?.offsetTop ?? 0}px`);
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
      root.classList.remove("dp-short-viewport");
    };
  }, []);

  function navigate(next: Section) {
    if (next === "play") setPanel(null);
    else if (next === "rooms") { setRoomView(desktop ? "rooms" : "players"); setPanel("room"); }
    else setPanel(next === "rankings" ? "ladder" : next);
  }
  function togglePanel(next: SocialPanel) {
    if(next==="chat"&&!hasGame){setPanel(null);return;}
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
      sessionStorage.setItem("dartspoint-opponent-v1", invite);
      sessionStorage.setItem("dartspoint-match-mode-v1", setup.ranked ? "ranked-demo" : "casual");
    } catch {}
    await game.startNewMatch(invite, setup); setOpponent(invite); setInvite(null); setPanel(null);
    setChatTab("match");
    setToast("De uitnodiging aan " + invite + " is verstuurd.");
  }
  async function openPrivateChat(name: string) {
    if (name === selfName()) return;
    if (isBlocked(name)) { setToast("Je hebt deze speler geblokkeerd. Deblokkeer via het profiel om contact te maken."); return; }
    await openPrivateChatTab(name);
    setChatTab(`private:${name}`); setProfile(null); setPanel("chat");
    if (desktop) requestAnimationFrame(() => desktopChatRef.current?.querySelector<HTMLInputElement>(".chat-compose input")?.focus({ preventScroll: true }));
  }

  function closePrivateChat(_name: string, nextTab: string) {
    setChatTab(nextTab || "match");
  }

  function invitePlayer(name: string) {
    if (name === selfName()) { setToast("Kies een andere speler om een wedstrijd te starten."); return; }
    if (isBlocked(name)) { setToast("Deze speler is geblokkeerd. Deblokkeer via het profiel om een uitnodiging te sturen."); return; }
    setInvite(name);
  }

  const commonDialog = "dp-dialog";
  const playerProps = { scores: game.scores, opponentName: opponent, roomName: room, gameId: game.id, onInvite: invitePlayer, onProfile: setProfile, onSpectate: setSpectate, onMessage: openPrivateChat, variant };
  const spectatorOpponent = spectate === opponent ? selfName() : spectate === selfName() ? opponent : getPlatform().matches.find(m=>m.players?.some((p:any)=>p.name===spectate))?.players.find((p:any)=>p.name!==spectate)?.name || "";
  const panelTitle = panel === "room" ? roomView === "players" ? room : "Alle kamers" : panel === "chat" ? "Chat" : panel === "ladder" ? "De ladder" : panel === "friends" ? "Vrienden" : panel === "tournaments" ? "Toernooien" : "Jouw DartsPoint";
  const overlayPanel = panel !== null && (!desktop || !["room", "chat", "friends"].includes(panel));
  const interactionBlocked = overlayPanel || !!invite || !!profile || !!spectate || settingsOpen || notifications || moderationOpen;
  const chatProps = { readEnabled: !invite&&!profile&&!spectate&&!settingsOpen&&!notifications&&!moderationOpen&&(desktop&&hasGame? !overlayPanel:!hasGame&&panel===null||panel==="chat"), gameId: game.id, roomId, roomName: room, opponentName: opponent, activeTab: chatTab, onTabChange: setChatTab, onClosePrivateTab: closePrivateChat, quiet: preferences.quietTurn && game.ready && game.turn === 0 && game.phase !== "won" };
  const friendProps = { onInvite: invitePlayer, onProfile: setProfile, onMessage: openPrivateChat, onSpectate: setSpectate, roomName: room, gameId: game.id };

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
        <div className="dp-header-actions">
          <button className="dp-header-notifications" onClick={() => setNotifications(true)} aria-label="Meldingen bekijken"><Bell size={19}/><i aria-hidden="true"/></button>
          <button className="dp-header-profile" onClick={() => setProfile(selfName())} aria-label="Mijn profiel bekijken">
            <span className="dp-header-avatar" aria-hidden="true">{selfName().slice(0,1).toUpperCase()}<span/></span>
            <span className="dp-header-profile-details"><PlayerName name={selfName()}/><small><RatingValue player={playerByName(selfName())} interactive={false}/></small></span>
          </button>
        </div>
      </header>
      <div className="dp-workspace">
        <main ref={stageRef} tabIndex={-1} className="dp-fullscreen-stage" id="main-content" aria-label="Dartwedstrijd">
          {hasGame?<GamePanel game={game} variant={variant} muted={muted} interactionBlocked={interactionBlocked} lessMotion={lessMotion}/>:room?<div className="dp-room-home"><ChatPanel {...chatProps}/></div>:<div className="dp-room-selection"><RoomList currentRoom="" onSelect={chooseRoom}/></div>}
        </main>
        {desktop && hasGame && <aside className="dp-desktop-community" aria-label="Spelers, vrienden en gesprekken">
          <div className="dp-desktop-community-top">
            <section className="dp-desktop-players" aria-label={roomView === "players" ? `Spelers in ${room}` : "Beschikbare kamers"}>
              <div className="dp-desktop-room-toolbar">
                <button onClick={() => setRoomView(current => current === "players" ? "rooms" : "players")} aria-label={roomView === "players" ? "Bekijk alle kamers" : `Terug naar ${room}`} title={roomView === "players" ? "Alle kamers" : "Terug naar de spelers"}><ArrowLeft size={17}/></button>
                <div><strong>{roomView === "players" ? room : "Alle kamers"}</strong><span>{roomView === "players" ? `${roomCount} / ${roomCapacity} spelers` : "Vind jouw plek aan de oche"}</span></div>
                {roomView === "players" && <span className="dp-desktop-live-dot" aria-label="Kamer actief"/>}
              </div>
              <div className={`dp-desktop-room-content ${roomView === "rooms" ? "is-room-list" : ""}`}>
                {roomView === "players" ? <PlayersTable {...playerProps} compact embedded/> : <RoomList currentRoom={room} onSelect={chooseRoom}/>}
              </div>
            </section>
            <div className="dp-desktop-friends"><FriendsPanel {...friendProps} compact embedded/></div>
          </div>
          <div ref={desktopChatRef} className="dp-desktop-chat"><ChatPanel {...chatProps} embedded/></div>
        </aside>}
      </div>
      <nav className="dp-play-nav" aria-label="Spelnavigatie">
        <button ref={playButton} className={!panel ? "active" : ""} onClick={() => hasGame?setPanel(null):window.location.assign("/oefenen")} aria-label={hasGame?"Toon de wedstrijd":"Oefenen in deze kamer"} aria-pressed={!panel}><Target size={21}/><span>{hasGame?"Spelen":"Oefenen"}</span></button>
        <button className={panel === "room" ? "active" : ""} onClick={() => togglePanel("room")} aria-expanded={panel === "room"} aria-controls={panel === "room" ? "dp-social-panel" : undefined}><Users size={21}/><span>Kamer</span></button>
        <button className={panel === "chat" ? "active" : ""} onClick={() => togglePanel("chat")} aria-expanded={panel === "chat"} aria-controls={panel === "chat" ? "dp-social-panel" : undefined}><MessageCircle size={21}/><span>Chat</span><ChatBadge count={chatUnread}/></button>
        <button className={panel === "ladder" ? "active" : ""} onClick={() => togglePanel("ladder")} aria-expanded={panel === "ladder"}><Trophy size={21}/><span>Ladder</span></button>
        <button className={panel === "profile" ? "active" : ""} onClick={() => togglePanel("profile")} aria-expanded={panel === "profile"}><Settings2 size={21}/><span>Meer</span></button>
      </nav>

      <Sheet open={overlayPanel} onOpenChange={open => !open && setPanel(null)} modal={false}>
        <SheetContent id="dp-social-panel" side="bottom" className={`dp-social-sheet ${!hasGame?"dp-social-fullscreen":""} ${panel === "chat" ? "dp-social-sheet-chat" : ""} ${lessMotion ? "reduce-motion" : ""}`} showCloseButton={false}
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
            {!desktop && panel === "room" && (roomView === "players" ? <PlayersTable {...playerProps}/> : <RoomList currentRoom={room} onSelect={chooseRoom}/>)}
            {!desktop && panel === "chat" && <ChatPanel {...chatProps}/>}
            {panel === "ladder" && <><a className="dp-panel-link" href="/divisies"><Trophy size={17}/>Divisieladder & speelrondes<ArrowUpRight size={16}/></a><RankingPanel onProfile={setProfile}/><button className="dp-panel-link" onClick={() => setPanel("tournaments")}><Trophy size={17}/>Bekijk de toernooien<ArrowUpRight size={16}/></button></>}
            {!desktop && panel === "friends" && <><FriendsPanel {...friendProps}/><LiveMatches onSpectate={setSpectate}/></>}
            {panel === "tournaments" && <PublishedTournaments/>}
            {panel === "profile" && <>
              <div className="dp-profile-menu">
                <button onClick={() => setProfile(selfName())}><UserRound size={18}/>Mijn profiel</button>
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
                <p className="settings-note">Partij opgeslagen. Je kunt vanuit de lobby verder spelen.</p>
              </div>
            </>}
          </div>
        </SheetContent>
      </Sheet>
      <AnimatePresence>{toast && <motion.div className="app-toast dp-play-toast" role="status" initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><Check size={17}/><span>{toast}</span><button onClick={() => setToast("")} aria-label="Sluiten"><X size={14}/></button></motion.div>}</AnimatePresence>
    <MatchInviteDialog opponent={invite} onClose={() => setInvite(null)} onStart={acceptInvite} initialRanked={currentRoom?.category === "ranked"}/>
    <Dialog open={!!profile} onOpenChange={open => !open && setProfile(null)}><DialogContent className={`${commonDialog} profile-dialog`}><DialogHeader className="sr-only"><DialogTitle>Profiel van {profile}</DialogTitle><DialogDescription>Spelersprofiel, statistieken en prestaties.</DialogDescription></DialogHeader>{profile && <ProfileView name={profile} roomName={room} gameId={game.id}/>}{profile === selfName() && isOwner && <a href="/beheer" className="dp-panel-link"><ShieldCheck size={16}/>Platformbeheer<ArrowUpRight size={15}/></a>}{profile && profile !== selfName() && <Button className="profile-message-button" variant="outline" disabled={social.blocked.includes(profile)} onClick={() => openPrivateChat(profile)}><MessageCircle size={16}/>Privébericht</Button>}<Button className="dialog-primary profile-invite-button" disabled={!!profile && social.blocked.includes(profile)} onClick={() => { if (profile === selfName()) { setProfile(null); navigate("rankings"); } else { invitePlayer(profile!); setProfile(null); } }}>{profile === selfName() ? "Bekijk de ranglijst" : "Nodig uit voor een potje"}<ArrowUpRight size={16}/></Button></DialogContent></Dialog>
    <Dialog open={!!spectate} onOpenChange={open => !open && setSpectate(null)}><DialogContent className={`${commonDialog} spectator-dialog`}><DialogHeader><DialogTitle>Langs de oche</DialogTitle><DialogDescription>Even meegenieten van de spanning.</DialogDescription></DialogHeader>{spectate && <SpectatorView name={spectate} linkedTurn={spectate === opponent ? 1 - game.turn : spectate === selfName() ? game.turn : undefined} matchLabel={spectate === opponent || spectate === selfName() ? `${matchRulesLabel(game.rules)} · ${matchFormatLabel(game.rules)}` : undefined} linkedScores={spectate === opponent ? [game.scores[1], game.scores[0]] : spectate === selfName() ? game.scores : undefined} linkedOpponent={spectate === opponent ? selfName() : spectate === selfName() ? opponent : undefined}/>}{spectate && <MatchQueue matchId={spectate === opponent || spectate === selfName() ? game.id : `spectate:${[spectate, spectatorOpponent].sort().join(":")}`} onPlayNext={() => { invitePlayer(spectate === selfName() ? opponent : spectate); setSpectate(null); }}/>}<Button className="dialog-primary" onClick={() => setSpectate(null)}>Terug naar jouw wedstrijd <ArrowRight size={15}/></Button></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Jouw speelritme</DialogTitle><DialogDescription>Bediening, geluid en sociale voorkeuren.</DialogDescription></DialogHeader><DartsPreferencesPanel/><Button className="dialog-primary" onClick={() => setSettingsOpen(false)}>Helemaal goed <Check size={16}/></Button></DialogContent></Dialog>
    <Dialog open={moderationOpen&&canManageRoom(currentRoom?.id??"")} onOpenChange={setModerationOpen}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Kamerbeheer</DialogTitle><DialogDescription>Houd {room} een fijne plek voor iedereen.</DialogDescription></DialogHeader><ModeratorPanel room={room}/></DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent className={commonDialog}><DialogHeader><DialogTitle>Even bijpraten</DialogTitle><DialogDescription>Wat er speelt in de club.</DialogDescription></DialogHeader><DartsNotifications/></DialogContent></Dialog>
    </div>
  </MotionConfig>;
}
