"use client";
import {blogUi as ui} from "./blog-ui";
import {browserLocale} from "../../../../packages/i18n/src/errors";
import {useI18n} from "@/lib/i18n/provider";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CircleAlert, Eye, FileText, Globe, ImagePlus, Link2, Plus, Save, Search, Send, Share2, Trash2, Upload } from "lucide-react";
import {getPlatform} from "@/lib/platform-client";
import {BlogCredentials} from "./blog-credentials";
import { BlogEditor } from "@/components/blog/blog-editor";
import { BlogArticleDetail } from "@/components/blog/public-blog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BLOG_CATEGORIES, BLOG_AUTHORS, blogOrigin, blogUrl, blogShareImage, type BlogArticle, type BlogImage } from "@/lib/blog";
import type { BlogAdminEntry, BlogDraft } from "@/lib/blog";
import "./blog-admin.css";

type UploadedImage = { url: string; assetId: string; width: number; height: number };
type Status = "draft" | "revision" | "live";
type Notice = { kind: "success" | "error"; message: string; code?: string; fields?: Record<string, string> };
type Selection = { entry: BlogAdminEntry | null; value: BlogDraft; slugManuallyEdited: boolean };

const stateLabels: Record<Status, string> = { draft: "Concept", revision: "Revisie open", live: "Gepubliceerd" };



function emptyDraft(): BlogDraft {
  return {
    title: "", slug: "", excerpt: "", type: "blog", locale: "nl-NL", category: BLOG_CATEGORIES[0].name, categoryId: BLOG_CATEGORIES[0].id, authorId: BLOG_AUTHORS[0].id, tags: [],
    author: "DartsPoint Redactie", content: { type: "doc", schemaVersion: 1, content: [{ type: "paragraph" }] },
    hero: { assetId: "", url: "", alt: "", width: 0, height: 0, focalPoint: { x: 0.5, y: 0.5 } },
    seo: { title: "", description: "" },
  };
}

function slugFor(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").slice(0, 110).replace(/^-|-$/g, "");
}

function entryStatus(entry: BlogAdminEntry): Status {
  if (!entry.liveRevision) return "draft";
  return entry.revision === entry.liveRevision ? "live" : "revision";
}

function day(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(browserLocale() === "en" ? "en-GB" : "nl-NL", {day:"numeric",month:"short",year:"numeric",timeZone:"Europe/Amsterdam"}).format(date);
}

class BlogRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly fields?: Record<string, string>) { super(message); }
}

async function request<T>(path = "", body?: object) {
  const form = body instanceof FormData;
  const response = await fetch(`/api/blog-admin${path}`, {
    cache: "no-store",
    ...(body ? {
      method: "POST",
      headers: form ? undefined : { "Content-Type": "application/json" },
      body: form ? body : JSON.stringify(body),
    } : {}),
  });
  const result = await response.json().catch(() => null) as (T & { error?: string; code?: string; fields?: Record<string, string> }) | null;
  if (!response.ok || !result) throw new BlogRequestError(ui(result?.error || ui("De actie is niet gelukt (HTTP {status}).", {status:response.status})), result?.code, result?.fields);
  return result;
}

function errorNotice(error: unknown): Notice {
  return {
    kind: "error",
    message: error instanceof Error ? error.message : ui("De actie is niet gelukt. Probeer het opnieuw."),
    code: error instanceof BlogRequestError ? error.code : undefined,
    fields: error instanceof BlogRequestError ? error.fields : undefined,
  };
}

async function upload(file: File): Promise<UploadedImage> {
  const body = new FormData();
  body.append("file", file);
  return request<UploadedImage>("/media", body);
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`dpba-status dpba-status--${status}`}><i />{ui(stateLabels[status])}</span>;
}

function Panel({ title, icon, children, className = "" }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`adm-panel dpba-panel ${className}`}>
    <h2 className="dpba-panel-title">{icon}{title}</h2>
    {children}
  </section>;
}

