"use client";
import {Bell,Flag,UserRoundCheck} from 'lucide-react';
import {mutate,usePlatform} from '@/lib/platform-client';

export function DartsNotifications(){
 const platform=usePlatform();
 const invitations=platform.invites.filter(i=>i.state==='pending'&&i.invitee_id===platform.actor?.id);
 const activeMatch=platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id));
 return <div className="lobby-notifications">
  {invitations.map(i=><button key={i.id} onClick={async()=>{const result=await mutate('invite/respond',{inviteId:i.id,action:'accept'});window.location.assign('/spelen?match='+result.matchId);}}><UserRoundCheck size={24}/><span><strong>{i.inviter_name} nodigt je uit</strong><small>Accepteer de uitnodiging en speel mee</small></span></button>)}
  {platform.notifications.map(n=>{const support=n.kind==='support',ticketId=support&&typeof n.payload?.ticketId==='string'?n.payload.ticketId:null;return <div className="notification-item" key={n.id}><span className="notification-icon"><Bell size={21}/></span><div><strong>{support?(n.payload.staff?'Een supportticket vraagt aandacht':'Er is een reactie op je ticket'):n.kind==='report-resolution'?'Je melding is behandeld':n.kind==='friend-request'?'Vriendschapsverzoek':n.kind==='welcome'?'Welkom bij DartsPoint':n.kind==='moderation'?'Bericht van beheer':n.kind==='tournament-reminder'?'Je toernooi begint binnenkort':n.kind==='match-reminder'?'Je divisiewedstrijd':n.kind==='announcement'?'Clubnieuws':'Nieuw bericht'}{support&&!n.read_at&&<span aria-label="Ongelezen" style={{display:'inline-block',width:6,height:6,background:'#ed8c7b',borderRadius:'50%',marginLeft:7}}/>}</strong><p>{support?(Number.isSafeInteger(n.payload.number)?'Bekijk ticket #'+n.payload.number+' in je afgeschermde inbox.':'Bekijk de reactie in je afgeschermde inbox.'):(n.payload.response??n.payload.reason??n.payload.eventName??n.payload.name??n.payload.body??n.payload.title??'')}</p>{ticketId&&<a href={(n.payload.staff?'/team/support':'/mijn-tickets')+'?ticket='+encodeURIComponent(ticketId)} target={activeMatch?'_blank':undefined} rel={activeMatch?'noopener noreferrer':undefined} style={{fontSize:12,textDecoration:'underline',textUnderlineOffset:3}}>Open ticket{activeMatch?' in nieuw tabblad ↗':''}</a>}<small>{new Date(n.created_at).toLocaleString('nl-NL')}</small></div></div>;})}
  {platform.social.reports.map((r:any)=><div className="notification-item" key={r.id}><span className="notification-icon"><Flag size={21}/></span><div><strong>Je melding over {r.name} · {r.status}</strong><p>{r.response||r.reason}</p></div></div>)}
  {!invitations.length&&!platform.notifications.length&&!platform.social.reports.length&&<p>Je hebt nog geen meldingen.</p>}
 </div>;
}
