"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, Check, CheckCheck, CircleAlert, Clock3, Eye, EyeOff, GripVertical, History, LayoutGrid, Lightbulb, MessageSquare, Plus, Search, Send, Sparkles, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { usePlatform } from "@/lib/platform-client";
import {
  RELEASE_CATEGORIES, RELEASE_PRIORITIES, RELEASE_STATUSES,
  createReleaseItem, moveReleaseItem, publishReleaseItem,
  saveReleaseItem, unpublishReleaseItem, useReleaseBoard, isReleaseVersionConflict, type ReleaseItem,
} from "@/lib/darts-releases";
import styles from "./darts-releases.module.css";

type Status = ReleaseItem["status"];
type Category = ReleaseItem["category"];
type Priority = ReleaseItem["priority"];
type Draft = Pick<ReleaseItem, "title" | "description" | "category" | "priority" | "status" | "version" | "releaseTitle" | "releaseSummary" | "notes">;
type Editor = { item: ReleaseItem | null; draft: Draft; original: string };
type Confirmation =
  | { kind: "discard" }
  | { kind: "reload" }
  | { kind: "save-withdraw" }
  | { kind: "publish" | "unpublish"; item: ReleaseItem }
  | { kind: "move-withdraw"; item: ReleaseItem; status: Status };

const statuses: Status[] = ["ideas", "considering", "doing", "added"];
const columnCopy: Record<Status, string> = {
  ideas: "Een goed begin komt van iedereen.",
  considering: "Samen kiezen wat het verschil maakt.",
  doing: "Hier wordt aan gewerkt.",
  added: "Klaar. Deel het wanneer jij wilt.",
};
const statusIcons = { ideas: Lightbulb, considering: MessageSquare, doing: Clock3, added: CheckCheck };
const freshDraft = (): Draft => ({ title: "", description: "", category: "other", priority: "normal", status: "ideas", version: "", releaseTitle: "", releaseSummary: "", notes: "" });
const draftFrom = (item: ReleaseItem): Draft => ({ title: item.title, description: item.description, category: item.category, priority: item.priority, status: item.status, version: item.version, releaseTitle: item.releaseTitle, releaseSummary: item.releaseSummary, notes: item.notes });
const signature = (value: Draft) => JSON.stringify(value);
const sourceLabel = (item: ReleaseItem) => item.source === "player" ? "Speleridee" : "Teamidee";
const dateLabel = (value: number) => new Date(value).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Dat lukte niet. Probeer het nog eens.";
const copyItem = (item: ReleaseItem): ReleaseItem => JSON.parse(JSON.stringify(item));

function ReleasePreview({ title, summary, version, category }: { title: string; summary: string; version: string; category: Category }) {
  return <div className={styles.publicPreview}>
    <span className={styles.previewLabel}><Sparkles size={14} aria-hidden="true"/>NIEUW OP DARTSPOINT</span>
    <h3 className={styles.previewTitle}>{title || "De titel van je update"}</h3>
    <p className={styles.previewSummary}>{summary || "Een korte uitleg voor spelers: wat is er nieuw en wat hebben zij eraan?"}</p>
    <div className={styles.previewFooter}><span>{RELEASE_CATEGORIES[category]}</span>{version && <span>{version}</span>}</div>
  </div>;
}

