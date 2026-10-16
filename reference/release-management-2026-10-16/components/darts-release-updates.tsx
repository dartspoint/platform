"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, Lightbulb, ListChecks, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { publicReleaseUpdates, RELEASE_CATEGORIES, RELEASE_STATUSES, submitReleaseIdea, useReleaseBoard } from "@/lib/darts-releases";
import { readDemoSessionProfile } from "@/lib/darts-session";
import styles from "./darts-release-updates.module.css";

type Category = keyof typeof RELEASE_CATEGORIES;
type PublicUpdate = ReturnType<typeof publicReleaseUpdates>[number];
type View = "history" | "detail" | "idea" | "mine" | "submitted" | null;
type UpdatesProps = { title?: string; description?: string; limit?: number; allowIdeas?: boolean; preview?: boolean };
const DEFAULT_CATEGORY: Category = "community";

function dateLabel(value: number | string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }) : "Datum volgt";
}
function dateTimeLabel(value: number | string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function UpdateList({ updates, onOpen, compact = false }: { updates: PublicUpdate[]; onOpen: (id: string) => void; compact?: boolean }) {
  if (!updates.length) return <div className={styles.empty}><Sparkles size={25}/><strong>De volgende toevoeging begint hier.</strong><p>Zodra er iets nieuws is gepubliceerd, lees je hier wat er is veranderd.</p></div>;
  return <ol className={`${styles.timeline}${compact ? ` ${styles.compact}` : ""}`} aria-label="Gepubliceerde toevoegingen">
    {updates.map((update, index) => <li key={update.id}><button type="button" className={styles.updateButton} onClick={() => onOpen(update.id)} aria-label={`Lees toevoeging: ${update.title}`}>
      <span className={`${styles.timelineMark}${index === 0 ? ` ${styles.latestMark}` : ""}`} aria-hidden="true">{index === 0 ? <Sparkles size={15}/> : <Check size={13}/>}</span>
      <span className={styles.updateCopy}><span className={styles.meta}><time dateTime={dateTimeLabel(update.publishedAt)}>{dateLabel(update.publishedAt)}</time>{update.version && <span className={styles.version}>{update.version}</span>}<span className={styles.category}>{RELEASE_CATEGORIES[update.category]}</span></span><strong>{update.title}</strong><span className={styles.summary}>{update.summary}</span></span>
      <ChevronRight className={styles.rowArrow} size={16}/>
    </button></li>)}
  </ol>;
}

function ReleaseUpdatesSurface({ title = "Een beetje beter. Elke avond.", description = "Dit hebben we aan DartsPoint toegevoegd.", limit = 3, allowIdeas = true, preview = false, fullPage = false }: UpdatesProps & { fullPage?: boolean }) {
  const board = useReleaseBoard();
  const updates = publicReleaseUpdates(board);
  const [profileName, setProfileName] = useState("");
  const [view, setView] = useState<View>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailBack, setDetailBack] = useState<"history" | "mine" | null>(null);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [ideaCategory, setIdeaCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const ideaInput = useRef<HTMLInputElement>(null);
  const dialogHeading = useRef<HTMLHeadingElement>(null);
  const [receipt, setReceipt] = useState<{ number: number | string; title: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState("");
  const formId = useId();
  const selectedUpdate = updates.find(update => update.id === detailId);
  const ownIdeas = profileName ? board.items.filter(item => item.source === "player" && item.authorName === profileName).sort((a, b) => b.createdAt - a.createdAt) : [];
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(5, Math.floor(limit))) : 3;
  const visible = fullPage ? updates : updates.slice(0, count);
  const dirty = Boolean(ideaTitle.trim() || ideaDescription.trim() || ideaCategory !== DEFAULT_CATEGORY);

  useEffect(() => { setProfileName(readDemoSessionProfile()?.username ?? "Nick"); }, []);
  useEffect(() => {
    if (!view) return;
    const frame = window.requestAnimationFrame(() => {
      if (view === "idea") ideaInput.current?.focus({ preventScroll: true });
      else dialogHeading.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);
  useEffect(() => {
    if (view !== "idea" || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view, dirty]);
  useEffect(() => {
    if (!previewNotice) return;
    const timer = window.setTimeout(() => setPreviewNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [previewNotice]);

  function openDetail(id: string, back: "history" | "mine" | null = null) { setDetailId(id); setDetailBack(back); setView("detail"); }
  function clearForm() { setIdeaTitle(""); setIdeaDescription(""); setIdeaCategory(DEFAULT_CATEGORY); setError(""); }
  function openIdea() {
    if (preview) { setPreviewNotice("In het voorbeeld kun je toevoegingen lezen. Ideeën indienen kan vanuit de lobby."); return; }
    setError(""); setView("idea");
  }
  function close() {
    if (busy) return;
    if (view === "idea" && dirty) { setDiscardOpen(true); return; }
    setView(null);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || submitting.current || !profileName) return;
    setError(""); submitting.current = true; setBusy(true);
    try {
      const item = submitReleaseIdea({ title: ideaTitle.trim(), description: ideaDescription.trim(), category: ideaCategory, authorName: profileName });
      setReceipt({ number: item.number, title: item.title });
      clearForm(); setView("submitted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Je idee kon niet worden opgeslagen. Je tekst staat er nog; probeer het opnieuw.");
    } finally { submitting.current = false; setBusy(false); }
  }
  const dialogTitle = view === "history" ? "Alle toevoegingen" : view === "detail" ? selectedUpdate?.title ?? "Toevoeging niet beschikbaar" : view === "mine" ? "Mijn ideeën" : view === "submitted" ? "Bedankt voor het meedenken." : "Wat zou jouw avond beter maken?";
  const dialogDescription = view === "history" ? "De gepubliceerde verbeteringen aan DartsPoint, van nieuw naar eerder." : view === "detail" ? "Een gepubliceerde toevoeging aan DartsPoint." : view === "mine" ? "Je eigen inzendingen, hun huidige status en eventuele openbare terugkoppeling." : view === "submitted" ? "Je idee is ontvangen en staat bij jouw ideeën." : "Een handige functie, een kleine verbetering of iets dat je mist. We horen het graag.";

  return <div className={`${styles.widget}${fullPage ? ` ${styles.full}` : ""}`}>
    <div className={styles.widgetTop}><span className={styles.eyebrow}><Sparkles size={14}/>NIEUW IN DARTSPOINT</span><span className={styles.demo}>DEMO</span></div>
    <div className={styles.headingRow}><h2 className={styles.heading}>{title}</h2><span className={styles.count} aria-label={`${updates.length} gepubliceerde toevoegingen`}>{updates.length.toString().padStart(2, "0")}</span></div>
    <p className={styles.intro}>{description}</p>
    <UpdateList updates={visible} compact={!fullPage} onOpen={id => openDetail(id)}/>
    <div className={styles.widgetActions}>
      {!fullPage && <button className={styles.textButton} type="button" onClick={() => setView("history")}>Alle toevoegingen<ArrowRight size={14}/></button>}
      {allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>Idee inbrengen</button>}
      {allowIdeas && !preview && <button className={styles.ownButton} type="button" onClick={() => setView("mine")}>Mijn ideeën{ownIdeas.length > 0 && <span>{ownIdeas.length}</span>}</button>}
    </div>
    {previewNotice && <p className={styles.previewNotice} role="status">{previewNotice}</p>}

    <Dialog open={view !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className={`${styles.dialog}${view === "history" || view === "mine" ? ` ${styles.wideDialog}` : ""}`} showCloseButton={false} onEscapeKeyDown={event => { if (discardOpen) event.preventDefault(); }}>
        <button className={styles.closeButton} type="button" onClick={close} aria-label="Venster sluiten" disabled={busy}><X size={20}/></button>
        <DialogHeader className={styles.dialogHeader}><span className={styles.eyebrow}>{view === "idea" || view === "mine" || view === "submitted" ? <Lightbulb size={14}/> : <Sparkles size={14}/>}<span>{view === "idea" || view === "mine" || view === "submitted" ? "SAMEN MAKEN WE DARTSPOINT" : "NIEUW IN DARTSPOINT"}</span></span><DialogTitle ref={dialogHeading} tabIndex={-1} className={styles.dialogTitle}>{dialogTitle}</DialogTitle><DialogDescription className={styles.dialogDescription}>{dialogDescription}</DialogDescription></DialogHeader>
        {view === "history" && <><UpdateList updates={updates} onOpen={id => openDetail(id, "history")}/><div className={styles.dialogFooter}><span className={styles.demoNote}>Prototype · voorbeeldpublicaties</span>{allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>Idee inbrengen</button>}</div>{previewNotice && <p className={styles.previewNotice} role="status">{previewNotice}</p>}</>}
        {view === "detail" && <>{selectedUpdate ? <><div className={styles.detailMeta}><span className={styles.category}>{RELEASE_CATEGORIES[selectedUpdate.category]}</span><time>{dateLabel(selectedUpdate.publishedAt)}</time>{selectedUpdate.version && <span className={styles.version}>{selectedUpdate.version}</span>}</div><div className={styles.detailBody}>{selectedUpdate.summary.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></> : <div className={styles.empty}><Clock3 size={25}/><p>Deze toevoeging is niet meer gepubliceerd. De andere toevoegingen vind je in het overzicht.</p></div>}<div className={styles.dialogFooter}><button className={styles.textButton} type="button" onClick={() => detailBack ? setView(detailBack) : close()}><ArrowLeft size={14}/>{detailBack === "mine" ? "Terug naar mijn ideeën" : detailBack ? "Terug naar alle toevoegingen" : "Terug"}</button><span className={styles.demoNote}>Gepubliceerde update · demo</span></div></>}
        {view === "idea" && <form className={styles.ideaForm} onSubmit={submit}>
          <label htmlFor={`${formId}-title`}><span>Jouw idee<small>{ideaTitle.length}/140</small></span><input ref={ideaInput} id={`${formId}-title`} value={ideaTitle} onChange={event => { setIdeaTitle(event.target.value); setError(""); }} minLength={3} maxLength={140} required autoComplete="off" placeholder="Bijvoorbeeld: een vaste avond met mijn vrienden" disabled={busy}/></label>
          <label htmlFor={`${formId}-category`}><span>Waar gaat het over?</span><select id={`${formId}-category`} value={ideaCategory} onChange={event => setIdeaCategory(event.target.value as Category)} disabled={busy}>{Object.entries(RELEASE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label htmlFor={`${formId}-description`}><span>Vertel er iets meer over<small>Optioneel · {ideaDescription.length}/3000</small></span><textarea id={`${formId}-description`} value={ideaDescription} onChange={event => { setIdeaDescription(event.target.value); setError(""); }} maxLength={3000} rows={5} placeholder="Wat mis je, en wanneer zou dit handig zijn?" disabled={busy}/></label>
          <div className={styles.privacyNote}><MessageCircle size={16}/><p>Je idee gaat naar platformbeheer. Alleen jij ziet je inzending bij Mijn ideeën. Als er iets wordt toegevoegd, kan het team daar een openbare update over plaatsen.</p></div>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <div className={styles.formBottom}><span>{profileName ? <>Ingediend als <strong>{profileName}</strong></> : "Je profiel wordt geladen…"}<small>Demo · alleen op dit apparaat</small></span><button className={styles.primaryButton} type="submit" disabled={busy || !profileName || ideaTitle.trim().length < 3}><Send size={15}/>{busy ? "Idee versturen…" : "Verstuur mijn idee"}</button></div>
        </form>}
        {view === "submitted" && receipt && <div className={styles.receipt}><span className={styles.successIcon}><CheckCircle2 size={33}/></span><span className={styles.receiptNumber}>IDEE #{receipt.number}</span><h3>{receipt.title}</h3><p>Je kunt de voortgang terugvinden bij Mijn ideeën. We nemen ieder idee mee; indienen is nog geen toezegging dat het wordt gebouwd.</p><button className={styles.primaryButton} type="button" onClick={() => setView("mine")}><ListChecks size={16}/>Bekijk mijn ideeën<ArrowRight size={15}/></button><button className={styles.textButton} type="button" onClick={close}>Terug naar {fullPage ? "de toevoegingen" : "de kamer"}</button><span className={styles.demoNote}>Dit is een lokale demo-inzending.</span></div>}
        {view === "mine" && <>{!profileName ? <div className={styles.empty}><Clock3 size={25}/><p>Je ideeën worden geladen…</p></div> : ownIdeas.length ? <div className={styles.ownIdeas}>{ownIdeas.map(item => { const feedback = updates.find(update => update.id === item.id); return <article className={styles.ownIdea} key={item.id}><div className={styles.ownIdeaMeta}><span>IDEE #{item.number} · {dateLabel(item.createdAt)}</span><span className={styles.ideaStatus} data-status={item.status}>{RELEASE_STATUSES[item.status]}</span></div><h3>{item.title}</h3><span className={styles.ownCategory}>{RELEASE_CATEGORIES[item.category]}</span>{item.description && <p className={styles.ownDescription}>{item.description}</p>}{feedback ? <div className={styles.publicFeedback}><span><CheckCircle2 size={14}/>Openbare terugkoppeling</span><p>{feedback.summary}</p><button className={styles.textButton} type="button" onClick={() => openDetail(feedback.id, "mine")}>Lees de toevoeging<ArrowRight size={13}/></button></div> : <p className={styles.noFeedback}>Nog geen openbare terugkoppeling.</p>}</article>; })}</div> : <div className={styles.empty}><Lightbulb size={29}/><strong>Jouw eerste idee is welkom.</strong><p>Je hebt op dit apparaat nog geen ideeën ingediend als {profileName}.</p></div>}<div className={styles.dialogFooter}><span className={styles.demoNote}>Alleen jouw lokale inzendingen</span>{allowIdeas && <button className={styles.ideaButton} type="button" onClick={openIdea}><Lightbulb size={15}/>Nieuw idee</button>}</div></>}
      </DialogContent>
    </Dialog>

    <Dialog open={discardOpen} onOpenChange={setDiscardOpen}><DialogContent className={`${styles.dialog} ${styles.discardDialog}`} showCloseButton={false}><DialogHeader className={styles.dialogHeader}><DialogTitle className={styles.dialogTitle}>Je idee nog even afmaken?</DialogTitle><DialogDescription className={styles.dialogDescription}>Je hebt nog niet verstuurd. Als je nu sluit, wordt je invoer gewist.</DialogDescription></DialogHeader><div className={styles.discardActions}><button className={styles.textButton} type="button" onClick={() => { clearForm(); setDiscardOpen(false); setView(null); }}>Sluiten en wissen</button><button className={styles.primaryButton} type="button" onClick={() => setDiscardOpen(false)}>Verder schrijven<ArrowRight size={15}/></button></div></DialogContent></Dialog>
  </div>;
}

export function ReleaseUpdatesWidget(props: UpdatesProps) {
  return <ReleaseUpdatesSurface {...props}/>;
}

export function ReleaseUpdatesPage() {
  return <div className={styles.page}>
    <header className={styles.pageHeader}><a className={styles.brand} href="/demo" aria-label="DartsPoint lobby"><Brand/></a><a className={styles.backLink} href="/demo"><ArrowLeft size={15}/>Terug naar de lobby</a></header>
    <main className={styles.pageMain}><div className={styles.pageIntro}><span className={styles.eyebrow}><Sparkles size={14}/>DE CLUB BLIJFT IN BEWEGING</span><h1>Nieuwe dingen.<br/><span>Hetzelfde clubgevoel.</span></h1><p>Van kleine verbeteringen tot iets helemaal nieuws. Hier lees je wat er aan DartsPoint is toegevoegd.</p></div><section className={styles.pageCard} aria-label="Toevoegingen en ideeën"><ReleaseUpdatesSurface fullPage title="Toegevoegd aan DartsPoint" description="De laatste verbeteringen, met ruimte voor jouw volgende idee."/></section><footer className={styles.pageFooter}><img src="/brand/icon.svg" alt=""/><span>Jouw kamer. Jouw avond. Jouw ideeën.</span><small>Interactief prototype</small></footer></main>
  </div>;
}
