'use client';
import { useEffect } from 'react';
import { ArrowUpRight, Check, Gamepad2, X } from 'lucide-react';
import { useNpcDirector, setNpcActiveRoom, respondNpcInvitation, beginHumanNpcMatch, finishHumanNpcMatch, setNpcHumanBusy, getNpcSnapshot, NPC_OPEN_ROOMS } from '@/lib/darts-npc';
import { npcByName } from '@/lib/darts-npc-profiles';
import './darts-npc-profile.css';

export function NpcRoomBridge({room,opponent,matchId,ready,won,winner,ranked,onInvite}:{room:string;opponent:string;matchId:string;ready:boolean;won:boolean;winner:number|null;ranked:boolean;onInvite:(name:string)=>void}){
  const state=useNpcDirector();const profile=npcByName(opponent);
  useEffect(()=>{setNpcActiveRoom(room);},[room]);
  useEffect(()=>{
    if(ready&&!won){if(profile)beginHumanNpcMatch(profile.id,ranked,matchId,room);else setNpcHumanBusy(true);}
    else if(ready&&won&&profile&&winner!==null)finishHumanNpcMatch(profile.id,winner===0,ranked);
    else if(!ready&&!getNpcSnapshot().invitations.some(i=>i.status==='accepted'&&getNpcSnapshot().humanMatch?.id===`human-${i.id}`))setNpcHumanBusy(false);
  },[ready,won,profile?.id,matchId,ranked,winner,room]);
  const invitation=state.invitations.find(i=>i.status==='pending'&&i.room===room);
  if(!NPC_OPEN_ROOMS.includes(room)||!invitation||ready&&!won)return null;
  return <aside className="npc-room-invitation" role="status"><span className="npc-invite-icon"><Gamepad2 size={20}/></span><div><strong>{invitation.name} heeft zin in een potje</strong><span>{invitation.ranked?'Voor DP-punten':'Gewoon oefenen'} · 301 double-out</span></div><button className="npc-invite-accept" onClick={()=>{if(respondNpcInvitation(invitation.id,true))onInvite(invitation.name);}}><Check size={15}/>Bekijken<ArrowUpRight size={14}/></button><button aria-label="Uitnodiging afwijzen" onClick={()=>respondNpcInvitation(invitation.id,false)}><X size={17}/></button></aside>;
}
