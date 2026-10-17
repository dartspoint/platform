"use client";
import {useI18n} from '@/lib/i18n/provider';

import Link from "next/link";
import { useFavoriteDesign } from "@/lib/use-favorite-design";
import { motion, MotionConfig } from "motion/react";
import { ArrowDown, ArrowUpRight, Check, ChevronRight, Heart, MessageCircle, MousePointer2, Smartphone, Target, Trophy } from "lucide-react";
import { designs } from "@/lib/designs";
export function Brand({ premium = false }: { premium?: boolean }) {
 const dpT = useI18n("designStudio").t;

  return <span className={`brand ${premium ? "brand-premium" : ""}`}><img src="/brand/icon.svg" alt=""/><img src={premium ? "/brand/wordmark-premium.png" : "/brand/wordmark.svg"} alt={dpT("designStudio.dartspoint")}/></span>;
}
export function DesignStudio() {
 const dpT = useI18n("designStudio").t;

  const [favorite, setFavorite] = useFavoriteDesign();
  function choose(id: string) { const next = favorite === id ? "" : id; setFavorite(next); }
  return <MotionConfig reducedMotion="user"><main className="design-studio">
    <header className="studio-header"><Link href="/" aria-label={dpT("designStudio.dartspoint")}><Brand /></Link><span className="studio-edition"><span/>{dpT("designStudio.dartspoint_2")} <b>{dpT("designStudio.jouw_avond_begint_hier")}</b></span><a href="#designs" className="studio-header-link">{dpT("designStudio.ontdek_de_vijf_sferen")} <ArrowDown size={14}/></a></header>
    <section className="studio-hero">
      <motion.div className="studio-hero-content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
        <div className="studio-eyebrow"><span className="tiny-line"/> {dpT("designStudio.een_club_vijf_sferen")}</div>
        <h1>{dpT("designStudio.nog_een_potje")}<br/><span>{dpT("designStudio.altijd_welkom")}</span></h1>
        <p>{dpT("designStudio.dat_gevoel_van_nog_een_potje_in_vijf")}<br/>{dpT("designStudio.bekijk_de_collectie_en_schuif_daarna_aan_in")}</p>
        <div className="studio-hero-actions"><a href="#designs" className="primary-link">{dpT("designStudio.bekijk_de_collectie")} <ArrowDown size={16}/></a><span><MousePointer2 size={14}/> {dpT("designStudio.samen_in_een_speelkamer")}</span></div>
      </motion.div>
      <motion.div className="studio-brand-scene" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .9, delay: .15 }}>
        <div className="scene-orbit scene-orbit-one"/><div className="scene-orbit scene-orbit-two"/><div className="scene-orbit scene-orbit-three"/>
        <img src="/brand/logo-premium.png" alt={dpT("designStudio.het_premium_dartspoint_logo_met_drie_rode_darts")} fetchPriority="high"/>
        <span className="scene-caption">{dpT("designStudio.een_nieuwe_ronde")} <span>◆</span> {dpT("designStudio.dezelfde_liefde_voor_darts")}</span>
      </motion.div>
      <div className="hero-bottom-rule"><span>{dpT("designStudio.welkom_bij_dartspoint")}</span><span>{dpT("designStudio.donker_sociaal_onmiskenbaar_darts")}</span></div>
    </section>
    <section id="designs" className="studio-designs">
      <div className="studio-section-heading"><div><span className="studio-eyebrow">{dpT("designStudio.de_collectie")}</span><h2>{dpT("designStudio.vijf_sferen")}<br className="mobile-only"/> {dpT("designStudio.een_dartspoint")}</h2></div><span className="design-count">01 — 05</span></div>
      <div className="design-grid">{designs.map((design, i) => <motion.article className={`design-card design-card-${design.id}`} key={design.id} style={{ "--card-accent": design.color } as React.CSSProperties} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .45, delay: i % 2 * .08 }}>
        <a href={`/${design.id}`} className="design-card-image" aria-label={dpT("designStudio.naar_de_speelkamer_vanuit",{name:design.name})}><img src={`/concepts/${design.id}.png`} alt={dpT("designStudio.label",{name:design.name,layout:design.layout})} loading="lazy"/><span className="card-image-shade"/><span className="design-card-number">{design.number}</span><span className="design-card-chip"><span/>{design.accent}</span><span className="design-image-cta">{dpT("designStudio.stap_binnen")} <ArrowUpRight size={20}/></span></a>
        <div className="design-card-body"><div className="design-card-title"><div><span>{design.label}</span><h3>{design.name}<span>↗</span></h3></div><button className={`favorite-button ${favorite === design.id ? "is-favorite" : ""}`} onClick={() => choose(design.id)} aria-pressed={favorite === design.id} aria-label={favorite === design.id ? dpT("designStudio.als_favoriet_verwijderen",{name:design.name}) : dpT("designStudio.kies_als_favoriet",{name:design.name})} title={dpT("designStudio.bewaar_je_favoriet")}>{favorite === design.id ? <Heart fill="currentColor" size={19}/> : <Heart size={19}/>}</button></div><p>{design.description}</p><div className="design-card-footer"><span>{design.signature}</span><a href={`/${design.id}`} aria-label={dpT("designStudio.naar_de_speelkamer_vanuit",{name:design.name})}>{dpT("designStudio.naar_de_speelkamer")} <ChevronRight size={15}/></a></div></div>
      </motion.article>)}
      <div className="collection-note"><span className="collection-note-icon"><Target size={30}/></span><h3>{dpT("designStudio.het_oude_gevoel")}<br/><em>{dpT("designStudio.een_nieuwe_standaard")}</em></h3><p>{dpT("designStudio.een_kamer_met_maximaal_50_spelers_namen_die")}</p><div className="collection-features"><span><MessageCircle size={17}/> {dpT("designStudio.kamer_wedstrijdchat")}</span><span><Trophy size={17}/> {dpT("designStudio.ratings_ladders_toernooien")}</span><span><Smartphone size={17}/> {dpT("designStudio.van_desktop_tot_telefoon")}</span></div></div>
      </div>
    </section>
    <footer className="studio-footer"><Brand/><p>{dpT("designStudio.jouw_kamer_jouw_wedstrijd_jouw_avond")}</p><span><Check size={13}/> {dpT("designStudio.welkom_in_het_online_dartcafe")}</span></footer>
  </main></MotionConfig>;
}
