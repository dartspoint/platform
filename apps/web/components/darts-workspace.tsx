"use client";
import {useEffect,useState,type RefObject} from 'react';
import {ArrowUpRight,Target,Users} from 'lucide-react';
import {ChatPanel,FriendsPanel,PlayersTable,ProfileView,openPrivateChatTab} from './darts-community';
import {DartsPractice} from './darts-practice';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {MatchInviteDialog} from './darts-match-invite';
import {mutate,playerId,usePlatform} from '@/lib/platform-client';
import {invitationReason} from '@/lib/darts-social';
import {Brand} from './design-studio';
import './darts-app.css';
import './darts-play-shell.css';
import './darts-desktop.css';

export function useDesktopWorkspace(){const [desktop,setDesktop]=useState(false);useEffect(()=>{const query=matchMedia('(min-width: 1024px)');const update=()=>setDesktop(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);return desktop;}

/** This right-hand tree stays mounted while the left-hand match changes phases. */
export function DesktopCommunity({roomId='',roomName='',gameId='',opponentName='',activeTab,onTabChange,onInvite,onProfile,onMessage,onSpectate,readEnabled=true,quiet=false,chatRef}:{roomId?:string;roomName?:string;gameId?:string;opponentName?:string;activeTab:string;onTabChange:(tab:string)=>void;onInvite:(name:string)=>void;onProfile:(name:string)=>void;onMessage:(name:string)=>void;onSpectate:(name:string)=>void;readEnabled?:boolean;quiet?:boolean;chatRef?:RefObject<HTMLDivElement|null>}){
 const p=usePlatform(),room=p.rooms.find(r=>r.id===roomId),actions={onInvite,onProfile,onMessage,onSpectate};
 return <aside className="dp-desktop-community" aria-label="Spelers, vrienden en gesprekken"><div className="dp-desktop-community-top"><section className="dp-desktop-players" aria-label={room?'Spelers in '+room.name:'Kies een kamer'}><div className="dp-desktop-room-toolbar"><Users size={17}/><div><strong>{room?.name??'Kamergebruikers'}</strong><span>{room?`${room.count} / ${room.capacity} spelers`:'Kies een kamer'}</span></div>{room&&<span className="dp-desktop-live-dot" aria-label="Kamer actief"/>}</div><div className="dp-desktop-room-content">{room?<PlayersTable roomName={room.name} gameId={gameId} {...actions} compact embedded/>:<div className="community-empty"><Users size={22}/><p>Kies een kamer</p><small>De actuele spelers verschijnen hier zodra je een kamer binnenkomt.</small></div>}</div></section><div className="dp-desktop-friends"><FriendsPanel roomName={roomName} gameId={gameId} {...actions} compact embedded/></div></div><div ref={chatRef} className="dp-desktop-chat"><ChatPanel roomId={roomId} roomName={roomName} gameId={gameId} opponentName={opponentName} lobby={!room} activeTab={activeTab} onTabChange={onTabChange} readEnabled={readEnabled} quiet={quiet} {...actions} embedded/></div></aside>;
}

export function RoomCommunity({roomId,onChooseRoom}:{roomId:string;onChooseRoom:()=>void}){
 const p=usePlatform(),room=p.rooms.find(r=>r.id===roomId),announcement=p.settings?.platform;
 const tournaments=p.tournaments.filter(t=>t.published&&['registration','checkin','live'].includes(t.status));
 return <section className="dp-room-community" aria-label="Kameroverzicht"><span className="community-eyebrow">JOUW COMMUNITY</span><h1>{room?.name??'Kies je kamer'}</h1><p>{room?.subtitle??'Schuif aan en ontmoet andere spelers.'}</p><div className="dp-room-community-actions"><a href="/oefenen"><Target size={17}/>Oefenen in deze kamer</a><button type="button" onClick={onChooseRoom}><Users size={17}/>Andere kamer</button></div><section><h2>Aankondigingen</h2>{announcement?.announcementActive&&announcement.announcement?<p>{announcement.announcement}</p>:<p className="dp-room-empty">Er zijn nog geen gepubliceerde aankondigingen.</p>}</section><section><h2>Toernooien</h2>{tournaments.length?tournaments.map(t=><a className="dp-room-tournament" key={t.id} href={'/toernooi/'+encodeURIComponent(t.id)}><strong>{t.name}</strong><span>{t.settings?.room??''}<ArrowUpRight size={15}/></span></a>):<p className="dp-room-empty">Er staan nog geen aankomende toernooien klaar.</p>}</section></section>;
}

export function PracticeWorkspace({tutorial=false}:{tutorial?:boolean}){
 const desktop=useDesktopWorkspace(),p=usePlatform(),own=p.players.find(v=>v.id===p.actor?.id),room=p.rooms.find(r=>r.id===own?.presence.roomId),[tab,setTab]=useState('room'),[profile,setProfile]=useState<string|null>(null),[invite,setInvite]=useState<string|null>(null),[feedback,setFeedback]=useState('');
 useEffect(()=>{setTab('room');},[room?.id]);
 async function openMessage(name:string){const channelId=await openPrivateChatTab(name);if(channelId)setTab('private:'+channelId);}
 function invitePlayer(name:string){const reason=invitationReason(name);if(reason){setFeedback(reason);return;}setInvite(playerId(name)??name);}
 function spectatePlayer(identifier:string){const id=playerId(identifier),match=p.matches.find(m=>m.players?.some((player:any)=>player.id===id));if(!id||!match){setFeedback('Deze wedstrijd is niet meer beschikbaar.');return;}try{sessionStorage.setItem('dartspoint-spectate-v1',id);}catch{setFeedback('Je keuze kon niet worden bewaard. Probeer het opnieuw.');return;}window.location.assign('/spelen');}
 // Keep the practice component at the same tree position. A responsive remount
 // starts another reset, whose late response can complete the visible session.
 const standaloneStyle=desktop?undefined:{display:'contents' as const};
 return <div className={desktop?'darts-app dp-fullscreen is-desktop-workspace dp-practice-workspace':undefined} style={standaloneStyle} data-room-context={desktop?'practice':undefined}>
  {desktop&&<header className="dp-workspace-header"><a href="/lobby" aria-label="DartsPoint lobby"><Brand/></a><strong>{room?.name??'Oefenruimte'}</strong><a href="/spelen">Terug naar de kamer</a></header>}
  <div className={desktop?'dp-workspace':undefined} style={standaloneStyle}>
   <main className={desktop?'dp-fullscreen-stage':undefined} id={desktop?'main-content':undefined} role={desktop?undefined:'presentation'} style={standaloneStyle}><DartsPractice tutorial={tutorial} embedded={desktop}/></main>
   {desktop&&<DesktopCommunity roomId={room?.id} roomName={room?.name} activeTab={tab} onTabChange={setTab} onProfile={setProfile} onInvite={invitePlayer} onMessage={openMessage} onSpectate={spectatePlayer} readEnabled={!profile&&!invite}/>}</div>
  {desktop&&<>{feedback&&<p className="dp-workspace-feedback" role="status">{feedback}</p>}<Dialog open={!!profile} onOpenChange={open=>!open&&setProfile(null)}><DialogContent className="dp-dialog profile-dialog"><DialogHeader className="sr-only"><DialogTitle>Profiel</DialogTitle><DialogDescription>Statistieken en contact.</DialogDescription></DialogHeader>{profile&&<ProfileView name={profile} roomName={room?.name}/>}</DialogContent></Dialog><MatchInviteDialog opponent={invite} onClose={()=>setInvite(null)} initialRanked={room?.category==='ranked'} onStart={async setup=>{if(!invite||!room)return;await mutate('invite',{targetId:playerId(invite),roomId:room.id,rules:setup.rules,ranked:setup.ranked});setInvite(null);}}/></>}
 </div>;
}
