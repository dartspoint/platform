"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck, Target, UserRound, Users } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DART_NUMBERS } from "@/lib/darts-rules";
import { startDemoSession } from "@/lib/darts-session";
import { demoLoginDestination } from "@/lib/darts-login-destination";
import { createDemoOtpCode, demoEmailFingerprint, demoOtpSendWait, DEMO_OTP_MAX_ATTEMPTS, DEMO_OTP_SEND_WINDOW_MS, isValidDemoEmail, makeDemoOtpChallenge, normalizeDemoEmail, readDemoAuthProfiles, sanitizeOtpInput, saveDemoAuthProfile, usernameProblem, verifyDemoOtp, type DemoAuthProfile, type DemoOtpChallenge } from "@/lib/darts-demo-auth";
import { renderDartsOtpEmail } from "@/lib/darts-email-templates";
import "./darts-login.css";
import "./darts-registration.css";

export function LoginBoard() {
  const point = (radius: number, degrees: number) => {
    const angle = degrees * Math.PI / 180;
    return `${220 + Math.sin(angle) * radius},${220 - Math.cos(angle) * radius}`;
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
      <text x={220 + Math.sin(i * Math.PI / 10) * 190} y={220 - Math.cos(i * Math.PI / 10) * 190 + 7} textAnchor="middle" fill="#d8dfd4" fontSize="22" fontFamily="'Barlow Condensed', sans-serif">{number}</text>
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
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [challenge, setChallenge] = useState<DemoOtpChallenge | null>(null);
  const [sentAt, setSentAt] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const [profile, setProfile] = useState<DemoAuthProfile | null>(null);
  const [returning, setReturning] = useState(false);
  const [savedLocally, setSavedLocally] = useState(true);
  const [destination, setDestination] = useState("/lobby");
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const readyHeading = useRef<HTMLHeadingElement>(null);
  const isNew = intent === "register";
  const resendWait = demoOtpSendWait(sentAt, now);
  const expired = challenge ? now >= challenge.expiresAt : false;
  const locked = Boolean(challenge && challenge.attempts >= DEMO_OTP_MAX_ATTEMPTS);
  const mail = challenge ? renderDartsOtpEmail({ code: challenge.code, expiresMinutes: 10, mode: "preview" }) : null;
  const currentIndex = step === "email" ? 0 : step === "code" ? 1 : 2;

  useEffect(() => {
    setDestination(demoLoginDestination(window.location.search));
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (step === "email") emailInput.current?.focus();
      if (step === "code") codeInput.current?.focus();
      if (step === "username") usernameInput.current?.focus();
      if (step === "ready") readyHeading.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  function issueCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    const normalized = normalizeDemoEmail(email);
    if (!isValidDemoEmail(normalized)) {
      setError("Vul een geldig e-mailadres in, bijvoorbeeld naam@voorbeeld.nl.");
      emailInput.current?.focus();
      return;
    }
    const time = Date.now();
    const wait = demoOtpSendWait(sentAt, time);
    if (wait > 0) { setError(`Je kunt over ${displayWait(wait)} een nieuwe democode aanvragen.`); return; }
    try {
      setChallenge(makeDemoOtpChallenge(time, createDemoOtpCode()));
      setSentAt(previous => [...previous.filter(at => time - at < DEMO_OTP_SEND_WINDOW_MS), time]);
      setEmail(normalized);
      setCode("");
      setNow(time);
      setError("");
      setNotice(step === "code" ? "Er staat een nieuwe demomail klaar. Je vorige code werkt niet meer." : "Je demomail staat klaar. Er is geen echte e-mail verstuurd.");
      setCopied(false);
      setStep("code");
      if (step === "code") codeInput.current?.focus();
    } catch { setError("Je browser kon geen democode maken. Probeer het opnieuw in een recente browser."); }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || busy) return;
    const result = verifyDemoOtp(challenge, code, Date.now());
    setChallenge(result.challenge);
    if (result.status !== "verified") {
      const messages = {
        "invalid-format": "Vul de volledige code van 6 cijfers in.",
        expired: "Deze code is verlopen. Vraag hieronder een nieuwe code aan.",
        locked: "Te veel onjuiste pogingen. Vraag hieronder een nieuwe code aan zodra dit kan.",
        incorrect: `Deze code klopt niet. Je hebt nog ${DEMO_OTP_MAX_ATTEMPTS - result.challenge.attempts} poging${result.challenge.attempts === DEMO_OTP_MAX_ATTEMPTS - 1 ? "" : "en"}.`,
      };
      setError(messages[result.status]);
      codeInput.current?.focus();
      codeInput.current?.select();
      return;
    }
    setBusy(true);
    try {
      const key = await demoEmailFingerprint(email);
      const existing = readDemoAuthProfiles().find(value => value.emailFingerprint === key);
      setFingerprint(key);
      setError("");
      setNotice("");
      setChallenge(null);
      setCode("");
      setShowMail(false);
      if (existing) { setProfile(existing); setReturning(true); setStep("ready"); }
      else { setReturning(false); setNickname(""); setStep("username"); }
    } catch { setError("De lokale profielcontrole lukte niet. Probeer het nogmaals."); }
    finally { setBusy(false); }
  }

  function submitUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fingerprint || busy) return;
    const username = nickname.trim();
    const problem = usernameProblem(username, readDemoAuthProfiles(), fingerprint);
    if (problem) { setError(problem); usernameInput.current?.focus(); return; }
    const newProfile: DemoAuthProfile = { emailFingerprint: fingerprint, username, role: "player", rating: 1500, createdAt: Date.now() };
    setSavedLocally(saveDemoAuthProfile(newProfile));
    setProfile(newProfile);
    setNickname(username);
    setError("");
    setStep("ready");
  }

  function changeEmail() {
    setChallenge(null); setCode(""); setNickname(""); setFingerprint(""); setProfile(null);
    setError(""); setNotice(""); setShowMail(false); setCopied(false); setReturning(false); setStep("email");
  }

  async function copyCode() {
    if (!challenge) return;
    try { await navigator.clipboard.writeText(challenge.code); setCopied(true); }
    catch { setCopied(false); }
  }

  function enterDemo() {
    if (!profile || busy) return;
    setBusy(true);
    startDemoSession(profile);
    window.location.assign(demoLoginDestination(window.location.search));
  }

  return <MotionConfig reducedMotion="user"><main className="dp-login-page dp-auth-page">
    <header className="dp-login-header">
      <a href="/" aria-label="DartsPoint startpagina"><Brand/></a>
      <span className="dp-login-edition"><span/> JOUW AVOND BEGINT HIER</span>
      <span className="dp-login-preview-tag">PROTOTYPE</span>
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
            <p className="dp-login-intro">Log in met je e-mailadres en een eenmalige code. Je hebt geen wachtwoord nodig. Nieuw hier? Kies na je code een spelersnaam.</p>
            <form className="dp-login-form" onSubmit={issueCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-email">E-mailadres</label><div className="dp-login-input-wrap"><Mail size={18}/><input ref={emailInput} id="dp-auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="jij@voorbeeld.nl" value={email} maxLength={254} onChange={event => { setEmail(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-prototype-note" : "dp-auth-prototype-note"}/></div></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy}>Ontvang je inlogcode <ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-reassurance"><ShieldCheck size={16}/><span>Je e-mailadres is niet zichtbaar voor andere spelers.</span></div>
            <p className="dp-login-new">{isNew ? "Al eerder gespeeld?" : "Voor het eerst hier?"} <a href={`${isNew ? "/inloggen" : "/registreren"}${destination === "/lobby" ? "" : `?next=${encodeURIComponent(destination)}`}`}>{isNew ? "Welkom terug" : "Maak het jouw avond"} <ArrowRight size={12}/></a></p>
          </>}
          {step === "code" && <>
            <h1 id="dp-auth-title">Een code.<br/>En je bent er<span>.</span></h1>
            <p className="dp-login-intro">Voer de 6 cijfers in voor <strong className="dp-auth-email">{email}</strong><button className="dp-auth-inline" type="button" onClick={changeEmail} disabled={busy}>E-mailadres wijzigen</button></p>
            <button type="button" className="dp-auth-mail-button" onClick={() => setShowMail(true)}><span className="dp-auth-mail-icon"><Mail size={19}/></span><span>Bekijk je demomail<small>Alleen hier zichtbaar · er is niets verstuurd</small></span><ArrowRight size={17}/></button>
            <form className="dp-login-form" onSubmit={submitCode} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-code">Je eenmalige code</label><input ref={codeInput} id="dp-auth-code" className="dp-auth-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => { setCode(sanitizeOtpInput(event.target.value)); setError(""); }} placeholder="000000" required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-code-expiry" : "dp-auth-code-expiry"} disabled={busy || locked || expired}/><span className="dp-auth-code-expiry" id="dp-auth-code-expiry"><Clock3 size={13}/>{expired ? "Deze code is verlopen" : `Nog ${displayWait((challenge?.expiresAt ?? now) - now)} geldig`}</span></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary" disabled={busy || expired || locked}>{busy ? "Even controleren…" : "Bevestig je code"}<ArrowRight size={18}/></button>
            </form>
            <div className="dp-auth-resend"><span>Geen code of code verlopen?</span><button type="button" onClick={() => issueCode()} disabled={busy || resendWait > 0}><RefreshCw size={13}/>{resendWait > 0 ? `Opnieuw over ${displayWait(resendWait)}` : "Vraag een nieuwe code aan"}</button></div>
            <p className="dp-auth-notice" role="status">{notice}</p>
          </>}
          {step === "username" && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> Democode bevestigd</span>
            <h1 id="dp-auth-title">Hoe noemen<br/>we je<span>?</span></h1>
            <p className="dp-login-intro">Dit is je eerste keer. Kies de naam waarmee andere spelers je straks herkennen. Je kiest je spelersnaam maar één keer.</p>
            <form className="dp-login-form" onSubmit={submitUsername} noValidate>
              <div className="dp-login-field"><label htmlFor="dp-auth-username">Spelersnaam</label><div className="dp-login-input-wrap"><UserRound size={18}/><input ref={usernameInput} id="dp-auth-username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder="Jouw naam aan het bord" value={nickname} onChange={event => { setNickname(event.target.value); setError(""); }} required aria-invalid={Boolean(error)} aria-describedby={error ? "dp-auth-error dp-auth-username-help" : "dp-auth-username-help"}/></div><p className="dp-register-field-help" id="dp-auth-username-help">3–20 tekens · A–Z, 0–9, - en _ · geen spaties</p></div>
              {error && <p className="dp-login-error" id="dp-auth-error" role="alert">{error}</p>}
              <button type="submit" className="dp-login-primary">Bevestig mijn spelersnaam <ArrowRight size={18}/></button>
            </form>
            <p className="dp-auth-name-note">Je begint als normale speler met <strong>1500 Elo</strong>. Je spelersnaam blijft wit bij de normale rol. Je rating blijft wit totdat je geplaatst bent.</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail}><ArrowLeft size={14}/> Ander e-mailadres gebruiken</button>
          </>}
          {step === "ready" && profile && <>
            <span className="dp-auth-verified"><CheckCircle2 size={15}/> {returning ? "Lokaal demoprofiel herkend" : "Je lokale demoprofiel staat klaar"}</span>
            <h1 ref={readyHeading} tabIndex={-1} id="dp-auth-title">{returning ? <>Welkom terug<span>.</span></> : <>Dit is jouw<br/>startpunt<span>.</span></>}</h1>
            <p className="dp-login-intro">{returning ? "Je spelersnaam staat al vast. Na je code kun je direct verder." : "De volgende keer wordt je spelersnaam na de code automatisch herkend in deze browser."}</p>
            <div className="dp-register-profile"><span className="dp-register-avatar" aria-hidden="true">{profile.username.slice(0, 2).toUpperCase()}</span><div><strong>{profile.username}</strong><span>Normale speler · nog niet geplaatst</span></div><span className="dp-register-rating">1500<small>ELO</small></span></div>
            <p className="dp-register-rating-note">Je rating groeit mee met je gerankte wedstrijden. Je profiel heeft geen beheerrechten.</p>
            {!savedLocally && <p className="dp-login-error" role="status">Je browser staat lokale opslag niet toe. Dit profiel blijft alleen in dit scherm beschikbaar.</p>}
            <button type="button" className="dp-login-primary" onClick={enterDemo} disabled={busy}>{busy ? "Het prototype openen…" : "Open de speeldemo"}<ArrowRight size={18}/></button>
            <p className="dp-auth-sample-note">De inlogflow gebruikt jouw lokale demoprofiel. De spelomgeving toont daarna nog de bestaande voorbeeldwedstrijd en het vaste demoprofiel van Nick.</p>
            <button type="button" className="dp-register-edit" onClick={changeEmail} disabled={busy}><ArrowLeft size={14}/> Ander e-mailadres gebruiken</button>
          </>}
          <p className="dp-login-demo-note" id="dp-auth-prototype-note"><ShieldCheck size={15}/><span>Interactief prototype: er wordt geen e-mail verstuurd en geen echt account aangemaakt. Je spelersnaam wordt alleen op dit apparaat onthouden; je e-mailadres en codes worden niet opgeslagen.</span></p>
          <div className="dp-auth-bottom-links"><a href="/">Terug naar DartsPoint</a><a href="/mailvoorbeelden">Bekijk onze mails <ArrowRight size={12}/></a></div>
        </motion.div>
      </section>
    </div>
    <footer className="dp-login-footer"><span>DartsPoint</span><span>Het oude gevoel. Een nieuwe avond.</span><span>V1 PROTOTYPE</span></footer>
    <Dialog open={showMail} onOpenChange={open => { setShowMail(open); setCopied(false); }}>
      <DialogContent className="dp-auth-mail-dialog">
        <DialogHeader><DialogTitle>Jouw demomail</DialogTitle><DialogDescription>Zo ontvang je straks je code. Dit voorbeeld is alleen hier zichtbaar; er is geen e-mail verstuurd.</DialogDescription></DialogHeader>
        <div className="dp-auth-mail-meta"><span>Aan <strong>{email}</strong></span><span>Onderwerp <strong>{mail?.subject}</strong></span></div>
        {mail && <iframe title="DartsPoint inlogmail" srcDoc={mail.html} sandbox="" className="dp-auth-mail-preview"/>}
        <div className="dp-auth-mail-actions"><button type="button" className="dp-auth-copy" onClick={copyCode}>{copied ? <Check size={16}/> : <Mail size={16}/>} {copied ? "Code gekopieerd" : "Kopieer code"}</button><button type="button" className="dp-login-primary" onClick={() => setShowMail(false)}>Code invoeren <ArrowRight size={17}/></button></div>
      </DialogContent>
    </Dialog>
  </main></MotionConfig>;
}

export function DartsLogin() { return <DartsAuthFlow/>; }
