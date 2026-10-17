"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';

import {useState} from 'react';
import {usePlatform,mutate} from '@/lib/platform-client';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {ArrowRight,Target} from 'lucide-react';
export function IncomingInvites(){
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("incomingInvites").t;
const p=usePlatform(),[busy,setBusy]=useState(false),[error,setError]=useState('');const invitation=p.invites.find(i=>i.state==='pending'&&i.invitee_id===p.actor?.id);if(!invitation)return null;
 async function respond(action:'accept'|'reject'){setBusy(true);setError('');try{const result=await mutate('invite/respond',{inviteId:invitation.id,action});if(result.matchId)window.location.assign('/spelen?match='+result.matchId);}catch(e){setError(e instanceof Error?e.message:dpFeedback("feedback.je_antwoord_is_niet_verstuurd_probeer_het_nog"));}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)void respond('reject');}}><DialogContent className="dp-dialog dp-match-invite"><DialogHeader><DialogTitle>{invitation.inviter_name} {dpT("incomingInvites.daagt_je_uit")}</DialogTitle><DialogDescription>{dpT("incomingInvites.een_partij")} {invitation.rules.startScore} {dpT("incomingInvites.best_of")} {invitation.rules.bestOf} {invitation.rules.format==='sets'?dpT("incomingInvites.legs_per_set"):dpT("incomingInvites.legs")} · {invitation.ranked?dpT("incomingInvites.gerankt"):dpT("incomingInvites.vrij_spelen")}</DialogDescription></DialogHeader><div className="dp-invite-summary"><Target size={24}/><p>{dpT("incomingInvites.na_het_accepteren_geef_je_allebei_aan_dat")}</p></div>{error&&<p className="dp-login-error" role="alert">{error}</p>}<button className="dialog-primary" disabled={busy} onClick={()=>void respond('accept')}>{dpT("incomingInvites.uitnodiging_accepteren")} <ArrowRight size={16}/></button><button className="dp-text-button" disabled={busy} onClick={()=>void respond('reject')}>{dpT("incomingInvites.afwijzen")}</button></DialogContent></Dialog>;
}
