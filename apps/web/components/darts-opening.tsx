"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Pause, Play, ShieldCheck, Sparkles, Target, Trophy, X } from "lucide-react";
import styles from "./darts-opening.module.css";

type OpeningStatus = { serverNow: number; opensAt: number; open: boolean };

function validStatus(value: unknown): value is OpeningStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<OpeningStatus>;
  return typeof status.serverNow === "number" && Number.isFinite(status.serverNow) && status.serverNow > 0
    && typeof status.opensAt === "number" && Number.isFinite(status.opensAt) && status.opensAt > 0
    && typeof status.open === "boolean";
}

function SocialIcon({ network }: { network: "facebook" | "instagram" | "tiktok" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {network === "facebook" && <path d="M14.4 22v-9.1h3.1l.5-3.6h-3.6V7c0-1 .3-1.8 1.8-1.8H18V2.1c-.4-.1-1.6-.1-2.9-.1-2.9 0-4.9 1.8-4.9 5.1v2.2H7v3.6h3.2V22z" fill="currentColor" stroke="none"/>}
    {network === "instagram" && <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.6" cy="6.4" r=".9" fill="currentColor" stroke="none"/></>}
    {network === "tiktok" && <path d="M16.1 2h-3.4v13.5a2.8 2.8 0 1 1-2.4-2.8V9.3A6.2 6.2 0 1 0 16.1 15.5V8.8A9 9 0 0 0 21 10V6.6A5.4 5.4 0 0 1 16.1 2Z" fill="currentColor" stroke="none"/>}
  </svg>;
}

export function DartsOpening({ serverNow, opensAt }: { serverNow: number; opensAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((opensAt - serverNow) / 1000)));
  const [paused, setPaused] = useState(false);
  const privacy = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let disposed = false;
    let navigating = false;
    let inFlight = false;
    let retryAt = 0;
    let anchor = { serverNow, localNow: performance.now(), opensAt };
    let controller: AbortController | undefined;

    const secondsLeft = () => Math.max(0, Math.ceil((anchor.opensAt - anchor.serverNow - (performance.now() - anchor.localNow)) / 1000));

    const sync = async () => {
      if (disposed || navigating || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch("/api/opening-status", {
          cache: "no-store", credentials: "omit", headers: { accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("opening-status-unavailable");
        const status: unknown = await response.json();
        if (!validStatus(status)) throw new Error("opening-status-invalid");
        if (disposed) return;
        anchor = { serverNow: status.serverNow, localNow: performance.now(), opensAt: status.opensAt };
        setRemaining(secondsLeft());
        if (status.open) {
          navigating = true;
          window.location.replace("/");
        }
      } catch {
        // A failed check never opens the app early. The monotonic timer and retries continue.
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        retryAt = performance.now() + (secondsLeft() === 0 ? 5_000 : 0);
      }
    };

    const tick = () => {
      const next = secondsLeft();
      setRemaining(next);
      if (next === 0 && performance.now() >= retryAt) void sync();
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") { tick(); void sync(); }
    };
    tick();
    void sync();
    const ticking = window.setInterval(tick, 250);
    const resync = window.setInterval(() => { if (!document.hidden) void sync(); }, 60_000);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(ticking);
      window.clearInterval(resync);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [serverNow, opensAt]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPaused(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return <div className={`${styles.scene}${paused ? ` ${styles.paused}` : ""}`}>
    <div className={styles.atmosphere} aria-hidden="true">
      <div className={styles.orbit}/><div className={`${styles.orbit} ${styles.orbitTwo}`}/>
      <span className={`${styles.crosshair} ${styles.crosshairA}`}/><span className={`${styles.crosshair} ${styles.crosshairB}`}/>
    </div>
    <header className={styles.topline}>
      <div className={styles.est}><Target strokeWidth={1.3} aria-hidden="true"/><span>HET ONLINE DARTCAFÉ</span></div>
      <div className={styles.opening}><span className={styles.statusDot} aria-hidden="true"/>VANAVOND GEOPEND</div>
    </header>

    <main className={styles.stage}>
      <span className={styles.sideNote} aria-hidden="true">GOEDE AVONDEN BEGINNEN HIER</span>
      <span className={`${styles.sideNote} ${styles.sideNoteRight}`} aria-hidden="true">DRIE PIJLEN. EINDELOOS PLEZIER.</span>
      <section className={styles.hero} aria-labelledby="opening-title">
        <p className={styles.kicker}>ZET JE PIJLEN MAAR VAST KLAAR</p>
        <img className={styles.logo} src="/brand/logo-premium.png" alt="DartsPoint" width={1448} height={1086} fetchPriority="high" decoding="async"/>
        <h1 id="opening-title">Het oude gevoel.<br/><span>Een nieuw begin.</span></h1>
        <p className={styles.tagline}>Vanavond gaan de dartbanen open.</p>
        <div className={styles.countdown} role="group" aria-label="DartsPoint opent op 15 oktober 2026 om 20:00 uur, Nederlandse tijd.">
          <p className={styles.countdownLabel}>DE EERSTE AVOND BEGINT OVER</p>
          <div className={styles.digits} aria-hidden="true">
            <div><strong>{String(hours).padStart(2, "0")}</strong><span>UUR</span></div>
            <b>:</b>
            <div><strong>{String(minutes).padStart(2, "0")}</strong><span>MINUTEN</span></div>
            <b>:</b>
            <div><strong>{String(seconds).padStart(2, "0")}</strong><span>SECONDEN</span></div>
          </div>
          <time className={styles.openingDate} dateTime="2026-10-15T18:00:00Z">15 oktober 2026 · 20:00 uur <span>(Nederland)</span></time>
        </div>
        <p className={styles.automatic}>{remaining === 0 ? "De deuren gaan zo open. Een ogenblik…" : "Blijf gerust hangen. Bij de opening ga je automatisch naar DartsPoint."}</p>
        <noscript><p className={styles.noScript}>Ververs deze pagina vanaf 20:00 uur om DartsPoint te openen.</p></noscript>
      </section>

      <article className={`${styles.tile} ${styles.tileOne}`} aria-label="Het DartsPoint-gevoel">
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>JE KENT HET WEL</span><MessageCircle strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>“Nog eentje dan?”</h2><p>Voor je het weet, is het weer veel te laat.</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div className={styles.speechDot} aria-hidden="true"><MessageCircle strokeWidth={1.4}/></div>
      </article>
      <article className={`${styles.tile} ${styles.tileTwo}`} aria-label="DartsPoint Divisies">
        <div className={styles.sticker} aria-hidden="true"><ShieldCheck strokeWidth={1.1}/></div>
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>JOUW VOLGENDE NIVEAU</span><Trophy strokeWidth={1.3} aria-hidden="true"/></div>
          <h2><small>DartsPoint</small>Divisies</h2><p>Jouw competitie. Jouw weg naar de top.</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
      </article>
      <article className={`${styles.tile} ${styles.tileThree}`} aria-label="De DartsPoint-community">
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>MEER DAN EEN POTJE</span><MessageCircle strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>Jouw vaste stek.<br/>Online.</h2><p>Dezelfde gezelligheid. Nieuwe rivalen.</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
      </article>
      <article className={`${styles.tile} ${styles.tileFour}`} aria-label="Spelen op DartsPoint">
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>ELKE WORP TELT</span><Sparkles strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>Tijd voor een 501.</h2><p>Even een potje. Of de hele avond.</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div className={styles.miniScore} aria-hidden="true"><b>180</b><span>DAT<br/>GEVOEL.</span></div>
      </article>
    </main>

    <footer className={styles.bottomline}>
      <div className={styles.footerCopy}>Een nieuwe ronde.<span>DEZELFDE LIEFDE VOOR DARTS.</span></div>
      <nav className={styles.socials} aria-label="DartsPoint op sociale media">
        <a href="https://www.facebook.com/share/19GY886bNL/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook"><SocialIcon network="facebook"/></a>
        <a href="https://www.tiktok.com/@dartspoint" target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok"><SocialIcon network="tiktok"/></a>
        <a href="https://www.instagram.com/dartspointnl/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram"><SocialIcon network="instagram"/></a>
      </nav>
      <div className={styles.footerActions}>
        <button type="button" className={styles.privacyButton} onClick={() => privacy.current?.showModal()}>Privacy</button>
        <button type="button" className={styles.motionToggle} onClick={() => setPaused(value => !value)} aria-label={paused ? "Hervat animaties" : "Pauzeer animaties"} title={paused ? "Hervat animaties" : "Pauzeer animaties"} aria-pressed={paused}>
          {paused ? <Play aria-hidden="true"/> : <Pause aria-hidden="true"/>}
        </button>
      </div>
    </footer>
    <nav aria-label="Informatie en contact" style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'10px 20px',padding:'10px 20px 24px',fontSize:12}}>
      <a href="/algemene-voorwaarden">Voorwaarden</a><a href="/privacy">Privacyverklaring</a><a href="/handleiding">Handleiding</a><a href="/support">Support</a><a href="/contact">Contact · Ontwikkeld door DG Webservices</a>
    </nav>

    <dialog ref={privacy} className={styles.privacyDialog} aria-labelledby="opening-privacy-title" onClick={event => { if (event.target === event.currentTarget) privacy.current?.close(); }}>
      <button className={styles.dialogClose} type="button" aria-label="Sluiten" onClick={() => privacy.current?.close()}><X aria-hidden="true"/></button>
      <h2 id="opening-privacy-title">Even aftellen.</h2>
      <p>Deze openingspagina bevat geen aanmeldformulier en vraagt niet om je e-mailadres. De teller controleert bij DartsPoint wanneer de dartbanen open zijn.</p>
      <p>Via de sociale knoppen bezoek je de pagina van DartsPoint op het gekozen platform. Daar geldt het privacybeleid van dat platform.</p>
      <button className={styles.dialogAction} type="button" onClick={() => privacy.current?.close()}>Terug naar het aftellen</button>
    </dialog>
  </div>;
}

export default DartsOpening;
