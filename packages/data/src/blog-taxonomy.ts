import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {transaction,audit} from './db';
import {authorizeBlogInTransaction,blogIdentity} from './blog';
import {DomainError,requireThat} from '../../contracts/src/index';
import {BLOG_AUTHORS,BLOG_CATEGORIES,blogSlug,blogTaxonomyMutation,type BlogDraft,type BlogTaxonomy,type BlogTaxonomyRecord} from '../../contracts/src/blog';

type Identity={siteId:string;environment:string};
const MAX_RECORDS=200;
/** Existing stable IDs are initial data only; edits and archives are never reset. */
async function ensureDefaults(c:PoolClient,identity:Identity){
 for(const [kind,records] of [['author',BLOG_AUTHORS],['category',BLOG_CATEGORIES]] as const){
  for(const record of records)await c.query('insert into private.blog_taxonomy(site_id,environment,kind,id,name) values($1,$2,$3,$4,$5) on conflict do nothing',[identity.siteId,identity.environment,kind,record.id,record.name]);
 }
}
export async function listBlogTaxonomyInTransaction(c:PoolClient,identity:Identity,includeInactive=true):Promise<BlogTaxonomy>{
 await ensureDefaults(c,identity);
 const rows=(await c.query('select kind,id,name,active from private.blog_taxonomy where site_id=$1 and environment=$2 and ($3::boolean or active) order by kind,lower(name),id limit $4',[identity.siteId,identity.environment,includeInactive,MAX_RECORDS*2])).rows;
 return {authors:rows.filter(row=>row.kind==='author').map(({id,name,active})=>({id,name,active})),categories:rows.filter(row=>row.kind==='category').map(({id,name,active})=>({id,name,active}))};
}
export async function resolveBlogTaxonomyInTransaction(c:PoolClient,identity:Identity,selection:Partial<Pick<BlogDraft,'authorId'|'categoryId'>>,previous?:Pick<BlogDraft,'authorId'|'categoryId'>){
 await ensureDefaults(c,identity);
 let authorId=selection.authorId??previous?.authorId,categoryId=selection.categoryId??previous?.categoryId;
 if(authorId===undefined||categoryId===undefined){
  const active=await listBlogTaxonomyInTransaction(c,identity,false);
  authorId??=active.authors.find(row=>row.id==='redactie')?.id??active.authors[0]?.id;
  categoryId??=active.categories.find(row=>row.id==='speltips')?.id??active.categories[0]?.id;
 }
 requireThat(authorId&&categoryId,'INVALID_TAXONOMY',422,'Voeg eerst een actieve auteur en categorie toe in blogbeheer.');
 const rows=(await c.query("select kind,id,name,active from private.blog_taxonomy where site_id=$1 and environment=$2 and ((kind='author' and id=$3) or (kind='category' and id=$4)) for share",[identity.siteId,identity.environment,authorId,categoryId])).rows;
 const author=rows.find(row=>row.kind==='author'),category=rows.find(row=>row.kind==='category');
 requireThat(author&&(author.active||previous?.authorId===author.id),'INVALID_TAXONOMY',422,'Kies een bestaande actieve auteur.');
 requireThat(category&&(category.active||previous?.categoryId===category.id),'INVALID_TAXONOMY',422,'Kies een bestaande actieve categorie.');
 return {authorId:author.id as string,author:author.name as string,categoryId:category.id as string,category:category.name as string};
}
export async function blogTaxonomy(actor:Actor){return transaction(async c=>{await authorizeBlogInTransaction(c,actor,'drafts:read');return listBlogTaxonomyInTransaction(c,blogIdentity());});}
/** Archived categories with live articles retain a working public filter URL. */
export async function publicBlogTaxonomy(){return transaction(async c=>{
 const identity=blogIdentity();await ensureDefaults(c,identity);
 const rows=(await c.query("select t.kind,t.id,t.name,t.active from private.blog_taxonomy t where t.site_id=$1 and t.environment=$2 and (t.active or t.kind='category' and exists(select 1 from public.blog_live l where l.site_id=t.site_id and l.environment=t.environment and l.article->>'categoryId'=t.id)) order by t.kind,lower(t.name),t.id limit $3",[identity.siteId,identity.environment,MAX_RECORDS*2])).rows;
 const records=(kind:string):BlogTaxonomyRecord[]=>rows.filter(row=>row.kind===kind).map(({id,name,active})=>({id,name,active}));
 return {authors:records('author'),categories:records('category')};
});}
export async function mutateBlogTaxonomy(actor:Actor,input:unknown){
 const parsed=blogTaxonomyMutation.safeParse(input);requireThat(parsed.success,'INVALID_TAXONOMY',422,'Controleer de auteur of categorie.');const value=parsed.data;
 try{return await transaction(async c=>{
  await authorizeBlogInTransaction(c,actor,'drafts:write');const identity=blogIdentity();await ensureDefaults(c,identity);
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['blog.taxonomy',identity.siteId,identity.environment,value.kind])]);
  let id:string;
  if(value.action==='create'){
   const count=Number((await c.query('select count(*)::int n from private.blog_taxonomy where site_id=$1 and environment=$2 and kind=$3',[identity.siteId,identity.environment,value.kind])).rows[0].n);
   requireThat(count<MAX_RECORDS,'TAXONOMY_LIMIT',409,'Er zijn maximaal 200 auteurs en 200 categorieën mogelijk.');
   id=value.id??((blogSlug(value.name).slice(0,65)||value.kind)+'-'+randomUUID().slice(0,8));
   await c.query('insert into private.blog_taxonomy(site_id,environment,kind,id,name,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)',[identity.siteId,identity.environment,value.kind,id,value.name,actor.id]);
  }else{
   id=value.id;
   const updated=await c.query('update private.blog_taxonomy set name=coalesce($5,name),active=coalesce($6,active),updated_by=$7,updated_at=now() where site_id=$1 and environment=$2 and kind=$3 and id=$4 returning id',[identity.siteId,identity.environment,value.kind,id,value.action==='update'?value.name??null:null,value.action==='archive'?false:value.active??null,actor.id]);
   requireThat(updated.rowCount,'TAXONOMY_NOT_FOUND',404,'Deze auteur of categorie bestaat niet.');
  }
  await audit(c,actor.id,'blog.taxonomy.'+value.action,id,{kind:value.kind,name:'name' in value?value.name:undefined,active:value.action==='archive'?false:'active' in value?value.active:undefined,environment:identity.environment});
  return listBlogTaxonomyInTransaction(c,identity);
 });}catch(error){if((error as {code?:string})?.code==='23505')throw new DomainError('TAXONOMY_CONFLICT',409,'Deze auteur- of categorienaam of ID bestaat al.');throw error;}
}
export type {BlogTaxonomyRecord};
