"use client";
import {useI18n} from '@/lib/i18n/provider';


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
 const dpT = useI18n("opening").t;

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
      <div className={styles.est}><Target strokeWidth={1.3} aria-hidden="true"/><span>{dpT("opening.het_online_dartcafe")}</span></div>
      <div className={styles.opening}><span className={styles.statusDot} aria-hidden="true"/>{dpT("opening.vanavond_geopend")}</div>
    </header>

    <main className={styles.stage}>
      <span className={styles.sideNote} aria-hidden="true">{dpT("opening.goede_avonden_beginnen_hier")}</span>
      <span className={`${styles.sideNote} ${styles.sideNoteRight}`} aria-hidden="true">{dpT("opening.drie_pijlen_eindeloos_plezier")}</span>
      <section className={styles.hero} aria-labelledby="opening-title">
        <p className={styles.kicker}>{dpT("opening.zet_je_pijlen_maar_vast_klaar")}</p>
        <img className={styles.logo} src="/brand/logo-premium.png" alt={dpT("opening.dartspoint")} width={1448} height={1086} fetchPriority="high" decoding="async"/>
        <h1 id="opening-title">{dpT("opening.het_oude_gevoel")}<br/><span>{dpT("opening.een_nieuw_begin")}</span></h1>
        <p className={styles.tagline}>{dpT("opening.vanavond_gaan_de_dartbanen_open")}</p>
        <div className={styles.countdown} role="group" aria-label={dpT("opening.dartspoint_opent_op_15_oktober_2026_om_20")}>
          <p className={styles.countdownLabel}>{dpT("opening.de_eerste_avond_begint_over")}</p>
          <div className={styles.digits} aria-hidden="true">
            <div><strong>{String(hours).padStart(2, "0")}</strong><span>{dpT("opening.uur")}</span></div>
            <b>:</b>
            <div><strong>{String(minutes).padStart(2, "0")}</strong><span>{dpT("opening.minuten")}</span></div>
            <b>:</b>
            <div><strong>{String(seconds).padStart(2, "0")}</strong><span>{dpT("opening.seconden")}</span></div>
          </div>
          <time className={styles.openingDate} dateTime="2026-10-15T18:00:00Z">{dpT("opening.15_oktober_2026_20_00_uur")} <span>{dpT("opening.nederland")}</span></time>
        </div>
        <p className={styles.automatic}>{remaining === 0 ? dpT("opening.de_deuren_gaan_zo_open_een_ogenblik") : dpT("opening.blijf_gerust_hangen_bij_de_opening_ga_je")}</p>
        <noscript><p className={styles.noScript}>{dpT("opening.ververs_deze_pagina_vanaf_20_00_uur_om")}</p></noscript>
      </section>

      <article className={`${styles.tile} ${styles.tileOne}`} aria-label={dpT("opening.het_dartspoint_gevoel")}>
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>{dpT("opening.je_kent_het_wel")}</span><MessageCircle strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>{dpT("opening.nog_eentje_dan")}</h2><p>{dpT("opening.voor_je_het_weet_is_het_weer_veel")}</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div className={styles.speechDot} aria-hidden="true"><MessageCircle strokeWidth={1.4}/></div>
      </article>
      <article className={`${styles.tile} ${styles.tileTwo}`} aria-label={dpT("opening.dartspoint_divisies")}>
        <div className={styles.sticker} aria-hidden="true"><ShieldCheck strokeWidth={1.1}/></div>
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>{dpT("opening.jouw_volgende_niveau")}</span><Trophy strokeWidth={1.3} aria-hidden="true"/></div>
          <h2><small>{dpT("opening.dartspoint")}</small>{dpT("opening.divisies")}</h2><p>{dpT("opening.jouw_competitie_jouw_weg_naar_de_top")}</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
      </article>
      <article className={`${styles.tile} ${styles.tileThree}`} aria-label={dpT("opening.de_dartspoint_community")}>
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>{dpT("opening.meer_dan_een_potje")}</span><MessageCircle strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>{dpT("opening.jouw_vaste_stek")}<br/>{dpT("opening.online")}</h2><p>{dpT("opening.dezelfde_gezelligheid_nieuwe_rivalen")}</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
      </article>
      <article className={`${styles.tile} ${styles.tileFour}`} aria-label={dpT("opening.spelen_op_dartspoint")}>
        <div className={styles.tileShell}>
          <div className={styles.tileMeta}><span>{dpT("opening.elke_worp_telt")}</span><Sparkles strokeWidth={1.3} aria-hidden="true"/></div>
          <h2>{dpT("opening.tijd_voor_een_501")}</h2><p>{dpT("opening.even_een_potje_of_de_hele_avond")}</p>
          <div className={styles.tileIndex} aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div className={styles.miniScore} aria-hidden="true"><b>180</b><span>{dpT("opening.dat")}<br/>{dpT("opening.gevoel")}</span></div>
      </article>
    </main>

    <footer className={styles.bottomline}>
      <div className={styles.footerCopy}>{dpT("opening.een_nieuwe_ronde")}<span>{dpT("opening.dezelfde_liefde_voor_darts")}</span></div>
      <nav className={styles.socials} aria-label={dpT("opening.dartspoint_op_sociale_media")}>
        <a href="https://www.facebook.com/share/19GY886bNL/" target="_blank" rel="noopener noreferrer" aria-label={dpT("opening.facebook")} title={dpT("opening.facebook")}><SocialIcon network="facebook"/></a>
        <a href="https://www.tiktok.com/@dartspoint" target="_blank" rel="noopener noreferrer" aria-label={dpT("opening.tiktok")} title={dpT("opening.tiktok")}><SocialIcon network="tiktok"/></a>
        <a href="https://www.instagram.com/dartspointnl/" target="_blank" rel="noopener noreferrer" aria-label={dpT("opening.instagram")} title={dpT("opening.instagram")}><SocialIcon network="instagram"/></a>
      </nav>
      <div className={styles.footerActions}>
        <button type="button" className={styles.privacyButton} onClick={() => privacy.current?.showModal()}>{dpT("opening.privacy")}</button>
        <button type="button" className={styles.motionToggle} onClick={() => setPaused(value => !value)} aria-label={paused ? dpT("opening.hervat_animaties") : dpT("opening.pauzeer_animaties")} title={paused ? dpT("opening.hervat_animaties") : dpT("opening.pauzeer_animaties")} aria-pressed={paused}>
          {paused ? <Play aria-hidden="true"/> : <Pause aria-hidden="true"/>}
        </button>
      </div>
    </footer>
    <nav aria-label={dpT("opening.informatie_en_contact")} style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'10px 20px',padding:'10px 20px 24px',fontSize:12}}>
      <a href="/algemene-voorwaarden">{dpT("opening.voorwaarden")}</a><a href="/privacy">{dpT("opening.privacyverklaring")}</a><a href="/handleiding">{dpT("opening.handleiding")}</a><a href="/support">{dpT("opening.support")}</a><a href="/contact">{dpT("opening.contact_ontwikkeld_door_dg_webservices")}</a>
    </nav>

    <dialog ref={privacy} className={styles.privacyDialog} aria-labelledby="opening-privacy-title" onClick={event => { if (event.target === event.currentTarget) privacy.current?.close(); }}>
      <button className={styles.dialogClose} type="button" aria-label={dpT("opening.sluiten")} onClick={() => privacy.current?.close()}><X aria-hidden="true"/></button>
      <h2 id="opening-privacy-title">{dpT("opening.even_aftellen")}</h2>
      <p>{dpT("opening.deze_openingspagina_bevat_geen_aanmeldformulier_en_vraagt_niet")}</p>
      <p>{dpT("opening.via_de_sociale_knoppen_bezoek_je_de_pagina")}</p>
      <button className={styles.dialogAction} type="button" onClick={() => privacy.current?.close()}>{dpT("opening.terug_naar_het_aftellen")}</button>
    </dialog>
  </div>;
}

export default DartsOpening;
