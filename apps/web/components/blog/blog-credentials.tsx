"use client";
import {blogUi as ui} from "./blog-ui";
import {browserLocale} from "../../../../packages/i18n/src/errors";
import {useI18n} from "@/lib/i18n/provider";
import {useCallback, useEffect, useState} from 'react';
import {Check, Copy, Eye, EyeOff, KeyRound, Link2, Plus, RefreshCw, Trash2} from 'lucide-react';
import {BLOG_SCOPES, type BlogScope} from '../../../../packages/contracts/src/blog';

type Credential = {id: string; label: string; scopes: BlogScope[]; createdAt: string; expiresAt: string; revokedAt: string | null};
const labels: Record<BlogScope, string> = {'capabilities:read':'Verbinding uitlezen', 'media:write':'Media uploaden', 'drafts:read':'Conceptstatus uitlezen', 'drafts:write':'Concepten aanleveren', 'posts:publish':'Goedgekeurde revisie publiceren'};
async function credentialsRequest<T>(body?: object): Promise<T> {
  const response = await fetch('/api/blog-admin/credentials', {cache:'no-store', ...(body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || ui('De verbinding kon niet worden bijgewerkt.'));
  return result as T;
}
export function BlogCredentials() {
  useI18n();
  const [credentials, setCredentials] = useState<Credential[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const [label, setLabel] = useState('SocialHero'), [expires, setExpires] = useState(() => new Date(Date.now()+90*86400000).toISOString().slice(0,10)), [scopes, setScopes] = useState<BlogScope[]>([...BLOG_SCOPES]);
  const [fresh, setFresh] = useState<{id: string; token: string} | null>(null), [visible, setVisible] = useState(false);
  const load = useCallback(async () => {try {const result = await credentialsRequest<{credentials: Credential[]}>(); setCredentials(result.credentials);} catch (cause) {setError(cause instanceof Error ? cause.message : ui('Verbindingen laden is niet gelukt.'));}}, []);
  useEffect(() => {void load();}, [load]);
  async function create() {
    if (busy || !label.trim() || !expires || !scopes.length) return;
    setBusy(true); setError(''); setFeedback(''); setFresh(null); setVisible(false);
    try {setFresh(await credentialsRequest<{id: string; token: string}>({action:'create', label, scopes, expiresAt:new Date(expires+'T23:59:59.000Z').toISOString()})); await load(); setFeedback(ui('Credential aangemaakt. Kopieer hem nu naar de juiste SocialHero-omgeving.'));}
    catch (cause) {setError(cause instanceof Error ? cause.message : ui('Aanmaken is niet gelukt.'));} finally {setBusy(false);}
  }
  async function revoke(credential: Credential) {
    if (busy || !window.confirm(ui("Verbinding “{label}” intrekken? SocialHero kan met deze credential daarna niet meer publiceren.", {label:credential.label}))) return;
    setBusy(true); setError(''); setFeedback('');
    try {await credentialsRequest({action:'revoke', id:credential.id}); if (fresh?.id===credential.id) setFresh(null); await load(); setFeedback(ui('Credential ingetrokken.'));}
    catch (cause) {setError(cause instanceof Error ? cause.message : ui('Intrekken is niet gelukt.'));} finally {setBusy(false);}
  }
  async function test() {
    if (!fresh || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {const response = await fetch('/api/socialhero/v1/capabilities', {cache:'no-store', headers:{Authorization:'Bearer '+fresh.token}}); const result = await response.json(); if (!response.ok) throw new Error(result.error || ui('Verbindingstest mislukt.')); setFeedback(ui("Verbinding geslaagd: {siteId}, {environment}, contract {version}.", {siteId:result.siteId,environment:result.environment,version:result.contractVersion}));}
    catch (cause) {setError(cause instanceof Error ? cause.message : ui('Verbindingstest mislukt.'));} finally {setBusy(false);}
  }
  return <section className="adm-panel dpba-panel dpba-credentials"><h2 className="dpba-panel-title"><Link2 size={17}/>{ui("SocialHero-verbindingen")}</h2><p className="dpba-help">{ui("Maak per omgeving een eigen credential met alleen de benodigde rechten. De geheime waarde verschijnt eenmaal. Roteer door een nieuwe credential te verbinden en daarna de vorige in te trekken.")}</p>
    {error && <p className="dpba-notice dpba-notice--error" role="alert">{error}</p>}{feedback && <p className="dpba-notice dpba-notice--success" role="status"><Check size={16}/>{feedback}</p>}
    <div className="dpba-fields-grid"><label className="dpba-field"><span>{ui("Naam verbinding")}</span><input value={label} maxLength={100} disabled={busy} onChange={event => setLabel(event.target.value)}/></label><label className="dpba-field"><span>{ui("Vervaldatum (einde dag UTC)")}</span><input type="date" value={expires} min={new Date().toISOString().slice(0,10)} disabled={busy} onChange={event => setExpires(event.target.value)}/></label></div>
    <fieldset className="dpba-credential-scopes" disabled={busy}><legend>{ui("Rechten")}</legend>{BLOG_SCOPES.map(scope => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={event => setScopes(current => event.target.checked ? [...current,scope] : current.filter(value => value!==scope))}/>{ui(labels[scope])}</label>)}</fieldset>
    <button className="adm-btn" type="button" disabled={busy || !label.trim() || !scopes.length} onClick={() => void create()}><Plus size={15}/>{ui("Credential aanmaken")}</button>
    {fresh && <div className="dpba-credential-secret"><label className="dpba-field"><span><KeyRound size={14}/> {ui("Eenmalige geheime waarde")}</span><input type={visible ? 'text' : 'password'} value={fresh.token} readOnly autoComplete="off" spellCheck={false}/></label><div className="dpba-actions"><button className="adm-btn" type="button" onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={14}/> : <Eye size={14}/>} {visible ? ui('Verbergen') : ui('Tonen')}</button><button className="adm-btn" type="button" onClick={() => {void navigator.clipboard.writeText(fresh.token).then(() => setFeedback(ui('Credential gekopieerd.'))).catch(() => setError(ui('Kopieer de waarde handmatig.')));}}><Copy size={14}/>{ui("Kopiëren")}</button><button type="button" className="adm-btn" disabled={busy} onClick={() => void test()}><RefreshCw size={14}/>{ui("Read-only testen")}</button></div></div>}
    <div className="dpba-credential-list">{credentials.map(credential => <div key={credential.id}><div><strong>{credential.label}</strong><small>•••••••• · {credential.revokedAt ? ui('Ingetrokken') : new Date(credential.expiresAt).getTime()<Date.now() ? ui('Verlopen') : ui('Actief')} {ui("· verloopt")} {new Date(credential.expiresAt).toLocaleDateString(browserLocale() === 'en' ? 'en-GB' : 'nl-NL', {timeZone:'Europe/Amsterdam'})}</small><small>{credential.scopes.map(scope => ui(labels[scope])).join(' · ')}</small></div><button type="button" className="adm-btn" disabled={busy || !!credential.revokedAt} onClick={() => void revoke(credential)}><Trash2 size={14}/>{ui("Intrekken")}</button></div>)}</div>
  </section>;
}
