import {z} from 'zod';
import {marked,type Token,type Tokens} from 'marked';
import {decodeHTML} from 'entities';

export const BLOG_SCHEMA_VERSION=1 as const;
export const BLOG_CONTRACT_VERSION='1';
export const BLOG_LOCALES=['nl-NL','en-GB'] as const;
export type BlogLocale=typeof BLOG_LOCALES[number];
export const BLOG_AUTHORS=[{id:'redactie',name:'DartsPoint Redactie'}] as const;
export const BLOG_CATEGORIES=[{id:'speltips',name:'Speltips'},{id:'online-darten',name:'Online darten'},{id:'community',name:'Community'}] as const;
export const BLOG_SCOPES=['capabilities:read','media:write','drafts:read','drafts:write','posts:publish'] as const;
export type BlogScope=typeof BLOG_SCOPES[number];
export type BlogDocument={type:string;schemaVersion?:number;attrs?:Record<string,any>;content?:BlogDocument[];text?:string;marks?:{type:string;attrs?:Record<string,any>}[]};
export type BlogImage={assetId:string;url:string;alt:string;width:number;height:number};
export type BlogDraft={slug:string;title:string;excerpt:string;locale:BlogLocale;type:'blog'|'article';translationOfId?:string;categoryId:string;category:string;tags:string[];authorId:string;author:string;content:BlogDocument;hero:BlogImage&{focalPoint:{x:number;y:number}};ogImage?:BlogImage;seo:{title:string;description:string}};
export type BlogArticle=BlogDraft&{id:string;revision:number;externalId?:string;publishedAt:string;updatedAt:string};
export type BlogAdminEntry={id:string;revision:number;liveRevision:number|null;draft:BlogDraft;live:BlogArticle|null;updatedAt:string;source:'redactie'|'socialhero'};
export const blogPath=(slug:string)=>'/blog/'+encodeURIComponent(slug);
export function blogCanonicalPath(locale:BlogLocale,slug:string,environment:string){return (environment==='development'&&locale==='en-GB'?'/en':'')+blogPath(slug);}
export const blogImageUrl=(assetId:string)=>'/api/blog-media/'+assetId;
export function blogSlug(title:string){return title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110).replace(/-$/,'');}
/** Canonicals depend on the deployment environment and are shared by HTML and API receipts. */
export function resolveBlogCanonicalOrigin(locale:BlogLocale,config:{environment:string;appUrl?:string;nlOrigin?:string;enOrigin?:string}){
 if(!['development','staging','production'].includes(config.environment))throw new Error('Invalid blog environment');
 const defaults=config.environment==='production'?{'nl-NL':'https://dartspoint.nl','en-GB':'https://dartspoint.app'}:config.environment==='staging'?{'nl-NL':'https://staging.dartspoint.nl','en-GB':'https://staging.dartspoint.app'}:{'nl-NL':config.appUrl??'http://localhost:4300','en-GB':config.appUrl??'http://localhost:4300'};
 const value=(locale==='nl-NL'?config.nlOrigin:config.enOrigin)??defaults[locale];const url=new URL(value);
 if(url.origin!==value||url.username||url.password||(config.environment==='development'?!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol):url.protocol!=='https:'))throw new Error('Invalid blog canonical origin');
 return value;
}
export function safeBlogLink(value:string){
 if(!value||/[\s\\\u0000-\u001f\u007f]/.test(value)||/%(?:00|0a|0d|5c)/i.test(value))return false;
 if(value.startsWith('/')&&!value.startsWith('//'))return true;
 if(/^#[A-Za-z0-9_-]+$/.test(value))return true;
 try{const u=new URL(value);return !u.username&&!u.password&&['https:','http:','mailto:','tel:'].includes(u.protocol);}catch{return false;}
}
const assetId=z.string().uuid();
const keys=(value:Record<string,unknown>,allowed:string[])=>Object.keys(value).every(key=>allowed.includes(key));
const record=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const inline=new Set(['text','hardBreak']);
const blocks=new Set(['paragraph','heading','blockquote','bulletList','orderedList','taskList','codeBlock','horizontalRule','image','table']);
/** This allowlist is shared by import, editor saves and server rendering. No HTML/embed nodes. */
export function validBlogDocument(input:unknown):input is BlogDocument{
 let count=0;
 if(!record(input)||input.type!=='doc'||input.schemaVersion!==BLOG_SCHEMA_VERSION)return false;
 let serialized:string;try{serialized=JSON.stringify(input);}catch{return false;}if(serialized.length>300000)return false;
 function valid(node:unknown,depth:number,parent:string):boolean{
  if(!record(node)||depth>24||++count>4000||!keys(node,['type','schemaVersion','attrs','content','text','marks']))return false;
  const {type}=node;if(typeof type!=='string'||(type==='doc')!==(depth===0)||depth>0&&node.schemaVersion!==undefined)return false;
  const content=node.content??[];if(!Array.isArray(content))return false;
  if(type==='text'){if(typeof node.text!=='string'||!node.text.length||node.text.length>100000||node.content!==undefined||node.attrs!==undefined)return false;}
  else if(node.text!==undefined||node.marks!==undefined)return false;
  const a=node.attrs??{};if(!record(a))return false;
  const allowedAttrs:Record<string,string[]>={doc:[],paragraph:['textAlign'],heading:['level','textAlign'],text:[],blockquote:[],bulletList:[],orderedList:['start','type'],listItem:[],taskList:[],taskItem:['checked'],codeBlock:['language'],hardBreak:[],horizontalRule:[],image:['assetId','src','alt','title','caption','width','height'],table:[],tableRow:[],tableCell:['colspan','rowspan','colwidth','align'],tableHeader:['colspan','rowspan','colwidth','align']};
  if(!allowedAttrs[type]||!keys(a,allowedAttrs[type]))return false;
  if(a.textAlign!=null&&!['left','center','right','justify'].includes(a.textAlign))return false;
  if(type==='heading'&&![2,3,4].includes(a.level))return false;
  if(type==='orderedList'&&a.start!=null&&(!Number.isSafeInteger(a.start)||a.start<1||a.start>100000))return false;
  if(type==='orderedList'&&a.type!=null&&a.type!=='1')return false;
  if(type==='taskItem'&&typeof a.checked!=='boolean')return false;
  if(type==='codeBlock'&&a.language!=null&&(typeof a.language!=='string'||!/^[-a-zA-Z0-9_+]{0,40}$/.test(a.language)))return false;
  if(type==='image'){
   if(!assetId.safeParse(a.assetId).success||a.src!==blogImageUrl(a.assetId)||typeof a.alt!=='string'||a.alt.length>250)return false;
   for(const key of ['title','caption'])if(a[key]!=null&&(typeof a[key]!=='string'||a[key].length>500))return false;
   for(const key of ['width','height'])if(a[key]!=null&&(!Number.isSafeInteger(a[key])||a[key]<1||a[key]>12000))return false;
  }
  if(['tableCell','tableHeader'].includes(type)){
   if(a.align!=null&&!['left','center','right'].includes(a.align))return false;
   for(const key of ['colspan','rowspan'])if(a[key]!=null&&(!Number.isSafeInteger(a[key])||a[key]<1||a[key]>20))return false;
   if(a.colwidth!=null&&(!Array.isArray(a.colwidth)||a.colwidth.length>20||a.colwidth.some((w:unknown)=>typeof w!=='number'||!Number.isSafeInteger(w)||w<1||w>4000)))return false;
  }
  if(node.marks!==undefined){
   if(!Array.isArray(node.marks)||node.marks.length>7||new Set(node.marks.map((m:any)=>m?.type)).size!==node.marks.length)return false;
   for(const mark of node.marks){
    if(!record(mark)||!keys(mark,['type','attrs'])||!['bold','italic','underline','strike','code','link','highlight'].includes(mark.type))return false;
    const ma=mark.attrs??{};if(!record(ma))return false;
    if(mark.type==='link'){
     if(!keys(ma,['href','target','rel','class','title'])||typeof ma.href!=='string'||ma.href.length>2000||!safeBlogLink(ma.href))return false;
     if(ma.target!=null&&!['_blank','_self'].includes(ma.target)||ma.rel!=null&&!['noopener noreferrer nofollow','noopener noreferrer','nofollow'].includes(ma.rel)||ma.class!=null||ma.title!=null&&(typeof ma.title!=='string'||ma.title.length>250))return false;
    }else if(mark.type==='highlight'){if(!keys(ma,['color'])||ma.color!=null&&!['#ffe066','#fff3bf','#d3f9d8','#a5d8ff'].includes(ma.color))return false;}
    else if(Object.keys(ma).length)return false;
   }
  }
  let children:Set<string>;
  if(type==='doc'||type==='blockquote'||['tableCell','tableHeader'].includes(type))children=blocks;
  else if(['paragraph','heading'].includes(type))children=inline;
  else if(type==='codeBlock')children=new Set(['text']);
  else if(type==='bulletList'||type==='orderedList')children=new Set(['listItem']);
  else if(type==='taskList')children=new Set(['taskItem']);
  else if(type==='listItem'||type==='taskItem')children=blocks;
  else if(type==='table')children=new Set(['tableRow']);
  else if(type==='tableRow')children=new Set(['tableCell','tableHeader']);
  else children=new Set();
  if(!['doc','paragraph','heading','codeBlock','text','hardBreak','horizontalRule','image'].includes(type)&&content.length===0)return false;
  if(['listItem','taskItem'].includes(type)&&content[0]?.type!=='paragraph')return false;
  if(type==='table'&&(content.length>100||content.some((row:any)=>!Array.isArray(row.content)||row.content.length>20)))return false;
  if(type==='codeBlock'&&content.some((child:any)=>child.marks?.length))return false;
  return content.every((child:unknown)=>record(child)&&children.has(child.type)&&valid(child,depth+1,type));
 }
 return valid(input,0,'');
}
export function parseBlogDocument(input:unknown):BlogDocument{return z.custom<BlogDocument>(validBlogDocument,'Ongeldig artikel: controleer blokken, links en afbeeldingen.').parse(input);}
export function blogMediaIds(draft:BlogDraft){
 const ids=new Set<string>();if(draft.hero.assetId)ids.add(draft.hero.assetId);if(draft.ogImage?.assetId)ids.add(draft.ogImage.assetId);
 const walk=(n:BlogDocument)=>{if(n.type==='image')ids.add(n.attrs!.assetId);n.content?.forEach(walk);};walk(draft.content);return [...ids];
}
const imageBase=z.object({assetId:z.union([assetId,z.literal('')]),url:z.string().max(200),alt:z.string().trim().max(250),width:z.number().int().min(0).max(12000),height:z.number().int().min(0).max(12000)}).strict();
const validImage=(i:BlogImage)=>i.assetId?i.url===blogImageUrl(i.assetId)&&i.width>0&&i.height>0:i.url===''&&i.width===0&&i.height===0;
const image=imageBase.refine(validImage,'Kies een eigen geüploade afbeelding.');
export const blogDraftSchema=z.object({slug:z.string().trim().min(1).max(110).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:z.string().trim().min(1).max(160),excerpt:z.string().trim().max(360),locale:z.enum(BLOG_LOCALES),type:z.enum(['blog','article']),translationOfId:z.string().uuid().optional(),categoryId:z.enum(['speltips','online-darten','community']),category:z.string().trim().max(70),authorId:z.literal('redactie'),author:z.string().trim().max(100),tags:z.array(z.string().trim().min(1).max(40)).max(20),content:z.custom<BlogDocument>(validBlogDocument,'Ongeldige artikelinhoud.'),hero:imageBase.extend({focalPoint:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict()}).strict().refine(validImage,'Kies een eigen geüploade afbeelding.'),ogImage:image.optional(),seo:z.object({title:z.string().trim().max(160),description:z.string().trim().max(320)}).strict()}).strict();

/** Parse CommonMark/GFM into the exact same schema. Executable/raw HTML is rejected. */
export function importBlogMarkdown(markdown:string):BlogDocument{
 if(typeof markdown!=='string'||markdown.length>150000)throw new Error('Markdown is te groot.');
 const text=(value:string,marks:BlogDocument['marks']=[]):BlogDocument[]=>value?[{type:'text',text:value,...(marks.length?{marks}:{})}]:[];
 const inlineTokens=(tokens:Token[],marks:BlogDocument['marks']=[]):BlogDocument[]=>tokens.flatMap(token=>{
  if(token.type==='html')throw new Error('HTML is niet toegestaan.');
  if(token.type==='text'||token.type==='escape')return 'tokens' in token&&token.tokens?inlineTokens(token.tokens,marks):text(decodeHTML(token.text),marks);
  if(token.type==='strong'||token.type==='em'||token.type==='del')return inlineTokens(token.tokens??[],[...marks,{type:token.type==='strong'?'bold':token.type==='em'?'italic':'strike'}]);
  if(token.type==='codespan')return text(token.text,[...marks,{type:'code'}]);
  if(token.type==='br')return [{type:'hardBreak'}];
  if(token.type==='link')return inlineTokens(token.tokens??[],[...marks,{type:'link',attrs:{href:decodeHTML(token.href),...(token.title?{title:decodeHTML(token.title)}:{})}}]);
  if(token.type==='image'){const match=/^\/api\/blog-media\/([0-9a-f-]{36})$/i.exec(token.href);if(!match)throw new Error('Gebruik een geüploade afbeelding.');return [{type:'image',attrs:{assetId:match[1],src:token.href,alt:decodeHTML(token.text),...(token.title?{title:decodeHTML(token.title)}:{})}}];}
  throw new Error('Niet-ondersteunde inline Markdown: '+token.type);
 });
 const paragraphs=(tokens:Token[]):BlogDocument[]=>{const output:BlogDocument[]=[],buffer:BlogDocument[]=[];const flush=()=>{if(buffer.length){output.push({type:'paragraph',content:buffer.splice(0)});}};for(const child of inlineTokens(tokens)){if(child.type==='image'){flush();output.push(child);}else buffer.push(child);}flush();return output.length?output:[{type:'paragraph'}];};
 const blockTokens=(tokens:Token[]):BlogDocument[]=>tokens.flatMap(token=>{
  switch(token.type){
   case 'space':case 'def':case 'checkbox':return [];
   case 'html':throw new Error('HTML is niet toegestaan.');
   case 'heading':return [{type:'heading',attrs:{level:Math.max(2,Math.min(4,token.depth))},content:inlineTokens(token.tokens??[])}];
   case 'paragraph':case 'text':return paragraphs(('tokens' in token&&token.tokens)||[{type:'text',raw:token.raw,text:token.text}]);
   case 'hr':return [{type:'horizontalRule'}];
   case 'code':return [{type:'codeBlock',attrs:{language:token.lang?.split(/\s/)[0]??null},content:text(token.text)}];
   case 'blockquote':return [{type:'blockquote',content:blockTokens(token.tokens??[])}];
   case 'list':{const list=token as Tokens.List;const tasks=list.items.some(item=>item.task);if(tasks&&list.items.some(item=>!item.task))throw new Error('Meng geen taken en gewone lijstitems.');return [{type:tasks?'taskList':list.ordered?'orderedList':'bulletList',...(list.ordered?{attrs:{start:list.start||1}}:{}),content:list.items.map(item=>({type:tasks?'taskItem':'listItem',...(tasks?{attrs:{checked:!!item.checked}}:{}),content:blockTokens(item.tokens)}))}];}
   case 'table':{const table=token as Tokens.Table;const cell=(c:Tokens.TableCell,header:boolean):BlogDocument=>({type:header?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null,align:c.align??null},content:[{type:'paragraph',content:inlineTokens(c.tokens)}]});return [{type:'table',content:[{type:'tableRow',content:table.header.map(c=>cell(c,true))},...table.rows.map(row=>({type:'tableRow',content:row.map(c=>cell(c,false))}))]}];}
   default:throw new Error('Niet-ondersteunde Markdown: '+token.type);
  }
 });
 return parseBlogDocument({type:'doc',schemaVersion:BLOG_SCHEMA_VERSION,content:blockTokens(marked.lexer(markdown,{gfm:true,breaks:false}))});
}
