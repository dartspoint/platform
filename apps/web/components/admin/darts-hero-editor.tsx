"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Check, CircleAlert, Image as ImageIcon, ImageOff, Link2, LoaderCircle, Move, RotateCcw, SunMoon, Upload, WandSparkles } from "lucide-react";
import { DEFAULT_HERO_IMAGE, NO_HERO_IMAGE, uploadHeroImage, normalizeHeroImage, safeHeroImageSrc, type HeroImage } from "@/lib/darts-hero-image";
import "@/components/darts-hero-background.css";
import "./darts-hero-editor.css";

type SourceMode = "default" | "upload" | "url" | "none";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
function sourceMode(src: string): SourceMode { return !src ? "none" : src === DEFAULT_HERO_IMAGE.src ? "default" : src.startsWith("/api/platform/media/") ? "upload" : "url"; }
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const picture = new window.Image();
    const timeout = window.setTimeout(() => { picture.onload = null; picture.onerror = null; picture.src = ""; reject(new Error("De afbeelding reageert niet. Probeer een ander bestand of een directe afbeeldingslink.")); }, 12000);
    picture.onload = () => { window.clearTimeout(timeout); picture.onload = null; picture.onerror = null; if (!picture.naturalWidth || !picture.naturalHeight) reject(new Error("Dit bestand bevat geen bruikbare afbeelding.")); else resolve(picture); };
    picture.onerror = () => { window.clearTimeout(timeout); picture.onload = null; picture.onerror = null; reject(new Error("De afbeelding kon niet worden geopend. Kies een geldig PNG-, JPG- of WebP-bestand of een bereikbare afbeeldingslink.")); };
    picture.referrerPolicy = "no-referrer"; picture.src = src;
  });
}
async function storeUpload(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Kies een PNG-, JPG- of WebP-afbeelding.");
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("Kies een afbeelding van maximaal 8 MB.");
  return (await uploadHeroImage(file)).src;
}

