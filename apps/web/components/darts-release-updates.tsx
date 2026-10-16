"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, Lightbulb, ListChecks, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RELEASE_CATEGORIES, RELEASE_STATUSES, submitReleaseIdea, useMyReleaseIdeas, usePublicReleaseUpdates, type ReleaseCategory, type PublicReleaseUpdate } from "@/lib/darts-releases";
import { usePlatform } from "@/lib/platform-client";
import styles from "./darts-release-updates.module.css";

type View = "history" | "detail" | "idea" | "mine" | "submitted" | null;
type UpdatesProps = { title?: string; description?: string; limit?: number; allowIdeas?: boolean; preview?: boolean; updates?: PublicReleaseUpdate[] };
const DEFAULT_CATEGORY: ReleaseCategory = "community";

function dateLabel(value: number | string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }) : "Datum volgt";
}
function dateTimeLabel(value: number | string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function UpdateList({ updates, onOpen, compact = false }: { updates: PublicReleaseUpdate[]; onOpen: (id: string) => void; compact?: boolean }) {
  if (!updates.length) return <div className={styles.empty}><Sparkles size={25}/><strong>De volgende toevoeging begint hier.</strong><p>Zodra er iets nieuws is gepubliceerd, lees je hier wat er is veranderd.</p></div>;
  return <ol className={`${styles.timeline}${compact ? ` ${styles.compact}` : ""}`} aria-label="Gepubliceerde toevoegingen">
    {updates.map((update, index) => <li key={update.id}><button type="button" className={styles.updateButton} onClick={() => onOpen(update.id)} aria-label={`Lees toevoeging: ${update.title}`}>
      <span className={`${styles.timelineMark}${index === 0 ? ` ${styles.latestMark}` : ""}`} aria-hidden="true">{index === 0 ? <Sparkles size={15}/> : <Check size={13}/>}</span>
      <span className={styles.updateCopy}><span className={styles.meta}><time dateTime={dateTimeLabel(update.publishedAt)}>{dateLabel(update.publishedAt)}</time>{update.version && <span className={styles.version}>{update.version}</span>}<span className={styles.category}>{RELEASE_CATEGORIES[update.category]}</span></span><strong>{update.title}</strong><span className={styles.summary}>{update.summary}</span></span>
      <ChevronRight className={styles.rowArrow} size={16}/>
    </button></li>)}
  </ol>;
}

function ReleaseUpdatesSurface({ title = "Een beetje beter. Elke avond.", description = "Dit hebben we aan DartsPoint toegevoegd.", limit = 3, allowIdeas = true, preview = false, fullPage = false, updates: suppliedUpdates }: UpdatesProps & { fullPage?: boolean }) {
  const platform = usePlatform();
  const [view, setView] = useState<View>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailBack, setDetailBack] = useState<"history" | "mine" | null>(null);
  const needsHistory = view === "history" || (view === "detail" && detailBack === "history");
  const publicFeed = usePublicReleaseUpdates(!preview && (suppliedUpdates === undefined || needsHistory));
  const updates = suppliedUpdates ?? publicFeed.updates;
  const historyUpdates = preview ? updates : publicFeed.updates;
  const own = useMyReleaseIdeas(!preview && (view === "mine" || (view === "detail" && detailBack === "mine")));
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [ideaCategory, setIdeaCategory] = useState<ReleaseCategory>(DEFAULT_CATEGORY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  // A retry of the same logical submission reuses its UUID, including after a lost response.
  const request = useRef<{ signature: string; id: string } | null>(null);
  const ideaInput = useRef<HTMLInputElement>(null);
  const dialogHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [receipt, setReceipt] = useState<{ number: number; title: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const discarding = useRef(false);
  const formId = useId();
  const [dialogViewport, setDialogViewport] = useState<CSSProperties>({});
  const selectedUpdate = historyUpdates.find(update => update.id === detailId) ?? updates.find(update => update.id === detailId) ?? (detailBack === "mine" ? own.ideas.find(idea => idea.publication?.id === detailId)?.publication : undefined);
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(5, Math.floor(limit))) : 3;
  const visible = fullPage ? updates : updates.slice(0, count);
  const dirty = Boolean(ideaTitle || ideaDescription || ideaCategory !== DEFAULT_CATEGORY);
  const profileName = platform.actor?.username ?? "";
  const loading = suppliedUpdates === undefined && !preview && publicFeed.loading;
  const publicError = suppliedUpdates === undefined && !preview ? publicFeed.error : "";

  useEffect(() => {
    if (view === null) return;
    const viewport = window.visualViewport;
    const update = () => {
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const height = (viewport?.height ?? window.innerHeight) / zoom;
      setDialogViewport({ "--release-viewport-height": `${height}px`, "--release-viewport-center": `${(viewport?.offsetTop ?? 0) / zoom + height / 2}px` } as CSSProperties);
    };
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [view !== null]);
  useEffect(() => {
    if (!view || discardOpen) return;
    const frame = window.requestAnimationFrame(() => {
      if (view === "idea") ideaInput.current?.focus({ preventScroll: true });
      else dialogHeading.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, discardOpen]);
  useEffect(() => {
    if (view !== "idea" || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view, dirty]);

  function open(next: Exclude<View, null>) {
    if (view === null) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setView(next);
  }
  function openDetail(id: string, back: "history" | "mine" | null = null) { setDetailId(id); setDetailBack(back); open("detail"); }
  function clearForm() { setIdeaTitle(""); setIdeaDescription(""); setIdeaCategory(DEFAULT_CATEGORY); setError(""); request.current = null; }
  function openIdea() { if (!preview) { setError(""); open("idea"); } }
  function close() {
    if (submitting.current) return;
    if (view === "idea" && dirty) { setDiscardOpen(true); return; }
    setView(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || submitting.current || !platform.actor?.id) return;
    const input = { title: ideaTitle.trim(), description: ideaDescription.trim(), category: ideaCategory };
    if (input.title.length < 3 || input.title.length > 140 || input.description.length > 3000) { setError("Gebruik een titel van 3–140 tekens en maximaal 3.000 tekens toelichting."); ideaInput.current?.focus(); return; }
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setError(""); submitting.current = true; setBusy(true);
    try {
      const item = await submitReleaseIdea(input, request.current.id);
      setReceipt({ number: item.number, title: item.title });
      clearForm(); setView("submitted"); void own.reload().catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} Je invoer blijft bewaard.` : "Je idee kon niet worden opgeslagen. Je tekst staat er nog; probeer het opnieuw.");
    } finally { submitting.current = false; setBusy(false); }
  }
  const dialogTitle = view === "history" ? "Alle toevoegingen" : view === "detail" ? selectedUpdate?.title ?? "Toevoeging niet beschikbaar" : view === "mine" ? "Mijn ideeën" : view === "submitted" ? "Bedankt voor het meedenken." : "Wat zou jouw avond beter maken?";
  const dialogDescription = view === "history" ? "De gepubliceerde verbeteringen aan DartsPoint, van nieuw naar eerder." : view === "detail" ? "Een gepubliceerde toevoeging aan DartsPoint." : view === "mine" ? "Je eigen inzendingen, hun huidige status en eventuele openbare terugkoppeling." : view === "submitted" ? "Je idee is ontvangen en staat bij jouw ideeën." : "Een handige functie, een kleine verbetering of iets dat je mist. We horen het graag.";

  return <div className={`${styles.widget}${fullPage ? ` ${styles.full}` : ""}`}>
    <div className={styles.widgetTop}><span className={styles.eyebrow}><Sparkles size={14}/>NIEUW IN DARTSPOINT</span>{preview && <span className={styles.demo}>VOORBEELD</span>}</div>
    <div className={styles.headingRow}><h2 className={styles.heading}>{title}</h2><span className={styles.count} aria-label={`${updates.length} ${fullPage ? "gepubliceerde" : "getoonde"} toevoegingen`}>{updates.length.toString().padStart(2, "0")}</span></div>
    <p className={styles.intro}>{description}</p>
    {loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>Toevoegingen laden…</p></div> : publicError ? <div className={styles.formError} role="alert"><p>{publicError}</p><button className={styles.textButton} type="button" onClick={() => { void publicFeed.reload().catch(() => {}); }}>Opnieuw laden</button></div> : <UpdateList updates={visible} compact={!fullPage} onOpen={id => openDetail(id)}/>}
    <div className={styles.widgetActions}>
      {!fullPage && <button className={styles.textButton} type="button" onClick={() => open("history")}>Alle toevoegingen<ArrowRight size={14}/></button>}
      {allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea} disabled={preview} title={preview ? "In het beheervoorbeeld kun je geen idee insturen." : undefined}><Lightbulb size={15}/>Idee inbrengen</button>}
      {!preview && <button className={styles.ownButton} type="button" onClick={() => open("mine")}>Mijn ideeën</button>}
    </div>
    {preview && <p className={styles.previewNotice}>Alleen een leesvoorbeeld. Ideeën insturen kan in de kamer.</p>}

    <Dialog open={view !== null} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className={`${styles.dialog}${view === "history" || view === "mine" ? ` ${styles.wideDialog}` : ""}`} showCloseButton={false} style={dialogViewport}
        onOpenAutoFocus={event => { event.preventDefault(); (view === "idea" ? ideaInput.current : dialogHeading.current)?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }}
        onPointerDownOutside={event => {
          // Radix defers outside pointer events. A cancel click from the nested
          // confirmation may arrive after it closed; it must not reopen it.
          const target = event.detail.originalEvent.target;
          if (discardOpen || submitting.current || (target instanceof Element && target.closest('[role="alertdialog"]'))) event.preventDefault();
        }}
        onEscapeKeyDown={event => { if (discardOpen || submitting.current) event.preventDefault(); }}>
        <button className={styles.closeButton} type="button" onClick={close} aria-label="Venster sluiten" disabled={busy}><X size={20}/></button>
        <DialogHeader className={styles.dialogHeader}><span className={styles.eyebrow}>{view === "idea" || view === "mine" || view === "submitted" ? <Lightbulb size={14}/> : <Sparkles size={14}/>}<span>{view === "idea" || view === "mine" || view === "submitted" ? "SAMEN MAKEN WE DARTSPOINT" : "NIEUW IN DARTSPOINT"}</span></span><DialogTitle ref={dialogHeading} tabIndex={-1} className={styles.dialogTitle}>{dialogTitle}</DialogTitle><DialogDescription className={styles.dialogDescription}>{dialogDescription}</DialogDescription></DialogHeader>
        <div className={styles.dialogBody}>
          {view === "history" && <>{!preview && publicFeed.loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>Alle toevoegingen laden…</p></div> : !preview && publicFeed.error ? <div className={styles.formError} role="alert"><p>{publicFeed.error}</p><button className={styles.textButton} type="button" onClick={() => { void publicFeed.reload().catch(() => {}); }}>Opnieuw laden</button></div> : <UpdateList updates={historyUpdates} onOpen={id => openDetail(id, "history")}/>}<div className={styles.dialogFooter}><span className={styles.demoNote}>Alleen gepubliceerde toevoegingen</span>{allowIdeas && !preview && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>Idee inbrengen</button>}</div></>}
          {view === "detail" && <>{selectedUpdate ? <><div className={styles.detailMeta}><span className={styles.category}>{RELEASE_CATEGORIES[selectedUpdate.category]}</span><time dateTime={dateTimeLabel(selectedUpdate.publishedAt)}>{dateLabel(selectedUpdate.publishedAt)}</time>{selectedUpdate.version && <span className={styles.version}>{selectedUpdate.version}</span>}</div><div className={styles.detailBody}>{selectedUpdate.summary.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></> : <div className={styles.empty}><Clock3 size={25}/><p>Deze toevoeging is niet meer gepubliceerd. De andere toevoegingen vind je in het overzicht.</p></div>}<div className={styles.dialogFooter}><button className={styles.textButton} type="button" onClick={() => detailBack ? setView(detailBack) : close()}><ArrowLeft size={14}/>{detailBack === "mine" ? "Terug naar mijn ideeën" : detailBack ? "Terug naar alle toevoegingen" : "Terug"}</button><span className={styles.demoNote}>Gepubliceerde update</span></div></>}
          {view === "idea" && !preview && <form id={formId} className={styles.ideaForm} onSubmit={submit} aria-busy={busy}>
            <label htmlFor={`${formId}-title`}><span>Jouw idee<small>{ideaTitle.length}/140</small></span><input ref={ideaInput} id={`${formId}-title`} value={ideaTitle} onChange={event => { setIdeaTitle(event.target.value); setError(""); }} minLength={3} maxLength={140} required autoComplete="off" placeholder="Bijvoorbeeld: een vaste avond met mijn vrienden" disabled={busy}/></label>
            <label htmlFor={`${formId}-category`}><span>Waar gaat het over?</span><select id={`${formId}-category`} value={ideaCategory} onChange={event => setIdeaCategory(event.target.value as ReleaseCategory)} disabled={busy}>{Object.entries(RELEASE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor={`${formId}-description`}><span>Vertel er iets meer over<small>Optioneel · {ideaDescription.length}/3000</small></span><textarea id={`${formId}-description`} value={ideaDescription} onChange={event => { setIdeaDescription(event.target.value); setError(""); }} maxLength={3000} rows={5} placeholder="Wat mis je, en wanneer zou dit handig zijn?" disabled={busy}/></label>
            <div className={styles.privacyNote}><MessageCircle size={16}/><p>Je idee gaat naar platformbeheer. Alleen jij ziet je inzending bij Mijn ideeën. Als er iets wordt toegevoegd, kan het team daar een openbare update over plaatsen.</p></div>
            {error && <p className={styles.formError} role="alert">{error}</p>}
          </form>}
          {view === "submitted" && receipt && <div className={styles.receipt}><span className={styles.successIcon}><CheckCircle2 size={33}/></span><span className={styles.receiptNumber}>IDEE #{receipt.number}</span><h3>{receipt.title}</h3><p>Je kunt de voortgang terugvinden bij Mijn ideeën. We nemen ieder idee mee; indienen is nog geen toezegging dat het wordt gebouwd.</p><button className={styles.primaryButton} type="button" onClick={() => setView("mine")}><ListChecks size={16}/>Bekijk mijn ideeën<ArrowRight size={15}/></button><button className={styles.textButton} type="button" onClick={close}>Terug naar {fullPage ? "de toevoegingen" : "de kamer"}</button></div>}
          {view === "mine" && !preview && <>{own.loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>Je ideeën worden geladen…</p></div> : own.error ? <div className={styles.formError} role="alert"><p>{own.error}</p><button className={styles.textButton} type="button" onClick={() => { void own.reload().catch(() => {}); }}>Opnieuw laden</button></div> : own.ideas.length ? <div className={styles.ownIdeas}>{own.ideas.map(item => { const feedback = item.publication; return <article className={styles.ownIdea} key={item.id}><div className={styles.ownIdeaMeta}><span>IDEE #{item.number} · {dateLabel(item.createdAt)}</span><span className={styles.ideaStatus} data-status={item.status}>{RELEASE_STATUSES[item.status]}</span></div><h3>{item.title}</h3><span className={styles.ownCategory}>{RELEASE_CATEGORIES[item.category]}</span>{item.description && <p className={styles.ownDescription}>{item.description}</p>}{feedback ? <div className={styles.publicFeedback}><span><CheckCircle2 size={14}/>Openbare terugkoppeling</span><p>{feedback.summary}</p><button className={styles.textButton} type="button" onClick={() => openDetail(feedback.id, "mine")}>Lees de toevoeging<ArrowRight size={13}/></button></div> : <p className={styles.noFeedback}>Nog geen openbare terugkoppeling.</p>}</article>; })}</div> : <div className={styles.empty}><Lightbulb size={29}/><strong>Jouw eerste idee is welkom.</strong><p>Je hebt nog geen ideeën ingediend. Deel wat jouw avond beter zou maken.</p></div>}<div className={styles.dialogFooter}><span className={styles.demoNote}>Alleen jouw eigen inzendingen</span>{allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>Nieuw idee</button>}</div></>}
        </div>
        {view === "idea" && !preview && <div className={styles.formBottom}><span>{profileName ? <>Ingediend als <strong>{profileName}</strong></> : "Je profiel wordt geladen…"}<small>Privé voor jou en platformbeheer</small></span><button form={formId} className={styles.primaryButton} type="submit" disabled={busy || !platform.actor?.id || ideaTitle.trim().length < 3}><Send size={15}/>{busy ? "Idee versturen…" : "Verstuur mijn idee"}</button></div>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent className={`${styles.dialog} ${styles.discardDialog}`} style={dialogViewport} onCloseAutoFocus={event => {
      event.preventDefault();
      // Let the nested modal release its body pointer lock before closing the
      // parent. Closing both in one render can leave the page non-interactive.
      if (discarding.current) { discarding.current = false; setView(null); }
      else if (view === "idea") ideaInput.current?.focus({ preventScroll: true });
      else if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    }}><AlertDialogHeader className={styles.dialogHeader}><AlertDialogTitle className={styles.dialogTitle}>Je idee nog even afmaken?</AlertDialogTitle><AlertDialogDescription className={styles.dialogDescription}>Je hebt nog niet verstuurd. Als je nu sluit, wordt je invoer gewist.</AlertDialogDescription></AlertDialogHeader><div className={styles.discardActions}><AlertDialogAction className={styles.textButton} onClick={() => { discarding.current = true; clearForm(); setDiscardOpen(false); }}>Invoer wissen</AlertDialogAction><AlertDialogCancel className={styles.primaryButton}>Verder schrijven<ArrowRight size={15}/></AlertDialogCancel></div></AlertDialogContent></AlertDialog>
  </div>;
}

export function ReleaseUpdatesWidget(props: UpdatesProps) {
  return <ReleaseUpdatesSurface {...props}/>;
}

export function ReleaseUpdatesPage() {
  return <div className={styles.page}>
    <header className={styles.pageHeader}><a className={styles.brand} href="/lobby" aria-label="DartsPoint lobby"><Brand/></a><a className={styles.backLink} href="/lobby"><ArrowLeft size={15}/>Terug naar de lobby</a></header>
    <main className={styles.pageMain}><div className={styles.pageIntro}><span className={styles.eyebrow}><Sparkles size={14}/>DE CLUB BLIJFT IN BEWEGING</span><h1>Nieuwe dingen.<br/><span>Hetzelfde clubgevoel.</span></h1><p>Van kleine verbeteringen tot iets helemaal nieuws. Hier lees je wat er aan DartsPoint is toegevoegd.</p></div><section className={styles.pageCard} aria-label="Toevoegingen en ideeën"><ReleaseUpdatesSurface fullPage title="Toegevoegd aan DartsPoint" description="De laatste verbeteringen, met ruimte voor jouw volgende idee."/></section><footer className={styles.pageFooter}><img src="/brand/icon.svg" alt=""/><span>Jouw kamer. Jouw avond. Jouw ideeën.</span></footer></main>
  </div>;
}
