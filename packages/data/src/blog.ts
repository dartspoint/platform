import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {db,transaction,audit} from './db';
import {DomainError,requireThat} from '../../contracts/src/index';
import {currentSocialHeroPolicy} from './socialhero-policy';
import {listBlogTaxonomyInTransaction,resolveBlogTaxonomyInTransaction} from './blog-taxonomy';
import {verifyBlogPublication} from './blog-publication';
import {resolveBlogCanonicalOrigin,BLOG_AUTHORS,BLOG_CATEGORIES,BLOG_CONTRACT_VERSION,BLOG_LOCALES,BLOG_SCHEMA_VERSION,BLOG_SCOPES,blogCanonicalPath,blogDraftSchema,blogImageUrl,blogMediaIds,blogSlug,blogTaxonomyId,importBlogMarkdown,parseBlogDocument,type BlogAdminEntry,type BlogArticle,type BlogDraft,type BlogLocale,type BlogScope,type BlogDocument} from '../../contracts/src/blog';
export type SocialHeroScope=BlogScope|'read'|'draft'|'publish';
export type BlogPrincipal={kind:'socialhero';tokenId:string;siteId:string;environment:string;scopes:SocialHeroScope[];connectionId?:string;destinationId?:string;credentialState?:'pending'|'active'};
type Principal=Actor|BlogPrincipal;
const integration=(p:Principal):p is BlogPrincipal=>'kind' in p&&p.kind==='socialhero';
export function blogIdentity(){const environment=process.env.APP_ENV??'development';requireThat(['development','staging','production'].includes(environment),'BLOG_CONFIGURATION_INVALID',503);const siteId=process.env.BLOG_SITE_ID??'dartspoint';requireThat(/^[a-z0-9][a-z0-9-]{0,79}$/.test(siteId),'BLOG_CONFIGURATION_INVALID',503);return {siteId,environment};}
export function blogCanonicalOrigin(locale:BlogLocale){try{return resolveBlogCanonicalOrigin(locale,{environment:blogIdentity().environment,appUrl:process.env.NEXT_PUBLIC_APP_URL,nlOrigin:process.env.BLOG_CANONICAL_NL_ORIGIN,enOrigin:process.env.BLOG_CANONICAL_EN_ORIGIN});}catch{throw new DomainError('BLOG_CONFIGURATION_INVALID',503);}}
export const blogPublicUrl=(draft:Pick<BlogDraft,'locale'|'slug'>)=>blogCanonicalOrigin(draft.locale)+blogCanonicalPath(draft.locale,draft.slug,blogIdentity().environment);
function grants(scopes:SocialHeroScope[],scope:BlogScope){
 const contractScope=scope==='capabilities:read'||scope==='drafts:read'?'read':scope==='posts:publish'?'publish':'draft';
 return scopes.includes(scope)||scopes.includes(contractScope);
}
function validCredential(row:any){return row&&['pending','active'].includes(row.credential_state)&&(row.credential_state==='active'||row.provisioning_expires_at&&new Date(row.provisioning_expires_at).getTime()>Date.now());}
async function permission(c:PoolClient,p:Principal,scope:BlogScope){
 const identity=blogIdentity();
 if(integration(p)){
  requireThat(p.siteId===identity.siteId&&p.environment===identity.environment,'PERMISSION_DENIED',403);
  // Administration uses settings -> credential too; keep one lock order for revocation/policy races.
  const policy=await currentSocialHeroPolicy(c,p.destinationId);
  const row=(await c.query('select scopes,connection_id,destination_id,credential_state,provisioning_expires_at from private.blog_tokens where id=$1 and site_id=$2 and environment=$3 and revoked_at is null and expires_at>now() for share',[p.tokenId,identity.siteId,identity.environment])).rows[0];
  requireThat(validCredential(row)&&(row.destination_id??null)===(p.destinationId??null)&&(row.connection_id??null)===(p.connectionId??null),'INVALID_CREDENTIAL',401,'De verbinding is ongeldig of ingetrokken.');
  p.scopes=row.scopes;p.credentialState=row.credential_state;
  requireThat(row.credential_state!=='pending'||scope==='capabilities:read','PAIRING_IN_PROGRESS',409,'De koppeling wordt nog gecontroleerd.');
  requireThat(grants(row.scopes,scope),'PERMISSION_DENIED',403,'De verbinding heeft geen toestemming voor deze actie.');
  if(['media:write','drafts:write'].includes(scope))requireThat(policy.draftEnabled,'PERMISSION_DENIED',403,'Conceptbewerking door SocialHero is lokaal uitgeschakeld.');
  if(scope==='posts:publish')requireThat(grants(row.scopes,'drafts:write')&&policy.publishEnabled,'PERMISSION_DENIED',403,'Publiceren door SocialHero is lokaal uitgeschakeld.');return;
 }
 requireThat(p.expiresAt>Date.now(),'session_expired',401);
 const row=(await c.query(`select p.status,p.onboarded_at,p.session_version,p.rename_required,exists(select 1 from public.user_roles r where r.user_id=p.id and r.role in('owner','admin') and r.revoked_at is null) staff,
 exists(select 1 from private.revoked_sessions where session_id=$2::uuid) revoked,
 exists(select 1 from public.sanctions s where s.target_id=p.id and s.room_id is null and s.kind='suspend' and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now()) suspended
 from public.profiles p where p.id=$1 for share of p`,[p.id,p.sessionId??null])).rows[0];
 requireThat(row?.status==='active'&&row.staff&&!row.suspended,'forbidden',403);requireThat(row.onboarded_at,'unauthenticated',401);requireThat(Number(row.session_version)===p.sessionVersion,'session_revoked',401);requireThat(!row.rename_required,'rename_required',403,'Kies eerst een nieuwe gebruikersnaam.');requireThat(!row.revoked,'session_revoked',401);
 // Hold role rows until commit so a simultaneous revocation cannot race this write.
 const roles=await c.query("select role from public.user_roles where user_id=$1 and role in('owner','admin') and revoked_at is null for share",[p.id]);requireThat(roles.rowCount,'forbidden',403);
}
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function canonical(value:any):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
/** Reservation, mutation and receipt commit together. Replay precedes state-dependent CAS checks. */
async function receipt<T>(c:PoolClient,p:Principal,operation:string,key:string,payload:unknown,write:()=>Promise<T>):Promise<T>{
 requireThat(typeof key==='string'&&/^[A-Za-z0-9_:/.-]{1,240}$/.test(key),'INVALID_REQUEST',400,'Een geldige Idempotency-Key is verplicht.');
 const {siteId,environment}=blogIdentity(),principal=integration(p)?'socialhero'+(p.destinationId?':'+p.destinationId:''):'user:'+p.id,fingerprint=hash(canonical(payload));
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([siteId,environment,principal,operation,key])]);
 const prior=(await c.query('select fingerprint,result from private.blog_operation_receipts where site_id=$1 and environment=$2 and principal=$3 and operation=$4 and key=$5',[siteId,environment,principal,operation,key])).rows[0];
 if(prior){requireThat(prior.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT',409);return operation==='post.publish'?refreshPublicationResult(c,p,prior.result):prior.result as T;}
 const result=await write();await c.query('insert into private.blog_operation_receipts(site_id,environment,principal,operation,key,fingerprint,result) values($1,$2,$3,$4,$5,$6,$7)',[siteId,environment,principal,operation,key,fingerprint,JSON.stringify(result)]);return result;
}
export async function authenticateBlogToken(token:string,scope?:BlogScope):Promise<BlogPrincipal>{
 requireThat(typeof token==='string'&&token.length>=32&&token.length<=2048&&!/[\s\u0000-\u001f\u007f]/.test(token),'INVALID_CREDENTIAL',401,'De verbinding is ongeldig of ingetrokken.');
 const {siteId,environment}=blogIdentity();const row=(await db().query('select id,scopes,connection_id,destination_id,credential_state,provisioning_expires_at from private.blog_tokens where token_hash=$1 and site_id=$2 and environment=$3 and revoked_at is null and expires_at>now()',[hash(token),siteId,environment])).rows[0];
 requireThat(validCredential(row),'INVALID_CREDENTIAL',401,'De verbinding is ongeldig of ingetrokken.');
 requireThat(row.credential_state!=='pending'||!scope||scope==='capabilities:read','PAIRING_IN_PROGRESS',409,'De koppeling wordt nog gecontroleerd.');
 requireThat(!scope||grants(row.scopes,scope),'PERMISSION_DENIED',403);return {kind:'socialhero',tokenId:row.id,siteId,environment,scopes:row.scopes,...(row.connection_id?{connectionId:row.connection_id}:{}),...(row.destination_id?{destinationId:row.destination_id}:{}),credentialState:row.credential_state};
}
async function tokenOwner(c:PoolClient,actor:Actor){await permission(c,actor,'capabilities:read');requireThat((await c.query("select role from public.user_roles where user_id=$1 and role='owner' and revoked_at is null for share",[actor.id])).rowCount,'forbidden',403);}
export const authorizeBlogInTransaction=permission;
export const authorizeBlogTokenOwnerInTransaction=tokenOwner;
const tokenInput=z.object({label:z.string().trim().min(1).max(100),scopes:z.array(z.enum(BLOG_SCOPES)).min(1).max(5).refine(s=>new Set(s).size===s.length),expiresAt:z.string().datetime({offset:true})}).strict();
export async function createBlogToken(actor:Actor,input:unknown){const p=tokenInput.parse(input);requireThat(Date.parse(p.expiresAt)>Date.now()&&Date.parse(p.expiresAt)<=Date.now()+366*86400000,'INVALID_REQUEST',400,'Kies een vervaldatum binnen een jaar.');return transaction(async c=>{await tokenOwner(c,actor);const token='dp_blog_'+randomBytes(32).toString('base64url'),identity=blogIdentity();const row=(await c.query('insert into private.blog_tokens(site_id,environment,label,token_hash,scopes,created_by,expires_at) values($1,$2,$3,$4,$5,$6,$7) returning id',[identity.siteId,identity.environment,p.label,hash(token),p.scopes,actor.id,p.expiresAt])).rows[0];await audit(c,actor.id,'blog.token.create',row.id,{siteId:identity.siteId,environment:identity.environment,scopes:p.scopes});return {id:row.id,token,...p};});}
export async function revokeBlogToken(actor:Actor,id:string){z.string().uuid().parse(id);return transaction(async c=>{await tokenOwner(c,actor);const i=blogIdentity();await c.query('update private.blog_tokens set revoked_at=coalesce(revoked_at,now()) where id=$1 and site_id=$2 and environment=$3',[id,i.siteId,i.environment]);await audit(c,actor.id,'blog.token.revoke',id);return {ok:true};});}
export async function listBlogTokens(actor:Actor){return transaction(async c=>{await tokenOwner(c,actor);const i=blogIdentity();return (await c.query('select id,label,scopes,created_at "createdAt",expires_at "expiresAt",revoked_at "revokedAt" from private.blog_tokens where site_id=$1 and environment=$2 order by created_at desc',[i.siteId,i.environment])).rows;});}
export async function blogCapabilities(principal:BlogPrincipal){return transaction(async c=>{
 await permission(c,principal,'capabilities:read');
 const paired=!!principal.destinationId,policy=await currentSocialHeroPolicy(c,principal.destinationId),publish=grants(principal.scopes,'posts:publish')&&policy.publishEnabled,draft=grants(principal.scopes,'drafts:write')&&policy.draftEnabled;
 const scopes=paired?[...(grants(principal.scopes,'capabilities:read')?['read']:[]),...(draft?['draft']:[]),...(publish?['publish']:[])]:principal.scopes.filter(scope=>scope!=='posts:publish'||publish).filter(scope=>!['drafts:write','media:write'].includes(scope)||draft);
 const taxonomy=await listBlogTaxonomyInTransaction(c,blogIdentity(),false);
 return {...blogIdentity(),contractVersion:paired?1:BLOG_CONTRACT_VERSION,connectionId:principal.connectionId??null,destinationId:principal.destinationId??null,credentialState:principal.credentialState??'active',siteName:process.env.BLOG_SITE_NAME??'DartsPoint',origin:blogApiOrigin(),blogPath:'/blog',publicOrigins:{'nl-NL':[blogCanonicalOrigin('nl-NL')],'en-GB':[blogCanonicalOrigin('en-GB')]},canonicalOrigins:{'nl-NL':[blogCanonicalOrigin('nl-NL')],'en-GB':[blogCanonicalOrigin('en-GB')]},scopes,permissions:{media:grants(principal.scopes,'media:write')&&policy.draftEnabled,drafts:draft,publish},locales:BLOG_LOCALES,contentTypes:['blog','article'],content:{formats:['markdown','tiptap-json'],schemaVersion:BLOG_SCHEMA_VERSION,nodes:['paragraph','heading','blockquote','bulletList','orderedList','taskList','codeBlock','image','table'],embeds:false},authors:taxonomy.authors.map(({id,name})=>({id,name})),categories:taxonomy.categories.map(({id,name})=>({id,name})),optionalFields:['slug','excerpt','authorId','categoryId','tags','seo','hero','ogImageAssetId'],publicationRequirements:['excerpt','hero.assetId','hero.alt'],media:{mimeTypes:['image/png','image/jpeg','image/webp'],formats:['image/png','image/jpeg','image/webp'],maxBytes:8388608,maxPixels:50000000}};
 });}
export function blogApiOrigin(){
 const value=process.env.NEXT_PUBLIC_APP_URL??blogCanonicalOrigin('nl-NL');let url:URL;
 try{url=new URL(value);}catch{throw new DomainError('BLOG_CONFIGURATION_INVALID',503);}
 requireThat(url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password&&(url.protocol==='https:'||blogIdentity().environment==='development'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)),'BLOG_CONFIGURATION_INVALID',503);return url.origin;
}
async function checkedDraft(c:PoolClient,p:Principal,input:unknown,previous?:BlogDraft):Promise<BlogDraft>{
 const parsed=blogDraftSchema.parse(input);const draft={...parsed,...await resolveBlogTaxonomyInTransaction(c,blogIdentity(),parsed,previous)} as BlogDraft;
 if(integration(p)&&draft.translationOfId){const i=blogIdentity();requireThat((await c.query('select 1 from private.blog_posts where id=$1 and site_id=$2 and environment=$3 and destination_id is not distinct from $4',[draft.translationOfId,i.siteId,i.environment,p.destinationId??null])).rowCount,'PERMISSION_DENIED',403,'Deze vertaling hoort bij een andere bestemming.');}
 const ids=blogMediaIds(draft),identity=blogIdentity();if(!ids.length)return draft;
 const assets=(await c.query('select id,width,height,token_id,destination_id from private.blog_media where id=any($1::uuid[]) and site_id=$2 and environment=$3',[ids,identity.siteId,identity.environment])).rows;
 requireThat(assets.length===ids.length&&(!integration(p)||assets.every(asset=>asset.token_id&&(asset.destination_id??null)===(p.destinationId??null))),'INVALID_CONTENT',422,'Een afbeelding hoort niet bij deze website en bestemming.');
 for(const image of [draft.hero,draft.ogImage].filter(Boolean))if(image!.assetId){const asset=assets.find(asset=>asset.id===image!.assetId);requireThat(asset.width===image!.width&&asset.height===image!.height,'INVALID_CONTENT',422,'Afbeeldingsmaten komen niet overeen.');}
 const walk=(n:BlogDocument)=>{if(n.type==='image'){const asset=assets.find(asset=>asset.id===n.attrs!.assetId)!;const width=n.attrs!.width,height=n.attrs!.height;requireThat(width==null||height==null||Math.abs(width*asset.height-height*asset.width)<=Math.max(asset.width,asset.height)*2,'INVALID_CONTENT',422,'Behoud de verhouding van de afbeelding.');}n.content?.forEach(walk);};walk(draft.content);return draft;
}
async function reserveSlug(c:PoolClient,id:string,draft:BlogDraft){const i=blogIdentity();await c.query('insert into private.blog_slug_reservations(site_id,environment,locale,slug,post_id) values($1,$2,$3,$4,$5) on conflict do nothing',[i.siteId,i.environment,draft.locale,draft.slug,id]);const row=(await c.query('select post_id from private.blog_slug_reservations where site_id=$1 and environment=$2 and locale=$3 and slug=$4',[i.siteId,i.environment,draft.locale,draft.slug])).rows[0];requireThat(row?.post_id===id,'SLUG_CONFLICT',409,'Deze URL is al gereserveerd.');}
const projection=`p.id,p.external_id,p.source,p.draft_revision,p.published_revision,p.published_at,p.updated_at,d.document draft,l.article live`;
async function entry(c:PoolClient,id:string):Promise<BlogAdminEntry>{const i=blogIdentity(),row=(await c.query(`select ${projection},pub.id publication_id,pub.state publication_state,pub.last_error_code,pub.attempts from private.blog_posts p join private.blog_revisions d on d.post_id=p.id and d.revision=p.draft_revision left join public.blog_live l on l.post_id=p.id left join private.blog_publications pub on pub.post_id=p.id and pub.revision=p.published_revision where p.id=$1 and p.site_id=$2 and p.environment=$3`,[id,i.siteId,i.environment])).rows[0];requireThat(row,'POST_NOT_FOUND',404);return {id:row.id,revision:Number(row.draft_revision),liveRevision:row.published_revision==null?null:Number(row.published_revision),draft:row.draft,live:row.live,updatedAt:new Date(row.updated_at).toISOString(),source:row.source,publicationId:row.publication_id??null,publicationState:row.publication_state??(row.live?'published':null),publicationError:row.last_error_code??null,publicationAttempts:Number(row.attempts??0)};}
async function save(c:PoolClient,p:Principal,input:{id?:string;revision?:number;draft:unknown;confirmSlugChange?:boolean},externalId?:string):Promise<BlogAdminEntry>{
 const identity=blogIdentity(),id=input.id??randomUUID();
 let row=(await c.query('select * from private.blog_posts where id=$1 and site_id=$2 and environment=$3 for update',[id,identity.siteId,identity.environment])).rows[0];
 const previous=row?(await c.query('select document from private.blog_revisions where post_id=$1 and revision=$2',[id,row.draft_revision])).rows[0]?.document as BlogDraft:undefined;
 const parsed=blogDraftSchema.parse(input.draft),draft=await checkedDraft(c,p,{...parsed,slugMode:parsed.slugMode??'manual',...(parsed.slugMode==='auto'?{slug:row?.published_revision?previous!.slug:blogSlug(parsed.title)||parsed.slug}:{})},previous);
 if(row){requireThat(input.revision!==undefined,'PRECONDITION_REQUIRED',428);requireThat(Number(row.draft_revision)===input.revision,'REVISION_CONFLICT',412);if(!integration(p)){const live=(await c.query('select slug,locale from public.blog_live where post_id=$1',[id])).rows[0];requireThat(!live||(live.slug===draft.slug&&live.locale===draft.locale)||input.confirmSlugChange,'SLUG_CHANGE_CONFIRMATION_REQUIRED',409,'Bevestig de wijziging van de openbare URL.');}}
 else {requireThat(input.revision===undefined,'REVISION_CONFLICT',412);await c.query('insert into private.blog_posts(id,site_id,environment,external_id,source,destination_id) values($1,$2,$3,$4,$5,$6)',[id,identity.siteId,identity.environment,externalId??null,integration(p)?'socialhero':'redactie',integration(p)?p.destinationId??null:null]);row={draft_revision:0};}
 await reserveSlug(c,id,draft);const revision=Number(row.draft_revision)+1;
 await c.query('insert into private.blog_revisions(post_id,revision,document,created_by) values($1,$2,$3,$4)',[id,revision,JSON.stringify(draft),integration(p)?null:p.id]);
 for(const mediaId of blogMediaIds(draft))await c.query('insert into private.blog_media_references(asset_id,post_id,revision) values($1,$2,$3)',[mediaId,id,revision]);
 await c.query('update private.blog_posts set draft_revision=$2,updated_at=now() where id=$1',[id,revision]);
 await audit(c,integration(p)?null:p.id,'blog.draft.save',id,{revision,source:integration(p)?'socialhero':'redactie'});return entry(c,id);
}
export async function blogAdmin(actor:Actor){return transaction(async c=>{await permission(c,actor,'drafts:read');const i=blogIdentity(),ids=(await c.query('select id from private.blog_posts where site_id=$1 and environment=$2 order by updated_at desc limit 500',[i.siteId,i.environment])).rows;const results:BlogAdminEntry[]=[];for(const row of ids)results.push(await entry(c,row.id));return results;});}
const manualSave=z.object({id:z.string().uuid().optional(),revision:z.number().int().positive().optional(),requestId:z.string().uuid().optional(),confirmSlugChange:z.boolean().optional(),draft:z.unknown()}).strict();
export async function saveBlogDraft(actor:Actor,input:unknown):Promise<BlogAdminEntry>{const p=manualSave.parse(input);return transaction(async c=>{await permission(c,actor,'drafts:write');return receipt(c,actor,'draft.save',p.requestId??randomUUID(),p,()=>save(c,actor,p));});}
async function publish(c:PoolClient,p:Principal,id:string,revision:number):Promise<BlogAdminEntry>{
 const i=blogIdentity(),row=(await c.query('select * from private.blog_posts where id=$1 and site_id=$2 and environment=$3 for update',[id,i.siteId,i.environment])).rows[0];requireThat(row,'POST_NOT_FOUND',404);requireThat(Number(row.draft_revision)===revision,'REVISION_CONFLICT',integration(p)&&p.destinationId?409:412);
 const document=(await c.query('select document from private.blog_revisions where post_id=$1 and revision=$2',[id,revision])).rows[0]?.document;const draft=await checkedDraft(c,p,document,document);
 requireThat(draft.hero.assetId&&draft.hero.alt.trim()&&draft.excerpt.trim(),'INVALID_CONTENT',422,'Vul samenvatting en hero met beschrijvende alt-tekst in.');
 const hasContent=(node:BlogDocument):boolean=>node.type==='image'||node.type==='text'&&!!node.text?.trim()||!!node.content?.some(hasContent);requireThat(hasContent(draft.content),'INVALID_CONTENT',422,'Vul de artikelinhoud in voordat je publiceert.');
 requireThat(!draft.ogImage||draft.ogImage.assetId&&draft.ogImage.alt.trim(),'INVALID_CONTENT',422,'Vul alt-tekst in voor het deelbeeld.');
 const walk=(n:BlogDocument)=>{if(n.type==='image')requireThat(n.attrs!.alt.trim(),'INVALID_CONTENT',422,'Vul alt-tekst in voor elke afbeelding.');n.content?.forEach(walk);};walk(draft.content);
 await reserveSlug(c,id,draft);await publicationTranslations(c,p,id,draft);
 const existing=(await c.query('select id,proof_token from private.blog_publications where post_id=$1 and revision=$2',[id,revision])).rows[0];
 if(existing&&Number(row.published_revision)===revision)return entry(c,id);
 const publicationId=existing?.id??randomUUID(),proof=existing?.proof_token??randomBytes(32).toString('base64url');
 const now=(await c.query('select now() stamp')).rows[0].stamp,article={...draft,id,revision,publicationProof:proof,...(row.external_id?{externalId:row.external_id}:{}),publishedAt:new Date(row.published_at??now).toISOString(),updatedAt:new Date(now).toISOString()} as BlogArticle;
 // Permission and current destination consent remain locked until the public projection commits.
 await permission(c,p,'posts:publish');
 await c.query("update private.blog_publications set state='superseded' where post_id=$1 and revision<>$2 and state='publishing'",[id,revision]);
 await c.query("insert into private.blog_publications(id,post_id,revision,site_id,environment,destination_id,token_id,public_url,proof_token,state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'publishing') on conflict(post_id,revision) do nothing",[publicationId,id,revision,i.siteId,i.environment,integration(p)?p.destinationId??null:null,integration(p)?p.tokenId:null,blogPublicUrl(draft),proof]);
 await c.query('update private.blog_slug_reservations set is_public=true where site_id=$1 and environment=$2 and locale=$3 and slug=$4 and post_id=$5',[i.siteId,i.environment,draft.locale,draft.slug,id]);
 await c.query('insert into public.blog_live(post_id,site_id,environment,locale,slug,revision,article,published_at) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(post_id) do update set locale=excluded.locale,slug=excluded.slug,revision=excluded.revision,article=excluded.article,published_at=excluded.published_at',[id,i.siteId,i.environment,draft.locale,draft.slug,revision,JSON.stringify(article),now]);
 await c.query('update private.blog_posts set published_revision=$2,published_at=coalesce(published_at,$3),updated_at=$3 where id=$1',[id,revision,now]);await audit(c,integration(p)?null:p.id,'blog.publish',id,{revision});return entry(c,id);
}
export async function publishBlog(actor:Actor,input:unknown):Promise<BlogAdminEntry>{const p=z.object({id:z.string().uuid(),revision:z.number().int().positive(),requestId:z.string().uuid().optional()}).strict().parse(input);return transaction(async c=>{await permission(c,actor,'posts:publish');return receipt(c,actor,'post.publish',p.requestId??randomUUID(),p,()=>publish(c,actor,p.id,p.revision));});}
export async function blogPreview(actor:Actor,id:string,revision?:number){z.string().uuid().parse(id);return transaction(async c=>{await permission(c,actor,'drafts:read');const current=await entry(c,id);const n=revision??current.revision;requireThat(Number.isSafeInteger(n)&&n>0,'INVALID_REQUEST',400);const row=(await c.query('select document from private.blog_revisions where post_id=$1 and revision=$2',[id,n])).rows[0];requireThat(row,'POST_NOT_FOUND',404);return {...row.document,id,revision:n,publishedAt:current.live?.publishedAt??current.updatedAt,updatedAt:current.updatedAt} as BlogArticle;});}
export async function listPublishedBlogArticles(locale?:BlogLocale):Promise<BlogArticle[]>{const i=blogIdentity();if(locale)z.enum(BLOG_LOCALES).parse(locale);return (await db().query('select article from public.blog_live where site_id=$1 and environment=$2 and ($3::text is null or locale=$3) order by published_at desc,post_id',[i.siteId,i.environment,locale??null])).rows.map(r=>r.article);}
export async function getPublishedBlogArticle(slug:string,locale:BlogLocale):Promise<BlogArticle|null>{const i=blogIdentity();return (await db().query('select article from public.blog_live where site_id=$1 and environment=$2 and locale=$3 and slug=$4',[i.siteId,i.environment,locale,slug])).rows[0]?.article??null;}
export async function getPublishedBlogRedirect(slug:string,locale:BlogLocale):Promise<string|null>{const i=blogIdentity();return (await db().query('select l.slug,l.locale from private.blog_slug_reservations r join public.blog_live l on l.post_id=r.post_id where r.site_id=$1 and r.environment=$2 and r.locale=$3 and r.slug=$4 and r.is_public and (l.slug<>r.slug or l.locale<>r.locale)',[i.siteId,i.environment,locale,slug])).rows.map(r=>blogCanonicalOrigin(r.locale)+blogCanonicalPath(r.locale,r.slug,blogIdentity().environment))[0]??null;}
export async function authorizeBlog(principal:Principal,scope:BlogScope='drafts:read'){return transaction(async c=>{await permission(c,principal,scope);});}
const externalIdSchema=z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
async function externalPost(c:PoolClient,p:BlogPrincipal,externalId:string,lock=false){const i=blogIdentity();return (await c.query('select * from private.blog_posts where site_id=$1 and environment=$2 and external_id=$3 and destination_id is not distinct from $4'+(lock?' for update':''),[i.siteId,i.environment,externalId,p.destinationId??null])).rows[0];}
function status(post:BlogAdminEntry,externalId:string,p:BlogPrincipal,created=false){return {postId:post.id,id:post.id,externalId,slug:post.draft.slug,state:post.publicationState==='publishing'?'publishing':post.live?'published':'draft',revision:post.revision,status:post.liveRevision===null?'draft':post.liveRevision===post.revision?'published':'draft',draftRevision:p.destinationId&&post.liveRevision===post.revision?null:post.revision,publishedRevision:post.liveRevision,previewUrl:blogApiOrigin()+'/beheer/blog/preview/'+post.id+'?revision='+post.revision,publicUrl:post.live?blogPublicUrl(post.live):null,publishedAt:post.live?.publishedAt??null,publicationId:post.publicationId,publicationState:post.publicationState,publicationError:post.publicationError,publicationAttempts:post.publicationAttempts,created};}
export async function getSocialHeroPost(p:BlogPrincipal,externalId:string){externalIdSchema.parse(externalId);return transaction(async c=>{await permission(c,p,'drafts:read');const row=await externalPost(c,p,externalId);requireThat(row,'POST_NOT_FOUND',404);return status(await entry(c,row.id),externalId,p);});}
const socialPayload=z.object({baseRevision:z.number().int().positive().nullable().optional(),type:z.enum(['blog','article']),locale:z.enum(BLOG_LOCALES),title:z.string().trim().min(1).max(160),slug:z.string().trim().min(1).max(110).optional(),excerpt:z.string().trim().max(360).optional(),content:z.discriminatedUnion('format',[z.object({format:z.literal('markdown'),body:z.string().max(150000)}).strict(),z.object({format:z.literal('tiptap-json'),schemaVersion:z.literal(BLOG_SCHEMA_VERSION),body:z.unknown()}).strict()]),seo:z.object({title:z.string().max(160).optional(),description:z.string().max(320).optional()}).strict().optional(),translationOfId:z.string().uuid().optional(),authorId:blogTaxonomyId.optional(),categoryId:blogTaxonomyId.optional(),tags:z.array(z.string().max(40)).max(20).optional(),hero:z.object({assetId:z.string().uuid(),alt:z.string().trim().min(1).max(250),focalPoint:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict().optional()}).strict().optional(),ogImageAssetId:z.string().uuid().optional(),ogImageAlt:z.string().trim().max(250).optional()}).strict();
async function socialDraft(c:PoolClient,p:BlogPrincipal,s:z.infer<typeof socialPayload>,previous?:BlogDraft):Promise<BlogDraft>{
 let content:BlogDocument;try{content=s.content.format==='markdown'?importBlogMarkdown(s.content.body):parseBlogDocument(s.content.body);}catch{throw new DomainError('INVALID_CONTENT',422,'De artikelinhoud bevat niet-toegestane opmaak, links of afbeeldingen.');}
 const i=blogIdentity();const media=async(id:string,alt:string)=>{const row=(await c.query('select width,height from private.blog_media where id=$1 and site_id=$2 and environment=$3 and token_id is not null and destination_id is not distinct from $4',[id,i.siteId,i.environment,p.destinationId??null])).rows[0];requireThat(row,'INVALID_CONTENT',422,'Een afbeelding hoort niet bij deze website en bestemming.');return {assetId:id,url:blogImageUrl(id),alt,width:row.width,height:row.height};};
 const hero=s.hero?{...await media(s.hero.assetId,s.hero.alt),focalPoint:s.hero.focalPoint??{x:.5,y:.5}}:previous?.hero??{assetId:'',url:'',alt:'',width:0,height:0,focalPoint:{x:.5,y:.5}};
 const excerpt=s.excerpt??previous?.excerpt??'',taxonomy=await resolveBlogTaxonomyInTransaction(c,i,{authorId:s.authorId,categoryId:s.categoryId},previous);
 const ogImage=s.ogImageAssetId?await media(s.ogImageAssetId,s.ogImageAlt??hero.alt):previous?.ogImage;
 return {...(s.translationOfId??previous?.translationOfId?{translationOfId:s.translationOfId??previous?.translationOfId}:{}),type:s.type,locale:s.locale,title:s.title,slug:s.slug??previous?.slug??(blogSlug(s.title)||'artikel-'+randomUUID().slice(0,8)),slugMode:s.slug?'manual':previous?.slugMode??(previous?'manual':'auto'),excerpt,seo:{title:s.seo?.title??previous?.seo.title??s.title,description:s.seo?.description??previous?.seo.description??excerpt},...taxonomy,tags:s.tags??previous?.tags??[],content,hero,...(ogImage?{ogImage}:{})};
}
export async function saveSocialHeroDraft(p:BlogPrincipal,externalId:string,payload:unknown,options:{key:string;ifMatch?:string;createOnly?:boolean}){
 externalIdSchema.parse(externalId);return transaction(async c=>{await permission(c,p,'drafts:write');return receipt(c,p,'draft.save',options.key,p.destinationId?{externalId,payload}:{externalId,payload,ifMatch:options.ifMatch??null,createOnly:!!options.createOnly},async()=>{
  const i=blogIdentity();await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[canonical(['blog.external',i.siteId,i.environment,p.destinationId??null,externalId])]);const row=await externalPost(c,p,externalId,true),input=socialPayload.parse(payload);
  if(p.destinationId||input.baseRevision!==undefined){
   requireThat(input.baseRevision!==undefined,'INVALID_CONTENT',422,'baseRevision is verplicht; gebruik null voor een nieuw concept.');
   requireThat(row?input.baseRevision===Number(row.draft_revision):input.baseRevision===null,'REVISION_CONFLICT',409,'Het artikel is intussen gewijzigd. Lees de actuele revisie opnieuw.');
  }else if(row){requireThat(!options.createOnly,'REVISION_CONFLICT',412);requireThat(options.ifMatch,'PRECONDITION_REQUIRED',428);requireThat(options.ifMatch==='"'+row.draft_revision+'"','REVISION_CONFLICT',412);}
  else requireThat(options.createOnly&&!options.ifMatch,'PRECONDITION_REQUIRED',428,'Gebruik If-None-Match: * om een nieuw artikel aan te maken.');
  const previous=row?(await entry(c,row.id)).draft:undefined,draft=await socialDraft(c,p,input,previous);return status(await save(c,p,{...(row?{id:row.id,revision:Number(row.draft_revision)}:{}),draft},externalId),externalId,p,!row);
 });});
}
export async function publishSocialHeroPost(p:BlogPrincipal,externalId:string,revision:number,key:string){externalIdSchema.parse(externalId);z.number().int().positive().parse(revision);return transaction(async c=>{await permission(c,p,'posts:publish');return receipt(c,p,'post.publish',key,{externalId,revision},async()=>{const row=await externalPost(c,p,externalId,true);requireThat(row,'POST_NOT_FOUND',404);if(p.destinationId)requireThat(Number(row.draft_revision)===revision,'REVISION_CONFLICT',409,'Het artikel is intussen gewijzigd.');return status(await publish(c,p,row.id,revision),externalId,p);});});}

