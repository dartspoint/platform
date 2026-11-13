"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

export function BlogShare({ title, url, english }: { title: string; url: string; english: boolean }) {
  const [feedback, setFeedback] = useState("");
  const copied = english ? "Link copied" : "Link gekopieerd";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(copied);
    } catch {
      setFeedback(english ? "Copy the link from the address bar." : "Kopieer de link uit de adresbalk.");
    }
  }

  async function share() {
    if (navigator.share) {try {await navigator.share({title, url});} catch (error) {if (!(error instanceof DOMException && error.name === "AbortError")) await copy();}} else await copy();
  }

  return <div className="dp-blog-share">
    <button type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true"/>{english ? "Share" : "Delen"}</button>
    <a href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`} target="_blank" rel="noopener noreferrer"><Share2 size={16} aria-hidden="true"/> WhatsApp</a>
    <button type="button" onClick={copy}>{feedback === copied ? <Check size={16} aria-hidden="true"/> : <Link2 size={16} aria-hidden="true"/>}{english ? "Copy link" : "Kopieer link"}</button>
    <span role="status" className="dp-blog-share-feedback">{feedback}</span>
  </div>;
}