export function HeroImageEditor({ value, onChange, title = "Een avond om naar uit te kijken.", allowNone = true, onBusyChange }: { value: HeroImage; onChange: (value: HeroImage) => void; title?: string; allowNone?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const hero = normalizeHeroImage(value);
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const [mode, setMode] = useState<SourceMode>(() => sourceMode(hero.src));
  const [url, setUrl] = useState(hero.src.startsWith("https://") ? hero.src : "");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setMode(sourceMode(hero.src)); setImageFailed(false); if (hero.src.startsWith("https://")) setUrl(hero.src); }, [hero.src]);
  useEffect(() => () => { operation.current += 1; }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  const patch = (change: Partial<HeroImage>) => onChange({ ...hero, ...change });
  function choose(next: SourceMode) {
    operation.current += 1; setBusy(false); setError(""); setMessage(""); setMode(next);
    if (next === "default") { onChange({ ...DEFAULT_HERO_IMAGE }); setMessage("De DartsPoint-foto is geselecteerd. Stel hieronder de uitsnede in."); }
    if (next === "none") onChange({ ...NO_HERO_IMAGE });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const current = ++operation.current; setBusy(true); setError(""); setMessage("");
    try { const src = await storeUpload(file); if (operation.current !== current) return; setFileName(file.name); onChange({ ...hero, src, positionX: 50, positionY: 50 }); setMessage("Foto veilig opgeslagen. Kies de uitsnede en sla daarna je wijzigingen op."); }
    catch (cause) { if (operation.current === current) setError(cause instanceof Error ? cause.message : "De afbeelding kon niet worden verwerkt. Probeer een ander bestand."); }
    finally { if (operation.current === current) setBusy(false); }
  }
  async function applyUrl() {
    setError(""); setMessage(""); const src = url.trim();
    try { const parsed = new URL(src); if (parsed.protocol !== "https:" || parsed.username || parsed.password || src.length > 2000 || !safeHeroImageSrc(src)) throw new Error(); }
    catch { setError("Gebruik een directe HTTPS-afbeelding van images.unsplash.com of images.pexels.com."); return; }
    const current = ++operation.current; setBusy(true);
    try { await loadImage(src); if (operation.current !== current) return; onChange({ ...hero, src, positionX: 50, positionY: 50 }); setMessage("Afbeeldingslink gecontroleerd en geselecteerd. Sla je wijzigingen op om deze te gebruiken."); }
    catch (cause) { if (operation.current === current) setError(cause instanceof Error ? cause.message : "Deze afbeeldingslink kan niet worden geopend."); }
    finally { if (operation.current === current) setBusy(false); }
  }
  return <section className="dhe-editor" aria-label="Achtergrondafbeelding instellen">
    <div className="dhe-source-options" role="group" aria-label="Bron van de afbeelding">
      <button type="button" aria-pressed={mode === "default"} onClick={() => choose("default")}><WandSparkles size={17}/><span>DartsPoint-foto</span></button>
      <button type="button" aria-pressed={mode === "upload"} onClick={() => choose("upload")}><Upload size={17}/><span>Eigen foto</span></button>
      <button type="button" aria-pressed={mode === "url"} onClick={() => choose("url")}><Link2 size={17}/><span>Afbeeldingslink</span></button>
      {allowNone && <button type="button" aria-pressed={mode === "none"} onClick={() => choose("none")}><ImageOff size={17}/><span>Zonder foto</span></button>}
    </div>
    {mode === "upload" && <div className="dhe-upload"><span className="dhe-upload-icon"><Upload size={23}/></span><div><strong>{hero.src.startsWith("/api/platform/media/") ? fileName || "Eigen foto geselecteerd" : "Maak het jouw avond."}</strong><p>PNG, JPG of WebP · maximaal 8 MB. De server controleert en verkleint je foto voor een snelle weergave.</p></div><input ref={fileInput} id={`${id}-file`} className="dhe-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Eigen achtergrondfoto uploaden" onChange={upload} disabled={busy}/><button type="button" className="dhe-button" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle className="dhe-spin" size={14}/> : <Upload size={14}/>}Foto kiezen</button></div>}
    {mode === "url" && <div className="dhe-url"><label htmlFor={`${id}-url`}>Directe HTTPS-link naar je afbeelding</label><div><input id={`${id}-url`} type="url" value={url} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy) void applyUrl(); } }} onChange={event => { setUrl(event.target.value); setError(""); }} placeholder="https://images.unsplash.com/..." maxLength={2000}/><button type="button" className="dhe-button" onClick={applyUrl} disabled={busy || !url.trim()}>{busy ? <LoaderCircle className="dhe-spin" size={14}/> : <Check size={14}/>}Gebruik foto</button></div><small>Toegestaan: images.unsplash.com en images.pexels.com, zonder gebruikersnaam, wachtwoord of aangepaste poort. Je browser laadt de afbeelding rechtstreeks; de server haalt externe URLs niet op.</small></div>}
    {error && <p className="dhe-feedback error" role="alert"><CircleAlert size={15}/>{error}</p>}
    {busy && <p className="dhe-feedback" role="status"><LoaderCircle className="dhe-spin" size={15}/>{mode === "url" ? "Afbeeldingslink controleren…" : "Je foto verwerken…"}</p>}
    {!busy && message && <p className="dhe-feedback success" role="status"><Check size={15}/>{message}</p>}
    <div className="dhe-preview-label"><span><ImageIcon size={14}/>Voorbeeld van de uitsnede</span><small>{hero.src ? `${hero.positionX}% / ${hero.positionY}%` : "Zonder afbeelding"}</small></div>
    <div className={`dhe-preview${!hero.src || imageFailed ? " no-image" : ""}`}>
      {hero.src && !imageFailed && <img key={hero.src} src={hero.src} referrerPolicy="no-referrer" alt="Voorbeeld van de geselecteerde achtergrondfoto" style={{ objectPosition: `${hero.positionX}% ${hero.positionY}%` }} onError={() => setImageFailed(true)}/>}
      <div className="dhe-preview-overlay"><div className="dp-hero-photo-shade" style={{ opacity: hero.overlay / 100 }}/><div className="dp-hero-copy-shade"/></div>
      <div className="dhe-preview-content"><span>JOUW CLUB. JOUW MOMENT.</span><h3>{title}</h3><p>Een sterke foto, ruimte voor je verhaal.</p><span className="dhe-preview-chip">DARTSPOINT</span></div>
      <span className="dhe-preview-badge">VOORBEELD</span>
    </div>
    {imageFailed && <p className="dhe-feedback error" role="alert"><CircleAlert size={15}/>De geselecteerde afbeelding kan niet worden getoond. Controleer de link of kies een andere foto.</p>}
    {hero.src && <div className="dhe-adjustments"><div className="dhe-adjustment-heading"><span><Move size={14}/>Uitsnede & leesbaarheid</span><button type="button" onClick={() => patch({ positionX: sourceMode(hero.src) === "default" ? 70 : 50, positionY: 50, overlay: 45 })}><RotateCcw size={12}/>Herstellen</button></div><label htmlFor={`${id}-x`}><span>Horizontale positie<output htmlFor={`${id}-x`}>{hero.positionX}%</output></span><input id={`${id}-x`} type="range" min={0} max={100} step={1} value={hero.positionX} onChange={event => patch({ positionX: Number(event.target.value) })}/><small><span>Links</span><span>Rechts</span></small></label><label htmlFor={`${id}-y`}><span>Verticale positie<output htmlFor={`${id}-y`}>{hero.positionY}%</output></span><input id={`${id}-y`} type="range" min={0} max={100} step={1} value={hero.positionY} onChange={event => patch({ positionY: Number(event.target.value) })}/><small><span>Boven</span><span>Onder</span></small></label><label className="dhe-darkness" htmlFor={`${id}-overlay`}><span><span><SunMoon size={13}/>Verdonkering</span><output htmlFor={`${id}-overlay`}>{hero.overlay}%</output></span><input id={`${id}-overlay`} type="range" min={25} max={85} step={1} value={hero.overlay} onChange={event => patch({ overlay: Number(event.target.value) })}/><small><span>Meer foto</span><span>Meer contrast</span></small></label></div>}
    <p className="dhe-note">Uploads worden gedeeld en duurzaam opgeslagen. De gekozen foto en uitsnede worden actief wanneer je dit onderdeel opslaat of publiceert.</p>
  </section>;
}
