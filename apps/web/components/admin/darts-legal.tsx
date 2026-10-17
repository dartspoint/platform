'use client';
import {runtimeFeedback} from "../../../../packages/i18n/src/feedback";

import {FixedCopy} from "@/components/fixed-copy";
import {browserLocale} from '../../../../packages/i18n/src/errors';
import {formatLocales} from '../../../../packages/i18n/src/locale';

import {LegalTranslations,type LegalTranslationEdition} from './legal-translations';
import {localiseStaticCopy} from "../../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LegalMarkdown} from '@/components/legal-markdown';
import {companyDetails,legalTitles,legalPaths,legalDraftSchema,legalPublishSchema,type LegalVersion,type LegalDocumentKey} from '../../../../packages/contracts/src/legal';
import '../legal.css';

type Bundle={company:typeof companyDetails;canPublish:boolean;isOwner:boolean;environment:string;versions:LegalVersion[];translations?:LegalTranslationEdition[]};
type Draft={key:LegalDocumentKey;title:string;version:string;language:'nl';markdown:string;summary:string;material:boolean;requiresAcceptance:boolean;reason:string};
type FormKey='draft'|'publish'|'publisher'|'company';
type Feedback={tone:'success'|'error'|'warning'|'pending';message:string;fields?:Record<string,string>};
function newDraft(key:LegalDocumentKey):Draft{return {key,title:legalTitles[key],version:'',language:'nl',markdown:'',summary:'',material:false,requiresAcceptance:false,reason:''};}
function formatDate(value:string|null){return value?new Date(value).toLocaleString(formatLocales[browserLocale()],{dateStyle:'medium',timeStyle:'short'}):runtimeFeedback("feedback.nog_niet_ingepland");}
function validationFields(issues:readonly {path:PropertyKey[];message:string}[]){
 const messages:Record<string,string>={title:runtimeFeedback("feedback.vul_een_titel_in_van_3_tot_150"),version:runtimeFeedback("feedback.vul_een_versienummer_in_van_maximaal_40_tekens"),markdown:runtimeFeedback("feedback.vul_50_tot_100_000_tekens_documenttekst_in"),summary:runtimeFeedback("feedback.vul_een_wijzigingssamenvatting_in_van_5_tot_2"),reason:runtimeFeedback("feedback.vul_een_reden_in_van_5_tot_500"),exceptionReason:runtimeFeedback("feedback.geef_een_uitleg_van_10_tot_1_000"),effectiveAt:runtimeFeedback("feedback.kies_een_geldige_ingangsdatum_en_tijd")};
const messagesStaticSource = messages;
 const fields:Record<string,string>={};for(const issue of issues){const key=String(issue.path[0]??'document');fields[key]=messages[key]??'Controleer de ingevulde gegevens.';}return fields;
}
class RequestFailure extends Error{constructor(message:string,readonly uncertain=false){super(message);}}
async function documentsRequest(method:'GET'|'POST',payload?:unknown){
 const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(method==='GET'?'/api/documents?admin=1':'/api/documents',{method,cache:'no-store',signal:controller.signal,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});
  let data:any;try{data=await response.json();}catch{
   // A successful POST status already confirms the mutation. A failure to load
   // its body or to refresh the list must not invite a duplicate save.
   if(response.ok&&method==='POST')return null;
   throw new RequestFailure(runtimeFeedback("feedback.de_server_gaf_geen_leesbare_reactie_probeer_het"));
  }
  if(!response.ok)throw new RequestFailure(typeof data?.error==='string'?data.error:runtimeFeedback("feedback.de_wijziging_kon_niet_worden_opgeslagen_probeer_het"));return data;
 }catch(error){
  if(error instanceof RequestFailure)throw error;
  throw new RequestFailure(method==='POST'?runtimeFeedback("feedback.geen_bevestiging_ontvangen_je_invoer_is_bewaard_vernieuw"):runtimeFeedback("feedback.de_documenten_konden_niet_worden_geladen_controleer_je"),method==='POST');
 }finally{window.clearTimeout(timer);}
}
async function loadDocuments():Promise<Bundle>{const data=await documentsRequest('GET');if(!data||!Array.isArray(data.versions)||!data.company||typeof data.environment!=='string')throw new RequestFailure(runtimeFeedback("feedback.het_documentenoverzicht_kon_niet_worden_geladen_probeer_het"));return data;}
function FormFeedback({form,feedback}:{form:FormKey;feedback?:Feedback}){
 return <div id={`legal-${form}-feedback`} tabIndex={-1} className={`dp-legal-feedback${feedback?` is-${feedback.tone}`:''}`} role={feedback?.tone==='error'?'alert':'status'} aria-live="polite" aria-atomic="true">{feedback&&<><p>{feedback.message}</p>{feedback.fields&&<ul>{Object.entries(feedback.fields).map(([field,message])=><li key={field}><a href={`#legal-${form}-${field}`} onClick={event=>{event.preventDefault();window.document.getElementById(`legal-${form}-${field}`)?.focus();}}>{message}</a></li>)}</ul>}</>}</div>;
}

