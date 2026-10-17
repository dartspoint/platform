"use client";
import {runtimeFeedback} from "../../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';


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
    const timeout = window.setTimeout(() => { picture.onload = null; picture.onerror = null; picture.src = ""; reject(new Error(runtimeFeedback("feedback.de_afbeelding_reageert_niet_probeer_een_ander_bestand"))); }, 12000);
    picture.onload = () => { window.clearTimeout(timeout); picture.onload = null; picture.onerror = null; if (!picture.naturalWidth || !picture.naturalHeight) reject(new Error(runtimeFeedback("feedback.dit_bestand_bevat_geen_bruikbare_afbeelding"))); else resolve(picture); };
    picture.onerror = () => { window.clearTimeout(timeout); picture.onload = null; picture.onerror = null; reject(new Error(runtimeFeedback("feedback.de_afbeelding_kon_niet_worden_geopend_kies_een"))); };
    picture.referrerPolicy = "no-referrer"; picture.src = src;
  });
}
async function storeUpload(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error(runtimeFeedback("feedback.kies_een_png_jpg_of_webp_afbeelding"));
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(runtimeFeedback("feedback.kies_een_afbeelding_van_maximaal_8_mb"));
  return (await uploadHeroImage(file)).src;
}

export function HeroImageEditor({ value, onChange, title = "Een avond om naar uit te kijken.", allowNone = true, onBusyChange }: { value: HeroImage; onChange: (value: HeroImage) => void; title?: string; allowNone?: boolean; onBusyChange?: (busy: boolean) => void }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("heroEditor").t;

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
    if (next === "default") { onChange({ ...DEFAULT_HERO_IMAGE }); setMessage(dpT("heroEditor.de_dartspoint_foto_is_geselecteerd_stel_hieronder_de")); }
    if (next === "none") onChange({ ...NO_HERO_IMAGE });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const current = ++operation.current; setBusy(true); setError(""); setMessage("");
    try { const src = await storeUpload(file); if (operation.current !== current) return; setFileName(file.name); onChange({ ...hero, src, positionX: 50, positionY: 50 }); setMessage(dpT("heroEditor.foto_veilig_opgeslagen_kies_de_uitsnede_en_sla")); }
    catch (cause) { if (operation.current === current) setError(cause instanceof Error ? cause.message : dpFeedback("feedback.de_afbeelding_kon_niet_worden_verwerkt_probeer_een")); }
    finally { if (operation.current === current) setBusy(false); }
  }
  async function applyUrl() {
    setError(""); setMessage(""); const src = url.trim();
    try { const parsed = new URL(src); if (parsed.protocol !== "https:" || parsed.username || parsed.password || src.length > 2000 || !safeHeroImageSrc(src)) throw new Error(); }
    catch { setError(dpT("heroEditor.gebruik_een_directe_https_afbeelding_van_images_unsplash")); return; }
    const current = ++operation.current; setBusy(true);
    try { await loadImage(src); if (operation.current !== current) return; onChange({ ...hero, src, positionX: 50, positionY: 50 }); setMessage(dpT("heroEditor.afbeeldingslink_gecontroleerd_en_geselecteerd_sla_je_wijzigingen_op")); }
    catch (cause) { if (operation.current === current) setError(cause instanceof Error ? cause.message : dpFeedback("feedback.deze_afbeeldingslink_kan_niet_worden_geopend")); }
    finally { if (operation.current === current) setBusy(false); }
  }
  return <section className="dhe-editor" aria-label={dpT("heroEditor.achtergrondafbeelding_instellen")}>
    <div className="dhe-source-options" role="group" aria-label={dpT("heroEditor.bron_van_de_afbeelding")}>
      <button type="button" aria-pressed={mode === "default"} onClick={() => choose("default")}><WandSparkles size={17}/><span>{dpT("heroEditor.dartspoint_foto")}</span></button>
      <button type="button" aria-pressed={mode === "upload"} onClick={() => choose("upload")}><Upload size={17}/><span>{dpT("heroEditor.eigen_foto")}</span></button>
      <button type="button" aria-pressed={mode === "url"} onClick={() => choose("url")}><Link2 size={17}/><span>{dpT("heroEditor.afbeeldingslink")}</span></button>
      {allowNone && <button type="button" aria-pressed={mode === "none"} onClick={() => choose("none")}><ImageOff size={17}/><span>{dpT("heroEditor.zonder_foto")}</span></button>}
    </div>
    {mode === "upload" && <div className="dhe-upload"><span className="dhe-upload-icon"><Upload size={23}/></span><div><strong>{hero.src.startsWith("/api/platform/media/") ? fileName || dpT("heroEditor.eigen_foto_geselecteerd") : dpT("heroEditor.maak_het_jouw_avond")}</strong><p>{dpT("heroEditor.png_jpg_of_webp_maximaal_8_mb_je")}</p></div><input ref={fileInput} id={`${id}-file`} className="dhe-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label={dpT("heroEditor.eigen_achtergrondfoto_uploaden")} onChange={upload} disabled={busy}/><button type="button" className="dhe-button" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle className="dhe-spin" size={14}/> : <Upload size={14}/>}{dpT("heroEditor.foto_kiezen")}</button></div>}
    {mode === "url" && <div className="dhe-url"><label htmlFor={`${id}-url`}>{dpT("heroEditor.directe_https_link_naar_je_afbeelding")}</label><div><input id={`${id}-url`} type="url" value={url} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy) void applyUrl(); } }} onChange={event => { setUrl(event.target.value); setError(""); }} placeholder="https://images.unsplash.com/..." maxLength={2000}/><button type="button" className="dhe-button" onClick={applyUrl} disabled={busy || !url.trim()}>{busy ? <LoaderCircle className="dhe-spin" size={14}/> : <Check size={14}/>}{dpT("heroEditor.gebruik_foto")}</button></div><small>{dpT("heroEditor.gebruik_een_afbeeldingslink_van_images_unsplash_com_of")}</small></div>}
    {error && <p className="dhe-feedback error" role="alert"><CircleAlert size={15}/>{error}</p>}
    {busy && <p className="dhe-feedback" role="status"><LoaderCircle className="dhe-spin" size={15}/>{mode === "url" ? dpT("heroEditor.afbeeldingslink_controleren") : dpT("heroEditor.je_foto_verwerken")}</p>}
    {!busy && message && <p className="dhe-feedback success" role="status"><Check size={15}/>{message}</p>}
    <div className="dhe-preview-label"><span><ImageIcon size={14}/>{dpT("heroEditor.voorbeeld_van_de_uitsnede")}</span><small>{hero.src ? dpT("heroEditor.label",{positionX:hero.positionX,positionY:hero.positionY}) : dpT("heroEditor.zonder_afbeelding")}</small></div>
    <div className={`dhe-preview${!hero.src || imageFailed ? " no-image" : ""}`}>
      {hero.src && !imageFailed && <img key={hero.src} src={hero.src} referrerPolicy="no-referrer" alt={dpT("heroEditor.voorbeeld_van_de_geselecteerde_achtergrondfoto")} style={{ objectPosition: `${hero.positionX}% ${hero.positionY}%` }} onError={() => setImageFailed(true)}/>}
      <div className="dhe-preview-overlay"><div className="dp-hero-photo-shade" style={{ opacity: hero.overlay / 100 }}/><div className="dp-hero-copy-shade"/></div>
      <div className="dhe-preview-content"><span>{dpT("heroEditor.jouw_club_jouw_moment")}</span><h3>{title}</h3><p>{dpT("heroEditor.een_sterke_foto_ruimte_voor_je_verhaal")}</p><span className="dhe-preview-chip">{dpT("heroEditor.dartspoint")}</span></div>
      <span className="dhe-preview-badge">{dpT("heroEditor.voorbeeld")}</span>
    </div>
    {imageFailed && <p className="dhe-feedback error" role="alert"><CircleAlert size={15}/>{dpT("heroEditor.de_geselecteerde_afbeelding_kan_niet_worden_getoond_controleer")}</p>}
    {hero.src && <div className="dhe-adjustments"><div className="dhe-adjustment-heading"><span><Move size={14}/>{dpT("heroEditor.uitsnede_leesbaarheid")}</span><button type="button" onClick={() => patch({ positionX: sourceMode(hero.src) === "default" ? 70 : 50, positionY: 50, overlay: 45 })}><RotateCcw size={12}/>{dpT("heroEditor.herstellen")}</button></div><label htmlFor={`${id}-x`}><span>{dpT("heroEditor.horizontale_positie")}<output htmlFor={`${id}-x`}>{hero.positionX}%</output></span><input id={`${id}-x`} type="range" min={0} max={100} step={1} value={hero.positionX} onChange={event => patch({ positionX: Number(event.target.value) })}/><small><span>{dpT("heroEditor.links")}</span><span>{dpT("heroEditor.rechts")}</span></small></label><label htmlFor={`${id}-y`}><span>{dpT("heroEditor.verticale_positie")}<output htmlFor={`${id}-y`}>{hero.positionY}%</output></span><input id={`${id}-y`} type="range" min={0} max={100} step={1} value={hero.positionY} onChange={event => patch({ positionY: Number(event.target.value) })}/><small><span>{dpT("heroEditor.boven")}</span><span>{dpT("heroEditor.onder")}</span></small></label><label className="dhe-darkness" htmlFor={`${id}-overlay`}><span><span><SunMoon size={13}/>{dpT("heroEditor.verdonkering")}</span><output htmlFor={`${id}-overlay`}>{hero.overlay}%</output></span><input id={`${id}-overlay`} type="range" min={25} max={85} step={1} value={hero.overlay} onChange={event => patch({ overlay: Number(event.target.value) })}/><small><span>{dpT("heroEditor.meer_foto")}</span><span>{dpT("heroEditor.meer_contrast")}</span></small></label></div>}
    <p className="dhe-note">{dpT("heroEditor.uploads_worden_gedeeld_en_duurzaam_opgeslagen_de_gekozen")}</p>
  </section>;
}
