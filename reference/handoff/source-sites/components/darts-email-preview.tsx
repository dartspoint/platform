"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Code2, Copy, Mail, Monitor, ShieldCheck, Smartphone, FileText } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { DARTS_EMAIL_EXAMPLES, renderDartsEmail } from "@/lib/darts-email-templates";
import "./darts-email-preview.css";

export function DartsEmailPreview() {
  const [selected, setSelected] = useState(0);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [view, setView] = useState<"email" | "text">("email");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const example = DARTS_EMAIL_EXAMPLES[selected];
  const email = useMemo(() => renderDartsEmail(example.input, { mode: "preview" }), [example]);
  async function copyEmail() {
    try { await navigator.clipboard.writeText(view === "text" ? email.text : renderDartsEmail(example.input).html); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  function choose(index: number) { setSelected(index); setCopied(false); setCopyError(false); }
  return <main className="email-studio">
    <header className="email-studio-header"><Link href="/" aria-label="DartsPoint homepage"><Brand /></Link><Link href="/inloggen"><ArrowLeft size={16} /> Naar inloggen</Link></header>
    <div className="email-studio-intro"><div><span className="email-studio-kicker"><span /> OOK IN JE INBOX. ONMISKENBAAR DARTSPOINT.</span><h1>Een vertrouwd bericht.</h1><p>Van je eerste inlogcode tot de volgende toernooiavond. Eén rustige, herkenbare stijl voor iedere e-mail.</p></div><span className="email-studio-prototype"><ShieldCheck size={17} /> Ontwerpvoorbeelden<br /><small>Er wordt geen e-mail verstuurd.</small></span></div>
    <div className="email-studio-layout">
      <aside className="email-studio-sidebar" aria-label="Kies een e-mailvoorbeeld"><span>DE BERICHTEN</span><div className="email-studio-choices">{DARTS_EMAIL_EXAMPLES.map((item, index) => <button key={item.id} type="button" onClick={() => choose(index)} aria-pressed={selected === index} className={selected === index ? "is-active" : ""}><span className="email-studio-number">0{index + 1}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowUpRight size={16} /></button>)}</div><div className="email-studio-system-note"><Mail size={20} /><h2>Herkenbaar tot de laatste regel.</h2><p>Diepgroen, warme crème en een rode uitnodiging. Leesbaar, ook zonder afbeeldingen.</p><span><Code2 size={14} /> HTML + gewone tekst</span></div></aside>
      <section className="email-studio-canvas" aria-label={`${example.title}: e-mailvoorbeeld`}>
        <div className="email-studio-toolbar"><div className="email-studio-views" role="group" aria-label="Weergave"><button type="button" onClick={() => { setView("email"); setCopied(false); }} aria-pressed={view === "email"}><Mail size={15} /><span>E-mail</span></button><button type="button" onClick={() => { setView("text"); setCopied(false); }} aria-pressed={view === "text"}><FileText size={15} /><span>Tekst</span></button></div><div className="email-studio-sizes" role="group" aria-label="Voorbeeldbreedte"><button type="button" onClick={() => setWidth("desktop")} aria-pressed={width === "desktop"} aria-label="Desktopbreedte"><Monitor size={17} /></button><button type="button" onClick={() => setWidth("mobile")} aria-pressed={width === "mobile"} aria-label="Mobiele breedte"><Smartphone size={17} /></button></div><button type="button" className="email-studio-copy" onClick={copyEmail}>{copied ? <Check size={15} /> : <Copy size={15} />}<span>{copied ? "Gekopieerd" : view === "text" ? "Kopieer tekst" : "Kopieer HTML"}</span></button></div>
        <div className="email-studio-envelope"><span><b>Van</b> DartsPoint <i>&lt;{example.id === "otp" ? "login@auth.dartspoint.nl" : "meldingen@notify.dartspoint.nl"}&gt;</i></span><span><b>Aan</b> Jij <i>· voorbeeld</i></span><h2>{email.subject}</h2><p>{email.preheader}</p></div>
        <div className={`email-studio-message is-${width}`}>
          {view === "email" ? <iframe key={example.id} title={`Voorbeeldmail: ${email.subject}`} srcDoc={email.html} sandbox="" referrerPolicy="no-referrer" /> : <pre tabIndex={0}>{email.text}</pre>}
        </div>
        <div className="email-studio-preview-note" role="status">{copyError ? "Kopiëren is in deze browser niet beschikbaar. De HTML- en tekstbestanden zitten ook in het overdrachtspakket." : copied ? "Voorbeeld gekopieerd. Gebruik voor echte inlogmails de Supabase-template met een dynamische code uit het overdrachtspakket." : "Alle gegevens en codes zijn voorbeelden. De links verwijzen naar het toekomstige dartspoint.nl; e-mailclients kunnen het ontwerp iets anders tonen."}</div>
      </section>
    </div>
    <footer className="email-studio-footer"><p>Jouw kamer. Jouw wedstrijd. Jouw avond.</p><Link href="/inloggen">Probeer de inlogflow <ArrowUpRight size={15} /></Link></footer>
  </main>;
}