export function DartsLegal(){
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("legal").t;

 const [bundle,setBundle]=useState<Bundle|null>(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[loadError,setLoadError]=useState('');
 const [document,setDocument]=useState<LegalDocumentKey>('terms'),[drafts,setDrafts]=useState<Record<LegalDocumentKey,Draft>>({terms:newDraft('terms'),privacy:newDraft('privacy'),guide:newDraft('guide')}),[savedDrafts,setSavedDrafts]=useState<Partial<Record<LegalDocumentKey,string>>>({});
 const [feedback,setFeedback]=useState<Partial<Record<FormKey,Feedback>>>({}),[latest,setLatest]=useState<Feedback|null>(null),[busy,setBusy]=useState<FormKey|null>(null),[uncertain,setUncertain]=useState(false),[preview,setPreview]=useState(false);
 const [selected,setSelected]=useState(''),[effectiveAt,setEffectiveAt]=useState(''),[exceptionReason,setExceptionReason]=useState(''),[publishReason,setPublishReason]=useState('');
 const [publisher,setPublisher]=useState({userId:'',enabled:true,reason:''});
 const [company,setCompany]=useState(companyDetails),[companyReason,setCompanyReason]=useState('');
 const pending=useRef(false),editor=useRef<HTMLFormElement>(null);
 const draft=drafts[document],blocked=!!busy||refreshing||uncertain,versions=bundle?.versions.filter(version=>version.key===document)??[],selectedVersion=versions.find(version=>version.id===selected),draftUnchanged=savedDrafts[document]===JSON.stringify(draft);
 useEffect(()=>{let active=true;loadDocuments().then(data=>{if(active){setBundle(data);setCompany(data.company);}}).catch(error=>{if(active)setLoadError(error.message);}).finally(()=>{if(active)setLoading(false);});return ()=>{active=false;};},[]);
 function report(form:FormKey,value:Feedback,focus=false){setFeedback(current=>({...current,[form]:value}));setLatest(value);if(focus)requestAnimationFrame(()=>{const node=window.document.getElementById(`legal-${form}-feedback`)??window.document.getElementById('legal-global-feedback');node?.focus();node?.scrollIntoView({block:'nearest',behavior:'smooth'});});}
 function setDraft(next:Draft){setDrafts(current=>({...current,[document]:next}));}
 async function refresh(){
  if(pending.current)return;pending.current=true;setRefreshing(true);setLoadError('');
  try{const data=await loadDocuments();setBundle(data);if(!bundle)setCompany(data.company);setUncertain(false);setLatest({tone:'success',message:dpFeedback("feedback.het_overzicht_is_bijgewerkt_controleer_de_versies_voordat")});}catch(error){setLoadError((error as Error).message);}finally{setRefreshing(false);setLoading(false);pending.current=false;}
 }
 async function action(form:FormKey,payload:unknown,message:string,onSaved?:()=>void){
  if(pending.current||uncertain)return;pending.current=true;setBusy(form);report(form,{tone:'pending',message:dpFeedback("feedback.bezig_met_opslaan")});
  try{await documentsRequest('POST',payload);onSaved?.();report(form,{tone:'success',message},form==='publish');try{setBundle(await loadDocuments());setLoadError('');}catch{report(form,{tone:'warning',message:`${message} Het overzicht kon daarna niet worden bijgewerkt. Je wijziging is opgeslagen; gebruik ‘Overzicht vernieuwen’ om de nieuwe versie te zien.`},form==='publish');}}
  catch(error){if(error instanceof RequestFailure&&error.uncertain)setUncertain(true);report(form,{tone:'error',message:(error as Error).message},true);}finally{setBusy(null);pending.current=false;}
 }
 function submitDraft(event:FormEvent){
  event.preventDefault();const parsed=legalDraftSchema.safeParse(draft);
  if(!parsed.success){report('draft',{tone:'error',message:dpFeedback("feedback.de_werkversie_is_nog_niet_opgeslagen_controleer_de"),fields:validationFields(parsed.error.issues)},true);return;}
  if(parsed.data.key==='terms'&&parsed.data.requiresAcceptance&&!parsed.data.material&&bundle?.versions.some(version=>version.key==='terms'&&version.publishedAt)){report('draft',{tone:'error',message:dpFeedback("feedback.de_werkversie_is_nog_niet_opgeslagen_een_tekstcorrectie")},true);return;}
  void action('draft',{action:'draft',...parsed.data},`${legalTitles[draft.key]} ${parsed.data.version} is opgeslagen als interne werkversie. Publiceer de versie wanneer deze klaar is.`,()=>setSavedDrafts(current=>({...current,[draft.key]:JSON.stringify(draft)})));
 }
 function submitPublish(event:FormEvent){
  event.preventDefault();const timestamp=new Date(effectiveAt),parsed=legalPublishSchema.safeParse({versionId:selected,effectiveAt:Number.isFinite(timestamp.getTime())?timestamp.toISOString():'',...(exceptionReason.trim()?{exceptionReason}:{}),reason:publishReason});
  if(!parsed.success){report('publish',{tone:'error',message:dpFeedback("feedback.de_versie_is_nog_niet_gepubliceerd_controleer_de"),fields:validationFields(parsed.error.issues)},true);return;}
  void action('publish',{action:'publish',...parsed.data},dpFeedback("feedback.de_versie_is_gepubliceerd_vanaf_de_gekozen_ingangsdatum"),()=>setSelected(''));
 }
 function copy(version:LegalVersion){
  const current=drafts[version.key];if((current.markdown||current.version||current.summary||current.reason)&&!window.confirm(dpFeedback("feedback.je_hebt_al_een_werktekst_voor_dit_document")))return;
  setDocument(version.key);setDrafts(current=>({...current,[version.key]:{...newDraft(version.key),title:version.title,markdown:version.markdown}}));setPreview(false);setSelected('');report('draft',{tone:'success',message:`Versie ${version.version} is gekopieerd. Kies een nieuw versienummer en beschrijf je wijzigingen.`});requestAnimationFrame(()=>{editor.current?.scrollIntoView({block:'start',behavior:'smooth'});window.document.getElementById('legal-draft-version')?.focus();});
 }
 function submitPublisher(event:FormEvent){event.preventDefault();const fields:Record<string,string>={};if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publisher.userId))fields.userId='Vul een geldige gebruikers-ID in.';if(publisher.reason.trim().length<5||publisher.reason.trim().length>500)fields.reason='Vul een reden in van 5 tot 500 tekens.';if(Object.keys(fields).length){report('publisher',{tone:'error',message:dpFeedback("feedback.de_machtiging_is_nog_niet_opgeslagen_controleer_de"),fields},true);return;}void action('publisher',{action:'publisher',...publisher,reason:publisher.reason.trim()},dpFeedback("feedback.de_publicatiemachtiging_is_bijgewerkt"));}
 function submitCompany(event:FormEvent){
  event.preventDefault();const fields:Record<string,string>={};for(const [key,min,max] of [['name',2,150],['address',3,150],['postalCode',4,20],['city',2,100]] as const){const length=company[key].trim().length;if(length<min||length>max)fields[key]=`Vul ${min} tot ${max} tekens in voor ${key==='name'?'de bedrijfsnaam':key==='address'?'het adres':key==='postalCode'?'de postcode':'de plaats'}.`;}
  if(!/^\d{8}$/.test(company.chamberOfCommerce))fields.chamberOfCommerce='Vul het KvK-nummer van 8 cijfers in.';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)||company.email.length>254)fields.email='Vul een geldig e-mailadres in.';if(companyReason.trim().length<5||companyReason.trim().length>500)fields.reason='Vul een reden in van 5 tot 500 tekens.';
  if(Object.keys(fields).length){report('company',{tone:'error',message:dpFeedback("feedback.de_contactgegevens_zijn_nog_niet_opgeslagen_controleer_de"),fields},true);return;}
  const trimmed={...company,name:company.name.trim(),address:company.address.trim(),postalCode:company.postalCode.trim(),city:company.city.trim()};void action('company',{action:'company',company:trimmed,reason:companyReason.trim()},dpFeedback("feedback.de_contactgegevens_zijn_gepubliceerd_eerdere_gegevens_blijven_in"),()=>setCompany(trimmed));
 }
 const draftField=(key:string)=>({'aria-invalid':!!feedback.draft?.fields?.[key],'aria-describedby':feedback.draft?.fields?.[key]?'legal-draft-feedback':undefined});
 return <section className="dp-legal-editor" aria-labelledby="legal-editor-title">
  <header className="dp-legal-heading"><div><h2 id="legal-editor-title">{dpT("legal.juridisch_en_informatie")}</h2><p>{dpT("legal.beheer_je_documenten_in_twee_stappen_sla_eerst")}</p></div><button type="button" onClick={()=>void refresh()} disabled={!!busy||refreshing}>{refreshing?dpT("legal.overzicht_laden"):dpT("legal.overzicht_vernieuwen")}</button></header>
  <div id="legal-global-feedback" tabIndex={-1} className={`dp-legal-feedback dp-legal-global${latest?` is-${latest.tone}`:''}`} aria-live="polite" aria-atomic="true">{latest?.message}</div>
  {loadError&&<div className="dp-legal-feedback is-error" role="alert">{loadError} {dpT("legal.je_ingevulde_tekst_blijft_bewaard")}</div>}
  {loading?<p role="status">{dpT("legal.documenten_laden")}</p>:!bundle?<p>{dpT("legal.het_overzicht_is_nog_niet_beschikbaar_kies_overzicht")}</p>:<>
   <nav className="dp-legal-tabs" aria-label={dpT("legal.document_kiezen")}>{(Object.keys(legalTitles) as LegalDocumentKey[]).map(key=><button type="button" key={key} aria-pressed={document===key} disabled={!!busy||refreshing} onClick={()=>{setDocument(key);setSelected('');setPreview(false);setFeedback(current=>({...current,draft:undefined,publish:undefined}));}}>{legalTitles[key]}</button>)}</nav>
   <div className="dp-legal-document-heading"><div><h3>{legalTitles[document]}</h3><p>{legalPaths[document]} {dpT("legal.nederlands")}</p></div><span>{versions.filter(version=>!version.publishedAt).length} {dpT("legal.werkversie_s")}</span></div>
   <form ref={editor} data-testid="legal-draft-form" aria-label={dpT("legal.werkversie_bewerken")} noValidate onSubmit={submitDraft} aria-busy={busy==='draft'} className="dp-legal-card">
    <h3>{dpT("legal.1_werkversie_bewerken")}</h3><p>{dpT("legal.je_tekst_blijft_intern_totdat_je_een_opgeslagen")}</p>
    <fieldset disabled={blocked}><div className="dp-legal-field-grid"><label htmlFor="legal-draft-title">{dpT("legal.titel")}<input id="legal-draft-title" aria-label={dpT("legal.titel")} value={draft.title} required maxLength={150} {...draftField('title')} onChange={event=>setDraft({...draft,title:event.target.value})}/></label><label htmlFor="legal-draft-version">{dpT("legal.nieuw_versienummer")}<input id="legal-draft-version" aria-label={dpT("legal.nieuw_versienummer")} value={draft.version} placeholder={dpT("legal.bijvoorbeeld_2_1")} required maxLength={40} {...draftField('version')} onChange={event=>setDraft({...draft,version:event.target.value})}/><small>{dpT("legal.gebruik_letters_cijfers_punten_streepjes_of_underscores")}</small></label></div>
     <label htmlFor="legal-draft-markdown">{dpT("legal.documenttekst_markdown")}<textarea id="legal-draft-markdown" aria-label={dpT("legal.documenttekst_markdown")} value={draft.markdown} required maxLength={100000} {...draftField('markdown')} onChange={event=>setDraft({...draft,markdown:event.target.value})}/><small>{dpT("legal.minimaal_50_tekens_je_kunt_koppen_lijsten_links")}</small></label>
     <div className="dp-legal-actions"><button type="button" className="dp-legal-secondary" onClick={()=>setPreview(!preview)} aria-expanded={preview}>{preview?dpT("legal.voorbeeld_sluiten"):dpT("legal.voorbeeld_tonen")}</button></div>{preview&&<div className="dp-legal-preview"><LegalMarkdown text={draft.markdown}/></div>}
     <label htmlFor="legal-draft-summary">{dpT("legal.wijzigingssamenvatting")}<textarea id="legal-draft-summary" className="dp-legal-short-text" value={draft.summary} required minLength={5} maxLength={2000} {...draftField('summary')} onChange={event=>setDraft({...draft,summary:event.target.value})}/><small>{dpT("legal.vertel_kort_wat_er_voor_spelers_verandert_minimaal")}</small></label>
     <label className="dp-legal-check"><input type="checkbox" checked={draft.material} onChange={event=>setDraft({...draft,material:event.target.checked,requiresAcceptance:event.target.checked?draft.requiresAcceptance:false})}/>{dpT("legal.dit_is_een_wezenlijke_inhoudelijke_wijziging")}</label><small>{dpT("legal.hiervoor_geldt_normaal_een_aankondigingstermijn_van_minimaal_30")}</small>
     {document==='terms'&&<label className="dp-legal-check"><input type="checkbox" checked={draft.requiresAcceptance} onChange={event=>setDraft({...draft,requiresAcceptance:event.target.checked})}/>{dpT("legal.spelers_moeten_de_nieuwe_voorwaarden_opnieuw_aanvaarden")}</label>}
     <label htmlFor="legal-draft-reason">{dpT("legal.reden_voor_het_beheerlog")}<input id="legal-draft-reason" aria-label={dpT("legal.reden_voor_het_beheerlog")} value={draft.reason} required minLength={5} maxLength={500} {...draftField('reason')} onChange={event=>setDraft({...draft,reason:event.target.value})}/><small>{dpT("legal.bijvoorbeeld_contactgegevens_bijgewerkt_minimaal_5_tekens")}</small></label>
    </fieldset><div className="dp-legal-submit"><button type="submit" disabled={blocked||draftUnchanged}>{busy==='draft'?dpT("legal.werkversie_opslaan"):draftUnchanged?dpT("legal.werkversie_opgeslagen"):dpT("legal.werkversie_opslaan_2")}</button><FormFeedback form="draft" feedback={feedback.draft}/></div>
   </form>
   <section className="dp-legal-card" aria-label={dpT("legal.versieoverzicht")}><h3 id="legal-versions-title">{dpT("legal.2_versies_en_publicatie")}</h3><p>{dpT("legal.alleen_versies_van")} {legalTitles[document].toLowerCase()} {dpT("legal.staan_hieronder")}</p>
    {!versions.length?<p>{dpT("legal.voor_dit_document_zijn_nog_geen_versies_opgeslagen")}</p>:<div className="dp-legal-versions">{versions.map(version=><article className="dp-legal-version-card" key={version.id}><div className="dp-legal-version-heading"><strong>{version.title} · <span>{version.version}</span></strong><span className={version.publishedAt?'dp-legal-badge is-published':'dp-legal-badge'}>{version.publishedAt?(new Date(version.effectiveAt!).getTime()>Date.now()?dpT("legal.aangekondigd"):dpT("legal.gepubliceerd")):dpT("legal.werkversie")}</span></div><p>{version.summary}</p><small>{version.publishedAt?dpT("legal.ingangsdatum",{value0:formatDate(version.effectiveAt)}):dpT("legal.opgeslagen",{value0:formatDate(version.createdAt)})}</small><div className="dp-legal-actions"><button type="button" className="dp-legal-secondary" disabled={blocked} onClick={()=>copy(version)}>{dpT("legal.bewerk_als_nieuwe_versie")}</button>{!version.publishedAt&&bundle.canPublish&&<button type="button" disabled={blocked} onClick={()=>{setSelected(version.id);setEffectiveAt('');setExceptionReason('');setPublishReason('');setFeedback(current=>({...current,publish:undefined}));}}>{dpT("legal.publiceren_voorbereiden")}</button>}</div><details><summary>{dpT("legal.documenttekst_bekijken")}</summary><LegalMarkdown text={version.markdown}/></details></article>)}</div>}
    {!bundle.canPublish&&<p>{dpT("legal.je_kunt_werkversies_opslaan_een_eigenaar_of_gemachtigde")}</p>}
   </section>
   {selectedVersion&&bundle.canPublish&&<form className="dp-legal-card" aria-label={dpT("legal.publicatie_bevestigen")} noValidate onSubmit={submitPublish} aria-busy={busy==='publish'}><h3>{dpT("legal.publicatie_bevestigen_2")} {selectedVersion.version}</h3><p>{dpT("legal.na_publicatie_blijft_deze_versie_bewaard_een_latere")}</p><fieldset disabled={blocked}><label htmlFor="legal-publish-effectiveAt">{dpT("legal.ingangsdatum_en_tijd")}<input id="legal-publish-effectiveAt" type="datetime-local" required value={effectiveAt} onChange={event=>setEffectiveAt(event.target.value)}/></label><label htmlFor="legal-publish-exceptionReason">{dpT("legal.uitleg_bij_een_kortere_aankondigingstermijn_optioneel")}<textarea id="legal-publish-exceptionReason" className="dp-legal-short-text" value={exceptionReason} maxLength={1000} onChange={event=>setExceptionReason(event.target.value)}/><small>{dpT("legal.alleen_voor_een_noodzakelijke_wettelijke_of_beveiligingsuitzondering")}</small></label><label htmlFor="legal-publish-reason">{dpT("legal.reden_voor_publicatie")}<input id="legal-publish-reason" required minLength={5} maxLength={500} value={publishReason} onChange={event=>setPublishReason(event.target.value)}/></label></fieldset><div className="dp-legal-submit"><div className="dp-legal-actions"><button disabled={blocked}>{busy==='publish'?dpT("legal.versie_publiceren"):dpT("legal.versie_publiceren_2")}</button><button type="button" className="dp-legal-secondary" disabled={blocked} onClick={()=>setSelected('')}>{dpT("legal.annuleren")}</button></div><FormFeedback form="publish" feedback={feedback.publish}/></div></form>}
   {bundle.canPublish&&<details className="dp-legal-card dp-legal-advanced"><summary>{dpT("legal.bedrijfs_en_contactgegevens")}</summary><form aria-label={dpT("legal.contactgegevens_bewerken")} noValidate onSubmit={submitCompany} aria-busy={busy==='company'}><p>{dpT("legal.deze_gegevens_worden_bij_de_gepubliceerde_documenten_getoond")}</p><fieldset disabled={blocked}><div className="dp-legal-field-grid">{([['name','Bedrijfsnaam',150],['address','Adres',150],['postalCode','Postcode',20],['city','Plaats',100],['chamberOfCommerce','KvK-nummer',8],['email','Bedrijfse-mail',254]] as const).map(([key,label,maxLength])=><label htmlFor={`legal-company-${key}`} key={key}><FixedCopy value={label}/><input id={`legal-company-${key}`} type={key==='email'?'email':'text'} required maxLength={maxLength} value={company[key]} onChange={event=>setCompany({...company,[key]:event.target.value})}/></label>)}</div><p>{dpT("legal.supportadres_support_dartspoint_nl")}</p><label htmlFor="legal-company-reason">{dpT("legal.reden_voor_de_wijziging")}<input id="legal-company-reason" required minLength={5} maxLength={500} value={companyReason} onChange={event=>setCompanyReason(event.target.value)}/></label></fieldset><div className="dp-legal-submit"><button disabled={blocked}>{busy==='company'?dpT("legal.contactgegevens_opslaan"):dpT("legal.contactgegevens_publiceren")}</button><FormFeedback form="company" feedback={feedback.company}/></div></form></details>}
   {bundle.isOwner&&<details className="dp-legal-card dp-legal-advanced"><summary>{dpT("legal.publicatiemachtigingen")}</summary><p>{dpT("legal.huidige_omgeving")} <strong>{bundle.environment==='production'?dpT("legal.productie"):bundle.environment==='staging'?dpT("legal.staging"):bundle.environment}</strong>{dpT("legal.geef_een_bestaande_eigenaar_of_beheerder_toestemming_om")}</p><form aria-label={dpT("legal.publicatiemachtiging_bewerken")} noValidate onSubmit={submitPublisher} aria-busy={busy==='publisher'}><fieldset disabled={blocked}><label htmlFor="legal-publisher-userId">{dpT("legal.gebruikers_id")}<input id="legal-publisher-userId" value={publisher.userId} required onChange={event=>setPublisher({...publisher,userId:event.target.value})}/></label><label className="dp-legal-check"><input type="checkbox" checked={publisher.enabled} onChange={event=>setPublisher({...publisher,enabled:event.target.checked})}/>{dpT("legal.publiceren_toestaan")}</label><label htmlFor="legal-publisher-reason">{dpT("legal.reden")}<input id="legal-publisher-reason" required minLength={5} maxLength={500} value={publisher.reason} onChange={event=>setPublisher({...publisher,reason:event.target.value})}/></label></fieldset><div className="dp-legal-submit"><button disabled={blocked}>{busy==='publisher'?dpT("legal.machtiging_opslaan"):dpT("legal.machtiging_opslaan_2")}</button><FormFeedback form="publisher" feedback={feedback.publisher}/></div></form></details>}
  </>}
 <LegalTranslations bundle={bundle} onRefresh={refresh}/>
 </section>;
}
export default DartsLegal;

const dpStaticCopyKeys={
  "Vul een titel in van 3 tot 150 tekens.": "legal.copy_vul_een_titel_in_van_3_tot_150"
};
