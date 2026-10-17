"use client";
import {useI18n} from '@/lib/i18n/provider';


import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Code2, Copy, Mail, Monitor, ShieldCheck, Smartphone, FileText } from "lucide-react";
import { Brand } from "@/components/design-studio";
import { getDartsEmailExamples, renderDartsEmail } from "@/lib/darts-email-templates";
import "./darts-email-preview.css";

export function DartsEmailPreview() {
 const {t:dpT,locale}=useI18n("emailPreview");

  const [selected, setSelected] = useState(0);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [view, setView] = useState<"email" | "text">("email");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const examples=getDartsEmailExamples(locale);
  const example = examples[selected];
  const email = useMemo(() => renderDartsEmail(example.input, { mode: "preview",locale }), [example,locale]);
  async function copyEmail() {
    try { await navigator.clipboard.writeText(view === "text" ? email.text : renderDartsEmail(example.input,{locale}).html); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  function choose(index: number) { setSelected(index); setCopied(false); setCopyError(false); }
  return <main className="email-studio">
    <header className="email-studio-header"><Link href="/" aria-label={dpT("emailPreview.dartspoint_homepage")}><Brand /></Link><Link href="/inloggen"><ArrowLeft size={16} /> {dpT("emailPreview.naar_inloggen")}</Link></header>
    <div className="email-studio-intro"><div><span className="email-studio-kicker"><span /> {dpT("emailPreview.ook_in_je_inbox_onmiskenbaar_dartspoint")}</span><h1>{dpT("emailPreview.een_vertrouwd_bericht")}</h1><p>{dpT("emailPreview.van_je_eerste_inlogcode_tot_de_volgende_toernooiavond")}</p></div><span className="email-studio-prototype"><ShieldCheck size={17} /> {dpT("emailPreview.ontwerpvoorbeelden")}<br /><small>{dpT("emailPreview.er_wordt_geen_e_mail_verstuurd")}</small></span></div>
    <div className="email-studio-layout">
      <aside className="email-studio-sidebar" aria-label={dpT("emailPreview.kies_een_e_mailvoorbeeld")}><span>{dpT("emailPreview.de_berichten")}</span><div className="email-studio-choices">{examples.map((item, index) => <button key={item.id} type="button" onClick={() => choose(index)} aria-pressed={selected === index} className={selected === index ? "is-active" : ""}><span className="email-studio-number">0{index + 1}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowUpRight size={16} /></button>)}</div><div className="email-studio-system-note"><Mail size={20} /><h2>{dpT("emailPreview.herkenbaar_tot_de_laatste_regel")}</h2><p>{dpT("emailPreview.diepgroen_warme_creme_en_een_rode_uitnodiging_leesbaar")}</p><span><Code2 size={14} /> {dpT("emailPreview.html_gewone_tekst")}</span></div></aside>
      <section className="email-studio-canvas" aria-label={dpT("emailPreview.e_mailvoorbeeld",{title:example.title})}>
        <div className="email-studio-toolbar"><div className="email-studio-views" role="group" aria-label={dpT("emailPreview.weergave")}><button type="button" onClick={() => { setView("email"); setCopied(false); }} aria-pressed={view === "email"}><Mail size={15} /><span>{dpT("emailPreview.e_mail")}</span></button><button type="button" onClick={() => { setView("text"); setCopied(false); }} aria-pressed={view === "text"}><FileText size={15} /><span>{dpT("emailPreview.tekst")}</span></button></div><div className="email-studio-sizes" role="group" aria-label={dpT("emailPreview.voorbeeldbreedte")}><button type="button" onClick={() => setWidth("desktop")} aria-pressed={width === "desktop"} aria-label={dpT("emailPreview.desktopbreedte")}><Monitor size={17} /></button><button type="button" onClick={() => setWidth("mobile")} aria-pressed={width === "mobile"} aria-label={dpT("emailPreview.mobiele_breedte")}><Smartphone size={17} /></button></div><button type="button" className="email-studio-copy" onClick={copyEmail}>{copied ? <Check size={15} /> : <Copy size={15} />}<span>{copied ? dpT("emailPreview.gekopieerd") : view === "text" ? dpT("emailPreview.kopieer_tekst") : dpT("emailPreview.kopieer_html")}</span></button></div>
        <div className="email-studio-envelope"><span><b>{dpT("emailPreview.van")}</b> {dpT("emailPreview.dartspoint")} <i>&lt;{example.id === "otp" ? dpT("emailPreview.login_auth_dartspoint_nl") : dpT("emailPreview.meldingen_notify_dartspoint_nl")}&gt;</i></span><span><b>{dpT("emailPreview.aan")}</b> {dpT("emailPreview.jij")} <i>{dpT("emailPreview.voorbeeld")}</i></span><h2>{email.subject}</h2><p>{email.preheader}</p></div>
        <div className={`email-studio-message is-${width}`}>
          {view === "email" ? <iframe key={example.id} title={dpT("emailPreview.voorbeeldmail",{subject:email.subject})} srcDoc={email.html} sandbox="" referrerPolicy="no-referrer" /> : <pre tabIndex={0}>{email.text}</pre>}
        </div>
        <div className="email-studio-preview-note" role="status">{copyError ? dpT("emailPreview.kopieren_is_in_deze_browser_niet_beschikbaar_de") : copied ? dpT("emailPreview.voorbeeld_gekopieerd_gebruik_voor_echte_inlogmails_de_supabase") : dpT("emailPreview.alle_gegevens_en_codes_zijn_voorbeelden_de_links")}</div>
      </section>
    </div>
    <footer className="email-studio-footer"><p>{dpT("emailPreview.jouw_kamer_jouw_wedstrijd_jouw_avond")}</p><Link href="/inloggen">{dpT("emailPreview.probeer_de_inlogflow")} <ArrowUpRight size={15} /></Link></footer>
  </main>;
}
