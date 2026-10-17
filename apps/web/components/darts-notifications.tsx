"use client";
import {useI18n} from '@/lib/i18n/provider';

import {Bell,Flag,UserRoundCheck} from 'lucide-react';
import {mutate,usePlatform} from '@/lib/platform-client';

export function DartsNotifications(){
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpT = useI18n("notifications").t;

 const platform=usePlatform();
 const invitations=platform.invites.filter(i=>i.state==='pending'&&i.invitee_id===platform.actor?.id);
 const activeMatch=platform.matches.some(match=>match.players?.some((player:any)=>player.id===platform.actor?.id));
 return <div className="lobby-notifications">
  {invitations.map(i=><button key={i.id} onClick={async()=>{const result=await mutate('invite/respond',{inviteId:i.id,action:'accept'});window.location.assign('/spelen?match='+result.matchId);}}><UserRoundCheck size={24}/><span><strong>{i.inviter_name} {dpT("notifications.nodigt_je_uit")}</strong><small>{dpT("notifications.accepteer_de_uitnodiging_en_speel_mee")}</small></span></button>)}
  {platform.notifications.map(n=>{const support=n.kind==='support',ticketId=support&&typeof n.payload?.ticketId==='string'?n.payload.ticketId:null;return <div className="notification-item" key={n.id}><span className="notification-icon"><Bell size={21}/></span><div><strong>{support?(n.payload.staff?dpT("notifications.een_supportticket_vraagt_aandacht"):dpT("notifications.er_is_een_reactie_op_je_ticket")):n.kind==='report-resolution'?dpT("notifications.je_melding_is_behandeld"):n.kind==='friend-request'?dpT("notifications.vriendschapsverzoek"):n.kind==='welcome'?dpT("notifications.welkom_bij_dartspoint"):n.kind==='moderation'?dpT("notifications.bericht_van_beheer"):n.kind==='tournament-reminder'?dpT("notifications.je_toernooi_begint_binnenkort"):n.kind==='match-reminder'?dpT("notifications.je_divisiewedstrijd"):n.kind==='announcement'?dpT("notifications.clubnieuws"):dpT("notifications.nieuw_bericht")}{support&&!n.read_at&&<span aria-label={dpT("notifications.ongelezen")} style={{display:'inline-block',width:6,height:6,background:'#ed8c7b',borderRadius:'50%',marginLeft:7}}/>}</strong><p>{support?(Number.isSafeInteger(n.payload.number)?dpT("notifications.bekijk_ticket")+n.payload.number+dpT("notifications.in_je_afgeschermde_inbox"):dpT("notifications.bekijk_de_reactie_in_je_afgeschermde_inbox")):(n.payload.response??n.payload.reason??n.payload.eventName??n.payload.name??n.payload.body??n.payload.title??'')}</p>{ticketId&&<a href={(n.payload.staff?'/team/support':'/mijn-tickets')+'?ticket='+encodeURIComponent(ticketId)} target={activeMatch?'_blank':undefined} rel={activeMatch?'noopener noreferrer':undefined} style={{fontSize:12,textDecoration:'underline',textUnderlineOffset:3}}>{dpT("notifications.open_ticket")}{activeMatch?dpT("notifications.in_nieuw_tabblad"):''}</a>}<small>{new Date(n.created_at).toLocaleString(dpFormatLocale)}</small></div></div>;})}
  {platform.social.reports.map((r:any)=><div className="notification-item" key={r.id}><span className="notification-icon"><Flag size={21}/></span><div><strong>{dpT("notifications.je_melding_over")} {r.name} · {r.status}</strong><p>{r.response||r.reason}</p></div></div>)}
  {!invitations.length&&!platform.notifications.length&&!platform.social.reports.length&&<p>{dpT("notifications.je_hebt_nog_geen_meldingen")}</p>}
 </div>;
}
