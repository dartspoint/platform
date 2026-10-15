"use client";

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
 const [step,setStep]=useState<AuthStep>("email"),[email,setEmail]=useState(""),[code,setCode]=useState(""),[nickname,setNickname]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[now,setNow]=useState(0),[sent,setSent]=useState(0);
 const [profile,setProfile]=useState<{username:string;role:string;rating:number}|null>(null),[returning,setReturning]=useState(false),[destination,setDestination]=useState("/lobby"),[captchaToken,setCaptchaToken]=useState(""),[captchaGeneration,setCaptchaGeneration]=useState(0);
 const [legal,setLegal]=useState<{terms:{id:string;version:string}|null;privacy:{id:string;version:string}|null}|null>(null),[age16,setAge16]=useState(false),[termsAccepted,setTermsAccepted]=useState(false);
 const captchaRequired=Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),captchaReady=!captchaRequired||Boolean(captchaToken),requestBusy=useRef(false);
 const emailInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null),usernameInput=useRef<HTMLInputElement>(null),readyHeading=useRef<HTMLHeadingElement>(null);
 const isNew=intent==="register",resendWait=Math.max(0,sent+60000-now),expired=sent>0&&now>=sent+600000,locked=false,currentIndex=step==="email"?0:step==="code"?1:2;
 const challenge=sent?{expiresAt:sent+600000}:null;
 const sanitizeOtpInput=(value:string)=>value.replace(/[^0-9]/g,"").slice(0,6);
 useEffect(()=>{setDestination(demoLoginDestination(window.location.search));setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search),messages:Record<string,string>={google_unavailable:"Google-aanmelding is nu niet beschikbaar. Probeer opnieuw of gebruik een e-mailcode.",google_cancelled:"Google-aanmelding is geannuleerd. Je kunt opnieuw proberen of een e-mailcode gebruiken.",google_expired:"Deze aanmelding is verlopen. Start Google-aanmelding opnieuw of gebruik een e-mailcode."};const authError=params.get('authError');if(authError)setError(messages[authError]??messages.google_unavailable);if(params.get('onboarding')==='1')api('profile').then(actor=>{if(actor.supportOnly){window.location.assign('/mijn-tickets');return;}if(actor.onboarded)window.location.assign(demoLoginDestination(window.location.search));else setStep('username');}).catch(e=>setError(e.message));fetch('/api/documents',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setLegal(data.current)).catch(()=>setLegal(null));},[]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{if(step==="email")emailInput.current?.focus();if(step==="code")codeInput.current?.focus();if(step==="username")usernameInput.current?.focus();if(step==="ready")readyHeading.current?.focus();});return ()=>cancelAnimationFrame(frame);},[step]);
 async function issueCode(event?:FormEvent<HTMLFormElement>){event?.preventDefault();if(busy||requestBusy.current||!captchaReady)return;requestBusy.current=true;setBusy(true);setError("");try{const normalized=email.trim().toLowerCase();await api("auth/request",{email:normalized,...(captchaToken?{captchaToken}:{})});setEmail(normalized);setSent(Date.now());setNow(Date.now());setCode("");setNotice("Je inlogcode is verstuurd. Controleer ook je spammap.");setStep("code");}catch(e){setError(e instanceof Error?e.message:"We konden je inlogcode niet versturen. Probeer het later opnieuw.");}finally{setCaptchaToken("");setCaptchaGeneration(n=>n+1);requestBusy.current=false;setBusy(false);}}
 async function submitCode(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError("");try{const actor=await api("auth/verify",{email,code});if(actor.supportOnly){window.location.assign('/mijn-tickets');return;}if(actor.onboarded){const result=await api("bootstrap");const player=result.players.find((p:any)=>p.id===actor.id);setReturning(true);setProfile({username:actor.username,role:actor.role,rating:player?.rating??1500});setStep("ready");}else setStep("username");}catch(e){setError(e instanceof Error?e.message:"We konden je code niet controleren. Probeer het nog eens.");codeInput.current?.select();}finally{setBusy(false);}}
 async function submitUsername(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||!age16||!termsAccepted||!legal?.terms||!legal?.privacy)return;setBusy(true);setError("");try{const r=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'onboard',username:nickname,termsVersionId:legal.terms.id,privacyVersionId:legal.privacy.id,age16Confirmed:true,termsAccepted:true})}),created=await r.json();if(!r.ok)throw new Error(created.error);setProfile(created);setStep("ready");}catch(e){setError(e instanceof Error?e.message:"We konden je spelersnaam niet opslaan. Probeer het nog eens.");}finally{setBusy(false);}}
 async function changeEmail(){await api("auth/logout",{});setCaptchaToken("");setCaptchaGeneration(n=>n+1);setCode("");setNickname("");setProfile(null);setError("");setNotice("");setReturning(false);setStep("email");}
 function enterDemo(){if(profile&&!busy){setBusy(true);window.location.assign(destination);}}

  return <MotionConfig reducedMotion="user"><main className="dp-login-page dp-auth-page">
    <header className="dp-login-header">
      <a href="/" aria-label="DartsPoint startpagina"><Brand/></a>
      <span className="dp-login-edition"><span/> JOUW AVOND BEGINT HIER</span>
      <span className="dp-login-preview-tag">ONLINE DARTEN</span>
    </header>
    <div className="dp-login-layout">
      <section className="dp-login-scene" aria-label="Welkom bij DartsPoint">
        <div className="dp-login-orbit dp-login-orbit-one"/><div className="dp-login-orbit dp-login-orbit-two"/>
        <motion.div className="dp-login-scene-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
          <span className="dp-login-eyebrow"><span/> HET SPEL DAT JE SAMEN SPEELT.</span>
          <h2>{isNew ? <>Jouw eerste<br/><span>180.</span></> : <>Nog één<br/><span>potje.</span></>}</h2>
          <p>Je vrienden. Jouw kamer.<br/>En die ene perfecte finish.</p>
        </motion.div>
        <motion.div className="dp-login-board-scene" initial={{ opacity: 0, rotate: -5, y: 30 }} animate={{ opacity: 1, rotate: 0, y: 0 }} transition={{ duration: .9, delay: .1 }}>
          <LoginBoard/><div className="dp-login-finish-badge"><span>DAT ENE MOMENT</span><strong><Target size={17}/> T20</strong></div>
        </motion.div>
        <div className="dp-login-scene-footer"><span><Users size={15}/> Vind je vaste kamer</span><span><MessageCircle size={15}/> Blijf nog even hangen</span></div>
      </section>
      <section className="dp-login-entry" aria-labelledby="dp-auth-title">
        <motion.div className="dp-login-card dp-auth-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
          <div className="dp-login-card-topline"><span className="dp-login-eyebrow">{isNew ? "JOUW EERSTE AVOND" : "WELKOM BIJ DARTSPOINT"}</span><span className="dp-login-mini-target"><Target size={19}/></span></div>
          <ol className="dp-auth-steps" aria-label="Inlogstappen">
            {["E-mail", "Code", "Profiel"].map((label, index) => <li key={label} data-active={currentIndex === index} data-done={currentIndex > index || step === "ready"} aria-current={currentIndex === index ? "step" : undefined}><span>{currentIndex > index || step === "ready" ? <Check size={11}/> : index + 1}</span>{label}</li>)}
          </ol>
          {step === "email" && <>
            <h1 id="dp-auth-title">{isNew ? <>Jouw plek aan<br/>het bord<span>.</span></> : <>Schuif aan<span>.</span></>}</h1>
            <p className="dp-login-intro">Ga verder met Google of ontvang een eenmalige e-mailcode. Nieuw hier? Kies daarna zelf je spelersnaam.</p>
            <a className="dp-login-primary" href={'/api/auth/google?next='+encodeURIComponent(destination)}>Doorgaan met Google <ArrowRight size={18}/></a><p className="dp-login-new">Of met je e-mailadres</p>
            <form className="dp-login-form" onSubmit={issueCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-email">E-mailadres</label><div className="dp-login-input-wrap"><Mail size={18}/><input ref={emailInput} id="dp-auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="jij@voorbeeld.nl" value={email} maxLength={254} onChange={event => { setEmail(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-prototype-note" : "dp-auth-prototype-note"}/></div></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy||!captchaReady}>Ontvang je inlogcode <ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-reassurance"><ShieldCheck size={16}/><span>Je e-mailadres is niet zichtbaar voor andere spelers.</span></div>
            <p className="dp-login-new">{isNew ? "Al eerder gespeeld?" : "Voor het eerst hier?"} <a href={`${isNew ? "/inloggen" : "/registreren"}${destination === "/lobby" ? "" : `?next=${encodeURIComponent(destination)}`}`}>{isNew ? "Welkom terug" : "Maak het jouw avond"} <ArrowRight size={12}/></a></p>
          </>}
          {step === "code" && <>
            <h1 id="dp-auth-title">Een code.<br/>En je bent er<span>.</span></h1>
            <p className="dp-login-intro">Voer de 6 cijfers in voor <strong className="dp-auth-email">{email}</strong><button className="dp-auth-inline" type="button" onClick={changeEmail} disabled={busy}>E-mailadres wijzigen</button></p>
            <div className="dp-auth-mail-button" role="status"><span className="dp-auth-mail-icon"><Mail size={19}/></span><span>Je inlogcode is verstuurd<small>Controleer je inbox en spammap</small></span><Check size={17}/></div>
            <form className="dp-login-form" onSubmit={submitCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-code">Je eenmalige code</label><input ref={codeInput} id="dp-auth-code" className="dp-auth-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => { setCode(sanitizeOtpInput(event.target.value)); setError(""); }} placeholder="000000" required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-code-expiry" : "dp-auth-code-expiry"} disabled={busy || locked || expired}/><span className="dp-auth-code-expiry" id="dp-auth-code-expiry"><Clock3 size={13}/>{expired ? "Deze code is verlopen" : `Nog ${displayWait((challenge?.expiresAt ?? now) - now)} geldig`}</span></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy || expired || locked}>{busy ? "Even controleren…" : "Bevestig je code"}<ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-resend"><span>Geen code of code verlopen?</span><button type="button" onClick={() => issueCode()} disabled={busy || resendWait > 0 || !captchaReady}><RefreshCw size={13}/>{resendWait > 0 ? `Opnieuw over ${displayWait(resendWait)}` : "Vraag een nieuwe code aan"}</button></div>
            <p className="dp-auth-notice" role="status">{notice}</p>
          </>}
          {step === "username" && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> E-mailadres bevestigd</span>
            <h1 id="dp-auth-title">Hoe noemen<br/>we je<span>?</span></h1>
            <p className="dp-login-intro">Dit is je eerste keer. Kies de naam waarmee andere spelers je straks herkennen. Je kiest je spelersnaam maar één keer.</p>
            <form className="dp-login-form" onSubmit={submitUsername} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-username">Spelersnaam</label><div className="dp-login-input-wrap"><UserRound size={18}/><input ref={usernameInput} id="dp-auth-username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder="Je naam aan het bord" value={nickname} onChange={event => { setNickname(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-username-help" : "dp-auth-username-help"}/></div><p className="dp-register-field-help" id="dp-auth-username-help">3–20 tekens · letters, cijfers, - en _ · geen spaties</p></div>
              <label className="dp-register-field-help"><input type="checkbox" checked={age16} onChange={e=>setAge16(e.target.checked)}/> Ik ben ten minste 16 jaar. Voor zover wettelijk nodig heb ik toestemming van mijn ouder of wettelijke vertegenwoordiger.</label>
              <label className="dp-register-field-help"><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/> Ik aanvaard de <a href="/algemene-voorwaarden" target="_blank" rel="noopener noreferrer">algemene voorwaarden{legal?.terms?' (versie '+legal.terms.version+')':''}</a>.</label>
              <p className="dp-register-field-help">Lees hoe wij je gegevens gebruiken in de <a href="/privacy" target="_blank" rel="noopener noreferrer">privacyverklaring{legal?.privacy?' (versie '+legal.privacy.version+')':''}</a>. We leggen vast welke versie je hebt ontvangen. Je geeft hiermee geen algemene toestemming voor verwerking of marketing.</p>
              {(!legal?.terms||!legal?.privacy)&&<p role="status" className="dp-register-field-help">Registratie wacht op publicatie van de voorwaarden en privacyverklaring. <a href="/support">Contact met support</a>.</p>}
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy||!age16||!termsAccepted||!legal?.terms||!legal?.privacy}>Bevestig mijn spelersnaam <ArrowRight size={18}/></button>
            </form>
            <p className="dp-auth-name-note">Je begint met <strong>1500 DP</strong>. Je krijgt een plek op de ladder zodra je tien rankingwedstrijden tegen vijf verschillende tegenstanders hebt gespeeld.</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail}><ArrowLeft size={14}/> Ander e-mailadres gebruiken</button>
          </>}
          {step === "ready" && profile && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> {returning ? "Je bent ingelogd" : "Je spelersprofiel staat klaar"}</span>
            <h1 ref={readyHeading} tabIndex={-1} id="dp-auth-title">{returning ? <>Welkom terug<span>.</span></> : <>Dit is jouw<br/>startpunt<span>.</span></>}</h1>
            <p className="dp-login-intro">{returning ? "Kies een kamer en speel verder waar je gebleven was." : "Je spelersnaam staat klaar. De volgende keer heb je alleen een nieuwe inlogcode nodig."}</p>
            <div className="dp-register-profile"><span className="dp-register-avatar" aria-hidden="true">{profile.username.slice(0, 2).toUpperCase()}</span><div><strong>{profile.username}</strong><span>{profile.role === "player" ? "Speler" : profile.role.toUpperCase()}</span></div><span className="dp-register-rating">{Math.round(profile.rating)}<small>DP</small></span></div>
            <p className="dp-register-rating-note">Je rating verandert door wedstrijden voor de ranking. Oefenen en vrij spelen tellen niet mee.</p>
            <button type="button" className="dp-login-primary" onClick={enterDemo} disabled={busy}>{busy ? "De lobby openen…" : "Open de lobby"}<ArrowRight size={18}/></button>
            <p className="dp-auth-sample-note">Je bent klaar voor je volgende dartavond. Kies een kamer en schuif aan.</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail} disabled={busy}><ArrowLeft size={14}/> Ander e-mailadres gebruiken</button>
          </>}
          {(step==="email"||step==="code")&&<Turnstile key={captchaGeneration} onToken={setCaptchaToken}/>}<p className="dp-login-demo-note" id="dp-auth-prototype-note"><ShieldCheck size={15}/><span>Je code is 10 minuten geldig en werkt één keer. Deel je code met niemand. Je e-mailadres blijft privé.</span></p>
          <div className="dp-auth-bottom-links"><a href="/">Terug naar DartsPoint</a></div>
        </motion.div>
      </section>
    </div>
    <footer className="dp-login-footer"><span>Ontwikkeld door <a href="/contact">DG Webservices</a></span><span><a href="/algemene-voorwaarden">Voorwaarden</a> · <a href="/privacy">Privacy</a> · <a href="/handleiding">Handleiding</a> · <a href="/support">Support</a></span><span>TOT AAN DE OCHE</span></footer>
  </main></MotionConfig>;
}

export function DartsLogin() { return <DartsAuthFlow/>; }
