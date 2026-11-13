import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import {BLOG_SCHEMA_VERSION,blogCanonicalPath,resolveBlogCanonicalOrigin,blogDraftSchema,blogImageUrl,blogSlug,importBlogMarkdown,parseBlogDocument,safeBlogLink,validBlogDocument,type BlogDraft} from '../../packages/contracts/src/blog';
const id='3f1198de-e71b-46a4-91ed-60ef22664de6';
const paragraph={type:'paragraph',content:[{type:'text',text:'Artikel'}]};
const doc=(...content:any[])=>({type:'doc',schemaVersion:BLOG_SCHEMA_VERSION,content});
const draft:BlogDraft={title:'Titel',slug:'titel',locale:'nl-NL',type:'blog',excerpt:'Samenvatting',content:doc(paragraph),authorId:'redactie',author:'DartsPoint Redactie',categoryId:'speltips',category:'Speltips',tags:[],hero:{assetId:id,url:blogImageUrl(id),alt:'Dartbord',width:800,height:1000,focalPoint:{x:.5,y:.5}},seo:{title:'Titel',description:'Omschrijving'}};
test('draft schema accepts one atomic article and rejects URL or dimension smuggling',()=>{
 assert.equal(blogDraftSchema.safeParse(draft).success,true);
 assert.equal(blogDraftSchema.safeParse({...draft,hero:{...draft.hero,url:'https://external.example/image.png'}}).success,false);
 assert.equal(blogDraftSchema.safeParse({...draft,hero:{...draft.hero,onerror:'alert(1)'}}).success,false);
 assert.equal(blogDraftSchema.safeParse({...draft,hero:{...draft.hero,focalPoint:{x:1.01,y:.5}}}).success,false);
 assert.equal(blogDraftSchema.safeParse({...draft,hero:{assetId:'',url:'',alt:'',width:0,height:0,focalPoint:{x:.5,y:.5}}}).success,true);
});
test('shared versioned schema enforces parent-child structure and supported attrs',()=>{
 assert.equal(validBlogDocument(doc(paragraph)),true);
 for(const value of [doc({type:'heading',attrs:{level:1},content:paragraph.content}),doc({type:'text',text:'Root text'}),doc({type:'paragraph',content:[{type:'bulletList',content:[]}]}),doc({type:'table',content:[paragraph]}),doc({type:'paragraph',attrs:{onclick:'alert(1)'}}),doc({type:'image',attrs:{src:'https://example.com/a.png',alt:'x'}}),{type:'doc',content:[paragraph]},doc({type:'iframe',attrs:{src:'https://example.com'}}),doc({type:'paragraph',content:[{type:'text',text:'A',marks:[{type:'bold',attrs:{style:'color:red'}}]}]})])assert.equal(validBlogDocument(value),false,JSON.stringify(value));
 const image={type:'image',attrs:{assetId:id,src:blogImageUrl(id),alt:'Dartbord',caption:'Onderschrift',width:800,height:1000}};
 assert.deepEqual(parseBlogDocument(doc(image)),doc(image));
 let nested:any=paragraph;for(let i=0;i<26;i++)nested={type:'blockquote',content:[nested]};assert.equal(validBlogDocument(doc(nested)),false);
 assert.equal(validBlogDocument(doc(...Array.from({length:4001},()=>paragraph))),false);
});
test('safe links reject executable schemes and ambiguous browser destinations',()=>{
 for(const href of ['javascript:alert(1)','data:text/html,x','//evil.example','/\\evil.example','https://user:pass@example.com','https://example.com/a\nb','/a%0ab','vbscript:msgbox(1)'])assert.equal(safeBlogLink(href),false,href);
 for(const href of ['/blog/test','#kop','https://dartspoint.nl/blog/test','mailto:support@dartspoint.nl'])assert.equal(safeBlogLink(href),true,href);
});
test('CommonMark importer supports real rich content and preserves safe text with HTML disabled',()=>{
 const imported=importBlogMarkdown('## Kop\n\n**Vet** en *cursief*, ~~weg~~ en `code` met [link](/blog/test).\n\n> Een quote\n\n1. Eerste\n2. Tweede\n\n- [x] Klaar\n- [ ] Nog doen\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![Dartbord]('+blogImageUrl(id)+')\n');
 assert.equal(imported.schemaVersion,1);assert.deepEqual(imported.content!.map(n=>n.type),['heading','paragraph','blockquote','orderedList','taskList','codeBlock','table','image']);
 assert.equal(imported.content![4].content![0].attrs!.checked,true);
 assert.equal(imported.content![7].attrs!.assetId,id);
 for(const markdown of ['<script>alert(1)</script>','tekst <img src=x onerror=alert(1)>','[klik](javascript:alert%281%29)','![x](https://example.com/a.png)'])assert.throws(()=>importBlogMarkdown(markdown),Error,markdown);
 assert.equal(importBlogMarkdown('&lt;script&gt; veilig').content![0].content![0].text,'<script> veilig');
});
test('list and task items preserve nested blockquotes and code through the shared Markdown policy',()=>{
 for(const marker of ['-','- [x]']){
  const imported=importBlogMarkdown(marker+' Eerste alinea\n\n  > Een quote in hetzelfde lijstitem\n\n  ```ts\n  const score = 501;\n  ```');
  const list=imported.content![0],item=list.content![0];
  assert.equal(list.type,marker==='-'?'bulletList':'taskList');
  assert.deepEqual(item.content!.map(node=>node.type),['paragraph','blockquote','codeBlock']);
  assert.deepEqual(parseBlogDocument(imported),imported);
  assert.equal(validBlogDocument(doc({...list,content:[{...item,content:item.content!.slice(1)}]})),false,'list items must still start with a paragraph');
 }
});
test('the installed TipTap table output and Markdown cell alignment pass the same server schema',()=>{
 const editor=new Editor({element:null,extensions:[StarterKit,TableKit],content:{type:'doc',content:[{type:'paragraph'}]}});
 try{
  assert.equal(editor.commands.insertTable({rows:2,cols:2,withHeaderRow:true}),true);
  const output={...editor.getJSON(),schemaVersion:BLOG_SCHEMA_VERSION};
  const parsed=parseBlogDocument(output);
  assert.equal(parsed.content![0].content![0].content![0].attrs!.align,null);
  assert.deepEqual(parsed,output,'new editor tables can be saved without stripping attributes');
 }finally{editor.destroy();}
 const aligned=importBlogMarkdown('| Left | Right |\n| :--- | ---: |\n| One | Two |');
 for(const row of aligned.content![0].content!)assert.deepEqual(row.content!.map(cell=>cell.attrs!.align),['left','right']);
 const unsafe=structuredClone(aligned);unsafe.content![0].content![0].content![0].attrs!.align='left; color:red';
 assert.equal(validBlogDocument(unsafe),false);
});
test('automatic slugs normalize titles while allowing callers to retain an explicit slug',()=>{assert.equal(blogSlug('Één potje · 501 bij DartsPoint!'),'een-potje-501-bij-dartspoint');});

test('one local origin uses an English route prefix while two-domain deployments keep canonical blog paths',()=>{assert.equal(blogCanonicalPath('en-GB','first-match','development'),'/en/blog/first-match');assert.equal(blogCanonicalPath('nl-NL','eerste-wedstrijd','development'),'/blog/eerste-wedstrijd');assert.equal(blogCanonicalPath('en-GB','first-match','production'),'/blog/first-match');assert.equal(blogCanonicalPath('en-GB','first-match','staging'),'/blog/first-match');assert.equal(resolveBlogCanonicalOrigin('en-GB',{environment:'development',appUrl:'http://127.0.0.1:4302'})+blogCanonicalPath('en-GB','first-match','development'),'http://127.0.0.1:4302/en/blog/first-match');assert.equal(resolveBlogCanonicalOrigin('en-GB',{environment:'production'})+blogCanonicalPath('en-GB','first-match','production'),'https://dartspoint.app/blog/first-match');});
