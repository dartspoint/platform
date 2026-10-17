"use client";
import {FixedCopy} from "@/components/fixed-copy";
import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';

import {LanguagePicker} from "./language-picker";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck, Target, UserRound, Users } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DART_NUMBERS } from "@/lib/darts-rules";
import { api } from "@/lib/platform-client";
import { Turnstile } from "@/components/turnstile";
import { demoLoginDestination } from "@/lib/darts-login-destination";
import "./darts-login.css";
import "./darts-registration.css";

export function LoginBoard() {
  const point = (radius: number, degrees: number) => {
    const angle = degrees * Math.PI / 180;
    return `${(220 + Math.sin(angle) * radius).toFixed(6)},${(220 - Math.cos(angle) * radius).toFixed(6)}`;
  };
  const wedge = (inner: number, outer: number, start: number, end: number) => `M${point(inner, start)} L${point(outer, start)} A${outer},${outer} 0 0 1 ${point(outer, end)} L${point(inner, end)} A${inner},${inner} 0 0 0 ${point(inner, start)} Z`;
  return <svg className="dp-login-board" viewBox="0 0 440 440" aria-hidden="true">
    <defs>
      <radialGradient id="dp-login-rim"><stop stopColor="#244235"/><stop offset=".75" stopColor="#0b1712"/><stop offset="1" stopColor="#263b32"/></radialGradient>
      <linearGradient id="dp-login-metal"><stop stopColor="#cbd7d3"/><stop offset=".45" stopColor="#677970"/><stop offset=".65" stopColor="#f0f0e9"/><stop offset="1" stopColor="#40594c"/></linearGradient>
      <linearGradient id="dp-login-flight"><stop stopColor="#f06c62"/><stop offset="1" stopColor="#b02f34"/></linearGradient>
    </defs>
    <circle cx="220" cy="220" r="211" fill="url(#dp-login-rim)" stroke="#496255" strokeWidth="2"/>
    <circle cx="220" cy="220" r="206" fill="none" stroke="#819387" strokeOpacity=".16"/>
    <circle cx="220" cy="220" r="176" fill="#070e0b" stroke="#6b776d"/>
    {DART_NUMBERS.map((number, i) => <g key={number}>
      <path d={wedge(15.9, 170, i * 18 - 9, i * 18 + 9)} fill={i % 2 ? "#d6ceb0" : "#252b27"} stroke="#92917c" strokeWidth=".7"/>
      <path d={wedge(99, 107, i * 18 - 9, i * 18 + 9)} fill={i % 2 ? "#3f9276" : "#c64444"} stroke="#aba48d" strokeWidth=".65"/>
      <path d={wedge(162, 170, i * 18 - 9, i * 18 + 9)} fill={i % 2 ? "#3f9276" : "#c64444"} stroke="#aba48d" strokeWidth=".65"/>
      <text x={Number((220 + Math.sin(i * Math.PI / 10) * 190).toFixed(6))} y={Number((220 - Math.cos(i * Math.PI / 10) * 190 + 7).toFixed(6))} textAnchor="middle" fill="#d8dfd4" fontSize="22" fontFamily="'Barlow Condensed', sans-serif">{number}</text>
    </g>)}
    <circle cx="220" cy="220" r="15.9" fill="#3f9276" stroke="#aaa68b" strokeWidth=".7"/>
    <circle cx="220" cy="220" r="6.35" fill="#c64444" stroke="#b2a68f" strokeWidth=".7"/>
    <g transform="translate(220 117) rotate(-15)">
      <path d="M2 0 L12 68 L24 82 L19 53 Z" fill="#000" opacity=".24"/>
      <path d="M0 0 L0 20" stroke="#bac9c0" strokeWidth="1.5"/>
      <path d="M-2 19 L-3 41 Q0 45 3 41 L2 19 Z" fill="url(#dp-login-metal)"/>
      {[23, 27, 31, 35, 39].map(y => <path key={y} d={`M-2 ${y} H2`} stroke="#34433b" strokeWidth=".8"/>)}
      <path d="M0 43 V60" stroke="#b2c2ba" strokeWidth="2"/>
      <path d="M0 52 L-11 63 L-10 81 L0 74 L10 81 L11 63 Z" fill="url(#dp-login-flight)" stroke="#f57a70" strokeWidth=".5"/>
      <path d="M0 53 V75" stroke="#fda898" strokeWidth="1"/>
    </g>
  </svg>;
}

