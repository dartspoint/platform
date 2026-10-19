'use client';
import { Clock3, MapPin, Target, Trophy, UserRound } from 'lucide-react';
import { npcCountries, type NpcProfile } from '@/lib/darts-npc-profiles';
import { NPC_STATUS_LABELS, useNpcDirector } from '@/lib/darts-npc';
import './darts-npc-profile.css';

export function NpcProfileView({profile}:{profile:NpcProfile}){
  const state=useNpcDirector();const presence=state.people[profile.id];
  return <div className="profile-view npc-profile" style={{'--npc-accent':profile.signatureColor} as React.CSSProperties}>
    <div className="profile-cover"><div className="profile-cover-orbit"/><span>DARTSPOINT PLAYER CLUB</span></div>
    <div className="profile-identity"><span className="npc-profile-avatar">{profile.displayName.split(' ').map(part=>part[0]).join('').slice(0,2)}</span><div><h2>{profile.nickname}</h2><p>{profile.displayName} · {profile.age} jaar</p><p><MapPin size={12}/>{profile.city}, {npcCountries[profile.country]}</p></div><span className="profile-rating"><Target size={14}/>{Math.round(presence.rating)}<small>DP</small></span></div>
    <div className="npc-profile-presence"><i className={presence.online?'online-dot':'offline-dot'}/>{NPC_STATUS_LABELS[presence.status]}{presence.online&&<> · {presence.room}</>}</div>
    <p className="npc-profile-bio">{profile.bio}</p>
    <div className="profile-stats-grid"><div><span>Wedstrijden</span><strong>{presence.played}</strong><small>Deze demonstratie</small></div><div><span>Gemiddelde</span><strong>{profile.average.toFixed(1)}</strong><small>Speelprofiel per 3 darts</small></div><div><span>Gewonnen</span><strong>{presence.wins}</strong><small>Deze demonstratie</small></div><div><span>Voorkeur</span><strong><Trophy size={20}/></strong><small>{profile.practicePreference>=.5?'Graag oefenen':'Graag voor DP'}</small></div></div>
    <section className="npc-profile-section"><h3>Dit vind ik leuk</h3><div>{profile.interests.map(value=><span key={value}>{value}</span>)}</div></section>
    <section className="npc-profile-section"><h3>Zo speel ik</h3><div>{profile.personality.map(value=><span key={value}>{value}</span>)}</div><p>{profile.conversationStyle}</p></section>
    <div className="npc-profile-facts"><span><Clock3 size={15}/>{profile.preferredHours.start}–{profile.preferredHours.end}</span><span><UserRound size={15}/>{profile.languages.map(lang=>lang==='nl'?'Nederlands':'English').join(' / ')}</span></div>
    <p className="npc-profile-ai">AI-clubspeler · fictief DartsPoint-personage</p>
  </div>;
}

export function NpcMatchPreview({name}:{name:string}){
  const state=useNpcDirector();const match=state.matches.find(match=>match.names.includes(name)&&match.phase==='playing')??state.matches.find(match=>match.names.includes(name));
  if(!match)return <div className="npc-match-preview"><Target size={30}/><h3>Nog geen actieve partij</h3><p>Deze speler is beschikbaar of kijkt mee. In het communityvoorbeeld kun je de regisseur een partij laten plannen.</p><a href="/npc">Open het communityvoorbeeld</a></div>;
  return <div className="npc-match-preview"><span>{match.room} · {match.ranked?'DP-wedstrijd':'Oefenen'} · 301 DO</span><div className="npc-match-preview-scores">{match.names.map((player,index)=><div key={player}><strong>{player}</strong><b>{match.scores[index]}</b><small>{match.phase==='finished'?(match.winner===player?'Gewonnen':'Afgerond'):match.turn%2===index?'Aan de beurt':'Wacht op beurt'}</small></div>)}</div><p>{match.phase==='finished'?`${match.winner} wint${match.delta?` · ${match.delta} DP gewisseld`:''}`:'De lokale regisseur speelt deze demonstratiepartij verder.'}</p></div>;
}