/** Publication receipts retain their operation identity while proof status advances durably. */
async function refreshPublicationResult(c:PoolClient,p:Principal,value:any):Promise<any>{
 if(!value?.publicationId)return value;
 const i=blogIdentity(),op=(await c.query('select state,last_error_code,attempts from private.blog_publications where id=$1 and site_id=$2 and environment=$3',[value.publicationId,i.siteId,i.environment])).rows[0];
 if(!op)return value;
 if(op.state==='superseded')return {...value,publicationState:'publishing',publicationError:'PUBLICATION_SUPERSEDED',publicationAttempts:Number(op.attempts),operationState:'superseded',retryable:false,...(typeof value.externalId==='string'?{state:'publishing'}:{})};
 return {...value,publicationState:op.state,publicationError:op.last_error_code??null,publicationAttempts:Number(op.attempts),...(typeof value.externalId==='string'?{state:op.state}:{})};
}
export async function refreshBlogPublicationResult<T>(principal:Principal,value:T):Promise<T>{return transaction(async c=>{await permission(c,principal,'drafts:read');return refreshPublicationResult(c,principal,value);});}

/** A bounded lease survives crashes; the worker and API retries share this exact recovery path. */
export async function processBlogPublication(id:string,transport:typeof fetch=fetch):Promise<boolean>{
 z.string().uuid().parse(id);const i=blogIdentity();
 const pending=await transaction(async c=>{
  const op=(await c.query("select * from private.blog_publications where id=$1 and site_id=$2 and environment=$3 and state='publishing' and next_attempt_at<=now() for update skip locked",[id,i.siteId,i.environment])).rows[0];
  if(!op)return null;
  await c.query("update private.blog_publications set attempts=attempts+1,next_attempt_at=now()+interval '30 seconds' where id=$1",[id]);
  const live=(await c.query('select article,revision from public.blog_live where post_id=$1 and site_id=$2 and environment=$3',[op.post_id,i.siteId,i.environment])).rows[0];
  return {...op,attempts:Number(op.attempts)+1,live:live?.article as BlogArticle|undefined};
 });
 if(!pending)return false;
 const live=pending.live;
 if(!live||live.revision!==Number(pending.revision)||live.publicationProof!==pending.proof_token){await db().query("update private.blog_publications set state='superseded',last_error_code=null where id=$1 and state='publishing'",[id]);return false;}
 const expectedUrl=blogPublicUrl(live);
 const proof=pending.public_url===expectedUrl?await verifyBlogPublication({url:expectedUrl,origin:blogCanonicalOrigin(live.locale),proof:pending.proof_token,revision:live.revision,...(live.externalId?{externalId:live.externalId}:{})},transport):{verified:false as const,code:'PUBLICATION_DESTINATION_INVALID'};
 return transaction(async c=>{
  // Lock in the same order as publishing; a delayed check can never confirm a superseded revision.
  await c.query('select id from private.blog_posts where id=$1 and site_id=$2 and environment=$3 for update',[pending.post_id,i.siteId,i.environment]);
  const op=(await c.query('select state from private.blog_publications where id=$1 for update',[id])).rows[0];
  if(op?.state!=='publishing')return op?.state==='published';
  const current=(await c.query('select revision,article from public.blog_live where post_id=$1',[pending.post_id])).rows[0];
  if(Number(current?.revision)!==Number(pending.revision)||current.article.publicationProof!==pending.proof_token){await c.query("update private.blog_publications set state='superseded',last_error_code=null where id=$1",[id]);return false;}
  if(proof.verified){await c.query("update private.blog_publications set state='published',verified_at=now(),last_error_code=null where id=$1",[id]);return true;}
  const seconds=Math.min(300,2**Math.min(pending.attempts,8));
  await c.query("update private.blog_publications set last_error_code=$2,next_attempt_at=now()+($3::int*interval '1 second') where id=$1",[id,proof.code,seconds]);return false;
 });
}
export async function processPendingBlogPublications(limit=2){
 const i=blogIdentity(),rows=(await db().query("select id from private.blog_publications where site_id=$1 and environment=$2 and state='publishing' and next_attempt_at<=now() order by next_attempt_at,id limit $3",[i.siteId,i.environment,Math.max(1,Math.min(limit,5))])).rows;
 for(const row of rows)await processBlogPublication(row.id);
}
export async function blogAdminEntry(actor:Actor,id:string){z.string().uuid().parse(id);return transaction(async c=>{await permission(c,actor,'drafts:read');return entry(c,id);});}
export type DecodedBlogMedia={bytes:Buffer;width:number;height:number;mime:'image/webp';color?:string;sourceFingerprint?:string};
export async function storeBlogMedia(p:Principal,input:DecodedBlogMedia,key?:string){
 requireThat(Buffer.isBuffer(input.bytes)&&input.bytes.length>0&&input.bytes.length<=8388608&&input.mime==='image/webp'&&Number.isInteger(input.width)&&Number.isInteger(input.height)&&input.width>0&&input.height>0&&input.width<=12000&&input.height<=12000&&input.width*input.height<=50000000&&(input.color===undefined||/^#[a-f0-9]{6}$/.test(input.color)),'INVALID_MEDIA',422);
 const checksum=hash(input.bytes),fingerprint=input.sourceFingerprint?{sourceFingerprint:input.sourceFingerprint}:{checksum,width:input.width,height:input.height,mime:input.mime};
 if(integration(p))requireThat(key,'INVALID_REQUEST',400,'Een geldige Idempotency-Key is verplicht.');
 return transaction(async c=>{await permission(c,p,'media:write');return receipt(c,p,'media.upload',key??randomUUID(),fingerprint,async()=>{const i=blogIdentity(),id=randomUUID();await c.query('insert into private.blog_media(id,site_id,environment,created_by,token_id,mime,image_data,width,height,checksum,color,destination_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,i.siteId,i.environment,integration(p)?null:p.id,integration(p)?p.tokenId:null,input.mime,input.bytes,input.width,input.height,checksum,input.color??null,integration(p)?p.destinationId??null:null]);await audit(c,integration(p)?null:p.id,'blog.media.upload',id,{width:input.width,height:input.height,bytes:input.bytes.length});return {assetId:id,url:blogImageUrl(id),width:input.width,height:input.height,mimeType:input.mime,type:input.mime,...(input.color?{color:input.color}:{})};});});
}
function mediaResult(row:any){requireThat(row,'MEDIA_NOT_FOUND',404);return {data:row.image_data as Buffer,mime:row.mime as string,etag:row.checksum as string};}
export async function readPublicBlogMedia(id:string){z.string().uuid().parse(id);const i=blogIdentity();return mediaResult((await db().query(`select m.image_data,m.mime,m.checksum from private.blog_media m where m.id=$1 and m.site_id=$2 and m.environment=$3 and exists(select 1 from private.blog_media_references r join public.blog_live l on l.post_id=r.post_id and l.revision=r.revision where r.asset_id=m.id)`,[id,i.siteId,i.environment])).rows[0]);}
export async function readPrivateBlogMedia(actor:Actor,id:string){z.string().uuid().parse(id);return transaction(async c=>{await permission(c,actor,'drafts:read');const i=blogIdentity();return mediaResult((await c.query('select image_data,mime,checksum from private.blog_media where id=$1 and site_id=$2 and environment=$3',[id,i.siteId,i.environment])).rows[0]);});}
async function publicationTranslations(c:PoolClient,p:Principal,id:string,draft:BlogDraft){
 const existing=(await c.query('select * from private.blog_translation_pairs where nl_post_id=$1 or en_post_id=$1',[id])).rows[0];
 if(integration(p)&&existing){const otherId=existing.nl_post_id===id?existing.en_post_id:existing.nl_post_id,i=blogIdentity();requireThat((await c.query('select 1 from private.blog_posts where id=$1 and site_id=$2 and environment=$3 and destination_id is not distinct from $4',[otherId,i.siteId,i.environment,p.destinationId??null])).rowCount,'PERMISSION_DENIED',403,'Deze vertaling hoort bij een andere bestemming.');}
 if(existing){requireThat((draft.locale==='nl-NL'?existing.nl_post_id:existing.en_post_id)===id,'INVALID_CONTENT',422,'De taal van gekoppelde vertalingen staat vast.');requireThat(!draft.translationOfId||[existing.nl_post_id,existing.en_post_id].includes(draft.translationOfId)&&draft.translationOfId!==id,'INVALID_CONTENT',422,'Dit artikel is al aan een andere vertaling gekoppeld.');return;}
 if(!draft.translationOfId)return;
 requireThat(draft.translationOfId!==id,'INVALID_CONTENT',422);
 await c.query('select id from private.blog_posts where id=$1 for share',[draft.translationOfId]);
 const i=blogIdentity(),other=(await c.query('select l.post_id,l.locale,p.destination_id from public.blog_live l join private.blog_posts p on p.id=l.post_id where l.post_id=$1 and l.site_id=$2 and l.environment=$3',[draft.translationOfId,i.siteId,i.environment])).rows[0];
 if(integration(p)&&other)requireThat((other.destination_id??null)===(p.destinationId??null),'PERMISSION_DENIED',403,'Deze vertaling hoort bij een andere bestemming.');
 requireThat(other&&other.locale!==draft.locale,'INVALID_CONTENT',422,'Kies een gepubliceerde vertaling in de andere taal.');
 const nl=draft.locale==='nl-NL'?id:other.post_id,en=draft.locale==='en-GB'?id:other.post_id;
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['blog.translation:'+other.post_id]);
 await c.query('insert into private.blog_translation_pairs(nl_post_id,en_post_id) values($1,$2) on conflict do nothing',[nl,en]);
 const pair=(await c.query('select * from private.blog_translation_pairs where nl_post_id=$1 and en_post_id=$2',[nl,en])).rows[0];requireThat(pair,'INVALID_CONTENT',422,'Deze vertaling is al gekoppeld.');
}
export async function getPublishedBlogTranslations(article:BlogArticle):Promise<BlogArticle[]>{const i=blogIdentity();return (await db().query(`select l.article from public.blog_live l where l.site_id=$2 and l.environment=$3 and (l.post_id=$1 or exists(select 1 from private.blog_translation_pairs t where (t.nl_post_id=$1 or t.en_post_id=$1) and l.post_id in(t.nl_post_id,t.en_post_id))) order by l.locale`,[article.id,i.siteId,i.environment])).rows.map(row=>row.article);}
