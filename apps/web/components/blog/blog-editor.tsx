"use client";
import {blogUi as ui} from "./blog-ui";
import {useI18n} from "@/lib/i18n/provider";

import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Braces, ChevronDown, Code, Columns3, Heading2,
  Heading3, Heading4, Highlighter, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered,
  Minus, Pilcrow, Quote, Redo2, Rows3, Strikethrough, Table2, Trash2, Underline, Undo2,
  type LucideIcon,
} from "lucide-react";
import { type ChainedCommands, type Editor, EditorContent, useEditor } from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extensions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type {BlogDocument} from "@/lib/blog";
import "./blog-editor.css";

type BlogEditorProps = {
  value: BlogDocument;
  onChange: (value: BlogDocument) => void;
  onUploadImage?: (file: File) => Promise<{assetId: string; url: string; width: number; height: number}>;
  readOnly?: boolean;
};

type EditingDialog = {
  type: "link" | "image";
  url: string;
  description: string;
  existing: boolean;
  requiresLinkText?: boolean;
  caption?: string;
  assetId?: string;
};

type BlockOption = {
  label: string;
  detail: string;
  icon: LucideIcon;
  matches?: string;
} & ({ run: (chain: ChainedCommands) => ChainedCommands } | { dialog: "image" });

const blocks: BlockOption[] = [
  { label: "Alinea", detail: "Gewone tekst", icon: Pilcrow, run: chain => chain.setParagraph() },
  { label: "Kop 2", detail: "Hoofdonderwerp", icon: Heading2, matches: "h2 titel", run: chain => chain.setHeading({ level: 2 }) },
  { label: "Kop 3", detail: "Subonderwerp", icon: Heading3, matches: "h3 titel", run: chain => chain.setHeading({ level: 3 }) },
  { label: "Kop 4", detail: "Verdieping", icon: Heading4, matches: "h4 titel", run: chain => chain.setHeading({ level: 4 }) },
  { label: "Opsomming", detail: "Lijst met bullets", icon: List, run: chain => chain.toggleBulletList() },
  { label: "Nummering", detail: "Genummerde lijst", icon: ListOrdered, run: chain => chain.toggleOrderedList() },
  { label: "Takenlijst", detail: "Afvinkbare lijst", icon: ListChecks, run: chain => chain.toggleTaskList() },
  { label: "Citaat", detail: "Uitgelichte tekst", icon: Quote, run: chain => chain.toggleBlockquote() },
  { label: "Codeblok", detail: "Code op een eigen regel", icon: Braces, run: chain => chain.toggleCodeBlock() },
  { label: "Scheidingslijn", detail: "Visuele onderbreking", icon: Minus, run: chain => chain.setHorizontalRule() },
  { label: "Afbeelding", detail: "Eigen afbeelding uploaden", icon: ImagePlus, dialog: "image" },
  { label: "Tabel", detail: "Tabel met koprij", icon: Table2, run: chain => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
];

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const imageFormatHelp = "Gebruik een JPG-, PNG- of WebP-bestand.";

function safeUrl(value: string, image = false): boolean {
  if (!value || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!image && value.startsWith("#")) return value.length > 1;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.protocol === "https:" || (!image && ["http:", "mailto:", "tel:"].includes(url.protocol));
  } catch {
    return false;
  }
}

const SafeImage = Image.extend({
  addAttributes() {
    return {...this.parent?.(), caption: {default: null, parseHTML: element => element.getAttribute("data-caption"), renderHTML: attrs => attrs.caption ? {"data-caption": attrs.caption} : {}}, assetId: {default: null, parseHTML: element => element.getAttribute("data-asset-id"), renderHTML: attrs => attrs.assetId ? {"data-asset-id": attrs.assetId} : {}}};
  },
  parseHTML() {
    return [{
      tag: "img[src]",
      getAttrs: element => /^\/api\/blog-media\/[0-9a-f-]{36}$/i.test(element.getAttribute("src") ?? "") && element.getAttribute("data-asset-id") ? null : false,
    }];
  },
});

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      defaultProtocol: "https",
      isAllowedUri: (url, context) => context.defaultValidate(url) && safeUrl(url),
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  SafeImage.configure({
    resize: { enabled: true, directions: ["top-left", "top-right", "bottom-left", "bottom-right"], minWidth: 80, minHeight: 48, alwaysPreserveAspectRatio: true },
  }),
  TableKit.configure({ table: { resizable: true, cellMinWidth: 70 } }),
  TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
  Highlight.configure({multicolor: true}),
  Placeholder.configure({ placeholder: () => ui("Begin met schrijven of typ / voor een blok…") }),
];