function ImageField({ title, image, placeholder, ratio, disabled, required, onUpload, onAlt, onRemove }: {
  title: string; image?: BlogImage; placeholder: string; ratio: string; disabled: boolean; required?: boolean;
  onUpload: (file: File) => void; onAlt: (value: string) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const focal = image && "focalPoint" in image ? (image as BlogDraft["hero"]).focalPoint : null;
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  }
  return <div className="dpba-image-field">
    <div className="dpba-image-label"><strong>{title}</strong><small>{ratio}</small></div>
    <div className={`dpba-image dpba-image--${required ? "hero" : "wide"}`}>
      {image?.url ? <img src={image.url} alt={image.alt} style={focal ? { objectPosition: `${focal.x * 100}% ${focal.y * 100}%` } : undefined} /> : <div className="dpba-image-empty"><ImagePlus size={23} /><span>{placeholder}</span></div>}
    </div>
    <div className="dpba-image-actions">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      <button type="button" className="adm-btn" disabled={disabled} onClick={() => input.current?.click()}><Upload size={13} />{image?.url ? ui("Vervangen") : ui("Uploaden")}</button>
      {image?.url && <button type="button" className="adm-icon-btn" disabled={disabled} aria-label={ui("{title} verwijderen", {title})} onClick={onRemove}><Trash2 size={14} /></button>}
    </div>
    {image?.url && <label className="dpba-field">
      <span>{ui("Alt-tekst")} {required ? <b className="dpba-required">*</b> : null}</span>
      <input value={image.alt} onChange={event => onAlt(event.target.value)} placeholder={ui("Beschrijf wat er op de foto staat")} maxLength={250} disabled={disabled} />
    </label>}
  </div>;
}

function SeoPanel({ draft, slug, onChange, disabled }: { draft: BlogDraft; slug: string; onChange: (seo: BlogDraft["seo"]) => void; disabled: boolean }) {
  const [mode, setMode] = useState<"google" | "social">("google");
  const title = draft.seo.title.trim() || draft.title.trim() || ui("Titel van je artikel");
  const description = draft.seo.description.trim() || draft.excerpt.trim() || ui("De omschrijving van je artikel verschijnt hier.");
  const image = blogShareImage(draft);
  const brandHost = new URL(blogOrigin(draft.locale)).hostname;
  return <Panel title={ui("SEO en delen")} icon={<Globe size={17} />}>
    <label className="dpba-field"><span>{ui("SEO-titel")} <small>{draft.seo.title.length} {ui("/ 60 aanbevolen")}</small></span><input value={draft.seo.title} onChange={event => onChange({ ...draft.seo, title: event.target.value })} placeholder={ui("Gebruikt standaard de artikeltitel")} maxLength={160} disabled={disabled} /></label>
    <label className="dpba-field"><span>{ui("Metaomschrijving")} <small>{draft.seo.description.length} {ui("/ 160 aanbevolen")}</small></span><textarea value={draft.seo.description} onChange={event => onChange({ ...draft.seo, description: event.target.value })} placeholder={ui("Gebruikt standaard de samenvatting")} maxLength={320} rows={3} disabled={disabled} /></label>
    <div className="dpba-seo-tabs" aria-label={ui("SEO-voorbeelden")}>
      <button type="button" aria-pressed={mode === "google"} onClick={() => setMode("google")}><Search size={14} /> Google</button>
      <button type="button" aria-pressed={mode === "social"} onClick={() => setMode("social")}><Share2 size={14} /> {ui("Sociale media")}</button>
    </div>
    {mode === "google" ? <div className="dpba-google">
      <div><img src="/favicon.svg" width={26} height={26} alt="" /><span><strong>DartsPoint</strong><small>{brandHost} › blog › {slug || ui("jouw-artikel")}</small></span></div>
      <b>{title}</b><p>{description}</p>
    </div> : <div className="dpba-social-preview">
      {image.url ? <img src={image.url} alt={image.alt} style={image === draft.hero ? { objectPosition: `${draft.hero.focalPoint.x * 100}% ${draft.hero.focalPoint.y * 100}%` } : undefined} /> : <div><ImagePlus size={20} /> {ui("Geen afbeelding gekozen")}</div>}
      <div><small>{brandHost}</small><strong>{title}</strong><p>{description}</p></div>
    </div>}
  </Panel>;
}

