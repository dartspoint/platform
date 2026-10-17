'use client';
import {useI18n} from '@/lib/i18n/provider';
import type {LobbyLayout} from '../../../../packages/contracts/src/lobby';
import {contentCopy,contentTranslationCurrent,type ContentCopy,type ContentTranslations} from '../../../../packages/contracts/src/content-translations';
function TranslationFields({item,onChange}:{item:any;onChange:(translations:ContentTranslations)=>void}){
 const {locale}=useI18n(),en=locale==='en',source=contentCopy(item),edition=item.translations?.en;
 const fields:Record<string,string>=en?{headline:'Heading',eyebrow:'Eyebrow',title:'Title',description:'Description',summary:'Summary',body:'Body',ctaLabel:'Button',scoreLabel:'Score label',pollOptions:'Answers'}:{headline:'Begroeting',eyebrow:'Bovenregel',title:'Titel',description:'Beschrijving',summary:'Samenvatting',body:'Inhoud',ctaLabel:'Knop',scoreLabel:'Scorelabel',pollOptions:'Antwoorden'};
 function update(key:string,value:string|string[]){onChange({en:{source:edition?.source??source,text:{...Object.fromEntries(Object.entries(source).map(([k,v])=>[k,Array.isArray(v)?v.map(()=>''):''])),...edition?.text,[key]:value}}});}
 return <details><summary>{item.headline??item.title} · {contentTranslationCurrent(item)?(en?'English ready':'Engels gereed'):edition?(en?'English incomplete or out of date':'Engels onvolledig of verouderd'):(en?'English missing':'Engels ontbreekt')}</summary>
 <p>{en?'The English edition shares this content ID. Review it again after changing the source.':'De Engelse editie deelt deze inhouds-ID. Controleer haar opnieuw na een wijziging van de bron.'}</p>
 {Object.entries(source).map(([key,value])=>Array.isArray(value)?<fieldset key={key}><legend>{fields[key]} · English</legend>{value.map((text,index)=><label key={index}>{text}<input lang="en" maxLength={160} value={(edition?.text[key] as string[]|undefined)?.[index]??''} onChange={event=>{const next=[...(edition?.text[key] as string[]|undefined??value.map(()=>''))];next[index]=event.target.value;update(key,next);}}/></label>)}</fieldset>:<label key={key} style={{display:'grid',gap:5,margin:'10px 0'}}>{fields[key]} · English<small>{value}</small><textarea lang="en" rows={key==='body'?8:2} maxLength={key==='body'?12000:key==='summary'?400:key==='description'?800:key==='title'?140:80} value={typeof edition?.text[key]==='string'?edition.text[key]:''} onChange={event=>update(key,event.target.value)}/></label>)}
 {edition&&<button type="button" onClick={()=>onChange({en:{source,text:edition.text}})}>{en?'Confirm this source has been reviewed':'Bevestig controle tegen deze bron'}</button>}
 </details>;
}
export function LobbyTranslationsEditor({layout,onChange}:{layout:LobbyLayout;onChange:(layout:LobbyLayout)=>void}){
 const {locale}=useI18n(),en=locale==='en';
 return <details style={{margin:'16px 0',padding:16,border:'1px solid #365343',borderRadius:8}}><summary>{en?'English content and publication status':'Engelse inhoud en publicatiestatus'}</summary><p>{en?'Save and publish through the existing lobby controls. Untranslated community content is shown as original text.':'Sla op en publiceer via de bestaande lobbybediening. Onvertaalde communityinhoud wordt als oorspronkelijke tekst getoond.'}</p>
 <TranslationFields item={layout} onChange={translations=>onChange({...layout,translations})}/>
 {layout.widgets.map((widget,index)=><TranslationFields key={widget.id} item={widget} onChange={translations=>onChange({...layout,widgets:layout.widgets.map((w,i)=>i===index?{...w,translations}:w)})}/>)}
 {layout.articles.map((article,index)=><TranslationFields key={article.id} item={article} onChange={translations=>onChange({...layout,articles:layout.articles.map((a,i)=>i===index?{...a,translations}:a)})}/>)}
 </details>;
}
