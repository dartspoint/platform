import {z} from 'zod';
import {db,transaction} from './db';
import type {Actor} from './auth';
import {authorizeBlogInTransaction,blogIdentity} from './blog';
import {requireThat} from '../../contracts/src/index';
import {blogListQuery,type BlogAdminEntry,type BlogArticle,type BlogLocale,type BlogPageInfo} from '../../contracts/src/blog';

const adminFrom=`from private.blog_posts p join private.blog_revisions d on d.post_id=p.id and d.revision=p.draft_revision left join public.blog_live l on l.post_id=p.id left join private.blog_publications j on j.post_id=p.id and j.revision=p.published_revision`;
const adminWhere=`where p.site_id=$1 and p.environment=$2 and ($3::text is null or d.document->>'locale'=$3) and ($4::text is null or d.document->>'categoryId'=$4) and ($5::text is null or d.document->>'authorId'=$5)
 and ($6='' or position(lower($6) in lower(concat_ws(' ',d.document->>'title',d.document->>'slug',d.document->>'excerpt',d.document->>'tags')))>0)
 and ($7='all' or ($7='draft' and p.published_revision is null) or ($7='revision' and p.published_revision is not null and p.draft_revision>p.published_revision) or ($7='published' and p.published_revision=p.draft_revision and coalesce(j.state,'published')='published') or ($7='publishing' and j.state='publishing'))`;
const adminColumns=`p.id,p.draft_revision,p.published_revision,p.updated_at,p.source,d.document draft,l.article live,j.id publication_id,j.state publication_state,j.last_error_code publication_error,j.attempts publication_attempts`;
function adminEntry(row:any):BlogAdminEntry{return {id:row.id,revision:Number(row.draft_revision),liveRevision:row.published_revision===null?null:Number(row.published_revision),draft:row.draft,live:row.live??null,updatedAt:new Date(row.updated_at).toISOString(),source:row.source,publicationId:row.publication_id??null,publicationState:row.publication_state==='superseded'?null:row.publication_state??(row.live?'published':null),publicationError:row.publication_error??null,publicationAttempts:Number(row.publication_attempts??0)};}
function pageInfo(query:{page:number;pageSize:number},total:number):BlogPageInfo{return {...query,total,hasMore:query.page*query.pageSize<total};}
export async function adminBlogPage(actor:Actor,input:unknown={}){const q=blogListQuery.parse(input);return transaction(async c=>{
 await authorizeBlogInTransaction(c,actor,'drafts:read');const identity=blogIdentity(),values=[identity.siteId,identity.environment,q.locale??null,q.categoryId??null,q.authorId??null,q.q,q.state];
 const total=Number((await c.query('select count(*)::int total '+adminFrom+' '+adminWhere,values)).rows[0].total);
 const rows=(await c.query('select '+adminColumns+' '+adminFrom+' '+adminWhere+' order by p.updated_at desc,p.id limit $8 offset $9',[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;
 return {entries:rows.map(adminEntry),...pageInfo({page:q.page,pageSize:q.pageSize},total)};
});}
export async function adminBlogEntry(actor:Actor,id:string){z.string().uuid().parse(id);return transaction(async c=>{
 await authorizeBlogInTransaction(c,actor,'drafts:read');const identity=blogIdentity();
 const row=(await c.query('select '+adminColumns+' '+adminFrom+' where p.site_id=$1 and p.environment=$2 and p.id=$3',[identity.siteId,identity.environment,id])).rows[0];
 requireThat(row,'POST_NOT_FOUND',404,'Dit artikel bestaat niet.');return adminEntry(row);
});}
export async function listPublicBlogPage(locale:BlogLocale,input:unknown={}){
 const q=blogListQuery.parse(input);z.enum(['nl-NL','en-GB']).parse(locale);const identity=blogIdentity();
 const values=[identity.siteId,identity.environment,locale,q.categoryId??null,q.authorId??null,q.q];
 const where=`where site_id=$1 and environment=$2 and locale=$3 and ($4::text is null or article->>'categoryId'=$4) and ($5::text is null or article->>'authorId'=$5) and ($6='' or position(lower($6) in lower(concat_ws(' ',article->>'title',article->>'slug',article->>'excerpt',article->>'tags')))>0)`;
 const total=Number((await db().query('select count(*)::int total from public.blog_live '+where,values)).rows[0].total);
 const items=(await db().query('select article from public.blog_live '+where+' order by published_at desc,post_id limit $7 offset $8',[...values,q.pageSize,(q.page-1)*q.pageSize])).rows.map(row=>row.article as BlogArticle);
 return {items,...pageInfo({page:q.page,pageSize:q.pageSize},total)};
}
