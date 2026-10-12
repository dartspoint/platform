"use client";
import {Bell,Flag,UserRoundCheck} from 'lucide-react';
import {mutate,usePlatform} from '@/lib/platform-client';

export function DartsNotifications(){
 const platform=usePlatform();
 const invitations=platform.invites.filter(i=>i.state==='pending'&&i.invitee_id===platform.actor?.id);
 return <div className="lobby-notifications">
  {invitations.map(i=><button key={i.id} onClick={async()=>{const result=await mutate('invite/respond',{inviteId:i.id,action:'accept'});window.location.assign('/spelen?match='+result.matchId);}}><UserRoundCheck size={24}/><span><strong>{i.inviter_name} nodigt je uit</strong><small>Accepteer de wedstrijd</small></span></button>)}
  {platform.notifications.map(n=><div className="notification-item" key={n.id}><span className="notification-icon"><Bell size={21}/></span><div><strong>{n.kind==='report-resolution'?'Je melding is behandeld':n.kind==='friend-request'?'Vriendschapsverzoek':n.kind==='welcome'?'Welkom bij DartsPoint':n.kind==='moderation'?'Bericht van beheer':n.kind==='tournament-reminder'?'Je toernooi begint binnenkort':n.kind==='match-reminder'?'Je divisiewedstrijd':n.kind==='announcement'?'Clubnieuws':'Nieuw bericht'}</strong><p>{n.payload.response??n.payload.reason??n.payload.eventName??n.payload.name??n.payload.body??n.payload.title??''}</p><small>{new Date(n.created_at).toLocaleString('nl-NL')}</small></div></div>)}
  {platform.social.reports.map((r:any)=><div className="notification-item" key={r.id}><span className="notification-icon"><Flag size={21}/></span><div><strong>Melding over {r.name} · {r.status}</strong><p>{r.response||r.reason}</p><small>{r.id}</small></div></div>)}
  {!invitations.length&&!platform.notifications.length&&!platform.social.reports.length&&<p>Je hebt nog geen meldingen.</p>}
 </div>;
}