type Props = { onConfigureWidget?: () => void; onRegisterNavigationGuard?: (guard: (() => Promise<boolean>) | null) => void };
export function AdminReleases(props: Props) {
  const platform = usePlatform();
  if (!["owner", "admin"].includes(platform.actor?.role)) return <section className={styles.empty}><strong>Releasebeheer is voor Platformbeheer.</strong><p>Je huidige rol heeft geen toegang tot ideeën en interne notities.</p></section>;
  return <ReleaseBoard {...props}/>;
}
function ReleaseBoard({ onConfigureWidget, onRegisterNavigationGuard }: Props) {
  const board = useReleaseBoard();
  const formId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [mobileStatus, setMobileStatus] = useState<Status>("ideas");
  const [dragged, setDragged] = useState<{ item: ReleaseItem; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogViewport, setDialogViewport] = useState<CSSProperties>({});
  const flight = useRef(false);
  const requests = useRef(new Map<string, string>());
  const pendingNavigation = useRef<((allow: boolean) => void) | null>(null);
  const statusInputs = useRef(new Map<string, HTMLSelectElement>());
  const statusReturn = useRef<{ id: string; status: Status } | null>(null);
  const dialogReturn = useRef<HTMLButtonElement | null>(null);
  const confirmationReturn = useRef<HTMLElement | null>(null);
  const confirmationCancel = useRef<HTMLButtonElement | null>(null);
  const discarding = useRef(false);
  const titleInput = useRef<HTMLInputElement | null>(null);
  const newButton = useRef<HTMLButtonElement | null>(null);
  const dirty = Boolean(editor && signature(editor.draft) !== editor.original);
  const currentItem = editor?.item ? board.items.find(item => item.id === editor.item!.id) : null;
  const stale = Boolean(editor?.item && (!currentItem || currentItem.revision > editor.item.revision));
  const normalizedQuery = query.trim().toLocaleLowerCase("nl-NL");
  const filtered = board.items.filter(item => (category === "all" || item.category === category) && (!normalizedQuery || [item.title, item.description, item.number, item.authorName, item.version].join(" ").toLocaleLowerCase("nl-NL").includes(normalizedQuery)));
  const hasFilters = Boolean(query.trim() || category !== "all");
  const publishedCount = board.items.filter(item => item.publication).length;

  useEffect(() => {
    if (!editor && !confirmation) return;
    const viewport = window.visualViewport;
    const update = () => {
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const height = (viewport?.height ?? window.innerHeight) / zoom;
      setDialogViewport({ "--release-viewport-height": `${height}px`, "--release-viewport-center": `${(viewport?.offsetTop ?? 0) / zoom + height / 2}px` } as CSSProperties);
    };
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [Boolean(editor || confirmation)]);

  useEffect(() => {
    const target = statusReturn.current;
    if (busy || !target || board.items.find(item => item.id === target.id)?.status !== target.status) return;
    const input = statusInputs.current.get(target.id);
    if (input?.getClientRects().length) { input.focus({ preventScroll: true }); statusReturn.current = null; }
  }, [board.items, busy, mobileStatus]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    onRegisterNavigationGuard?.(async () => {
      if (flight.current) return false;
      if (!dirty) return true;
      ask({ kind: "discard" });
      return await new Promise<boolean>(resolve => { pendingNavigation.current = resolve; });
    });
    return () => onRegisterNavigationGuard?.(null);
  }, [dirty, onRegisterNavigationGuard]);
  useEffect(() => () => { pendingNavigation.current?.(false); pendingNavigation.current = null; }, []);

  function requestId(value: unknown) {
    const key = JSON.stringify(value);
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    return requests.current.get(key)!;
  }
  function begin() { if (flight.current) return false; flight.current = true; setBusy(true); return true; }
  function end() { flight.current = false; setBusy(false); }
  function cancelConfirmation() {
    if (flight.current) return;
    setConfirmation(null); setConfirmationError("");
    pendingNavigation.current?.(false); pendingNavigation.current = null;
    const target = statusReturn.current; statusReturn.current = null;
    if (target) requestAnimationFrame(() => statusInputs.current.get(target.id)?.focus({ preventScroll: true }));
  }

  function openItem(item: ReleaseItem, trigger: HTMLButtonElement) {
    if (flight.current) return;
    dialogReturn.current = trigger;
    const snapshot = copyItem(item), draft = draftFrom(snapshot);
    setEditor({ item: snapshot, draft, original: signature(draft) });
    setEditorError(""); setEditorMessage("");
  }
  function openNew() {
    if (flight.current) return;
    requests.current.clear();
    dialogReturn.current = newButton.current;
    const draft = freshDraft();
    setEditor({ item: null, draft, original: signature(draft) });
    setEditorError(""); setEditorMessage("");
  }
  function patch(patchValue: Partial<Draft>) {
    setEditor(previous => previous ? { ...previous, draft: { ...previous.draft, ...patchValue } } : previous);
    setEditorError(""); setEditorMessage("");
  }
  function ask(value: Confirmation) { confirmationReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setConfirmation(value); setConfirmationError(""); }
  function restoreConfirmationFocus() {
    const trigger = confirmationReturn.current;
    if (trigger?.isConnected && !trigger.matches(":disabled")) trigger.focus({ preventScroll: true });
    else if (titleInput.current?.isConnected) titleInput.current.focus({ preventScroll: true });
    else if (dialogReturn.current?.isConnected) dialogReturn.current.focus({ preventScroll: true });
    else newButton.current?.focus({ preventScroll: true });
  }
  function closeEditor() {
    setEditor(null); setEditorError(""); setEditorMessage("");
  }
  function requestClose() { if (flight.current || confirmation) return; if (dirty) ask({ kind: "discard" }); else closeEditor(); }
  function acceptSaved(item: ReleaseItem) {
    const snapshot = copyItem(item), draft = draftFrom(snapshot);
    setEditor({ item: snapshot, draft, original: signature(draft) });
    setEditorError("");
  }
  async function save(confirmWithdraw = false): Promise<boolean> {
    if (!editor) return false;
    if (stale) { const message = "Deze kaart is inmiddels gewijzigd. Laad de nieuwste versie voordat je opslaat. Jouw tekst blijft hier staan."; setEditorError(message); if (confirmWithdraw) setConfirmationError(message); return false; }
    if (!begin()) return false;
    try {
      if (!editor.item) {
        const input = { title: editor.draft.title, description: editor.draft.description, category: editor.draft.category, priority: editor.draft.priority };
        const item = await createReleaseItem(input, requestId(["create", input]));
        setNotice({ text: `Idee #${item.number} toegevoegd aan Ideeën.` });
        setMobileStatus("ideas"); closeEditor();
      } else {
        const item = await saveReleaseItem(editor.item.id, editor.draft, editor.item.revision, { confirmWithdraw, requestId: requestId(["save", editor.item.id, editor.item.revision, editor.draft, confirmWithdraw]) });
        acceptSaved(item);
        setEditorMessage(item.publication ? "Opgeslagen. De huidige lobbypublicatie blijft staan totdat je de update opnieuw publiceert." : "Opgeslagen. Deze kaart is nog niet gepubliceerd in de lobby.");
        setNotice({ text: `Kaart #${item.number} opgeslagen.` });
      }
      return true;
    } catch (error) {
      const message = isReleaseVersionConflict(error) ? "Deze kaart is inmiddels gewijzigd. Jouw formulier is bewaard. Laad de nieuwste versie voordat je opslaat." : `${errorText(error)} Je invoer is bewaard.`;
      setEditorError(message); if (confirmWithdraw) setConfirmationError(message);
      if (isReleaseVersionConflict(error)) void board.reload().catch(() => {});
      return false;
    } finally { end(); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (editor?.item?.publication && editor.draft.status !== "added") { ask({ kind: "save-withdraw" }); return; }
    void save();
  }
  async function executeMove(item: ReleaseItem, status: Status): Promise<boolean> {
    if (!begin()) return false;
    try {
      const updated = await moveReleaseItem(item.id, status, item.revision, false, requestId(["move", item.id, status, item.revision, false]));
      setNotice({ text: `#${updated.number} staat nu bij ${RELEASE_STATUSES[status]}.${item.publication && status !== "added" ? " De lobbypublicatie is ingetrokken." : status === "added" && !updated.publication ? " Nog niet gepubliceerd in de lobby." : ""}` });
      setMobileStatus(status);
      return true;
    } catch (error) { statusReturn.current = null; setNotice({ text: errorText(error), error: true }); if (isReleaseVersionConflict(error)) void board.reload().catch(() => {}); return false; }
    finally { end(); }
  }
  function requestMove(item: ReleaseItem, status: Status) {
    if (flight.current || status === item.status) return;
    if (item.publication && status !== "added") ask({ kind: "move-withdraw", item: copyItem(item), status });
    else void executeMove(item, status);
  }
  function requestPublish() {
    if (flight.current || !editor?.item) return;
    if (dirty) { setEditorError("Sla eerst je wijzigingen op. Daarna kun je de opgeslagen openbare tekst controleren en publiceren."); return; }
    if (stale) { setEditorError("Er is een nieuwere versie van deze kaart. Laad die eerst."); return; }
    if (editor.draft.releaseTitle.trim().length < 3 || editor.draft.releaseSummary.trim().length < 20) {
      setEditorError("Vul een openbare titel van minstens 3 tekens en een samenvatting van minstens 20 tekens in. Sla die daarna op."); return;
    }
    ask({ kind: "publish", item: copyItem(editor.item) });
  }
  async function confirmAction() {
    if (flight.current || !confirmation) return;
    if (confirmation.kind === "discard") {
      // Close the child layer first. Its cleanup must restore the parent's
      // pointer lock before closing the editor or navigating away.
      discarding.current = true; setConfirmation(null); return;
    }
    if (confirmation.kind === "reload") {
      if (!begin()) return;
      try {
        const latestBoard = await board.reload();
        const latest = latestBoard.items.find(item => item.id === editor?.item?.id);
        if (!latest) { setConfirmationError("Deze kaart is niet meer beschikbaar. Bewaar je tekst voordat je het venster sluit."); return; }
        acceptSaved(latest); setEditorMessage("De nieuwste versie is geladen."); setConfirmation(null);
      } catch (error) { setConfirmationError(errorText(error)); } finally { end(); }
      return;
    }
    if (confirmation.kind === "save-withdraw") {
      if (await save(true)) setConfirmation(null);
      return;
    }
    if (!begin()) return;
    if (confirmation.kind === "move-withdraw") {
      try {
        const next = await moveReleaseItem(confirmation.item.id, confirmation.status, confirmation.item.revision, true, requestId(["move", confirmation.item.id, confirmation.status, confirmation.item.revision, true]));
        setMobileStatus(next.status); setNotice({ text: `#${next.number} verplaatst naar ${RELEASE_STATUSES[next.status]}. De lobbypublicatie is ingetrokken.` });
        setConfirmation(null);
      } catch (error) { setConfirmationError(errorText(error)); if (isReleaseVersionConflict(error)) void board.reload().catch(() => {}); }
      finally { end(); }
      return;
    }
    try {
      const next = confirmation.kind === "publish"
        ? await publishReleaseItem(confirmation.item.id, confirmation.item.revision, requestId(["publish", confirmation.item.id, confirmation.item.revision]))
        : await unpublishReleaseItem(confirmation.item.id, confirmation.item.revision, requestId(["unpublish", confirmation.item.id, confirmation.item.revision]));
      if (editor?.item?.id === next.id) acceptSaved(next);
      const text = confirmation.kind === "publish" ? "De openbare update is gepubliceerd. De releasewidget toont deze in de kamers waar die widget actief is." : "De lobbypublicatie is ingetrokken. De kaart blijft in beheer bewaard.";
      setEditorMessage(text); setNotice({ text }); setConfirmation(null);
    } catch (error) { setConfirmationError(errorText(error)); if (isReleaseVersionConflict(error)) void board.reload().catch(() => {}); }
    finally { end(); }
  }

  const confirmationTitle = !confirmation ? "" : confirmation.kind === "publish" ? "Deze update publiceren?"
    : confirmation.kind === "unpublish" ? "Publicatie intrekken?"
    : confirmation.kind === "discard" ? "Je wijzigingen laten vervallen?"
    : confirmation.kind === "reload" ? "Nieuwste versie laden?"
    : "Verplaatsen en publicatie intrekken?";
  const confirmationDescription = !confirmation ? "" : confirmation.kind === "publish"
    ? "Hieronder staat de openbare momentopname: titel, samenvatting, categorie en optionele versie. De publicatiedatum wordt toegevoegd. Interne notities en de oorspronkelijke inzending komen niet in de lobby."
    : confirmation.kind === "unpublish"
    ? "Deze update verdwijnt uit de releasewidget. De kaart blijft bij Toegevoegd staan en kan later opnieuw worden gepubliceerd."
    : confirmation.kind === "discard"
    ? "Je laatste wijzigingen zijn nog niet opgeslagen. Je kunt verder bewerken of dit venster sluiten zonder die wijzigingen."
    : confirmation.kind === "reload"
    ? "De nieuwste opgeslagen kaart vervangt je huidige formulier. Niet-opgeslagen wijzigingen in dit formulier vervallen."
    : "Een openbare update hoort bij een toegevoegde verbetering. Door deze kaart terug te verplaatsen wordt de huidige lobbypublicatie ook ingetrokken. Later publiceren blijft een aparte keuze.";
  const confirmationButton = confirmation?.kind === "publish" ? "Publiceren in lobby" : confirmation?.kind === "unpublish" ? "Publicatie intrekken" : confirmation?.kind === "discard" ? "Wijzigingen laten vervallen" : confirmation?.kind === "reload" ? "Nieuwste versie laden" : "Verplaatsen en intrekken";
  const publicChanged = Boolean(editor?.item?.publication && (
    editor.item.publication.title !== editor.item.releaseTitle ||
    editor.item.publication.summary !== editor.item.releaseSummary ||
    editor.item.publication.version !== editor.item.version ||
    (editor.item.publication.category ?? editor.item.category) !== editor.item.category
  ));

  return <div className={styles.page} aria-busy={busy || board.loading}>
    <section className={styles.intro}>
      <div className={styles.introText}><span className={styles.eyebrow}>SAMEN MAKEN WE DARTSPOINT BETER</span><h2>Van goed idee naar mooie update.</h2><p>Verzamel ideeën, houd de voortgang bij en vertel spelers wat er is toegevoegd. Jij kiest wat in de lobby verschijnt.</p></div>
      <div className={styles.introActions}><button ref={newButton} type="button" disabled={busy || board.loading} className={`${styles.button} ${styles.primary}`} onClick={openNew}><Plus size={16} aria-hidden="true"/>Nieuw idee</button>{onConfigureWidget && <button type="button" disabled={busy} className={`${styles.button} ${styles.quiet}`} onClick={onConfigureWidget}><LayoutGrid size={15} aria-hidden="true"/>Lobbywidget inrichten<ArrowRight size={14} aria-hidden="true"/></button>}</div>
    </section>
    {board.loading && <div className={styles.notice} role="status">Releasebord laden…</div>}
    {board.error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert"><CircleAlert size={17} aria-hidden="true"/><span>{board.error}</span><button type="button" disabled={busy} className={`${styles.button} ${styles.retry}`} onClick={() => { void board.reload().catch(() => {}); }}>Opnieuw laden</button></div>}
    <div className={styles.metrics} aria-label="Overzicht van het releasebord">
      <span className={styles.metric}><Lightbulb size={16} aria-hidden="true"/><strong>{board.items.length}</strong> ideeën & verbeteringen</span>
      <span className={styles.metric}><Users size={16} aria-hidden="true"/><strong>{board.items.filter(item => item.source === "player").length}</strong> van spelers</span>
      <span className={styles.metric}><Eye size={16} aria-hidden="true"/><strong>{publishedCount}</strong> lobbypublicaties</span>
    </div>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17} aria-hidden="true"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek op titel, nummer of inzender" aria-label="Zoek ideeën en verbeteringen"/>{query && <button type="button" aria-label="Zoekopdracht wissen" onClick={() => setQuery("")}><X size={15}/></button>}</label>
      <label className={styles.filter}><span>Categorie</span><select value={category} onChange={event => setCategory(event.target.value as Category | "all")}><option value="all">Alle categorieën</option>{Object.entries(RELEASE_CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {hasFilters && <button className={styles.clear} type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Filters wissen</button>}
    </div>
    <div className={styles.boardHint}><span>{hasFilters ? `${filtered.length} van ${board.items.length} kaarten` : "Sleep een kaart of kies de status op de kaart."}</span><span>Toegevoegd is pas openbaar na publiceren.</span></div>
    <div className={styles.mobileTabs} role="group" aria-label="Kies een kolom">{statuses.map(status => <button type="button" key={status} className={mobileStatus === status ? styles.mobileTabActive : undefined} aria-pressed={mobileStatus === status} onClick={() => setMobileStatus(status)}>{RELEASE_STATUSES[status]}<span>{filtered.filter(item => item.status === status).length}</span></button>)}</div>
    {notice && <div className={`${styles.notice} ${notice.error ? styles.noticeError : ""}`} role={notice.error ? "alert" : "status"}>{notice.error ? <CircleAlert size={17} aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}<span>{notice.text}</span><button type="button" aria-label="Melding sluiten" onClick={() => setNotice(null)}><X size={15}/></button></div>}
    <div className={styles.board} data-any-dragging={Boolean(dragged)}>
      {statuses.map(status => {
        const cards = filtered.filter(item => item.status === status), Icon = statusIcons[status];
        return <section key={status} className={`${styles.column} ${mobileStatus === status ? styles.columnActive : ""} ${dropTarget === status ? styles.columnDrop : ""}`} data-status={status} aria-labelledby={`${formId}-column-${status}`}
          onDragOver={event => { if (busy || !dragged) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(status); }}
          onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
          onDrop={event => { event.preventDefault(); if (dragged && event.dataTransfer.getData("application/x-dartspoint-release") === dragged.id) requestMove(dragged.item, status); setDragged(null); setDropTarget(null); }}>
          <header className={styles.columnHeader}><div className={styles.columnTitle}><span className={styles.columnDot}/><h3 id={`${formId}-column-${status}`}>{RELEASE_STATUSES[status]}</h3><span className={styles.columnCount}>{cards.length}</span></div><p className={styles.columnDescription}>{columnCopy[status]}</p></header>
          <div className={styles.columnCards}>{cards.map(item => <article className={styles.card} key={item.id} draggable={!busy} data-dragging={dragged?.id === item.id}
            onDragStart={event => { if (busy || (event.target as HTMLElement).closest("select")) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-dartspoint-release", item.id); setDragged({ item: copyItem(item), id: item.id }); }}
            onDragEnd={() => { setDragged(null); setDropTarget(null); }}>
            <div className={styles.cardTop}><span className={styles.number}>#{item.number}</span><span className={styles.source}>{item.source === "player" ? <Users size={11} aria-hidden="true"/> : <Sparkles size={11} aria-hidden="true"/>}{sourceLabel(item)}</span><GripVertical size={15} className={styles.dragHandle} aria-hidden="true"/></div>
            <button type="button" disabled={busy} className={styles.cardButton} onClick={event => openItem(item, event.currentTarget)} aria-label={`Open #${item.number}: ${item.title}`}><h4 className={styles.cardTitle}>{item.title}</h4>{item.description && <p className={styles.cardDescription}>{item.description}</p>}</button>
            <div className={styles.cardMeta}><span className={styles.category}>{RELEASE_CATEGORIES[item.category]}</span><span className={`${styles.priority} ${item.priority === "high" ? styles.priorityHigh : item.priority === "low" ? styles.priorityLow : ""}`}>{RELEASE_PRIORITIES[item.priority]}</span>{item.version && <span className={styles.version}>{item.version}</span>}</div>
            {item.status === "added" && <span className={item.publication ? styles.publication : styles.publicationPrivate}>{item.publication ? <Eye size={12} aria-hidden="true"/> : <EyeOff size={12} aria-hidden="true"/>}{item.publication ? "In de lobby gepubliceerd" : "Nog niet in lobby"}</span>}
            <div className={styles.cardFooter}><span title={item.authorName}>{item.authorName}</span><select ref={node => { if (node) statusInputs.current.set(item.id, node); else statusInputs.current.delete(item.id); }} disabled={busy} aria-label={`Status van #${item.number}: ${item.title}`} value={item.status} onChange={event => { statusReturn.current = { id: item.id, status: event.target.value as Status }; requestMove(item, event.target.value as Status); }}>{statuses.map(value => <option key={value} value={value}>{RELEASE_STATUSES[value]}</option>)}</select></div>
          </article>)}
          {!cards.length && <div className={styles.empty}><Icon size={24} className={styles.emptyIcon} aria-hidden="true"/><strong>{hasFilters ? "Geen passende kaarten" : "Nog even rustig hier"}</strong><p>{hasFilters ? "Pas je zoekopdracht of categorie aan." : status === "ideas" ? "Voeg het eerste idee toe om te beginnen." : `Kies ‘${RELEASE_STATUSES[status]}’ op een kaart om deze hier te zetten.`}</p>{!hasFilters && status === "ideas" && <button type="button" className={styles.clear} onClick={openNew}>Nieuw idee<Plus size={13} aria-hidden="true"/></button>}</div>}
          </div>
        </section>;
      })}
    </div>

    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open) requestClose(); }}>
      <DialogContent className={`${styles.dialog} ${styles.editorDialog}`} style={dialogViewport} aria-busy={busy}
        onInteractOutside={event => { const target = event.detail.originalEvent.target; if (confirmation || busy || (target instanceof Element && target.closest('[role="alertdialog"]'))) event.preventDefault(); }}
        onEscapeKeyDown={event => { if (busy || confirmation) event.preventDefault(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (dialogReturn.current?.isConnected) dialogReturn.current.focus(); else newButton.current?.focus(); }}>
        {editor && <>
          <div className={styles.editorBody}>
          <DialogHeader className={styles.dialogHeading}><span className={styles.dialogEyebrow}>{editor.item ? `KAART #${editor.item.number} · ${sourceLabel(editor.item).toUpperCase()}` : "EEN NIEUW IDEE"}</span><DialogTitle>{editor.item ? "Idee & voortgang" : "Wat kan er beter?"}</DialogTitle><DialogDescription>{editor.item ? "Houd het idee en de voortgang bij. De tekst voor spelers stel je apart in." : "Geef het idee een herkenbare naam en beschrijf wat het voor spelers oplevert."}</DialogDescription></DialogHeader>
          {editor.item && <div className={styles.dialogMeta}><span>Ingezonden door <strong>{editor.item.authorName}</strong></span><span>Aangemaakt {dateLabel(editor.item.createdAt)}</span><span>Gewijzigd {dateLabel(editor.item.updatedAt)}</span><span>Revisie {editor.item.revision}</span><details><summary>Intern ID</summary><code>{editor.item.id}</code></details></div>}
          {stale && <div className={styles.conflict} role="alert"><CircleAlert size={17} aria-hidden="true"/><div><strong>Er is een nieuwere versie van deze kaart.</strong><p>Jouw formulier is bewaard. Kopieer tekst die je wilt houden en laad daarna de nieuwste versie.</p><div className={styles.conflictActions}><button type="button" className={styles.button} onClick={() => ask({ kind: "reload" })}>Nieuwste versie laden</button></div></div></div>}
          <form className={styles.form} id={`${formId}-form`} onSubmit={submit}>
            <fieldset className={styles.editingFields} disabled={busy}>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.fieldWide}`}><span>Titel van het idee</span><input ref={titleInput} autoFocus required minLength={3} maxLength={140} value={editor.draft.title} onChange={event => patch({ title: event.target.value })} placeholder="Bijvoorbeeld: favoriete wedstrijdvormen bewaren"/></label>
              <label className={`${styles.field} ${styles.fieldWide}`}><span>Omschrijving</span><textarea rows={4} maxLength={3000} value={editor.draft.description} onChange={event => patch({ description: event.target.value })} placeholder="Wat wil je verbeteren, en voor wie?"/></label>
              <label className={styles.field}><span>Categorie</span><select value={editor.draft.category} onChange={event => patch({ category: event.target.value as Category })}>{Object.entries(RELEASE_CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className={styles.field}><span>Prioriteit</span><select value={editor.draft.priority} onChange={event => patch({ priority: event.target.value as Priority })}>{Object.entries(RELEASE_PRIORITIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              {editor.item && <>
                <label className={styles.field}><span>Status</span><select value={editor.draft.status} onChange={event => patch({ status: event.target.value as Status })}>{statuses.map(status => <option value={status} key={status}>{RELEASE_STATUSES[status]}</option>)}</select><small className={styles.fieldHint}>Toegevoegd wordt niet automatisch openbaar.</small></label>
                <label className={styles.field}><span>Versie <small>optioneel</small></span><input maxLength={40} value={editor.draft.version} onChange={event => patch({ version: event.target.value })} placeholder="Bijvoorbeeld 1.4"/><small className={styles.fieldHint}>Verschijnt bij de update wanneer je publiceert.</small></label>
                <label className={`${styles.field} ${styles.fieldWide}`}><span>Interne notities</span><textarea rows={3} maxLength={5000} value={editor.draft.notes} onChange={event => patch({ notes: event.target.value })} placeholder="Afwegingen, afspraken of aandachtspunten voor het team."/><small className={styles.fieldHint}>Alleen voor beheer; nooit onderdeel van de lobbypublicatie.</small></label>
              </>}
            </div>
            {editor.item && <section className={styles.publicationPanel} aria-labelledby={`${formId}-publication`}>
              <div className={styles.publicationHeading}><span><Send size={17} aria-hidden="true"/><h3 id={`${formId}-publication`}>De update voor spelers</h3></span><span className={editor.item.publication ? styles.publication : styles.publicationPrivate}>{editor.item.publication ? "Gepubliceerd" : "Niet gepubliceerd"}</span></div>
              <p className={styles.publicationCopy}>Vertel wat er is verbeterd en wat spelers daaraan hebben. Publiceren bewaart een aparte momentopname van deze openbare tekst.</p>
              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.fieldWide}`}><span>Openbare titel</span><input maxLength={140} value={editor.draft.releaseTitle} onChange={event => patch({ releaseTitle: event.target.value })} placeholder="Een korte titel voor de lobby"/><small className={styles.fieldHint}>Minimaal 3 tekens om te publiceren.</small></label>
                <label className={`${styles.field} ${styles.fieldWide}`}><span>Openbare samenvatting</span><textarea rows={3} maxLength={800} value={editor.draft.releaseSummary} onChange={event => patch({ releaseSummary: event.target.value })} placeholder="Dit is er nieuw. Zo helpt het je tijdens het spelen."/><small className={styles.fieldHint}>20–800 tekens. Interne notities worden niet meegestuurd.</small></label>
              </div>
              {editor.item.publication && <><span className={styles.previewLabel}>NU GEPUBLICEERD · {dateLabel(editor.item.publication.publishedAt)}</span><ReleasePreview title={editor.item.publication.title} summary={editor.item.publication.summary} version={editor.item.publication.version} category={editor.item.publication.category ?? editor.item.category}/></>}
              {publicChanged && <p className={styles.fieldHint}>Je opgeslagen openbare tekst wijkt af van de publicatie. Controleer en publiceer opnieuw om die te vervangen.</p>}
              {editor.draft.status !== "added" ? <p className={styles.fieldHint}>{editor.item.publication ? "Bij opslaan met deze status wordt de huidige publicatie ingetrokken." : "Zet de kaart op Toegevoegd en sla op om deze update te publiceren."}</p> : <p className={styles.fieldHint}>{dirty ? "Sla je wijzigingen op voordat je de publicatie controleert." : "De releasewidget toont gepubliceerde updates in de ingestelde kamers."}</p>}
              <div className={styles.footerActions}><button type="button" className={styles.button} disabled={editor.draft.status !== "added" || dirty || stale} onClick={requestPublish}><Eye size={15} aria-hidden="true"/>{editor.item.publication ? "Publicatie bijwerken" : "Publiceren in lobby"}</button>{editor.item.publication && <button type="button" className={`${styles.button} ${styles.quiet}`} disabled={dirty || stale} onClick={() => ask({ kind: "unpublish", item: copyItem(editor.item!) })}><EyeOff size={15} aria-hidden="true"/>Intrekken</button>}</div>
            </section>}
            {editor.item && <section className={styles.history} aria-labelledby={`${formId}-history`}><h3 className={styles.sectionTitle} id={`${formId}-history`}><History size={16} aria-hidden="true"/>Geschiedenis</h3>{editor.item.history.map(entry => <div className={styles.historyRow} key={entry.id}><span className={styles.historyDot}/><div className={styles.historyBody}><p>{entry.text}</p><small>{entry.actor}</small></div><time className={styles.historyTime} dateTime={new Date(entry.at).toISOString()}>{dateLabel(entry.at)}</time></div>)}{!editor.item.history.length && <p className={styles.fieldHint}>Wijzigingen verschijnen hier zodra je opslaat.</p>}</section>}
            </fieldset>
          </form>
          </div>
          {editorError && <div className={styles.inlineError} role="alert"><CircleAlert size={16} aria-hidden="true"/><span>{editorError}</span></div>}
          {editorMessage && <div className={styles.notice} role="status"><Check size={16} aria-hidden="true"/><span>{editorMessage}</span></div>}
          <div className={styles.dialogFooter}><span className={styles.saveState} role="status">{busy ? "Wijziging wordt opgeslagen…" : dirty ? "Wijzigingen nog niet opgeslagen" : editor.item ? "Alle wijzigingen opgeslagen" : "Nieuw idee · start bij Ideeën"}</span><div className={styles.footerActions}><button type="button" disabled={busy} className={styles.button} onClick={requestClose}>Sluiten</button><button type="submit" form={`${formId}-form`} className={`${styles.button} ${styles.primary}`} disabled={busy || stale || Boolean(editor.item && !dirty)}><Check size={15} aria-hidden="true"/>{editor.item ? "Opslaan" : "Idee toevoegen"}</button></div></div>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) cancelConfirmation(); }}>
      <AlertDialogContent className={`${styles.dialog} ${styles.confirm}`} style={dialogViewport} aria-busy={busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onOpenAutoFocus={event => { event.preventDefault(); confirmationCancel.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (discarding.current) {
            discarding.current = false; closeEditor();
            const completeNavigation = pendingNavigation.current; pendingNavigation.current = null; completeNavigation?.(true);
          } else restoreConfirmationFocus();
        }}><div className={styles.confirmBody}><AlertDialogHeader><AlertDialogTitle>{confirmationTitle}</AlertDialogTitle><AlertDialogDescription>{confirmationDescription}</AlertDialogDescription></AlertDialogHeader>
        {confirmation?.kind === "publish" && <ReleasePreview title={confirmation.item.releaseTitle} summary={confirmation.item.releaseSummary} version={confirmation.item.version} category={confirmation.item.category}/>}
        {confirmationError && <div className={styles.inlineError} role="alert"><CircleAlert size={16} aria-hidden="true"/><span>{confirmationError}</span></div>}
        </div>
        <div className={styles.confirmActions}><button ref={confirmationCancel} type="button" disabled={busy} className={styles.button} onClick={cancelConfirmation}>{confirmation?.kind === "discard" ? "Verder bewerken" : "Annuleren"}</button><button type="button" disabled={busy} className={`${styles.button} ${confirmation?.kind === "publish" || confirmation?.kind === "reload" ? styles.primary : styles.danger}`} onClick={() => { void confirmAction(); }}>{busy ? "Even wachten…" : confirmationButton}</button></div>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
