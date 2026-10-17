"use client";
import {browserLocale} from '../../../packages/i18n/src/errors';
import {formatLocales} from '../../../packages/i18n/src/locale';

import {runtimeFeedback} from "../../../packages/i18n/src/feedback";
import {useI18n} from '@/lib/i18n/provider';


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
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(formatLocales[browserLocale()], { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }) : "Datum volgt";
}
function dateTimeLabel(value: number | string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function UpdateList({ updates, onOpen, compact = false }: { updates: PublicReleaseUpdate[]; onOpen: (id: string) => void; compact?: boolean }) {
 const dpT = useI18n("releaseUpdates").t;
 const originalTextLabel=useI18n().locale==='en'?'Original text':'Oorspronkelijke tekst';

  if (!updates.length) return <div className={styles.empty}><Sparkles size={25}/><strong>{dpT("releaseUpdates.de_volgende_toevoeging_begint_hier")}</strong><p>{dpT("releaseUpdates.zodra_er_iets_nieuws_is_gepubliceerd_lees_je")}</p></div>;
  return <ol className={`${styles.timeline}${compact ? ` ${styles.compact}` : ""}`} aria-label={dpT("releaseUpdates.gepubliceerde_toevoegingen")}>
    {updates.map((update, index) => <li key={update.id}><button type="button" className={styles.updateButton} onClick={() => onOpen(update.id)} aria-label={dpT("releaseUpdates.lees_toevoeging",{title:update.title})}>
      <span className={`${styles.timelineMark}${index === 0 ? ` ${styles.latestMark}` : ""}`} aria-hidden="true">{index === 0 ? <Sparkles size={15}/> : <Check size={13}/>}</span>
      <span className={styles.updateCopy}><span className={styles.meta}><time dateTime={dateTimeLabel(update.publishedAt)}>{dateLabel(update.publishedAt)}</time>{update.version && <span className={styles.version}>{update.version}</span>}<span className={styles.category}>{RELEASE_CATEGORIES[update.category]}</span></span><strong>{update.title}</strong><small>{originalTextLabel}</small><span className={styles.summary}>{update.summary}</span></span>
      <ChevronRight className={styles.rowArrow} size={16}/>
    </button></li>)}
  </ol>;
}

function ReleaseUpdatesSurface({ title = "Een beetje beter. Elke avond.", description = "Dit hebben we aan DartsPoint toegevoegd.", limit = 3, allowIdeas = true, preview = false, fullPage = false, updates: suppliedUpdates }: UpdatesProps & { fullPage?: boolean }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("releaseUpdates").t;

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
    if (input.title.length < 3 || input.title.length > 140 || input.description.length > 3000) { setError(dpT("releaseUpdates.gebruik_een_titel_van_3_140_tekens_en")); ideaInput.current?.focus(); return; }
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setError(""); submitting.current = true; setBusy(true);
    try {
      const item = await submitReleaseIdea(input, request.current.id);
      setReceipt({ number: item.number, title: item.title });
      clearForm(); setView("submitted"); void own.reload().catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? dpFeedback("feedback.value0_je_invoer_blijft_bewaard",{value0:cause.message}) : dpFeedback("feedback.je_idee_kon_niet_worden_opgeslagen_je_tekst"));
    } finally { submitting.current = false; setBusy(false); }
  }
  const dialogTitle = view === "history" ? "Alle toevoegingen" : view === "detail" ? selectedUpdate?.title ?? "Toevoeging niet beschikbaar" : view === "mine" ? "Mijn ideeën" : view === "submitted" ? "Bedankt voor het meedenken." : "Wat zou jouw avond beter maken?";
  const dialogDescription = view === "history" ? "De gepubliceerde verbeteringen aan DartsPoint, van nieuw naar eerder." : view === "detail" ? "Een gepubliceerde toevoeging aan DartsPoint." : view === "mine" ? "Je eigen inzendingen, hun huidige status en eventuele openbare terugkoppeling." : view === "submitted" ? "Je idee is ontvangen en staat bij jouw ideeën." : "Een handige functie, een kleine verbetering of iets dat je mist. We horen het graag.";

  return <div className={`${styles.widget}${fullPage ? ` ${styles.full}` : ""}`}>
    <div className={styles.widgetTop}><span className={styles.eyebrow}><Sparkles size={14}/>{dpT("releaseUpdates.nieuw_in_dartspoint")}</span>{preview && <span className={styles.demo}>{dpT("releaseUpdates.voorbeeld")}</span>}</div>
    <div className={styles.headingRow}><h2 className={styles.heading}>{title}</h2><span className={styles.count} aria-label={dpT("releaseUpdates.toevoegingen",{length:updates.length,published:String(fullPage)})}>{updates.length.toString().padStart(2, "0")}</span></div>
    <p className={styles.intro}>{description}</p>
    {loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>{dpT("releaseUpdates.toevoegingen_laden")}</p></div> : publicError ? <div className={styles.formError} role="alert"><p>{publicError}</p><button className={styles.textButton} type="button" onClick={() => { void publicFeed.reload().catch(() => {}); }}>{dpT("releaseUpdates.opnieuw_laden")}</button></div> : <UpdateList updates={visible} compact={!fullPage} onOpen={id => openDetail(id)}/>}
    <div className={styles.widgetActions}>
      {!fullPage && <button className={styles.textButton} type="button" onClick={() => open("history")}>{dpT("releaseUpdates.alle_toevoegingen")}<ArrowRight size={14}/></button>}
      {allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea} disabled={preview} title={preview ? dpT("releaseUpdates.in_het_beheervoorbeeld_kun_je_geen_idee_insturen") : undefined}><Lightbulb size={15}/>{dpT("releaseUpdates.idee_inbrengen")}</button>}
      {!preview && <button className={styles.ownButton} type="button" onClick={() => open("mine")}>{dpT("releaseUpdates.mijn_ideeen")}</button>}
    </div>
    {preview && <p className={styles.previewNotice}>{dpT("releaseUpdates.alleen_een_leesvoorbeeld_ideeen_insturen_kan_in_de")}</p>}

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
        <button className={styles.closeButton} type="button" onClick={close} aria-label={dpT("releaseUpdates.venster_sluiten")} disabled={busy}><X size={20}/></button>
        <DialogHeader className={styles.dialogHeader}><span className={styles.eyebrow}>{view === "idea" || view === "mine" || view === "submitted" ? <Lightbulb size={14}/> : <Sparkles size={14}/>}<span>{view === "idea" || view === "mine" || view === "submitted" ? dpT("releaseUpdates.samen_maken_we_dartspoint") : dpT("releaseUpdates.nieuw_in_dartspoint")}</span></span><DialogTitle ref={dialogHeading} tabIndex={-1} className={styles.dialogTitle}>{dialogTitle}</DialogTitle><DialogDescription className={styles.dialogDescription}>{dialogDescription}</DialogDescription></DialogHeader>
        <div className={styles.dialogBody}>
          {view === "history" && <>{!preview && publicFeed.loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>{dpT("releaseUpdates.alle_toevoegingen_laden")}</p></div> : !preview && publicFeed.error ? <div className={styles.formError} role="alert"><p>{publicFeed.error}</p><button className={styles.textButton} type="button" onClick={() => { void publicFeed.reload().catch(() => {}); }}>{dpT("releaseUpdates.opnieuw_laden")}</button></div> : <UpdateList updates={historyUpdates} onOpen={id => openDetail(id, "history")}/>}<div className={styles.dialogFooter}><span className={styles.demoNote}>{dpT("releaseUpdates.alleen_gepubliceerde_toevoegingen")}</span>{allowIdeas && !preview && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>{dpT("releaseUpdates.idee_inbrengen")}</button>}</div></>}
          {view === "detail" && <>{selectedUpdate ? <><div className={styles.detailMeta}><span className={styles.category}>{RELEASE_CATEGORIES[selectedUpdate.category]}</span><time dateTime={dateTimeLabel(selectedUpdate.publishedAt)}>{dateLabel(selectedUpdate.publishedAt)}</time>{selectedUpdate.version && <span className={styles.version}>{selectedUpdate.version}</span>}</div><div className={styles.detailBody}>{selectedUpdate.summary.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></> : <div className={styles.empty}><Clock3 size={25}/><p>{dpT("releaseUpdates.deze_toevoeging_is_niet_meer_gepubliceerd_de_andere")}</p></div>}<div className={styles.dialogFooter}><button className={styles.textButton} type="button" onClick={() => detailBack ? setView(detailBack) : close()}><ArrowLeft size={14}/>{detailBack === "mine" ? dpT("releaseUpdates.terug_naar_mijn_ideeen") : detailBack ? dpT("releaseUpdates.terug_naar_alle_toevoegingen") : dpT("releaseUpdates.terug")}</button><span className={styles.demoNote}>{dpT("releaseUpdates.gepubliceerde_update")}</span></div></>}
          {view === "idea" && !preview && <form id={formId} className={styles.ideaForm} onSubmit={submit} aria-busy={busy}>
            <label htmlFor={`${formId}-title`}><span>{dpT("releaseUpdates.jouw_idee")}<small>{ideaTitle.length}/140</small></span><input ref={ideaInput} id={`${formId}-title`} value={ideaTitle} onChange={event => { setIdeaTitle(event.target.value); setError(""); }} minLength={3} maxLength={140} required autoComplete="off" placeholder={dpT("releaseUpdates.bijvoorbeeld_een_vaste_avond_met_mijn_vrienden")} disabled={busy}/></label>
            <label htmlFor={`${formId}-category`}><span>{dpT("releaseUpdates.waar_gaat_het_over")}</span><select id={`${formId}-category`} value={ideaCategory} onChange={event => setIdeaCategory(event.target.value as ReleaseCategory)} disabled={busy}>{Object.entries(RELEASE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor={`${formId}-description`}><span>{dpT("releaseUpdates.vertel_er_iets_meer_over")}<small>{dpT("releaseUpdates.optioneel")} {ideaDescription.length}/3000</small></span><textarea id={`${formId}-description`} value={ideaDescription} onChange={event => { setIdeaDescription(event.target.value); setError(""); }} maxLength={3000} rows={5} placeholder={dpT("releaseUpdates.wat_mis_je_en_wanneer_zou_dit_handig")} disabled={busy}/></label>
            <div className={styles.privacyNote}><MessageCircle size={16}/><p>{dpT("releaseUpdates.je_idee_gaat_naar_platformbeheer_alleen_jij_ziet")}</p></div>
            {error && <p className={styles.formError} role="alert">{error}</p>}
          </form>}
          {view === "submitted" && receipt && <div className={styles.receipt}><span className={styles.successIcon}><CheckCircle2 size={33}/></span><span className={styles.receiptNumber}>{dpT("releaseUpdates.idee")}{receipt.number}</span><h3>{receipt.title}</h3><p>{dpT("releaseUpdates.je_kunt_de_voortgang_terugvinden_bij_mijn_ideeen")}</p><button className={styles.primaryButton} type="button" onClick={() => setView("mine")}><ListChecks size={16}/>{dpT("releaseUpdates.bekijk_mijn_ideeen")}<ArrowRight size={15}/></button><button className={styles.textButton} type="button" onClick={close}>{dpT("releaseUpdates.terug_naar")} {fullPage ? dpT("releaseUpdates.de_toevoegingen") : dpT("releaseUpdates.de_kamer")}</button></div>}
          {view === "mine" && !preview && <>{own.loading ? <div className={styles.empty} role="status"><Clock3 size={25}/><p>{dpT("releaseUpdates.je_ideeen_worden_geladen")}</p></div> : own.error ? <div className={styles.formError} role="alert"><p>{own.error}</p><button className={styles.textButton} type="button" onClick={() => { void own.reload().catch(() => {}); }}>{dpT("releaseUpdates.opnieuw_laden")}</button></div> : own.ideas.length ? <div className={styles.ownIdeas}>{own.ideas.map(item => { const feedback = item.publication; return <article className={styles.ownIdea} key={item.id}><div className={styles.ownIdeaMeta}><span>{dpT("releaseUpdates.idee")}{item.number} · {dateLabel(item.createdAt)}</span><span className={styles.ideaStatus} data-status={item.status}>{RELEASE_STATUSES[item.status]}</span></div><h3>{item.title}</h3><span className={styles.ownCategory}>{RELEASE_CATEGORIES[item.category]}</span>{item.description && <p className={styles.ownDescription}>{item.description}</p>}{feedback ? <div className={styles.publicFeedback}><span><CheckCircle2 size={14}/>{dpT("releaseUpdates.openbare_terugkoppeling")}</span><p>{feedback.summary}</p><button className={styles.textButton} type="button" onClick={() => openDetail(feedback.id, "mine")}>{dpT("releaseUpdates.lees_de_toevoeging")}<ArrowRight size={13}/></button></div> : <p className={styles.noFeedback}>{dpT("releaseUpdates.nog_geen_openbare_terugkoppeling")}</p>}</article>; })}</div> : <div className={styles.empty}><Lightbulb size={29}/><strong>{dpT("releaseUpdates.jouw_eerste_idee_is_welkom")}</strong><p>{dpT("releaseUpdates.je_hebt_nog_geen_ideeen_ingediend_deel_wat")}</p></div>}<div className={styles.dialogFooter}><span className={styles.demoNote}>{dpT("releaseUpdates.alleen_jouw_eigen_inzendingen")}</span>{allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>{dpT("releaseUpdates.nieuw_idee")}</button>}</div></>}
        </div>
        {view === "idea" && !preview && <div className={styles.formBottom}><span>{profileName ? <>{dpT("releaseUpdates.ingediend_als")} <strong>{profileName}</strong></> : dpT("releaseUpdates.je_profiel_wordt_geladen")}<small>{dpT("releaseUpdates.prive_voor_jou_en_platformbeheer")}</small></span><button form={formId} className={styles.primaryButton} type="submit" disabled={busy || !platform.actor?.id || ideaTitle.trim().length < 3}><Send size={15}/>{busy ? dpT("releaseUpdates.idee_versturen") : dpT("releaseUpdates.verstuur_mijn_idee")}</button></div>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent className={`${styles.dialog} ${styles.discardDialog}`} style={dialogViewport} onCloseAutoFocus={event => {
      event.preventDefault();
      // Let the nested modal release its body pointer lock before closing the
      // parent. Closing both in one render can leave the page non-interactive.
      if (discarding.current) { discarding.current = false; setView(null); }
      else if (view === "idea") ideaInput.current?.focus({ preventScroll: true });
      else if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    }}><AlertDialogHeader className={styles.dialogHeader}><AlertDialogTitle className={styles.dialogTitle}>{dpT("releaseUpdates.je_idee_nog_even_afmaken")}</AlertDialogTitle><AlertDialogDescription className={styles.dialogDescription}>{dpT("releaseUpdates.je_hebt_nog_niet_verstuurd_als_je_nu")}</AlertDialogDescription></AlertDialogHeader><div className={styles.discardActions}><AlertDialogAction className={styles.textButton} onClick={() => { discarding.current = true; clearForm(); setDiscardOpen(false); }}>{dpT("releaseUpdates.invoer_wissen")}</AlertDialogAction><AlertDialogCancel className={styles.primaryButton}>{dpT("releaseUpdates.verder_schrijven")}<ArrowRight size={15}/></AlertDialogCancel></div></AlertDialogContent></AlertDialog>
  </div>;
}

export function ReleaseUpdatesWidget(props: UpdatesProps) {
  return <ReleaseUpdatesSurface {...props}/>;
}

export function ReleaseUpdatesPage() {
 const dpT = useI18n("releaseUpdates").t;

  return <div className={styles.page}>
    <header className={styles.pageHeader}><a className={styles.brand} href="/lobby" aria-label={dpT("releaseUpdates.dartspoint_lobby")}><Brand/></a><a className={styles.backLink} href="/lobby"><ArrowLeft size={15}/>{dpT("releaseUpdates.terug_naar_de_lobby")}</a></header>
    <main className={styles.pageMain}><div className={styles.pageIntro}><span className={styles.eyebrow}><Sparkles size={14}/>{dpT("releaseUpdates.de_club_blijft_in_beweging")}</span><h1>{dpT("releaseUpdates.nieuwe_dingen")}<br/><span>{dpT("releaseUpdates.hetzelfde_clubgevoel")}</span></h1><p>{dpT("releaseUpdates.van_kleine_verbeteringen_tot_iets_helemaal_nieuws_hier")}</p></div><section className={styles.pageCard} aria-label={dpT("releaseUpdates.toevoegingen_en_ideeen")}><ReleaseUpdatesSurface fullPage title={dpT("releaseUpdates.toegevoegd_aan_dartspoint")} description={dpT("releaseUpdates.de_laatste_verbeteringen_met_ruimte_voor_jouw_volgende")}/></section><footer className={styles.pageFooter}><img src="/brand/icon.svg" alt=""/><span>{dpT("releaseUpdates.jouw_kamer_jouw_avond_jouw_ideeen")}</span></footer></main>
  </div>;
}
