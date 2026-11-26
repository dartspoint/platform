import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client,Pool} from 'pg';
import {migrate} from '../../scripts/migrate';
import {db,transaction} from '../../packages/data/src/db';
import type {Actor} from '../../packages/data/src/auth';
import {DomainError} from '../../packages/contracts/src/index';
import {blogDraftSchema,blogListQuery,type BlogDraft} from '../../packages/contracts/src/blog';
import {blogIdentity,createBlogToken,authenticateBlogToken,blogCapabilities,saveBlogDraft} from '../../packages/data/src/blog';
import {blogTaxonomy,mutateBlogTaxonomy,publicBlogTaxonomy,resolveBlogTaxonomyInTransaction} from '../../packages/data/src/blog-taxonomy';
import {adminBlogEntry,adminBlogPage,listPublicBlogPage} from '../../packages/data/src/blog-query';

assert.equal(process.env.APP_ENV,'development');
const source=new URL(process.env.MIGRATION_DATABASE_URL!);assert.equal(source.hostname,'127.0.0.1');
const database='taxonomy_test_'+randomUUID().replaceAll('-',''),control=new Pool({connectionString:source.toString(),max:1});
await control.query('create database '+database);const url=new URL(source);url.pathname='/'+database;
const setup=new Client({connectionString:url.toString()});process.env.DATABASE_URL=url.toString();process.env.MIGRATION_DATABASE_URL=url.toString();process.env.DATABASE_ROLE='dartspoint_app';process.env.BLOG_SITE_ID='taxonomy-integration';process.argv.push('--expand-only');
const checks:string[]=[];
const denied=async(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,error=>error instanceof DomainError&&error.code===code);
try{
 await setup.connect();await setup.query("create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(user_id text);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$");await migrate();await migrate();
 const actor=async(role:'owner'|'admin'|'player'):Promise<Actor>=>{const id=randomUUID();await setup.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);await setup.query("insert into profiles(id,username,onboarded_at) values($1,$2,now()) on conflict(id) do update set username=excluded.username,onboarded_at=excluded.onboarded_at",[id,'Tax'+id.replaceAll('-','').slice(0,14)]);if(role!=='player')await setup.query('insert into user_roles(user_id,role) values($1,$2)',[id,role]);return {id,username:'TaxonomyTest',role,sessionVersion:1,expiresAt:Date.now()+3_600_000,onboarded:true,sessionId:randomUUID()};};
 const owner=await actor('owner'),admin=await actor('admin'),player=await actor('player');
 const initial=await blogTaxonomy(owner);assert.equal(initial.authors[0].id,'redactie');assert.equal(initial.categories.length,3);
 await denied(()=>blogTaxonomy(player),'forbidden');await denied(()=>mutateBlogTaxonomy(player,{kind:'author',action:'create',name:'Forbidden'}),'forbidden');
 let taxonomy=await mutateBlogTaxonomy(admin,{kind:'author',action:'create',id:'guest-writer',name:'Gastredacteur'});assert.ok(taxonomy.authors.some(row=>row.id==='guest-writer'&&row.active));
 taxonomy=await mutateBlogTaxonomy(owner,{kind:'category',action:'create',id:'training',name:'Training'});
 const generated=await mutateBlogTaxonomy(owner,{kind:'category',action:'create',name:'Wedstrijd voorbereiding'});assert.ok(generated.categories.some(row=>row.name==='Wedstrijd voorbereiding'&&/^wedstrijd-voorbereiding-[a-f0-9]{8}$/.test(row.id)));
 await denied(()=>mutateBlogTaxonomy(owner,{kind:'author',action:'create',id:'guest-writer',name:'Andere naam'}),'TAXONOMY_CONFLICT');await denied(()=>mutateBlogTaxonomy(owner,{kind:'author',action:'create',name:'gastredacteur'}),'TAXONOMY_CONFLICT');
 await denied(()=>mutateBlogTaxonomy(owner,{kind:'category',action:'update',id:'missing',name:'Missing'}),'TAXONOMY_NOT_FOUND');await denied(()=>mutateBlogTaxonomy(owner,{kind:'category',action:'create',id:'../bad',name:'Bad'}),'INVALID_TAXONOMY');
 taxonomy=await mutateBlogTaxonomy(owner,{kind:'author',action:'update',id:'redactie',name:'Actuele redactie'});assert.equal((await blogTaxonomy(owner)).authors.find(row=>row.id==='redactie')!.name,'Actuele redactie');
 const changed=(await setup.query("select updated_by,updated_at from private.blog_taxonomy where site_id=$1 and environment='development' and kind='author' and id='redactie'",[blogIdentity().siteId])).rows[0];assert.equal(changed.updated_by,owner.id);assert.ok(changed.updated_at);
 checks.push('editable records, stable seeds, names, permissions and mutation audit');

 const identity=blogIdentity(),selection={authorId:'guest-writer',categoryId:'training'};
 let names=await transaction(c=>resolveBlogTaxonomyInTransaction(c,identity,selection));assert.equal(names.author,'Gastredacteur');assert.equal(names.category,'Training');
 const draft:BlogDraft={title:'Een nieuw artikel',slug:'eerste-artikel',slugMode:'manual',excerpt:'Lokale taxonomy-test.',locale:'nl-NL',type:'blog',...selection,author:'Forged author',category:'Forged category',tags:[],content:{type:'doc',schemaVersion:1,content:[{type:'paragraph',content:[{type:'text',text:'Een testartikel.'}]}]},hero:{assetId:'',url:'',alt:'',width:0,height:0,focalPoint:{x:.5,y:.5}},seo:{title:'Artikel',description:'Een test.'}};
 assert.equal(blogDraftSchema.parse(draft).authorId,'guest-writer');const first=await saveBlogDraft(owner,{draft});assert.equal(first.draft.author,'Gastredacteur');assert.equal(first.draft.category,'Training');
 const manual=await createBlogToken(owner,{label:'Taxonomy capability test',scopes:['capabilities:read'],expiresAt:new Date(Date.now()+86_400_000).toISOString()});const principal=await authenticateBlogToken(manual.token);
 assert.ok((await blogCapabilities(principal)).authors.some(row=>row.id==='guest-writer'&&row.name==='Gastredacteur'));
 await mutateBlogTaxonomy(owner,{kind:'author',action:'archive',id:'guest-writer'});await mutateBlogTaxonomy(owner,{kind:'category',action:'archive',id:'training'});
 assert.ok(!(await publicBlogTaxonomy()).authors.some(row=>row.id==='guest-writer'));assert.ok(!(await blogCapabilities(principal)).categories.some(row=>row.id==='training'));
 await denied(()=>transaction(c=>resolveBlogTaxonomyInTransaction(c,identity,selection)),'INVALID_TAXONOMY');names=await transaction(c=>resolveBlogTaxonomyInTransaction(c,identity,selection,selection));assert.equal(names.authorId,'guest-writer');
 const retained=await saveBlogDraft(owner,{id:first.id,revision:1,draft:{...first.draft,title:'Bestaande selectie blijft geldig'}});assert.equal(retained.draft.authorId,'guest-writer');await denied(()=>saveBlogDraft(owner,{draft:{...draft,slug:'archive-cannot-select'}}),'INVALID_TAXONOMY');
 await mutateBlogTaxonomy(owner,{kind:'author',action:'update',id:'guest-writer',active:true});await mutateBlogTaxonomy(owner,{kind:'category',action:'update',id:'training',active:true});
 await mutateBlogTaxonomy(owner,{kind:'author',action:'archive',id:'redactie'});await mutateBlogTaxonomy(owner,{kind:'category',action:'archive',id:'speltips'});
 const fallback=await transaction(c=>resolveBlogTaxonomyInTransaction(c,identity,{}));assert.equal(fallback.authorId,'guest-writer');assert.notEqual(fallback.categoryId,'speltips');
 await mutateBlogTaxonomy(owner,{kind:'author',action:'archive',id:'guest-writer'});await denied(()=>transaction(c=>resolveBlogTaxonomyInTransaction(c,identity,{})),'INVALID_TAXONOMY');
 await mutateBlogTaxonomy(owner,{kind:'author',action:'update',id:'redactie',active:true});await mutateBlogTaxonomy(owner,{kind:'author',action:'update',id:'guest-writer',active:true});await mutateBlogTaxonomy(owner,{kind:'category',action:'update',id:'speltips',active:true});
 const otherIdentity={siteId:'another-site',environment:'development'};await denied(()=>transaction(c=>resolveBlogTaxonomyInTransaction(c,otherIdentity,selection)),'INVALID_TAXONOMY');
 checks.push('database validation, capabilities, archived references and site isolation');

 // Build genuine revisioned drafts; public rows are controlled test projections
 // so pagination can be tested independently from the publication worker.
 const ids:string[]=[];
 for(let index=0;index<26;index++){
  const entry=await saveBlogDraft(owner,{draft:{...draft,title:index===0?'Only%needle':'Paging article '+index,slug:'paging-'+index,authorId:index%2?'redactie':'guest-writer',categoryId:index%2?'speltips':'training'}});ids.push(entry.id);
  if(index<21){const article={...entry.draft,id:entry.id,revision:1,publishedAt:new Date(Date.now()+index*1000).toISOString(),updatedAt:entry.updatedAt};await setup.query('insert into public.blog_live(post_id,site_id,environment,locale,slug,revision,article,published_at) values($1,$2,$3,$4,$5,1,$6,$7)',[entry.id,identity.siteId,identity.environment,article.locale,article.slug,article,article.publishedAt]);await setup.query('update private.blog_posts set published_revision=1,published_at=$2 where id=$1',[entry.id,article.publishedAt]);}
 }
 const page1=await listPublicBlogPage('nl-NL',{page:1,pageSize:10}),page2=await listPublicBlogPage('nl-NL',{page:2,pageSize:10}),page3=await listPublicBlogPage('nl-NL',{page:3,pageSize:10});assert.equal(page1.total,21);assert.equal(page1.items.length,10);assert.equal(page2.items.length,10);assert.equal(page3.items.length,1);assert.equal(page3.hasMore,false);assert.equal(new Set([...page1.items,...page2.items,...page3.items].map(row=>row.id)).size,21);
 const filtered=await listPublicBlogPage('nl-NL',{categoryId:'training',authorId:'guest-writer',pageSize:50});assert.equal(filtered.total,11);assert.ok(filtered.items.every(row=>row.categoryId==='training'&&row.authorId==='guest-writer'));
 await mutateBlogTaxonomy(owner,{kind:'category',action:'archive',id:'training'});assert.ok((await publicBlogTaxonomy()).categories.some(row=>row.id==='training'&&!row.active));assert.equal((await listPublicBlogPage('nl-NL',{categoryId:'training'})).total,11);
 assert.equal((await listPublicBlogPage('en-GB')).total,0);assert.equal((await listPublicBlogPage('nl-NL',{q:'%needle'})).total,1);
 const administrative=await adminBlogPage(admin,{page:1,pageSize:10});assert.equal(administrative.total,27);assert.equal(administrative.entries.length,10);assert.equal((await adminBlogPage(owner,{state:'draft'})).total,6);assert.equal((await adminBlogPage(owner,{state:'published'})).total,21);
 const selected=await adminBlogEntry(owner,ids[0]);assert.equal(selected.id,ids[0]);await denied(()=>adminBlogEntry(player,ids[0]),'forbidden');await denied(()=>adminBlogPage(player,{}),'forbidden');await denied(()=>adminBlogEntry(owner,randomUUID()),'POST_NOT_FOUND');
 assert.throws(()=>blogListQuery.parse({pageSize:1000}));assert.throws(()=>blogListQuery.parse({page:0}));assert.throws(()=>blogListQuery.parse({categoryId:"x' or true--"}));
 await setup.query("insert into private.blog_publications(id,post_id,revision,site_id,environment,public_url,proof_token,state) values($1,$2,1,$3,$4,$5,$6,'publishing')",[randomUUID(),ids[0],identity.siteId,identity.environment,'https://example.test/blog/paging-0',randomUUID()]);assert.equal((await adminBlogPage(owner,{state:'publishing'})).total,1);assert.equal((await adminBlogEntry(owner,ids[0])).publicationState,'publishing');
 checks.push('bounded public/admin pages, filters, literal search and direct detail selection');

 assert.equal((await setup.query("select rowsecurity from pg_tables where schemaname='private' and tablename='blog_taxonomy'")).rows[0].rowsecurity,true);
 for(const role of ['anon','authenticated']){assert.equal((await setup.query("select has_table_privilege($1,'private.blog_taxonomy','select') allowed",[role])).rows[0].allowed,false);await setup.query('set role '+role);await assert.rejects(setup.query('select * from private.blog_taxonomy'),/permission denied/);await setup.query('reset role');}
 assert.ok(Number((await setup.query("select count(*)::int n from private.audit_events where action like 'blog.taxonomy.%'")).rows[0].n)>0);checks.push('private table grants, RLS and durable audit');
 console.log(JSON.stringify({event:'blog_taxonomy_pagination_passed',checks,scope:'isolated PostgreSQL, real blog/taxonomy/query services'}));
}finally{await db().end();await setup.end();await control.query('drop database '+database+' with (force)');await control.end();}
