import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {publicPaths} from '../packages/i18n/src/locale.ts';
import {IntlMessageFormat} from 'intl-messageformat';

// This presentation adapter never reads or changes scoring, input or timers.
// The original, source-protected offline game script is included byte for byte.
function presentOffline(catalogs,publicPaths,scoreForms){
 const preference=document.cookie.match(/(?:^|;\s*)dp-ui-locale=(nl|en)(?:;|$)/)?.[1]??document.cookie.match(/(?:^|;\s*)dp-locale=(nl|en)(?:;|$)/)?.[1];
 const prefix=/^\/(nl|en)(?:\/|$)/.exec(location.pathname)?.[1];
 const domain=location.hostname.endsWith('dartspoint.app')?'en':'nl';
 const locale=prefix??(publicPaths.includes(location.pathname)?domain:preference??domain);
 document.documentElement.lang=locale;
 const nl=catalogs.nl,active=catalogs[locale],formatLocale=locale==='en'?'en-GB':'nl-NL',plural=new Intl.PluralRules(formatLocale),numbers=new Intl.NumberFormat(formatLocale);
 const direct=new Map(Object.keys(nl).filter(key=>key!=='offline.scored').map(key=>[nl[key],active[key]]));
 function translated(source){
  if(direct.has(source))return direct.get(source);
  const scored=/^((?:[TD]?\d+|BULL|MIS)) · (\d+) punten\. Stop je volgende richting\.$/.exec(source);
  return scored?(scoreForms[locale][plural.select(Number(scored[2]))]??scoreForms[locale].other).replace('{label}',direct.get(scored[1])??scored[1]).replace('{score}',numbers.format(Number(scored[2]))):source;
 }
 document.title=active['offline.title'];
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode())if(!['SCRIPT','STYLE'].includes(walker.currentNode.parentElement?.tagName))nodes.push(walker.currentNode);
 for(const node of nodes){const text=node.textContent,trimmed=text.trim(),next=translated(trimmed);if(next!==trimmed)node.textContent=text.replace(trimmed,next);}
 function accessible(){for(const node of document.querySelectorAll('[aria-label]')){const value=node.getAttribute('aria-label'),next=translated(value);if(next!==value)node.setAttribute('aria-label',next);}}
 accessible();
 const observer=new MutationObserver(()=>{
  for(const id of ['status','hit','action']){const node=document.getElementById(id),next=translated(node.textContent);if(next!==node.textContent)node.textContent=next;}
  accessible();
 });
 for(const id of ['status','hit','action'])observer.observe(document.getElementById(id),{childList:true,characterData:true,subtree:true});
 observer.observe(document.getElementById('throw'),{attributes:true,attributeFilter:['aria-label']});
}

const catalogs=Object.fromEntries(await Promise.all(['nl','en'].map(async locale=>{
 const text=await readFile(new URL(`../packages/i18n/src/catalogs/offline.${locale}.json`,import.meta.url),'utf8');
 return [locale,JSON.parse(text)];
})));
assert.deepEqual(Object.keys(catalogs.nl).sort(),Object.keys(catalogs.en).sort());
for(const value of Object.values(catalogs.en))assert.ok(typeof value==='string'&&value.trim());
// Compile the full ICU sentence to offline templates during the build. The
// browser only substitutes trusted score/label parameters after a landed dart.
function scoreTemplate(nodes,form){return nodes.map(node=>{
 if(node.type===0)return node.value;
 if(node.type===1){assert.equal(node.value,'label');return '{label}';}
 if(node.type===7)return '{score}';
 assert.equal(node.type,6);assert.equal(node.value,'score');assert.equal(node.offset,0);
 return scoreTemplate((node.options[form]??node.options.other).value,form);
}).join('');}
const scoreForms=Object.fromEntries(['nl','en'].map(locale=>{
 const ast=new IntlMessageFormat(catalogs[locale]['offline.scored'],locale).getAst();
 return [locale,Object.fromEntries(['one','other'].map(form=>[form,scoreTemplate(ast,form)]))];
}));
const root=new URL('../apps/web/public/',import.meta.url),source=await readFile(new URL('offline.html',root),'utf8');
assert.equal(source.split('<script>').length,2,'The protected offline source must have one unchanged game script');
for(const [key,value] of Object.entries(catalogs.nl))if(key!=='offline.scored')assert.ok(source.includes(value),`Offline source changed: ${key}`);
const safeJson=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const adapter=`<script>(${presentOffline.toString()})(${safeJson(catalogs)},${safeJson(publicPaths)},${safeJson(scoreForms)});</script>\n`;
const html=source.replace('<head>','<head><meta name="robots" content="noindex,nofollow">').replace('<script>',adapter+'<script>');
assert.equal(html.slice(html.lastIndexOf('<script>')),source.slice(source.lastIndexOf('<script>')),'The entire original offline game script must remain byte-identical');
const workerSource=await readFile(new URL('sw.js',root),'utf8');
assert.equal(workerSource.split('"/offline.html"').length,3);
assert.equal(workerSource.split('"dartspoint-offline-v1"').length,2);
const worker=workerSource.replace('"dartspoint-offline-v1"','"dartspoint-offline-i18n-v1"')
 .replace('const CORE = ["/offline.html",','const CORE = ["/offline.html", "/offline-i18n.html",')
 .replace('caches.match("/offline.html")','caches.match("/offline-i18n.html")');
for(const [name,content] of [['offline-i18n.html',html],['sw-i18n.js',worker]]){
 const path=new URL(name,root);
 if(process.argv.includes('--check'))assert.equal(await readFile(path,'utf8'),content,`Run node scripts/generate-offline-i18n.mjs to refresh ${name}`);
 else await writeFile(path,content);
}
console.log('Bilingual offline assets verified; original game script, assets and worker source preserved.');
