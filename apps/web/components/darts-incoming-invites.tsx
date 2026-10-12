"use client";
import {useState} from 'react';
import {usePlatform,mutate} from '@/lib/platform-client';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {ArrowRight,Target} from 'lucide-react';
export function IncomingInvites(){const p=usePlatform(),[busy,setBusy]=useState(false),[error,setError]=useState('');const invitation=p.invites.find(i=>i.state==='pending'&&i.invitee_id===p.actor?.id);if(!invitation)return null;
 async function respond(action:'accept'|'reject'){setBusy(true);setError('');try{const result=await mutate('invite/respond',{inviteId:invitation.id,action});if(result.matchId)window.location.assign('/spelen?match='+result.matchId);}catch(e){setError(e instanceof Error?e.message:'De uitnodiging kon niet worden verwerkt.');}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)void respond('reject');}}><DialogContent className="dp-dialog dp-match-invite"><DialogHeader><DialogTitle>{invitation.inviter_name} daagt je uit</DialogTitle><DialogDescription>Een partij {invitation.rules.startScore} · Best of {invitation.rules.bestOf} {invitation.rules.format==='sets'?'legs per set':'legs'} · {invitation.ranked?'Gerankt':'Vrij spelen'}</DialogDescription></DialogHeader><div className="dp-invite-summary"><Target size={24}/><p>Beide spelers bevestigen hun start op het speelveld.</p></div>{error&&<p className="dp-login-error" role="alert">{error}</p>}<button className="dialog-primary" disabled={busy} onClick={()=>void respond('accept')}>Uitnodiging accepteren <ArrowRight size={16}/></button><button className="dp-text-button" disabled={busy} onClick={()=>void respond('reject')}>Afwijzen</button></DialogContent></Dialog>;
}