function ToolButton({ label, icon: Icon, onClick, active, disabled }: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="dp-blog-editor-tool" aria-label={label} aria-pressed={active} title={label}
      disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function getSlashQuery(editor: Editor | null) {
  if (!editor || !editor.isFocused) return null;
  const { selection } = editor.state;
  if (!selection.empty || selection.$from.parent.type.name !== "paragraph") return null;
  const { $from } = selection;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const value = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const match = /^\/([\p{L}\d ]{0,30})$/u.exec(value);
  if (!match) return null;
  return { from: $from.start(), to: $from.pos, query: match[1].trim().toLocaleLowerCase("nl"), key: `${$from.start()}:${value}` };
}

export function BlogEditor({ value, onChange, onUploadImage, readOnly = false }: BlogEditorProps) {
  useI18n();
  const dialogId = useId();
  const slashId = `${dialogId}-blokken`;
  const writing = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const menuKeyboard = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const [dialog, setDialog] = useState<EditingDialog | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [activeOption, setActiveOption] = useState({ key: "", index: 0 });
  const [dismissed, setDismissed] = useState("");

  function acceptImage(files: FileList | undefined) {
    const image = Array.from(files ?? []).find(candidate => candidate.type.startsWith("image/"));
    if (!image || !onUploadImage || readOnly) return false;
    setFile(image);
    setError(imageTypes.includes(image.type) ? "" : ui(imageFormatHelp));
    setDialog({ type: "image", url: "", description: "", existing: false });
    return true;
  }

  function setImageFile(next: File | null) {
    setFile(next);
    setError(next && !imageTypes.includes(next.type) ? ui(imageFormatHelp) : "");
  }

  const editor = useEditor({
    extensions,
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { "aria-label": ui("Artikelinhoud"), "aria-multiline": "true", role: "textbox", spellcheck: "true" },
      handleKeyDown: (_view, event) => menuKeyboard.current(event),
      handlePaste: (_view, event) => acceptImage(event.clipboardData?.files),
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !acceptImage(event.dataTransfer?.files)) return false;
        const dropPoint = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (dropPoint) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(dropPoint.pos))));
        return true;
      },
    },
    onUpdate: ({ editor: changed }) => onChange({ ...changed.getJSON(), type: "doc", schemaVersion: 1 }),
  });

  useEffect(() => { editor?.setEditable(!readOnly, false); }, [editor, readOnly]);

  const slash = readOnly ? null : getSlashQuery(editor);
  const slashOptions = slash && slash.key !== dismissed
    ? blocks.filter(block => `${ui(block.label)} ${ui(block.detail)} ${block.label} ${block.detail} ${block.matches ?? ""}`.toLocaleLowerCase("nl").includes(slash.query))
    : [];
  const optionIndex = activeOption.key === slash?.key ? Math.min(activeOption.index, slashOptions.length - 1) : 0;
  const showMenu = !!slashOptions.length;

  function openDialog(type: EditingDialog["type"]) {
    if (!editor) return;
    const existing = editor.isActive(type);
    const attrs = editor.getAttributes(type);
    setFile(null);
    setError("");
    setDialog({
      type,
      existing,
      url: (type === "link" ? attrs.href : attrs.src) ?? "",
      description: type === "image" ? (attrs.alt ?? "") : "",
      requiresLinkText: type === "link" && !existing && editor.state.selection.empty,
      caption: type === "image" ? (attrs.caption ?? attrs.title ?? "") : undefined,
      assetId: type === "image" ? attrs.assetId : undefined,
    });
  }

  function selectBlock(block: BlockOption) {
    if (!editor || !slash) return;
    const chain = editor.chain().deleteRange({ from: slash.from, to: slash.to });
    if ("run" in block) block.run(chain.focus()).run();
    else {
      chain.run();
      openDialog(block.dialog);
    }
  }

  useLayoutEffect(() => {
    menuKeyboard.current = event => {
      if (!slash || !showMenu) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveOption({ key: slash.key, index: (optionIndex + direction + slashOptions.length) % slashOptions.length });
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        selectBlock(slashOptions[optionIndex]);
        return true;
      }
      if (event.key === "Escape") {
        setDismissed(slash.key);
        return true;
      }
      return false;
    };
    if (!editor) return;
    const input = editor.view.dom;
    if (!slash || !menu.current || !writing.current) {
      input.removeAttribute("aria-controls");
      input.removeAttribute("aria-activedescendant");
      return;
    }
    input.setAttribute("aria-controls", slashId);
    input.setAttribute("aria-activedescendant", `${slashId}-${optionIndex}`);
    const position = editor.view.coordsAtPos(slash.to);
    const bounds = writing.current.getBoundingClientRect();
    menu.current.style.top = `${position.bottom - bounds.top + 8}px`;
    const left = Math.max(8, Math.min(position.left - bounds.left, bounds.width - menu.current.offsetWidth - 8));
    menu.current.style.left = `${left}px`;
    const selected = menu.current.querySelector<HTMLElement>("[aria-selected='true']");
    if (selected && selected.offsetTop < menu.current.scrollTop) menu.current.scrollTop = selected.offsetTop;
    if (selected && selected.offsetTop + selected.offsetHeight > menu.current.scrollTop + menu.current.clientHeight) {
      menu.current.scrollTop = selected.offsetTop + selected.offsetHeight - menu.current.clientHeight;
    }
  });

  function closeDialog() {
    if (uploading) return;
    setDialog(null);
    editor?.commands.focus();
  }

  async function applyDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!editor || !dialog || uploading) return;
    setError("");
    const url = dialog.url.trim();
    const description = dialog.description.trim();
    if (dialog.type === "link") {
      if (!safeUrl(url)) {
        setError(ui("Gebruik een webadres, e-mailadres, telefoonlink of intern pad dat met / begint."));
        return;
      }
      if (dialog.requiresLinkText && !description) {
        setError(ui("Vul de tekst in die als link verschijnt."));
        return;
      }
      const chain = editor.chain().focus();
      if (dialog.requiresLinkText) {
        chain.insertContent({ type: "text", text: description, marks: [{ type: "link", attrs: { href: url } }] });
      } else chain.extendMarkRange("link").setLink({ href: url });
      chain.run();
      setDialog(null);
      return;
    }
    if (!description) {
      setError(ui("Beschrijf de afbeelding voor bezoekers die het beeld niet kunnen zien."));
      return;
    }
    if (file && !imageTypes.includes(file.type)) {
      setError(ui(imageFormatHelp));
      return;
    }
    if (!file && (!dialog.existing || !dialog.assetId)) {
      setError(ui("Upload een eigen afbeelding voor dit artikel."));
      return;
    }
    try {
      setUploading(true);
      const uploaded = file && onUploadImage ? await onUploadImage(file) : null;
      const src = uploaded?.url ?? url;
      const assetId = uploaded?.assetId ?? dialog.assetId;
      if (!safeUrl(src, true)) throw new Error(ui("Deze afbeeldings-URL is ongeldig."));
      if (editor.isDestroyed) return;
      const title = dialog.caption?.trim() || undefined;
      const chain = editor.chain().focus();
      const imageAttrs = { src, assetId, alt: description, caption: title ?? null, title: title ?? null, ...(uploaded ? {width: uploaded.width, height: uploaded.height} : {}) };
      if (dialog.existing) chain.updateAttributes("image", imageAttrs);
      else chain.insertContent({type: "image", attrs: imageAttrs});
      chain.run();
      setDialog(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui("De afbeelding kon niet worden toegevoegd."));
    } finally {
      setUploading(false);
    }
  }

  const text = editor?.getText() ?? "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const headingLevel = editor?.isActive("heading") ? editor.getAttributes("heading").level : 0;
  const inTable = editor?.isActive("table") ?? false;
  return (
    <div className="dp-blog-editor">
      {!readOnly && editor && (
        <div className="dp-blog-editor-controls" role="group" aria-label={ui("Tekstopmaak")}>
          <div className="dp-blog-editor-group">
            <ToolButton label={ui("Ongedaan maken")} icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
            <ToolButton label={ui("Opnieuw uitvoeren")} icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
          </div>
          <div className="dp-blog-editor-group dp-blog-editor-style">
            <select aria-label={ui("Tekststijl")} value={headingLevel} onChange={event => {
              const level = Number(event.target.value);
              const chain = editor.chain().focus();
              if (level === 2 || level === 3 || level === 4) chain.setHeading({ level }).run();
              else chain.setParagraph().run();
            }}>
              <option value="0">{ui("Alinea")}</option>
              <option value="2">{ui("Kop 2")}</option>
              <option value="3">{ui("Kop 3")}</option>
              <option value="4">{ui("Kop 4")}</option>
            </select>
            <ChevronDown aria-hidden="true" size={13} />
          </div>
          <div className="dp-blog-editor-group">
            <ToolButton label={ui("Vet")} icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
            <ToolButton label={ui("Cursief")} icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <ToolButton label={ui("Onderstrepen")} icon={Underline} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
            <ToolButton label={ui("Doorhalen")} icon={Strikethrough} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
            <ToolButton label={ui("Markeren")} icon={Highlighter} active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} />
            <ToolButton label={ui("Inline code")} icon={Code} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
          </div>
          <div className="dp-blog-editor-group">
            <ToolButton label={ui("Opsomming")} icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolButton label={ui("Nummering")} icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <ToolButton label={ui("Takenlijst")} icon={ListChecks} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
            <ToolButton label={ui("Citaat")} icon={Quote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <ToolButton label={ui("Codeblok")} icon={Braces} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
          </div>
          <div className="dp-blog-editor-group">
            <ToolButton label={ui("Links uitlijnen")} icon={AlignLeft} active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().toggleTextAlign("left").run()} />
            <ToolButton label={ui("Centreren")} icon={AlignCenter} active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().toggleTextAlign("center").run()} />
            <ToolButton label={ui("Rechts uitlijnen")} icon={AlignRight} active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().toggleTextAlign("right").run()} />
          </div>
          <div className="dp-blog-editor-group">
            <ToolButton label={ui("Link invoegen of wijzigen")} icon={Link2} active={editor.isActive("link")} onClick={() => openDialog("link")} />
            <ToolButton label={ui("Afbeelding invoegen of wijzigen")} icon={ImagePlus} active={editor.isActive("image")} onClick={() => openDialog("image")} />
            <ToolButton label={ui("Tabel invoegen")} icon={Table2} disabled={inTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
            <ToolButton label={ui("Scheidingslijn")} icon={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          </div>
        </div>
      )}
      {!readOnly && editor && inTable && (
        <div className="dp-blog-editor-controls dp-blog-editor-table-tools" role="group" aria-label={ui("Tabel bewerken")}>
          <span>{ui("Tabel")}</span>
          <ToolButton label={ui("Rij toevoegen")} icon={Rows3} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolButton label={ui("Kolom toevoegen")} icon={Columns3} onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>{ui("Rij weg")}</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>{ui("Kolom weg")}</button>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>{ui("Koprij")}</button>
          <ToolButton label={ui("Tabel verwijderen")} icon={Trash2} onClick={() => editor.chain().focus().deleteTable().run()} />
        </div>
      )}
      <div ref={writing} className="dp-blog-editor-writing">
        <EditorContent editor={editor} />
        {!editor && <div className="dp-blog-editor-loading" role="status">{ui("Editor laden…")}</div>}
        {showMenu && (
          <div ref={menu} className="dp-blog-editor-menu" id={slashId} role="listbox" aria-label={ui("Invoegblokken")}>
            {slashOptions.map((block, index) => (
              <button key={block.label} id={`${slashId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === optionIndex}
                onMouseDown={event => event.preventDefault()} onClick={() => selectBlock(block)}>
                <block.icon size={16} aria-hidden="true" />
                <span><strong>{ui(block.label)}</strong><small>{ui(block.detail)}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="dp-blog-editor-status">
        {!readOnly && <span>{ui("Typ")} <kbd>/</kbd> {ui("voor invoegblokken")}</span>}
        <span>{wordCount} {wordCount === 1 ? ui("woord") : ui("woorden")}</span>
      </div>
      <Dialog open={!!dialog} onOpenChange={open => { if (!open) closeDialog(); }}>
        {dialog && (
          <DialogContent className="dp-blog-editor-dialog" showCloseButton={false} onCloseAutoFocus={event => event.preventDefault()}>
            <DialogTitle>{dialog.type === "image" ? (dialog.existing ? ui("Afbeelding wijzigen") : ui("Afbeelding invoegen")) : (dialog.existing ? ui("Link wijzigen") : ui("Link invoegen"))}</DialogTitle>
            <DialogDescription>{dialog.type === "image" ? ui("Geef de afbeelding een korte, beschrijvende alt-tekst.") : ui("Gebruik een volledig webadres of een intern pad zoals /blog.")}</DialogDescription>
            <form onSubmit={applyDialog}>
              {dialog.type === "image" && onUploadImage && (
                <label htmlFor={`${dialogId}-file`}>{ui("Afbeelding uploaden")}
                  <input ref={imageInput} id={`${dialogId}-file`} type="file" accept={imageTypes.join(",")} disabled={uploading} onChange={event => setImageFile(event.target.files?.[0] ?? null)} />
                  {file && <small className="dp-blog-editor-file">{ui("Geselecteerd bestand ·")} {file.name}</small>}
                </label>
              )}
              {dialog.type === "link" && <label htmlFor={`${dialogId}-url`}>{ui("Linkadres")}
                <input id={`${dialogId}-url`} type="text" inputMode="url" placeholder={ui("https://… of /blog")} value={dialog.url} disabled={uploading} onChange={event => setDialog({ ...dialog, url: event.target.value })} />
              </label>}
              {(dialog.type === "image" || dialog.requiresLinkText) && (
                <label htmlFor={`${dialogId}-description`}>{dialog.type === "image" ? ui("Alt-tekst") : ui("Linktekst")}
                  <input id={`${dialogId}-description`} type="text" value={dialog.description} maxLength={220} disabled={uploading} onChange={event => setDialog({ ...dialog, description: event.target.value })} />
                </label>
              )}
              {dialog.type === "image" && (
                <label htmlFor={`${dialogId}-caption`}>{ui("Bijschrift (optioneel)")}
                  <input id={`${dialogId}-caption`} type="text" value={dialog.caption ?? ""} maxLength={220} disabled={uploading} onChange={event => setDialog({ ...dialog, caption: event.target.value })} />
                </label>
              )}
              {error && <p className="dp-blog-editor-error" role="alert">{error}</p>}
              <div className="dp-blog-editor-dialog-actions">
                {dialog.type === "link" && dialog.existing && <button type="button" onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setDialog(null); }}>{ui("Verwijder link")}</button>}
                {dialog.type === "image" && dialog.existing && <button type="button" disabled={uploading} onClick={() => { editor?.chain().focus().deleteNode("image").run(); setDialog(null); }}>{ui("Verwijder afbeelding")}</button>}
                {dialog.type === "image" && file && <button type="button" disabled={uploading} onClick={() => { setImageFile(null); if (imageInput.current) imageInput.current.value = ""; }}>{ui("Wis bestand")}</button>}
                <button type="button" disabled={uploading} onClick={closeDialog}>{ui("Annuleren")}</button>
                <button className="dp-blog-editor-dialog-primary" type="submit" disabled={uploading}>{uploading ? ui("Uploaden…") : dialog.existing ? ui("Bijwerken") : ui("Invoegen")}</button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