export function BlogAdmin({ onRegisterNavigationGuard }: { onRegisterNavigationGuard: (guard: (() => Promise<boolean>) | null) => void }) {
  useI18n();
  const [entries, setEntries] = useState<BlogAdminEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [operation, setOperation] = useState<string | null>("laden");
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const [preview, setPreview] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const baseline = useRef<string>("");
  const busy = Boolean(operation);
  const draft = selection?.value;
  const slug = draft ? slugFor(draft.slug) : "";
  const tags = useMemo(() => [...new Set(tagInput.split(",").map(tag => tag.trim()).filter(Boolean))], [tagInput]);
  const actualDraft = draft ? { ...draft, tags, slug } : null;
  const dirty = actualDraft !== null && JSON.stringify(actualDraft) !== baseline.current;

  const load = useCallback(async () => {
    setOperation("laden");
    setLoadFailed(false);
    setNotice(null);
    try {
      const result = await request<{ entries: BlogAdminEntry[] }>();
      setEntries(result.entries);
    } catch (error) {
      setLoadFailed(true);
      setNotice(errorNotice(error));
    } finally { setOperation(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const guard = async () => !busy && (!dirty || window.confirm(ui("Je hebt onopgeslagen wijzigingen. Wil je deze verlaten?")));
    onRegisterNavigationGuard(guard);
    return () => onRegisterNavigationGuard(null);
  }, [busy, dirty, onRegisterNavigationGuard]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (notice?.kind === "error") noticeRef.current?.focus(); }, [notice]);

  const shown = entries.filter(entry => {
    const matchFilter = filter === "all" || entryStatus(entry) === filter;
    const matchQuery = [entry.draft.title, entry.draft.category, entry.draft.slug, entry.draft.author, entry.source].some(value => value.toLowerCase().includes(query.trim().toLowerCase()));
    return matchFilter && matchQuery;
  }).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const liveCount = entries.filter(entry => entry.live !== null).length;
  const draftCount = entries.filter(entry => entryStatus(entry) !== "live").length;
  const socialHeroCount = entries.filter(entry => entry.source === "socialhero").length;

  function remember(entry: BlogAdminEntry) {
    setEntries(items => [entry, ...items.filter(item => item.id !== entry.id)]);
  }

  function setEditor(entry: BlogAdminEntry | null, draftValue = entry?.draft ?? emptyDraft()) {
    baseline.current = JSON.stringify(draftValue);
    setSelection({ entry, value: draftValue, slugManuallyEdited: !!entry });
    setTagInput(draftValue.tags.join(", "));
    setEditorVersion(version => version + 1);
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  function openEditor(entry: BlogAdminEntry | null) {
    setNotice(null);
    setEditor(entry);
  }

  function leaveEditor() {
    if (busy || (dirty && !window.confirm(ui("Je hebt onopgeslagen wijzigingen. Wil je terug naar het overzicht?")))) return;
    setSelection(null);
    setNotice(null);
  }

  function update(fields: Partial<BlogDraft>) {
    setSelection(current => current ? { ...current, value: { ...current.value, ...fields } } : null);
  }

  function updateTitle(title: string) {
    setSelection(current => current ? { ...current, value: { ...current.value, title, slug: current.slugManuallyEdited ? current.value.slug : slugFor(title) } } : null);
  }

  function updateSlug(value: string) {
    setSelection(current => current ? { ...current, slugManuallyEdited: true, value: { ...current.value, slug: value } } : null);
  }

  async function reloadEditor() {
    const id = selection?.entry?.id;
    if (!id || busy || (dirty && !window.confirm(ui("Wil je het concept opnieuw laden en je onopgeslagen wijzigingen wissen?")))) return;
    setOperation("laden");
    try {
      const result = await request<{ entries: BlogAdminEntry[] }>();
      const latest = result.entries.find(entry => entry.id === id);
      if (!latest) throw new Error(ui("Dit artikel is niet meer beschikbaar."));
      setEntries(result.entries);
      setEditor(latest);
      setNotice(null);
    } catch (error) { setNotice(errorNotice(error)); }
    finally { setOperation(null); }
  }

  async function saveDraft() {
    if (!selection || !actualDraft || busy) return;
    if (!actualDraft.title.trim() || !actualDraft.slug) {
      setNotice({ kind: "error", message: ui("Vul een titel en een geldige URL-slug in.") });
      return;
    }
    if (tags.length > 20 || tags.some(tag => tag.length > 40)) {
      setNotice({ kind: "error", message: ui("Gebruik maximaal 20 tags van maximaal 40 tekens per tag.") });
      return;
    }
    const confirmSlugChange = !!selection.entry?.live && (selection.entry.live.slug !== actualDraft.slug || selection.entry.live.locale !== actualDraft.locale);
    if (confirmSlugChange && !window.confirm(ui("De publieke URL wijzigt bij publicatie naar {url}. Wil je deze wijziging opslaan? De oude URL blijft doorverwijzen.", {url:blogUrl(actualDraft)}))) return;
    setOperation("opslaan");
    setNotice(null);
    try {
      const result = await request<{ entry: BlogAdminEntry }>("", { id: selection.entry?.id, revision: selection.entry?.revision, confirmSlugChange, draft: actualDraft });
      remember(result.entry);
      baseline.current = JSON.stringify(result.entry.draft);
      setSelection({ entry: result.entry, value: result.entry.draft, slugManuallyEdited: true });
      setTagInput(result.entry.draft.tags.join(", "));
      setNotice({ kind: "success", message: result.entry.live ? ui("Revisie opgeslagen. De huidige versie blijft zichtbaar tot je publiceert.") : ui("Concept opgeslagen.") });
    } catch (error) { setNotice(errorNotice(error)); }
    finally { setOperation(null); }
  }

  async function publish() {
    const entry = selection?.entry;
    if (!entry || dirty || busy) return;
    setConfirmPublish(false);
    setOperation("publiceren");
    setNotice(null);
    try {
      const result = await request<{ entry: BlogAdminEntry }>("/publish", { id: entry.id, revision: entry.revision, requestId: crypto.randomUUID() });
      remember(result.entry);
      baseline.current = JSON.stringify(result.entry.draft);
      setSelection({ entry: result.entry, value: result.entry.draft, slugManuallyEdited: true });
      setNotice({ kind: "success", message: ui("De nieuwe versie staat op de blog.") });
    } catch (error) { setNotice(errorNotice(error)); }
    finally { setOperation(null); }
  }

  async function uploadField(file: File, field: "hero" | "ogImage") {
    if (!draft || busy) return;
    setOperation("uploaden");
    setNotice(null);
    try {
      const { assetId, url, width, height } = await upload(file);
      if (field === "hero") update({ hero: { assetId, url, width, height, alt: "", focalPoint: { x: 0.5, y: 0.5 } } });
      else update({ ogImage: { assetId, url, width, height, alt: "" } });
    } catch (error) { setNotice(errorNotice(error)); }
    finally { setOperation(null); }
  }

  const flash = notice ? <div ref={noticeRef} tabIndex={-1} role={notice.kind === "error" ? "alert" : "status"} className={`dpba-notice dpba-notice--${notice.kind}`}>
    {notice.kind === "error" ? <CircleAlert size={17} /> : <Check size={17} />}<span>{notice.message}{notice.fields && <ul>{Object.entries(notice.fields).map(([field, message]) => <li key={field}><strong>{({title:ui("Titel"),slug:ui("URL-slug"),excerpt:ui("Samenvatting"),content:ui("Artikeltekst"),hero:ui("Hero-afbeelding"),ogImage:ui("Deelafbeelding"),locale:ui("Taal"),authorId:ui("Auteur"),categoryId:ui("Categorie")} as Record<string,string>)[field.split(".")[0]] ?? field}: </strong>{ui(message)}</li>)}</ul>}</span>{["REVISION_CONFLICT", "revision_conflict", "blog_revision_conflict"].includes(notice.code ?? "") && selection?.entry && <button type="button" className="adm-btn" disabled={busy} onClick={() => void reloadEditor()}>{ui("Concept opnieuw laden")}</button>}
  </div> : null;

  if (!draft || !selection) return <div className="dp-blog-admin">
    <div className="dpba-list-header"><p>{ui("Beheer artikelen, concepten en publicaties voor de DartsPoint-blog.")}</p><div className="dpba-actions">
      <a className="adm-btn" href="/blog" target="_blank" rel="noreferrer"><ArrowUpRight size={15} />{ui("Bekijk blog")}</a>
      <button type="button" className="adm-btn adm-btn-primary" disabled={busy || loadFailed} onClick={() => openEditor(null)}><Plus size={17} />{ui("Nieuw artikel")}</button>
    </div></div>
    {flash}
    <div className="dpba-summary">
      <div className="adm-panel"><Globe size={16} /><span>{ui("Gepubliceerd")}</span><strong>{liveCount}</strong></div>
      <div className="adm-panel"><FileText size={16} /><span>{ui("Concepten en revisies")}</span><strong>{draftCount}</strong></div>
      <div className="adm-panel"><Link2 size={16} /><span>{ui("Van SocialHero")}</span><strong>{socialHeroCount}</strong></div>
    </div>
    <div className="adm-toolbar dpba-list-tools">
      <label className="adm-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label={ui("Zoeken in blogartikelen")} placeholder={ui("Zoek op titel, categorie of auteur")} /></label>
      <label className="dpba-status-filter"><span>{ui("Status")}</span><select className="adm-filter-select" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">{ui("Alle statussen")}</option><option value="draft">{ui("Concept")}</option><option value="revision">{ui("Revisie open")}</option><option value="live">{ui("Gepubliceerd")}</option></select></label>
    </div>
    <div className="adm-panel dpba-entries">
      <div className="dpba-entries-head" aria-hidden="true"><span>{ui("Artikel")}</span><span>{ui("Status")}</span><span>{ui("Herkomst")}</span><span>{ui("Bijgewerkt")}</span><span /></div>
      {shown.map(entry => <button type="button" className="dpba-entry" key={entry.id} onClick={() => openEditor(entry)}>
        <span className="dpba-entry-title"><span className="dpba-entry-image">{entry.draft.hero.url ? <img src={entry.draft.hero.url} alt="" /> : <BookOpen size={16} />}</span><span><strong>{entry.draft.title}</strong><small>{entry.draft.category} · {entry.draft.locale}</small></span></span>
        <span className="dpba-entry-status"><StatusPill status={entryStatus(entry)} /></span><span className="dpba-entry-source">{entry.source === "socialhero" ? "SocialHero" : ui("Redactie")}</span><span className="dpba-entry-date">{day(entry.updatedAt)}</span><ChevronRight size={17} className="dpba-entry-arrow" />
      </button>)}
      {!shown.length && <div className="dpba-empty">{operation === "laden" ? ui("Artikelen laden…") : loadFailed ? <button type="button" className="adm-btn" onClick={() => void load()}>{ui("Opnieuw laden")}</button> : ui("Geen artikelen gevonden.")}</div>}
    </div>
    {getPlatform().actor?.role === "owner" && <BlogCredentials/>}
  </div>;

  const entry = selection.entry;
  const canPublish = !!entry && !dirty && entry.revision !== entry.liveRevision;
  const previewArticle: BlogArticle = { id: entry?.id ?? "preview", revision: entry?.revision ?? 0, ...(actualDraft ?? draft), title: draft.title || ui("Naamloos artikel"), publishedAt: entry?.live?.publishedAt ?? new Date().toISOString(), updatedAt: entry?.updatedAt ?? new Date().toISOString() };
  const redirectFrom = entry?.live && (entry.live.slug !== slug || entry.live.locale !== draft.locale) ? blogUrl(entry.live) : null;
  return <div className="dp-blog-admin">
    <div className="dpba-edit-header">
      <div><button type="button" className="dpba-back" disabled={busy} onClick={leaveEditor}><ArrowLeft size={14} />{ui("Alle artikelen")}</button><h2 ref={headingRef} tabIndex={-1}>{entry ? (draft.title || ui("Artikel bewerken")) : ui("Nieuw artikel")}</h2></div>
      <div className="dpba-actions"><button type="button" className="adm-btn" onClick={() => setPreview(true)}><Eye size={15} />{ui("Voorbeeld")}</button>{entry && <a className="adm-btn" href={`/beheer/blog/preview/${entry.id}?revision=${entry.revision}`} target="_blank" rel="noreferrer">{ui("Opgeslagen revisie")}</a>}{entry?.live && <a className="adm-btn" href={blogUrl(entry.live)} target="_blank" rel="noreferrer"><ArrowUpRight size={15} />{ui("Bekijk live")}</a>}</div>
    </div>
    {flash}
    <div className="dpba-editor-grid">
      <div className="dpba-editor-main">
        <Panel title={ui("Artikel")} icon={<FileText size={17} />}>
          <label className="dpba-field"><span>{ui("Titel")} <b className="dpba-required">*</b></span><input className="dpba-title-input" value={draft.title} aria-invalid={!!notice?.fields?.title} onChange={event => updateTitle(event.target.value)} placeholder={ui("Schrijf een duidelijke titel")} maxLength={160} disabled={busy} /></label>
          <label className="dpba-field"><span>{ui("URL-slug")} <b className="dpba-required">*</b></span><input value={draft.slug} aria-invalid={!!notice?.fields?.slug} onChange={event => updateSlug(event.target.value)} onBlur={() => { if (draft.slug !== slug) update({ slug }); }} maxLength={110} placeholder={ui("jouw-artikel")} disabled={busy} aria-describedby="dpba-slug-help" /></label>
          <p id="dpba-slug-help" className="dpba-help dpba-canonical"><Link2 size={14} /><span>{blogUrl({locale:draft.locale, slug:slug || ui("jouw-artikel")})}</span></p>
          {redirectFrom && <p className="dpba-help dpba-url-change">{ui("Na publicatie verwijst")+" "}{redirectFrom} {ui("permanent naar de nieuwe URL.")}</p>}
          <label className="dpba-field"><span>{ui("Samenvatting")} <b className="dpba-required">*</b></span><textarea value={draft.excerpt} onChange={event => update({ excerpt: event.target.value })} rows={3} maxLength={360} placeholder={ui("Een korte introductie bij het artikel")} disabled={busy} /></label>
          <div className="dpba-body-label">{ui("Artikeltekst")} <b className="dpba-required">*</b></div>
          <BlogEditor key={editorVersion} value={draft.content} onChange={content => update({ content })} onUploadImage={upload} readOnly={busy} />
        </Panel>
        <Panel title={ui("Details")} icon={<BookOpen size={17} />}>
          <div className="dpba-fields-grid">
            <label className="dpba-field"><span>{ui("Type")}</span><select value={draft.type} onChange={event => update({ type: event.target.value as BlogDraft["type"] })} disabled={busy}><option value="blog">{ui("Blogbericht")}</option><option value="article">{ui("Artikel")}</option></select></label>
            <label className="dpba-field"><span>{ui("Taal")}</span><select value={draft.locale} onChange={event => update({ locale: event.target.value as BlogDraft["locale"] })} disabled={busy}><option value="nl-NL">{ui("Nederlands")}</option><option value="en-GB">{ui("Engels")}</option></select></label>
            <label className="dpba-field"><span>{ui("Categorie")}</span><select value={draft.categoryId} onChange={event => { const category = BLOG_CATEGORIES.find(item => item.id === event.target.value); if (category) update({ categoryId: category.id, category: category.name }); }} disabled={busy}>{BLOG_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="dpba-field"><span>{ui("Auteur")}</span><select value={draft.authorId} onChange={event => { const author = BLOG_AUTHORS.find(item => item.id === event.target.value); if (author) update({ authorId: author.id, author: author.name }); }} disabled={busy}>{BLOG_AUTHORS.map(author => <option key={author.id} value={author.id}>{author.name}</option>)}</select></label>
          </div>
          <label className="dpba-field"><span>{ui("Tags")}</span><input value={tagInput} onChange={event => setTagInput(event.target.value)} maxLength={850} placeholder={ui("Bijvoorbeeld 501, trainen, dubbels")} disabled={busy} /></label>
          <p className="dpba-help">{ui("Gebruik komma’s om maximaal 20 tags te scheiden.")}</p>
          <label className="dpba-field"><span>{ui("Gepubliceerde vertaling")}</span><select value={draft.translationOfId ?? ""} disabled={busy} onChange={event => update({translationOfId:event.target.value || undefined})}><option value="">{ui("Geen gekoppelde vertaling")}</option>{entries.filter(item => item.live && item.id !== entry?.id && item.live.locale !== draft.locale).map(item => <option key={item.id} value={item.id}>{item.live!.title} · {item.live!.locale}</option>)}</select></label><p className="dpba-help">{ui("Koppel alleen een echte vertaling. Taalverwijzingen verschijnen zodra beide artikelen live staan.")}</p>
        </Panel>
      </div>
      <div className="dpba-editor-side">
        <Panel title={ui("Publicatie")} icon={<Send size={17} />}>
          <div className="dpba-publish-state"><StatusPill status={entry ? entryStatus(entry) : "draft"} />{dirty && <span>{ui("Onopgeslagen wijzigingen")}</span>}</div>
          <dl className="dpba-publish-details"><div><dt>{ui("Herkomst")}</dt><dd>{entry?.source === "socialhero" ? "SocialHero" : ui("Redactie")}</dd></div>{entry && <div><dt>{ui("Conceptrevisie")}</dt><dd>{entry.revision}</dd></div>}{entry?.liveRevision && <div><dt>{ui("Live revisie")}</dt><dd>{entry.liveRevision}</dd></div>}</dl>
          {entry?.live && entry.liveRevision !== entry.revision && <p className="dpba-help">{ui("De vorige versie blijft zichtbaar tot je deze revisie publiceert.")}</p>}
          <div className="dpba-publish-actions">
            <button type="button" className="adm-btn" disabled={busy || (!!entry && !dirty)} onClick={() => void saveDraft()}><Save size={15} />{operation === "opslaan" ? ui("Opslaan…") : ui("Concept opslaan")}</button>
            <button type="button" className="adm-btn adm-btn-primary" disabled={busy || !canPublish} onClick={() => setConfirmPublish(true)}><Send size={15} />{operation === "publiceren" ? ui("Publiceren…") : ui("Publiceren")}</button>
          </div>
          {(!entry || dirty) && <p className="dpba-help">{ui("Sla het concept op om te kunnen publiceren.")}</p>}
        </Panel>
        <Panel title={ui("Afbeeldingen")} icon={<ImagePlus size={17} />}>
          <ImageField title={ui("Hero-afbeelding")} image={draft.hero} placeholder={ui("Kies een portretafbeelding")} ratio={ui("4:5 aanbevolen")} disabled={busy} required onUpload={file => void uploadField(file, "hero")} onAlt={alt => update({ hero: { ...draft.hero, alt } })} onRemove={() => update({ hero: emptyDraft().hero })} />
          {draft.hero.url && <fieldset className="dpba-focal" disabled={busy}>
            <legend>{ui("Focuspunt")}</legend>
            <label><span>{ui("Horizontaal")}</span><input type="range" min={0} max={100} value={Math.round(draft.hero.focalPoint.x * 100)} onChange={event => update({ hero: { ...draft.hero, focalPoint: { ...draft.hero.focalPoint, x: Number(event.target.value) / 100 } } })} /><output>{Math.round(draft.hero.focalPoint.x * 100)}%</output></label>
            <label><span>{ui("Verticaal")}</span><input type="range" min={0} max={100} value={Math.round(draft.hero.focalPoint.y * 100)} onChange={event => update({ hero: { ...draft.hero, focalPoint: { ...draft.hero.focalPoint, y: Number(event.target.value) / 100 } } })} /><output>{Math.round(draft.hero.focalPoint.y * 100)}%</output></label>
          </fieldset>}
          <ImageField title={ui("Deelafbeelding")} image={draft.ogImage} placeholder={ui("Optioneel, standaard wordt de hero gebruikt")} ratio={ui("1200 × 630 aanbevolen")} disabled={busy} onUpload={file => void uploadField(file, "ogImage")} onAlt={alt => { if (draft.ogImage) update({ ogImage: { ...draft.ogImage, alt } }); }} onRemove={() => update({ ogImage: undefined })} />
        </Panel>
        <SeoPanel draft={draft} slug={slug} onChange={seo => update({ seo })} disabled={busy} />
      </div>
    </div>
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="dpba-preview-dialog">
      <DialogHeader><DialogTitle>{ui("Artikelvoorbeeld")}</DialogTitle><DialogDescription>{ui("Deze weergave is alleen zichtbaar in blogbeheer.")}</DialogDescription></DialogHeader>
      <BlogArticleDetail article={previewArticle} preview />
    </DialogContent></Dialog>
    <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}><DialogContent className="dpba-confirm-dialog">
      <DialogHeader><DialogTitle>{ui("Artikel publiceren")}</DialogTitle><DialogDescription>{redirectFrom ? ui("De URL wijzigt naar {url}. De oude URL verwijst door naar de nieuwe.", {url:blogUrl(previewArticle)}) : ui("Revisie {revision} verschijnt op de blog.", {revision:entry?.revision ?? 0})}</DialogDescription></DialogHeader>
      <div className="dpba-actions"><button type="button" className="adm-btn" onClick={() => setConfirmPublish(false)}>{ui("Annuleren")}</button><button type="button" className="adm-btn adm-btn-primary" onClick={() => void publish()}><Send size={15} />{ui("Publiceren")}</button></div>
    </DialogContent></Dialog>
  </div>;
}
