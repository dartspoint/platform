"use client";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';

import {useState} from 'react';
import {mutate,usePlatform} from '@/lib/platform-client';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
export function RequiredRename(){
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("requiredRename").t;
const platform=usePlatform(),[username,setUsername]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);return <Dialog open={platform.actor?.renameRequired===true}><DialogContent className="dp-dialog" showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onInteractOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>{dpT("requiredRename.kies_een_nieuwe_gebruikersnaam")}</DialogTitle><DialogDescription>{dpT("requiredRename.kies_een_andere_naam_om_verder_te_spelen")}</DialogDescription></DialogHeader><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await mutate('profile/rename',{username});}catch(e){setError(e instanceof Error?e.message:dpFeedback("feedback.we_konden_je_nieuwe_naam_niet_opslaan_probeer"));}finally{setBusy(false);}}}><label htmlFor="required-username">{dpT("requiredRename.nieuwe_gebruikersnaam")}</label><input id="required-username" required minLength={3} maxLength={20} autoComplete="nickname" value={username} onChange={e=>setUsername(e.target.value)} style={{width:'100%',padding:12,marginBlock:12,border:'1px solid #88ad9350',borderRadius:8}}/>{error&&<p role="alert">{error}</p>}<button type="submit" className="dialog-primary" disabled={busy}>{busy?dpT("requiredRename.wordt_opgeslagen"):dpT("requiredRename.gebruikersnaam_opslaan")}</button></form></DialogContent></Dialog>;}
