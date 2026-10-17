'use client';
import {useState} from 'react';
import {useI18n} from '@/lib/i18n/provider';
import {errorText} from '../../../../packages/i18n/src/errors';
import {LegalMarkdown} from '../legal-markdown';
import type {LegalVersion} from '../../../../packages/contracts/src/legal';
export type LegalTranslationEdition={id:string;source_version_id:string;revision:string;title:string;summary:string;markdown:string;published_at:string|null};
type TranslationBundle={versions:LegalVersion[];translations?:LegalTranslationEdition[];canPublish:boolean};
export function LegalTranslations({bundle,onRefresh}:{bundle:TranslationBundle|null;onRefresh:()=>Promise<void>}){
 const {locale}=useI18n(),en=locale==='en';
 const [source,setSource]=useState(''),[revision,setRevision]=useState('en-1'),[title,setTitle]=useState(''),[summary,setSummary]=useState(''),[markdown,setMarkdown]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function action(input:unknown){setBusy(true);setError('');try{const r=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await r.json();if(!r.ok)throw new Error(errorText(data.code,locale,data.error));await onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const selected=bundle?.versions.find((v)=>v.id===source),translations=bundle?.translations?.filter(t=>t.source_version_id===source)??[];
 if(!bundle)return null;
 return <section className="legal-translations" style={{borderTop:'1px solid #365343',marginTop:28,paddingTop:20}}>
 <h2>{en?'English translations':'Engelse vertalingen'}</h2>
 <p>{en?'Link an English editorial revision to the same Dutch content version. A translation does not change the effective date or require renewed acceptance. Publish the source first.':'Koppel een Engelse redactionele revisie aan dezelfde Nederlandse inhoudsversie. Een vertaling wijzigt de ingangsdatum niet en vraagt geen nieuw akkoord. Publiceer eerst de bron.'}</p>
 {error&&<p role="alert">{error}</p>}
 <label>{en?'Dutch source version':'Nederlandse bronversie'}<select value={source} onChange={e=>{setSource(e.target.value);setTitle('');setSummary('');setMarkdown('');setRevision('en-1');}}><option value="">{en?'Choose a source':'Kies een bron'}</option>{bundle.versions.map((v)=><option key={v.id} value={v.id}>{v.title} · {v.version} · {v.publishedAt?(en?'Published':'Gepubliceerd'):(en?'Draft':'Werkversie')}</option>)}</select></label>
 {selected&&<><details><summary>{en?'Read the exact Dutch source':'Lees de exacte Nederlandse bron'}</summary><LegalMarkdown text={selected.markdown}/></details>
 <form onSubmit={e=>{e.preventDefault();void action({action:'translation',sourceVersionId:source,revision,title,summary,markdown,reason});}} style={{display:'grid',gap:12}}>
 <label>{en?'Translation revision':'Vertaalrevisie'}<input value={revision} onChange={e=>setRevision(e.target.value)} required maxLength={40}/></label>
 <label>{en?'English title':'Engelse titel'}<input lang="en" value={title} onChange={e=>setTitle(e.target.value)} required minLength={3} maxLength={150}/></label>
 <label>{en?'English summary':'Engelse samenvatting'}<textarea lang="en" value={summary} onChange={e=>setSummary(e.target.value)} required minLength={5} maxLength={2000}/></label>
 <label>{en?'Complete English text (Markdown)':'Volledige Engelse tekst (Markdown)'}<textarea lang="en" rows={18} value={markdown} onChange={e=>setMarkdown(e.target.value)} required minLength={50} maxLength={100000}/></label>
 <label>{en?'Reason and source check':'Reden en broncontrole'}<textarea value={reason} onChange={e=>setReason(e.target.value)} required minLength={5} maxLength={500}/></label>
 <button type="submit" disabled={busy}>{en?'Save translation draft':'Vertaalconcept opslaan'}</button></form>
 <ul>{translations.map((t)=><li key={t.id}><strong>{t.revision}</strong> · {t.published_at?(en?'Published':'Gepubliceerd'):(en?'Draft':'Werkversie')}
 <button type="button" onClick={()=>{setTitle(t.title);setSummary(t.summary);setMarkdown(t.markdown);setRevision(t.revision+'-next');}}>{en?'Edit as a new revision':'Bewerk als nieuwe revisie'}</button>
 {!t.published_at&&bundle.canPublish&&<button type="button" disabled={busy||reason.trim().length<5||!selected.publishedAt} onClick={()=>void action({action:'publish-translation',translationId:t.id,reason})}>{en?'Publish translation':'Vertaling publiceren'}</button>}</li>)}</ul>
 {!translations.some((t)=>t.published_at)&&<p role="status">{en?'This source version has no published English translation.':'Deze bronversie heeft geen gepubliceerde Engelse vertaling.'}</p>}</>}
 </section>;
}
