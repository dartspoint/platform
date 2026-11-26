"use client";
import {useCallback,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/lib/i18n/provider';
import {isPublicPath,stripLocale} from '../../../packages/i18n/src/locale';
import {announceAnalyticsConsent,createAnalyticsConsent,parseAnalyticsConsent,SOCIALHERO_CONSENT_KEY,SOCIALHERO_CONSENT_SESSION_DENIAL_KEY,type AnalyticsConsent} from '@/lib/socialhero-consent';
import './socialhero-consent.css';

// A failed withdrawal must override an older persisted grant until a new,
// explicit choice can be saved. Keep this across client component remounts too.
let unsavedDenial:AnalyticsConsent|null=null;
function storedConsent(){
 if(unsavedDenial){if(unsavedDenial.expiresAt<=Date.now())unsavedDenial=createAnalyticsConsent('denied');return unsavedDenial;}
 try{
  const fallback=sessionStorage.getItem(SOCIALHERO_CONSENT_SESSION_DENIAL_KEY);
  if(fallback!==null){const parsed=parseAnalyticsConsent(fallback);unsavedDenial=parsed?.choice==='denied'?parsed:createAnalyticsConsent('denied');return unsavedDenial;}
 }catch{/* The in-memory override still protects a withdrawal when all storage is blocked. */}
 try{return parseAnalyticsConsent(localStorage.getItem(SOCIALHERO_CONSENT_KEY));}catch{return null;}
}
/** The bridge runs on every route; controls appear only on public and auth pages. */
export function SocialHeroConsent(){
 const {t,href}=useI18n(),pathname=usePathname();
 const [record,setRecord]=useState<AnalyticsConsent|null>(null),[ready,setReady]=useState(false),[open,setOpen]=useState(false),[storageFailed,setStorageFailed]=useState(false);
 const showControls=!!pathname&&(isPublicPath(pathname)||['/inloggen','/registreren','/support'].includes(stripLocale(pathname)));
 const apply=useCallback((next:AnalyticsConsent|null)=>{const current=unsavedDenial??next;announceAnalyticsConsent(current?.choice==='granted');setRecord(current);setStorageFailed(!!unsavedDenial);setReady(true);if(!current)setOpen(true);},[]);
 useEffect(()=>{
  apply(storedConsent());
  const refresh=()=>apply(storedConsent());
  const storage=(event:StorageEvent)=>{if(event.key===SOCIALHERO_CONSENT_KEY||event.key===null)refresh();};
  window.addEventListener('storage',storage);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return ()=>{window.removeEventListener('storage',storage);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[apply]);
 useEffect(()=>{
  if(!record)return;
  const timer=window.setTimeout(()=>apply(storedConsent()),Math.min(Math.max(1,record.expiresAt-Date.now()),2_147_000_000));
  return ()=>window.clearTimeout(timer);
 },[record,apply]);
 function choose(choice:AnalyticsConsent['choice']){
  const next=createAnalyticsConsent(choice);
  // Withdraw synchronously; granting only takes effect after persistence succeeds.
  if(choice==='denied'){unsavedDenial=next;apply(next);}
  try{
   localStorage.setItem(SOCIALHERO_CONSENT_KEY,JSON.stringify(next));
   sessionStorage.removeItem(SOCIALHERO_CONSENT_SESSION_DENIAL_KEY);
   unsavedDenial=null;apply(next);setOpen(false);
  }catch{
   const denied=choice==='denied'?next:createAnalyticsConsent('denied');unsavedDenial=denied;apply(denied);
   // Either store can protect a reload when the other is unavailable. If both
   // deny writes/removal, the in-memory choice remains authoritative in this tab.
   try{sessionStorage.setItem(SOCIALHERO_CONSENT_SESSION_DENIAL_KEY,JSON.stringify(denied));}catch{}
   try{localStorage.setItem(SOCIALHERO_CONSENT_KEY,JSON.stringify(denied));}catch{try{localStorage.removeItem(SOCIALHERO_CONSENT_KEY);}catch{}}
   setOpen(true);
  }
 }
 if(!ready||!showControls)return null;
 return <div className="dp-consent-controls">
  <button className="dp-consent-settings" type="button" onClick={()=>setOpen(true)} aria-expanded={open} aria-controls="dp-analytics-consent">{t('consent.settings')}</button>
  {open&&<aside className="dp-consent-panel" id="dp-analytics-consent" role="region" aria-labelledby="dp-consent-title" aria-describedby="dp-consent-description">
   <h2 id="dp-consent-title">{t('consent.title')}</h2>
   <p id="dp-consent-description">{t('consent.description')} <a href={href('/privacy')}>{t('consent.privacy')}</a></p>
   {record&&<p className="dp-consent-current" role="status">{t(record.choice==='granted'?'consent.enabled':'consent.disabled')}</p>}
   {storageFailed&&<p role="alert">{t('consent.storageFailed')}</p>}
   <div className="dp-consent-actions"><button type="button" onClick={()=>choose('granted')}>{t('consent.accept')}</button><button type="button" onClick={()=>choose('denied')}>{t('consent.reject')}</button></div>
   {record?.choice==='granted'&&<button className="dp-consent-withdraw" type="button" onClick={()=>choose('denied')}>{t('consent.withdraw')}</button>}
   {record&&<button className="dp-consent-close" type="button" onClick={()=>setOpen(false)}>{t('common.close')}</button>}
  </aside>}
 </div>;
}
