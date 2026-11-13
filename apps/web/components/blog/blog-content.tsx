import { createElement, type CSSProperties, type ReactNode } from "react";
import type { BlogDocument } from "@/lib/blog";
import {safeBlogLink, blogImageUrl} from "../../../../packages/contracts/src/blog";

function safeUrl(value: unknown, kind: "link" | "image", assetId?: unknown) {
  if (typeof value !== "string") return null;
  if (kind === "image") return typeof assetId === "string" && /^[0-9a-f-]{36}$/i.test(assetId) && value === blogImageUrl(assetId) ? value : null;
  return safeBlogLink(value) ? value : null;
}

function alignment(node: BlogDocument): CSSProperties | undefined {
  const value = node.attrs?.textAlign;
  if (value === "center" || value === "right" || value === "justify" || value === "left") {
    return { textAlign: value };
  }
}

function count(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function renderText(node: BlogDocument, key: string): ReactNode {
  return (node.marks ?? []).reduce<ReactNode>((value, mark, index) => {
    const markKey = `${key}-${index}`;
    switch (mark.type) {
      case "bold": return <strong key={markKey}>{value}</strong>;
      case "italic": return <em key={markKey}>{value}</em>;
      case "strike": return <s key={markKey}>{value}</s>;
      case "underline": return <u key={markKey}>{value}</u>;
      case "code": return <code key={markKey}>{value}</code>;
      case "subscript": return <sub key={markKey}>{value}</sub>;
      case "superscript": return <sup key={markKey}>{value}</sup>;
      case "highlight": {
        const color = ["#ffe066", "#fff3bf", "#d3f9d8", "#a5d8ff"].includes(mark.attrs?.color) ? mark.attrs?.color as string : undefined;
        return <mark key={markKey} style={color ? {backgroundColor: color} : undefined}>{value}</mark>;
      }
      case "link": {
        const href = safeUrl(mark.attrs?.href, "link");
        return href ? <a key={markKey} href={href} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>{value}</a> : value;
      }
      default: return value;
    }
  }, node.text ?? "");
}

function headingId(index: number) {
  return `artikel-onderdeel-${index + 1}`;
}

function renderNode(node: BlogDocument, key: string, id?: string): ReactNode {
  const children = () => (node.content ?? []).map((child, index) => renderNode(child, `${key}-${index}`));
  switch (node.type) {
    case "doc": return children();
    case "text": return renderText(node, key);
    case "paragraph": return <p key={key} style={alignment(node)}>{children()}</p>;
    case "heading": {
      const level = count(node.attrs?.level, 2, 6) ?? 2;
      return createElement(`h${level}`, { key, id, style: alignment(node) }, children());
    }
    case "hardBreak": return <br key={key}/>;
    case "horizontalRule": return <hr key={key}/>;
    case "bulletList": return <ul key={key}>{children()}</ul>;
    case "orderedList": return <ol key={key} start={count(node.attrs?.start, 1, 100000)}>{children()}</ol>;
    case "listItem": return <li key={key}>{children()}</li>;
    case "taskList": return <ul key={key} className="dp-blog-tasks">{children()}</ul>;
    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return <li key={key}><span aria-label={checked ? "Afgerond" : "Open"} className="dp-blog-task" role="img">{checked ? "☑" : "☐"}</span><div>{children()}</div></li>;
    }
    case "blockquote": return <blockquote key={key}>{children()}</blockquote>;
    case "codeBlock": return <pre key={key}><code>{children()}</code></pre>;
    case "image": {
      const src = safeUrl(node.attrs?.src, "image", node.attrs?.assetId);
      if (!src) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      const caption = node.attrs?.caption ?? node.attrs?.title;
      const title = typeof caption === "string" ? caption : undefined;
      const width = count(node.attrs?.width, 1, 16384);
      const height = count(node.attrs?.height, 1, 16384);
      return <figure key={key}><img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async"/>{title && <figcaption>{title}</figcaption>}</figure>;
    }
    case "table": return <div key={key} className="dp-blog-table" tabIndex={0} role="region" aria-label="Tabel"><table><tbody>{children()}</tbody></table></div>;
    case "tableRow": return <tr key={key}>{children()}</tr>;
    case "tableHeader": return <th style={node.attrs?.align === "left" || node.attrs?.align === "center" || node.attrs?.align === "right" ? {textAlign:node.attrs.align} : undefined} key={key} colSpan={count(node.attrs?.colspan, 1, 25)} rowSpan={count(node.attrs?.rowspan, 1, 100)}>{children()}</th>;
    case "tableCell": return <td style={node.attrs?.align === "left" || node.attrs?.align === "center" || node.attrs?.align === "right" ? {textAlign:node.attrs.align} : undefined} key={key} colSpan={count(node.attrs?.colspan, 1, 25)} rowSpan={count(node.attrs?.rowspan, 1, 100)}>{children()}</td>;
    default: return null;
  }
}

function textOf(node: BlogDocument): string {
  return node.text ?? (node.content ?? []).map(textOf).join("");
}

export function blogReadTime(content: BlogDocument) {
  const wordCount = (content.content ?? []).map(textOf).join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 205));
}

export function blogHeadings(content: BlogDocument) {
  return (content.content ?? []).flatMap((node, index) =>
    node.type === "heading" && node.attrs?.level === 2 && textOf(node).trim()
      ? [{ id: headingId(index), label: textOf(node) }] : []
  );
}

export function BlogContent({ content, headingAnchors = false }: { content: BlogDocument; headingAnchors?: boolean }) {
  return <div className="dp-blog-prose">{(content.content ?? []).map((node, index) =>
    renderNode(node, String(index), headingAnchors ? headingId(index) : undefined)
  )}</div>;
}
