"use client";

import { useState, type ReactNode } from "react";
import { normalizeHeroImage, type HeroImage } from "@/lib/darts-hero-image";
import "./darts-hero-background.css";

/** Shared decorative photograph for the tournament header and its lobby card. */
export function DartsHeroBackground({ hero, enabled = true, fallback }: { hero?: HeroImage; enabled?: boolean; fallback?: ReactNode }) {
  const image = normalizeHeroImage(hero);
  if (!enabled || !image.src) return fallback ?? null;
  // Changing the source resets load/error state; changing the crop updates immediately.
  return <HeroPhoto key={image.src} hero={image} fallback={fallback}/>;
}

function HeroPhoto({ hero, fallback }: { hero: HeroImage; fallback?: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  return <>
    {status !== "loaded" && fallback}
    {status !== "failed" && <div className={`dp-hero-background${status === "loaded" ? " is-loaded" : ""}`} aria-hidden="true">
      <img src={hero.src} referrerPolicy="no-referrer" alt="" decoding="async" draggable={false} style={{ objectPosition: `${hero.positionX}% ${hero.positionY}%` }} onLoad={() => setStatus("loaded")} onError={() => setStatus("failed")}/>
      <div className="dp-hero-photo-shade" style={{ opacity: hero.overlay / 100 }}/>
      <div className="dp-hero-copy-shade"/>
    </div>}
  </>;
}
