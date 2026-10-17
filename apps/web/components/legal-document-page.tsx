import {LanguagePicker} from './language-picker';
import {getServerI18n} from '@/lib/i18n/server';
import {getLegalPublicBundle} from '../../../packages/data/src/legal';
import {legalPaths,legalTitles,type LegalDocumentKey} from '../../../packages/contracts/src/legal';
import {LegalMarkdown} from './legal-markdown';
import './legal.css';
export async function LegalDocumentPage({documentKey,versionId}:{documentKey:LegalDocumentKey;versionId?:string}){
 const {t:dpT,locale}=await getServerI18n("legalDocumentPage");
 const shared=(await getServerI18n()).t;

 const bundle=await getLegalPublicBundle(locale),version=versionId?bundle.history.find(v=>v.key===documentKey&&v.id===versionId):bundle.current[documentKey];
 const history=bundle.history.filter(v=>v.key===documentKey);
 return <main className="dp-legal-page"><header><LanguagePicker/><a href={'/'+locale}>{dpT("legalDocumentPage.dartspoint")}</a><nav aria-label={dpT("legalDocumentPage.informatie")}><a href={'/'+locale+'/algemene-voorwaarden'}>{dpT("legalDocumentPage.voorwaarden")}</a><a href={'/'+locale+'/privacy'}>{dpT("legalDocumentPage.privacy")}</a><a href={'/'+locale+'/handleiding'}>{dpT("legalDocumentPage.handleiding")}</a><a href={'/'+locale+'/support'}>{dpT("legalDocumentPage.support")}</a><a href={'/'+locale+'/contact'}>{dpT("legalDocumentPage.contact")}</a></nav></header><article>
  {version?<><p className="dp-legal-version">{dpT("legalDocumentPage.versie")} {version.version} {dpT("legalDocumentPage.gepubliceerd")} {new Date(version.publishedAt!).toLocaleDateString(locale==='en'?'en-GB':'nl-NL')} {dpT("legalDocumentPage.geldig_vanaf")} {new Date(version.effectiveAt!).toLocaleDateString(locale==='en'?'en-GB':'nl-NL')}</p>{versionId&&<p><a href={'/'+locale+legalPaths[documentKey]}>{dpT("legalDocumentPage.bekijk_de_actuele_versie")}</a></p>}<LegalMarkdown text={version.markdown}/><p><a download href={'/api/documents?locale='+locale+'&download='+version.id}>{dpT("legalDocumentPage.download_deze_tekst_en_versie_md")}</a></p></>:<><h1>{locale==='en'?{terms:'Terms and conditions',privacy:'Privacy notice',guide:'Player guide'}[documentKey]:legalTitles[documentKey]}</h1>{locale==='en'&&bundle.missing.some(v=>v.key===documentKey)&&<p>{shared('legal.translationUnavailable')} <a href={'/nl'+legalPaths[documentKey]}>{shared('legal.original')}</a></p>}<p>{dpT("legalDocumentPage.de_informatie_wordt_voorbereid_voor_publicatie_neem_voor")} <a href="mailto:support@dartspoint.nl">{dpT("legalDocumentPage.support_dartspoint_nl")}</a>.</p></>}
  {documentKey==='privacy'&&<p><a className="dp-legal-button" href={'/'+locale+'/support?topic=privacy&request=access'}>{dpT("legalDocumentPage.privacyverzoek_indienen")}</a></p>}
  {documentKey==='privacy'&&<p>{dpT("legalDocumentPage.botbescherming")} <a href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/" rel="noopener noreferrer">{dpT("legalDocumentPage.cloudflare_turnstile_privacy_addendum")}</a>.</p>}
  {bundle.announcements.filter(v=>v.key===documentKey).map(v=><aside key={v.id}><h2>{dpT("legalDocumentPage.aangekondigde_wijziging_versie")} {v.version}</h2><p>{v.summary}</p><p>{dpT("legalDocumentPage.ingangsdatum")} {new Date(v.effectiveAt!).toLocaleDateString(locale==='en'?'en-GB':'nl-NL')} · <a href={'/'+locale+legalPaths[documentKey]+'?version='+v.id}>{dpT("legalDocumentPage.lees_deze_versie")}</a></p></aside>)}
  {!!history.length&&<details><summary>{dpT("legalDocumentPage.eerdere_en_aangekondigde_versies")}</summary><ul>{history.map(v=><li key={v.id}><a href={'/'+locale+legalPaths[documentKey]+'?version='+v.id}>{dpT("legalDocumentPage.versie")} {v.version}</a> · {new Date(v.effectiveAt!).toLocaleDateString(locale==='en'?'en-GB':'nl-NL')} · {v.summary}</li>)}</ul></details>}
 </article><footer>{dpT("legalDocumentPage.ontwikkeld_door")} <a href={'/'+locale+'/contact'}>{dpT("legalDocumentPage.dg_webservices")}</a> · <a href={'/'+locale+'/support'}>{dpT("legalDocumentPage.help_en_tickets")}</a></footer></main>;
}
