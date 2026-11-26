"use client";

import {useState, type FormEvent} from 'react';
import {Archive, Check, Plus, RotateCcw, Save} from 'lucide-react';
import {blogUi as ui} from './blog-ui';

export type BlogTaxonomyRecord = {id: string; name: string; active: boolean};
export type BlogTaxonomy = {authors: BlogTaxonomyRecord[]; categories: BlogTaxonomyRecord[]};
type Kind = 'author' | 'category';
type Command = {kind: Kind; action: 'create'; name: string} | {kind: Kind; action: 'update'; id: string; name?: string; active?: boolean} | {kind: Kind; action: 'archive'; id: string};

export function BlogTaxonomyManager({value, onChange, disabled = false}: {value: BlogTaxonomy; onChange: (value: BlogTaxonomy) => void; disabled?: boolean}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [newNames, setNewNames] = useState({author: '', category: ''});

  async function save(command: Command) {
    if (busy || disabled) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const response = await fetch('/api/blog-admin/taxonomy', {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(command)});
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {TAXONOMY_CONFLICT: 'Deze naam is al in gebruik. Kies een andere naam.', TAXONOMY_NOT_FOUND: 'Deze auteur of categorie bestaat niet meer. Laad het overzicht opnieuw.', INVALID_TAXONOMY: 'Vul een geldige naam in en controleer je selectie.'};
        throw new Error(messages[result.code] ?? result.message ?? result.error ?? 'De wijziging kon niet worden opgeslagen.');
      }
      onChange(result as BlogTaxonomy);
      if (command.action === 'create') setNewNames(current => ({...current, [command.kind]: ''}));
      else setNames(current => { const next = {...current}; delete next[command.kind + ':' + command.id]; return next; });
      setFeedback(command.action === 'archive' ? 'Gearchiveerd. Bestaande artikelen behouden hun selectie.' : 'Auteurs en categorieën bijgewerkt.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'De wijziging kon niet worden opgeslagen.'); }
    finally { setBusy(false); }
  }

  function create(event: FormEvent, kind: Kind) {
    event.preventDefault();
    const name = newNames[kind].trim();
    if (name) void save({kind, action: 'create', name});
  }

  return <details className="adm-panel dpba-panel dpba-taxonomies">
    <summary>{ui('Auteurs en categorieën beheren')}</summary>
    <p className="dpba-help">{ui('Voeg namen toe of wijzig ze. Gearchiveerde keuzes blijven bij bestaande artikelen bewaard en zijn niet beschikbaar voor nieuwe selecties.')}</p>
    {error && <p className="dpba-notice dpba-notice--error" role="alert">{ui(error)}</p>}
    {feedback && <p className="dpba-notice dpba-notice--success" role="status"><Check size={16}/>{ui(feedback)}</p>}
    <div className="dpba-taxonomy-grid">{(['author', 'category'] as const).map(kind => <section key={kind}>
      <h3>{ui(kind === 'author' ? 'Auteurs' : 'Categorieën')}</h3>
      <div className="dpba-taxonomy-list">{(kind === 'author' ? value.authors : value.categories).map(record => {
        const key = kind + ':' + record.id, name = names[key] ?? record.name;
        return <form key={record.id} className="dpba-taxonomy-row" onSubmit={event => {event.preventDefault(); if (name.trim()) void save({kind, action: 'update', id: record.id, name: name.trim()});}}>
          <label className="dpba-field"><span>{record.active ? ui('Naam') : ui('Gearchiveerd')}</span><input aria-label={ui(kind === 'author' ? 'Naam auteur: {name}' : 'Naam categorie: {name}', {name: record.name})} value={name} maxLength={100} disabled={busy || disabled} onChange={event => setNames(current => ({...current, [key]: event.target.value}))}/></label>
          <button className="adm-btn" type="submit" disabled={busy || disabled || !name.trim() || name.trim() === record.name} aria-label={ui('{name} opslaan', {name: record.name})}><Save size={14}/>{ui('Opslaan')}</button>
          <button className="adm-btn" type="button" disabled={busy || disabled} onClick={() => void save(record.active ? {kind, action: 'archive', id: record.id} : {kind, action: 'update', id: record.id, active: true})}>{record.active ? <Archive size={14}/> : <RotateCcw size={14}/>} {ui(record.active ? 'Archiveren' : 'Herstellen')}</button>
        </form>;
      })}</div>
      <form className="dpba-taxonomy-create" onSubmit={event => create(event, kind)}><label className="dpba-field"><span>{ui(kind === 'author' ? 'Nieuwe auteur' : 'Nieuwe categorie')}</span><input value={newNames[kind]} maxLength={100} disabled={busy || disabled} onChange={event => setNewNames(current => ({...current, [kind]: event.target.value}))}/></label><button className="adm-btn" type="submit" disabled={busy || disabled || !newNames[kind].trim()}><Plus size={14}/>{ui('Toevoegen')}</button></form>
    </section>)}</div>
  </details>;
}
