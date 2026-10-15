import {getLegalPublicBundle} from '../../../packages/data/src/legal';
import {legalPaths,legalTitles,type LegalDocumentKey} from '../../../packages/contracts/src/legal';
import {LegalMarkdown} from './legal-markdown';
import './legal.css';
export async function LegalDocumentPage({documentKey,versionId}:{documentKey:LegalDocumentKey;versionId?:string}){
 const bundle=await getLegalPublicBundle(),version=versionId?bundle.history.find(v=>v.key===documentKey&&v.id===versionId):bundle.current[documentKey];
 const history=bundle.history.filter(v=>v.key===documentKey);
 return <main className="dp-legal-page"><header><a href="/">DartsPoint</a><nav aria-label="Informatie"><a href="/algemene-voorwaarden">Voorwaarden</a><a href="/privacy">Privacy</a><a href="/handleiding">Handleiding</a><a href="/support">Support</a><a href="/contact">Contact</a></nav></header><article>
  {version?<><p className="dp-legal-version">Versie {version.version} · Gepubliceerd {new Date(version.publishedAt!).toLocaleDateString('nl-NL')} · Geldig vanaf {new Date(version.effectiveAt!).toLocaleDateString('nl-NL')}</p>{versionId&&<p><a href={legalPaths[documentKey]}>Bekijk de actuele versie</a></p>}<LegalMarkdown text={version.markdown}/><p><a download href={'/api/documents?download='+version.id}>Download deze tekst en versie (.md)</a></p></>:<><h1>{legalTitles[documentKey]}</h1><p>De informatie wordt voorbereid voor publicatie. Neem voor vragen contact op via <a href="mailto:support@dartspoint.nl">support@dartspoint.nl</a>.</p></>}
  {documentKey==='privacy'&&<p><a className="dp-legal-button" href="/support?topic=privacy&request=access">Privacyverzoek indienen</a></p>}
  {documentKey==='privacy'&&<p>Botbescherming: <a href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/" rel="noopener noreferrer">Cloudflare Turnstile Privacy Addendum</a>.</p>}
  {bundle.announcements.filter(v=>v.key===documentKey).map(v=><aside key={v.id}><h2>Aangekondigde wijziging: versie {v.version}</h2><p>{v.summary}</p><p>Ingangsdatum: {new Date(v.effectiveAt!).toLocaleDateString('nl-NL')} · <a href={legalPaths[documentKey]+'?version='+v.id}>Lees deze versie</a></p></aside>)}
  {!!history.length&&<details><summary>Eerdere en aangekondigde versies</summary><ul>{history.map(v=><li key={v.id}><a href={legalPaths[documentKey]+'?version='+v.id}>Versie {v.version}</a> · {new Date(v.effectiveAt!).toLocaleDateString('nl-NL')} · {v.summary}</li>)}</ul></details>}
 </article><footer>Ontwikkeld door <a href="/contact">DG Webservices</a> · <a href="/support">Help en tickets</a></footer></main>;
}