type AuthStep = "email" | "code" | "username" | "ready";

function displayWait(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DartsAuthFlow({ intent = "login" }: { intent?: "login" | "register" }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("login").t;

 const {locale}=useI18n();
 const [step,setStep]=useState<AuthStep>("email"),[email,setEmail]=useState(""),[code,setCode]=useState(""),[nickname,setNickname]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[now,setNow]=useState(0),[sent,setSent]=useState(0);
 const [profile,setProfile]=useState<{username:string;role:string;rating:number}|null>(null),[returning,setReturning]=useState(false),[destination,setDestination]=useState("/lobby"),[captchaToken,setCaptchaToken]=useState(""),[captchaGeneration,setCaptchaGeneration]=useState(0);
 const [legal,setLegal]=useState<{terms:{id:string;version:string;translationId?:string}|null;privacy:{id:string;version:string;translationId?:string}|null}|null>(null),[age16,setAge16]=useState(false),[termsAccepted,setTermsAccepted]=useState(false);
 const captchaRequired=Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),captchaReady=!captchaRequired||Boolean(captchaToken),requestBusy=useRef(false);
 const emailInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null),usernameInput=useRef<HTMLInputElement>(null),readyHeading=useRef<HTMLHeadingElement>(null);
 const isNew=intent==="register",resendWait=Math.max(0,sent+60000-now),expired=sent>0&&now>=sent+600000,locked=false,currentIndex=step==="email"?0:step==="code"?1:2;
 const challenge=sent?{expiresAt:sent+600000}:null;
 const sanitizeOtpInput=(value:string)=>value.replace(/[^0-9]/g,"").slice(0,6);
 useEffect(()=>{setDestination(demoLoginDestination(window.location.search));setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search),messages:Record<string,string>={google_unavailable:dpFeedback("feedback.google_aanmelding_is_nu_niet_beschikbaar_probeer_opnieuw"),google_cancelled:dpFeedback("feedback.google_aanmelding_is_geannuleerd_je_kunt_opnieuw_proberen"),google_expired:dpFeedback("feedback.deze_aanmelding_is_verlopen_start_google_aanmelding_opnieuw")};const authError=params.get('authError');if(authError)setError(messages[authError]??messages.google_unavailable);if(params.get('onboarding')==='1')api('profile').then(actor=>{if(actor.supportOnly){window.location.assign('/mijn-tickets');return;}if(actor.onboarded)window.location.assign(demoLoginDestination(window.location.search));else setStep('username');}).catch(e=>setError(e.message));fetch('/api/documents?locale='+locale,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setLegal(data.current)).catch(()=>setLegal(null));},[locale]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{if(step==="email")emailInput.current?.focus();if(step==="code")codeInput.current?.focus();if(step==="username")usernameInput.current?.focus();if(step==="ready")readyHeading.current?.focus();});return ()=>cancelAnimationFrame(frame);},[step]);
 async function issueCode(event?:FormEvent<HTMLFormElement>){event?.preventDefault();if(busy||requestBusy.current||!captchaReady)return;requestBusy.current=true;setBusy(true);setError("");try{const normalized=email.trim().toLowerCase();await api("auth/request",{email:normalized,locale,...(captchaToken?{captchaToken}:{})});setEmail(normalized);setSent(Date.now());setNow(Date.now());setCode("");setNotice(dpFeedback("feedback.je_inlogcode_is_verstuurd_controleer_ook_je_spammap"));setStep("code");}catch(e){setError(e instanceof Error?e.message:dpFeedback("feedback.we_konden_je_inlogcode_niet_versturen_probeer_het"));}finally{setCaptchaToken("");setCaptchaGeneration(n=>n+1);requestBusy.current=false;setBusy(false);}}
 async function submitCode(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError("");try{const actor=await api("auth/verify",{email,code});if(actor.supportOnly){window.location.assign('/mijn-tickets');return;}if(actor.onboarded){const result=await api("bootstrap");const player=result.players.find((p:any)=>p.id===actor.id);setReturning(true);setProfile({username:actor.username,role:actor.role,rating:player?.rating??1500});setStep("ready");}else setStep("username");}catch(e){setError(e instanceof Error?e.message:dpFeedback("feedback.we_konden_je_code_niet_controleren_probeer_het"));codeInput.current?.select();}finally{setBusy(false);}}
 async function submitUsername(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||!age16||!termsAccepted||!legal?.terms||!legal?.privacy)return;setBusy(true);setError("");try{const r=await fetch('/api/documents?locale='+locale,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'onboard',username:nickname,termsVersionId:legal.terms.id,privacyVersionId:legal.privacy.id,age16Confirmed:true,termsAccepted:true,locale,language:locale,termsTranslationId:legal.terms.translationId,privacyTranslationId:legal.privacy.translationId})}),created=await r.json();if(!r.ok)throw new Error(created.error);setProfile(created);setStep("ready");}catch(e){setError(e instanceof Error?e.message:dpFeedback("feedback.we_konden_je_spelersnaam_niet_opslaan_probeer_het"));}finally{setBusy(false);}}
 async function changeEmail(){await api("auth/logout",{});setCaptchaToken("");setCaptchaGeneration(n=>n+1);setCode("");setNickname("");setProfile(null);setError("");setNotice("");setReturning(false);setStep("email");}
 function enterDemo(){if(profile&&!busy){setBusy(true);window.location.assign(destination);}}

  return <MotionConfig reducedMotion="user"><main className="dp-login-page dp-auth-page">
    <header className="dp-login-header">
      <a href="/" aria-label={dpT("login.dartspoint_startpagina")}><Brand/></a>
      <span className="dp-login-edition"><span/> {dpT("login.jouw_avond_begint_hier")}</span>
      <span className="dp-login-preview-tag">{dpT("login.online_darten")}</span>
    </header>
    <div className="dp-login-layout">
      <section className="dp-login-scene" aria-label={dpT("login.welkom_bij_dartspoint")}>
        <div className="dp-login-orbit dp-login-orbit-one"/><div className="dp-login-orbit dp-login-orbit-two"/>
        <motion.div className="dp-login-scene-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
          <span className="dp-login-eyebrow"><span/> {dpT("login.het_spel_dat_je_samen_speelt")}</span>
          <h2>{isNew ? <>{dpT("login.jouw_eerste")}<br/><span>180.</span></> : <>{dpT("login.nog_een")}<br/><span>{dpT("login.potje")}</span></>}</h2>
          <p>{dpT("login.je_vrienden_jouw_kamer")}<br/>{dpT("login.en_die_ene_perfecte_finish")}</p>
        </motion.div>
        <motion.div className="dp-login-board-scene" initial={{ opacity: 0, rotate: -5, y: 30 }} animate={{ opacity: 1, rotate: 0, y: 0 }} transition={{ duration: .9, delay: .1 }}>
          <LoginBoard/><div className="dp-login-finish-badge"><span>{dpT("login.dat_ene_moment")}</span><strong><Target size={17}/> T20</strong></div>
        </motion.div>
        <div className="dp-login-scene-footer"><span><Users size={15}/> {dpT("login.vind_je_vaste_kamer")}</span><span><MessageCircle size={15}/> {dpT("login.blijf_nog_even_hangen")}</span></div>
      </section>
      <section className="dp-login-entry" aria-labelledby="dp-auth-title">
        <motion.div className="dp-login-card dp-auth-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
          <div className="dp-login-card-topline"><span className="dp-login-eyebrow">{isNew ? dpT("login.jouw_eerste_avond") : dpT("login.welkom_bij_dartspoint_2")}</span><span className="dp-login-mini-target"><Target size={19}/></span></div>
          <ol className="dp-auth-steps" aria-label={dpT("login.inlogstappen")}>
            {["E-mail", "Code", "Profiel"].map((label, index) => <li key={label} data-active={currentIndex === index} data-done={currentIndex > index || step === "ready"} aria-current={currentIndex === index ? "step" : undefined}><span>{currentIndex > index || step === "ready" ? <Check size={11}/> : index + 1}</span><FixedCopy value={label}/></li>)}
          </ol>
          {step === "email" && <>
            <h1 id="dp-auth-title">{isNew ? <>{dpT("login.jouw_plek_aan")}<br/>{dpT("login.het_bord")}<span>.</span></> : <>{dpT("login.schuif_aan")}<span>.</span></>}</h1>
            <p className="dp-login-intro">{dpT("login.ga_verder_met_google_of_ontvang_een_eenmalige")}</p>
            <a className="dp-login-primary" href={'/api/auth/google?locale='+locale+'&next='+encodeURIComponent(destination)}>{dpT("login.doorgaan_met_google")} <ArrowRight size={18}/></a><p className="dp-login-new">{dpT("login.of_met_je_e_mailadres")}</p>
            <form className="dp-login-form" onSubmit={issueCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-email">{dpT("login.e_mailadres")}</label><div className="dp-login-input-wrap"><Mail size={18}/><input ref={emailInput} id="dp-auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={dpT("login.jij_voorbeeld_nl")} value={email} maxLength={254} onChange={event => { setEmail(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-prototype-note" : "dp-auth-prototype-note"}/></div></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy||!captchaReady}>{dpT("login.ontvang_je_inlogcode")} <ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-reassurance"><ShieldCheck size={16}/><span>{dpT("login.je_e_mailadres_is_niet_zichtbaar_voor_andere")}</span></div>
            <p className="dp-login-new">{isNew ? dpT("login.al_eerder_gespeeld") : dpT("login.voor_het_eerst_hier")} <a href={`${isNew ? "/inloggen" : "/registreren"}${destination === "/lobby" ? "" : `?next=${encodeURIComponent(destination)}`}`}>{isNew ? dpT("login.welkom_terug") : dpT("login.maak_het_jouw_avond")} <ArrowRight size={12}/></a></p>
          </>}
          {step === "code" && <>
            <h1 id="dp-auth-title">{dpT("login.een_code")}<br/>{dpT("login.en_je_bent_er")}<span>.</span></h1>
            <p className="dp-login-intro">{dpT("login.voer_de_6_cijfers_in_voor")} <strong className="dp-auth-email">{email}</strong><button className="dp-auth-inline" type="button" onClick={changeEmail} disabled={busy}>{dpT("login.e_mailadres_wijzigen")}</button></p>
            <div className="dp-auth-mail-button" role="status"><span className="dp-auth-mail-icon"><Mail size={19}/></span><span>{dpT("login.je_inlogcode_is_verstuurd")}<small>{dpT("login.controleer_je_inbox_en_spammap")}</small></span><Check size={17}/></div>
            <form className="dp-login-form" onSubmit={submitCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-code">{dpT("login.je_eenmalige_code")}</label><input ref={codeInput} id="dp-auth-code" className="dp-auth-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => { setCode(sanitizeOtpInput(event.target.value)); setError(""); }} placeholder="000000" required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-code-expiry" : "dp-auth-code-expiry"} disabled={busy || locked || expired}/><span className="dp-auth-code-expiry" id="dp-auth-code-expiry"><Clock3 size={13}/>{expired ? dpT("login.deze_code_is_verlopen") : dpT("login.nog_geldig",{value0:displayWait((challenge?.expiresAt ?? now) - now)})}</span></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy || expired || locked}>{busy ? dpT("login.even_controleren") : dpT("login.bevestig_je_code")}<ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-resend"><span>{dpT("login.geen_code_of_code_verlopen")}</span><button type="button" onClick={() => issueCode()} disabled={busy || resendWait > 0 || !captchaReady}><RefreshCw size={13}/>{resendWait > 0 ? dpT("login.opnieuw_over",{value0:displayWait(resendWait)}) : dpT("login.vraag_een_nieuwe_code_aan")}</button></div>
            <p className="dp-auth-notice" role="status">{notice}</p>
          </>}
          {step === "username" && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> {dpT("login.e_mailadres_bevestigd")}</span>
            <h1 id="dp-auth-title">{dpT("login.hoe_noemen")}<br/>{dpT("login.we_je")}<span>?</span></h1>
            <p className="dp-login-intro">{dpT("login.dit_is_je_eerste_keer_kies_de_naam")}</p>
            <form className="dp-login-form" onSubmit={submitUsername} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-username">{dpT("login.spelersnaam")}</label><div className="dp-login-input-wrap"><UserRound size={18}/><input ref={usernameInput} id="dp-auth-username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder={dpT("login.je_naam_aan_het_bord")} value={nickname} onChange={event => { setNickname(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-username-help" : "dp-auth-username-help"}/></div><p className="dp-register-field-help" id="dp-auth-username-help">{dpT("login.3_20_tekens_letters_cijfers_en_geen_spaties")}</p></div>
              <label className="dp-register-field-help"><input type="checkbox" checked={age16} onChange={e=>setAge16(e.target.checked)}/> {dpT("login.ik_ben_ten_minste_16_jaar_voor_zover")}</label>
              <label className="dp-register-field-help"><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/> {dpT("login.ik_aanvaard_de")} <a href="/algemene-voorwaarden" target="_blank" rel="noopener noreferrer">{dpT("login.algemene_voorwaarden")}{legal?.terms?dpT("login.versie")+legal.terms.version+')':''}</a>.</label>
              <p className="dp-register-field-help">{dpT("login.lees_hoe_wij_je_gegevens_gebruiken_in_de")} <a href="/privacy" target="_blank" rel="noopener noreferrer">{dpT("login.privacyverklaring")}{legal?.privacy?dpT("login.versie")+legal.privacy.version+')':''}</a>{dpT("login.we_leggen_vast_welke_versie_je_hebt_ontvangen")}</p>
              {(!legal?.terms||!legal?.privacy)&&<p role="status" className="dp-register-field-help">{dpT("login.registratie_wacht_op_publicatie_van_de_voorwaarden_en")} <a href="/support">{dpT("login.contact_met_support")}</a>.</p>}
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy||!age16||!termsAccepted||!legal?.terms||!legal?.privacy}>{dpT("login.bevestig_mijn_spelersnaam")} <ArrowRight size={18}/></button>
            </form>
            <p className="dp-auth-name-note">{dpT("login.je_begint_met")} <strong>{dpT("login.1500_dp")}</strong>{dpT("login.je_krijgt_een_plek_op_de_ladder_zodra")}</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail}><ArrowLeft size={14}/> {dpT("login.ander_e_mailadres_gebruiken")}</button>
          </>}
          {step === "ready" && profile && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> {returning ? dpT("login.je_bent_ingelogd") : dpT("login.je_spelersprofiel_staat_klaar")}</span>
            <h1 ref={readyHeading} tabIndex={-1} id="dp-auth-title">{returning ? <>{dpT("login.welkom_terug")}<span>.</span></> : <>{dpT("login.dit_is_jouw")}<br/>{dpT("login.startpunt")}<span>.</span></>}</h1>
            <p className="dp-login-intro">{returning ? dpT("login.kies_een_kamer_en_speel_verder_waar_je") : dpT("login.je_spelersnaam_staat_klaar_de_volgende_keer_heb")}</p>
            <div className="dp-register-profile"><span className="dp-register-avatar" aria-hidden="true">{profile.username.slice(0, 2).toUpperCase()}</span><div><strong>{profile.username}</strong><span>{profile.role === "player" ? dpT("login.speler") : profile.role.toUpperCase()}</span></div><span className="dp-register-rating">{Math.round(profile.rating)}<small>{dpT("login.dp")}</small></span></div>
            <p className="dp-register-rating-note">{dpT("login.je_rating_verandert_door_wedstrijden_voor_de_ranking")}</p>
            <button type="button" className="dp-login-primary" onClick={enterDemo} disabled={busy}>{busy ? dpT("login.de_lobby_openen") : dpT("login.open_de_lobby")}<ArrowRight size={18}/></button>
            <p className="dp-auth-sample-note">{dpT("login.je_bent_klaar_voor_je_volgende_dartavond_kies")}</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail} disabled={busy}><ArrowLeft size={14}/> {dpT("login.ander_e_mailadres_gebruiken")}</button>
          </>}
          {(step==="email"||step==="code")&&<Turnstile key={captchaGeneration} onToken={setCaptchaToken}/>}<p className="dp-login-demo-note" id="dp-auth-prototype-note"><ShieldCheck size={15}/><span>{dpT("login.je_code_is_10_minuten_geldig_en_werkt")}</span></p>
          <div className="dp-auth-bottom-links"><LanguagePicker/><a href="/">{dpT("login.terug_naar_dartspoint")}</a></div>
        </motion.div>
      </section>
    </div>
    <footer className="dp-login-footer"><span>{dpT("login.ontwikkeld_door")} <a href="/contact">{dpT("login.dg_webservices")}</a></span><span><a href="/algemene-voorwaarden">{dpT("login.voorwaarden")}</a> · <a href="/privacy">{dpT("login.privacy")}</a> · <a href="/handleiding">{dpT("login.handleiding")}</a> · <a href="/support">{dpT("login.support")}</a></span><span>{dpT("login.tot_aan_de_oche")}</span></footer>
  </main></MotionConfig>;
}

export function DartsLogin() { return <DartsAuthFlow/>; }
