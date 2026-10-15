"use client";
import Link from "next/link";
import { useFavoriteDesign } from "@/lib/use-favorite-design";
import { motion, MotionConfig } from "motion/react";
import { ArrowDown, ArrowUpRight, Check, ChevronRight, Heart, MessageCircle, MousePointer2, Smartphone, Target, Trophy } from "lucide-react";
import { designs } from "@/lib/designs";
export function Brand({ premium = false }: { premium?: boolean }) {
  return <span className={`brand ${premium ? "brand-premium" : ""}`}><img src="/brand/icon.svg" alt=""/><img src={premium ? "/brand/wordmark-premium.png" : "/brand/wordmark.svg"} alt="DartsPoint"/></span>;
}
export function DesignStudio() {
  const [favorite, setFavorite] = useFavoriteDesign();
  function choose(id: string) { const next = favorite === id ? "" : id; setFavorite(next); }
  return <MotionConfig reducedMotion="user"><main className="design-studio">
    <header className="studio-header"><Link href="/" aria-label="DartsPoint"><Brand /></Link><span className="studio-edition"><span/>DARTSPOINT <b>JOUW AVOND BEGINT HIER</b></span><a href="#designs" className="studio-header-link">Ontdek de vijf sferen <ArrowDown size={14}/></a></header>
    <section className="studio-hero">
      <motion.div className="studio-hero-content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
        <div className="studio-eyebrow"><span className="tiny-line"/> ÉÉN CLUB. VIJF SFEREN.</div>
        <h1>Nog één potje.<br/><span>Altijd welkom.</span></h1>
        <p>Dat gevoel van nog één potje. In vijf verschillende sferen.<br/>Bekijk de collectie en schuif daarna aan in de speelkamer.</p>
        <div className="studio-hero-actions"><a href="#designs" className="primary-link">Bekijk de collectie <ArrowDown size={16}/></a><span><MousePointer2 size={14}/> Samen in één speelkamer</span></div>
      </motion.div>
      <motion.div className="studio-brand-scene" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .9, delay: .15 }}>
        <div className="scene-orbit scene-orbit-one"/><div className="scene-orbit scene-orbit-two"/><div className="scene-orbit scene-orbit-three"/>
        <img src="/brand/logo-premium.png" alt="Het premium DartsPoint logo met drie rode darts" fetchPriority="high"/>
        <span className="scene-caption">EEN NIEUWE RONDE <span>◆</span> DEZELFDE LIEFDE VOOR DARTS</span>
      </motion.div>
      <div className="hero-bottom-rule"><span>WELKOM BIJ DARTSPOINT</span><span>DONKER. SOCIAAL. ONMISKENBAAR DARTS.</span></div>
    </section>
    <section id="designs" className="studio-designs">
      <div className="studio-section-heading"><div><span className="studio-eyebrow">DE COLLECTIE</span><h2>Vijf sferen.<br className="mobile-only"/> Eén DartsPoint.</h2></div><span className="design-count">01 — 05</span></div>
      <div className="design-grid">{designs.map((design, i) => <motion.article className={`design-card design-card-${design.id}`} key={design.id} style={{ "--card-accent": design.color } as React.CSSProperties} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .45, delay: i % 2 * .08 }}>
        <a href={`/${design.id}`} className="design-card-image" aria-label={`Naar de speelkamer vanuit ${design.name}`}><img src={`/concepts/${design.id}.png`} alt={`${design.name}: ${design.layout}`} loading="lazy"/><span className="card-image-shade"/><span className="design-card-number">{design.number}</span><span className="design-card-chip"><span/>{design.accent}</span><span className="design-image-cta">Stap binnen <ArrowUpRight size={20}/></span></a>
        <div className="design-card-body"><div className="design-card-title"><div><span>{design.label}</span><h3>{design.name}<span>↗</span></h3></div><button className={`favorite-button ${favorite === design.id ? "is-favorite" : ""}`} onClick={() => choose(design.id)} aria-pressed={favorite === design.id} aria-label={favorite === design.id ? `${design.name} als favoriet verwijderen` : `Kies ${design.name} als favoriet`} title="Bewaar je favoriet">{favorite === design.id ? <Heart fill="currentColor" size={19}/> : <Heart size={19}/>}</button></div><p>{design.description}</p><div className="design-card-footer"><span>{design.signature}</span><a href={`/${design.id}`} aria-label={`Naar de speelkamer vanuit ${design.name}`}>Naar de speelkamer <ChevronRight size={15}/></a></div></div>
      </motion.article>)}
      <div className="collection-note"><span className="collection-note-icon"><Target size={30}/></span><h3>Het oude gevoel.<br/><em>Een nieuwe standaard.</em></h3><p>Een kamer met maximaal 50 spelers. Namen die meekleuren met je rating. Die ene uitnodiging, precies op het juiste moment.</p><div className="collection-features"><span><MessageCircle size={17}/> Kamer- & wedstrijdchat</span><span><Trophy size={17}/> Ratings, ladders & toernooien</span><span><Smartphone size={17}/> Van desktop tot telefoon</span></div></div>
      </div>
    </section>
    <footer className="studio-footer"><Brand/><p>Jouw kamer. Jouw wedstrijd. Jouw avond.</p><span><Check size={13}/> Welkom in het online dartcafé</span></footer>
  </main></MotionConfig>;
}
