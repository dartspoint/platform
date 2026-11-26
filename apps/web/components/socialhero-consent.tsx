"use client";
import {useCallback,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/lib/i18n/provider';
import {isPublicPath,stripLocale} from '../../../packages/i18n/src/locale';
import {announceAnalyticsConsent,createAnalyticsConsent,parseAnalyticsConsent,SOCIALHERO_CONSENT_KEY,type AnalyticsConsent} from '@/lib/socialhero-consent';
import './socialhero-consent.css';

function storedConsent(){try{return parseAnalyticsConsent(localStorage.getItem(SOCIALHERO_CONSENT_KEY));}catch{return null;}}
/** The bridge runs on every route; controls appear only on public and auth pages. */
export function SocialHeroConsent(){
 const {t,href}=useI18n(),pathname=usePathname();
 const [record,setRecord]=useState<AnalyticsConsent|null>(null),[ready,setReady]=useState(false),[open,setOpen]=useState(false);
 const showControls=!!pathname&&(isPublicPath(pathname)||['/inloggen','/registreren','/support'].includes(stripLocale(pathname)));
 const apply=useCallback((next:AnalyticsConsent|null)=>{announceAnalyticsConsent(next?.choice==='granted');setRecord(next);setReady(true);if(!next)setOpen(true);},[]);
 useEffect(()=>{
  apply(storedConsent());
  const storage=(event:StorageEvent)=>{if(event.key===SOCIALHERO_CONSENT_KEY||event.key===null)apply(event.key===null?null:parseAnalyticsConsent(event.newValue));};
  const refresh=()=>apply(storedConsent());
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
  // Withdraw synchronously, before storage or React updates can defer feedback.
  apply(next);try{localStorage.setItem(SOCIALHERO_CONSENT_KEY,JSON.stringify(next));}catch{/* A blocked store never restores consent on a later visit. */}
  setOpen(false);
 }
 if(!ready||!showControls)return null;
 return <div className="dp-consent-controls">
  <button className="dp-consent-settings" type="button" onClick={()=>setOpen(true)} aria-expanded={open} aria-controls="dp-analytics-consent">{t('consent.settings')}</button>
  {open&&<aside className="dp-consent-panel" id="dp-analytics-consent" role="region" aria-labelledby="dp-consent-title" aria-describedby="dp-consent-description">
   <h2 id="dp-consent-title">{t('consent.title')}</h2>
   <p id="dp-consent-description">{t('consent.description')} <a href={href('/privacy')}>{t('consent.privacy')}</a></p>
   {record&&<p className="dp-consent-current" role="status">{t(record.choice==='granted'?'consent.enabled':'consent.disabled')}</p>}
   <div className="dp-consent-actions"><button type="button" onClick={()=>choose('granted')}>{t('consent.accept')}</button><button type="button" onClick={()=>choose('denied')}>{t('consent.reject')}</button></div>
   {record?.choice==='granted'&&<button className="dp-consent-withdraw" type="button" onClick={()=>choose('denied')}>{t('consent.withdraw')}</button>}
   {record&&<button className="dp-consent-close" type="button" onClick={()=>setOpen(false)}>{t('common.close')}</button>}
  </aside>}
 </div>;
}
