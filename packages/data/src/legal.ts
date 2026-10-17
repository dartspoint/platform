import knownLegalTranslations from '../../../content/legal/bundled-translations.json';
import {createHash} from 'node:crypto';
import {isLocale,type Locale} from '../../i18n/src/locale';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {db,transaction,audit,outbox} from './db';
import type {Actor} from './auth';
import {requireThat,usernameSchema,DomainError} from '../../contracts/src/index';
import {companyDetails,legalDraftSchema,legalPublishSchema,legalAcceptanceSchema,legalOnboardingSchema,rolloutGateKeys,validatePublicationTiming,type LegalVersion} from '../../contracts/src/legal';
import {assertContentAllowed} from './content-filter';

const versionProjection=`v.id,v.document_key key,v.title,v.version,v.language,v.markdown,v.summary,v.material,v.requires_acceptance "requiresAcceptance",v.created_at "createdAt",p.published_at "publishedAt",p.effective_at "effectiveAt"`;
async function legalPermission(c:PoolClient,actor:Actor,publish=false){
 const row=(await c.query(`select exists(select 1 from public.user_roles where user_id=$1 and role='owner' and revoked_at is null) owner,
 exists(select 1 from public.user_roles where user_id=$1 and role='admin' and revoked_at is null) admin,
 exists(select 1 from private.legal_publishers where user_id=$1 and revoked_at is null) publisher,
 exists(select 1 from public.profiles where id=$1 and status='active') active`,[actor.id])).rows[0];
 requireThat(row.active&&(row.owner||row.admin),'forbidden',403);
 requireThat(!publish||row.owner||row.publisher,'legal_publish_forbidden',403,'Alleen de eigenaar of een expliciet gemachtigde beheerder kan publiceren.');
 return row;
}
export async function getLegalPublicBundle(locale:Locale='nl'){
 const versions=(await db().query(`select ${versionProjection} from private.legal_versions v join private.legal_publications p on p.version_id=v.id order by p.effective_at desc,p.published_at desc,v.created_at desc`)).rows as LegalVersion[];
 const translations=(await db().query(`select t.*,p.published_at from private.legal_translations t join private.legal_translation_publications p on p.translation_id=t.id order by p.published_at desc,t.created_at desc`)).rows;
 const localised=locale==='nl'?versions:versions.flatMap(v=>{
  const translated=translations.find(t=>t.source_version_id===v.id&&t.source_hash===createHash('sha256').update(v.markdown.trim()).digest('hex'));
  return translated?[{...v,language:'en' as const,title:translated.title,summary:translated.summary,markdown:translated.markdown,translationId:translated.id,translationRevision:translated.revision,translationPublishedAt:translated.published_at}]:[];
 });
 const now=Date.now(),current=Object.fromEntries(['terms','privacy','guide'].map(key=>{
  const source=versions.find(v=>v.key===key&&new Date(v.effectiveAt!).getTime()<=now);
  return [key,source?localised.find(v=>v.id===source.id)??null:null];
 }));
 return {company:await getLegalCompany(),locale,current,history:localised,announcements:localised.filter(v=>new Date(v.effectiveAt!).getTime()>now),missing:versions.filter(v=>!localised.some(t=>t.id===v.id)).map(v=>({id:v.id,key:v.key,version:v.version,language:'nl'}))};
}
export async function getLegalCompany():Promise<typeof companyDetails>{return (await db().query('select data from private.legal_company_versions order by created_at desc limit 1')).rows[0]?.data??companyDetails;}
export async function saveLegalCompany(actor:Actor,input:unknown){const p=z.object({company:z.object({name:z.string().trim().min(2).max(150),address:z.string().trim().min(3).max(150),postalCode:z.string().trim().min(4).max(20),city:z.string().trim().min(2).max(100),chamberOfCommerce:z.string().regex(/^\d{8}$/),email:z.string().email().max(254),supportEmail:z.literal('support@dartspoint.nl')}).strict(),reason:z.string().trim().min(5).max(500)}).strict().parse(input);return transaction(async c=>{await legalPermission(c,actor,true);await c.query('insert into private.legal_company_versions(data,created_by) values($1,$2)',[JSON.stringify(p.company),actor.id]);await audit(c,actor.id,'legal.company','company',{},p.reason);return {ok:true};});}
export async function getLegalAdminBundle(actor:Actor){return transaction(async c=>{
 const permission=await legalPermission(c,actor);
 return {company:(await c.query('select data from private.legal_company_versions order by created_at desc limit 1')).rows[0]?.data??companyDetails,canPublish:!!(permission.owner||permission.publisher),isOwner:!!permission.owner,environment:process.env.APP_ENV??'production',
 translations:(await c.query('select t.*,p.published_at from private.legal_translations t left join private.legal_translation_publications p on p.translation_id=t.id order by t.created_at desc')).rows,
 versions:(await c.query(`select ${versionProjection} from private.legal_versions v left join private.legal_publications p on p.version_id=v.id order by v.created_at desc`)).rows,
 checks:(await c.query('select environment,check_key "key",verified_at "verifiedAt",evidence from private.legal_rollout_checks order by environment,check_key')).rows,
 publishers:(await c.query('select user_id "userId",granted_at "grantedAt",revoked_at "revokedAt" from private.legal_publishers')).rows};
});}
export async function saveLegalDraft(actor:Actor,input:unknown){const p=legalDraftSchema.parse(input);requireThat(p.key==='terms'||!p.requiresAcceptance,'invalid_acceptance_document',400);return transaction(async c=>{
 await legalPermission(c,actor);
 if(p.requiresAcceptance&&!p.material)requireThat(!(await c.query("select 1 from private.legal_publications p join private.legal_versions v on v.id=p.version_id where v.document_key='terms' limit 1")).rowCount,'correction_no_acceptance',400,'Een tekstcorrectie vraagt geen nieuwe aanvaarding. Markeer een wezenlijke wijziging alleen als de inhoud dat rechtvaardigt.');
 const row=(await c.query(`insert into private.legal_versions(document_key,title,version,language,markdown,summary,material,requires_acceptance,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,[p.key,p.title,p.version,p.language,p.markdown,p.summary,p.material,p.requiresAcceptance,actor.id])).rows[0];
 await audit(c,actor.id,'legal.draft',row.id,{key:p.key,version:p.version},p.reason);return row;
});}
export async function publishLegalVersion(actor:Actor,input:unknown){const p=legalPublishSchema.parse(input);return transaction(async c=>{
 await legalPermission(c,actor,true);await c.query("select pg_advisory_xact_lock(741928410)");
 const v=(await c.query('select * from private.legal_versions where id=$1',[p.versionId])).rows[0];requireThat(v,'not_found',404);
 const existing=(await c.query('select 1 from private.legal_publications where version_id=$1',[p.versionId])).rowCount;requireThat(!existing,'already_published',409);
 try{validatePublicationTiming({material:v.material,publishedAt:new Date(),effectiveAt:new Date(p.effectiveAt),exceptionReason:p.exceptionReason});}catch(e){throw new DomainError('publication_timing',400,(e as Error).message);}
 await c.query('insert into private.legal_publications(version_id,published_by,effective_at,exception_reason,reason) values($1,$2,$3,$4,$5)',[v.id,actor.id,p.effectiveAt,p.exceptionReason??null,p.reason]);
 await seedKnownLegalTranslation(c,v,actor.id);
 await audit(c,actor.id,'legal.publish',v.id,{key:v.document_key,version:v.version,effectiveAt:p.effectiveAt},p.reason);
 // Existing notification infrastructure delivers an announcement once. No mail
 // or forced overlay interrupts an active game.
 if(v.material)await c.query(`insert into public.notifications(user_id,kind,payload) select id,'legal_change',$1::jsonb from public.profiles where status='active' and onboarded_at is not null`,[JSON.stringify({versionId:v.id,title:v.title,summary:v.summary,effectiveAt:p.effectiveAt,href:v.document_key==='terms'?'/algemene-voorwaarden':'/privacy'})]);
 return {ok:true,versionId:v.id};
});}
export async function updateLegalAuthority(actor:Actor,input:unknown){const p=z.object({userId:z.string().uuid(),enabled:z.boolean(),reason:z.string().trim().min(5).max(500)}).strict().parse(input);return transaction(async c=>{
 const rights=await legalPermission(c,actor);requireThat(rights.owner,'owner_required',403);
 requireThat((await c.query("select 1 from public.user_roles where user_id=$1 and role in ('owner','admin') and revoked_at is null",[p.userId])).rowCount,'existing_admin_required',400);
 await c.query(`insert into private.legal_publishers(user_id,granted_by,reason,revoked_at) values($1,$2,$3,case when $4 then null else now() end) on conflict(user_id) do update set granted_by=$2,granted_at=now(),reason=$3,revoked_at=case when $4 then null else now() end`,[p.userId,actor.id,p.reason,p.enabled]);
 await audit(c,actor.id,'legal.publisher',p.userId,{enabled:p.enabled},p.reason);return {ok:true};
});}
export async function verifyLegalRolloutCheck(actor:Actor,input:unknown){const p=z.object({environment:z.enum(['staging','production']),key:z.enum(rolloutGateKeys),evidence:z.string().trim().min(20).max(2000)}).strict().parse(input);return transaction(async c=>{
 const rights=await legalPermission(c,actor);requireThat(rights.owner,'owner_required',403);
 await c.query(`insert into private.legal_rollout_checks(environment,check_key,verified_by,evidence) values($1,$2,$3,$4) on conflict(environment,check_key) do update set verified_by=$3,verified_at=now(),evidence=$4`,[p.environment,p.key,actor.id,p.evidence]);
 await audit(c,actor.id,'legal.rollout_verified',p.key,{environment:p.environment},p.evidence);return {ok:true};
});}
export async function recordLegalAcceptanceInTransaction(c:PoolClient,userId:string,input:unknown){
 const p=legalAcceptanceSchema.parse(input);
 await c.query('select pg_advisory_xact_lock(741928410)');
 const active=(await c.query(`select distinct on (v.document_key) v.document_key,v.id from private.legal_versions v join private.legal_publications p on p.version_id=v.id where v.document_key in ('terms','privacy') and p.effective_at<=now() order by v.document_key,p.effective_at desc,p.published_at desc,v.created_at desc`)).rows;
 requireThat(active.length===2,'legal_not_published',409,'Registratie is beschikbaar zodra de voorwaarden en privacyverklaring gepubliceerd zijn.');
 requireThat(active.find(v=>v.document_key==='terms')?.id===p.termsVersionId&&active.find(v=>v.document_key==='privacy')?.id===p.privacyVersionId,'legal_version_changed',409,'De informatie is gewijzigd. Lees de actuele versie opnieuw.');
 const editions:string[]=[];
 if(p.language==='en')for(const sourceId of [p.termsVersionId,p.privacyVersionId]){
  const edition=(await c.query(`select t.id from private.legal_translations t join private.legal_translation_publications pub on pub.translation_id=t.id join private.legal_versions v on v.id=t.source_version_id where t.source_version_id=$1 and t.language='en' and t.source_hash=encode(sha256(convert_to(btrim(v.markdown,E' \\t\\r\\n'),'UTF8')),'hex') order by pub.published_at desc,t.created_at desc limit 1`,[sourceId])).rows[0];
  requireThat(edition,'legal_translation_missing',409);editions.push(edition.id);
 }
 if(p.language==='en'){requireThat(!p.termsTranslationId||p.termsTranslationId===editions[0],'legal_version_changed',409);requireThat(!p.privacyTranslationId||p.privacyTranslationId===editions[1],'legal_version_changed',409);}
 await c.query(`insert into private.legal_acceptances(user_id,terms_version_id,privacy_version_id,age16_confirmed,language,terms_translation_id,privacy_translation_id) values($1,$2,$3,true,$4,$5,$6) on conflict(user_id,terms_version_id,privacy_version_id) do nothing`,[userId,p.termsVersionId,p.privacyVersionId,p.language??null,editions[0]??null,editions[1]??null]);
 return {ok:true};
}
export async function recordLegalAcceptance(userId:string,input:unknown){return transaction(c=>recordLegalAcceptanceInTransaction(c,userId,input));}
export async function getRequiredLegalAcceptance(userId:string){
 const q=(await db().query(`select v.id,v.title,v.version,v.summary,p.effective_at "effectiveAt" from private.legal_versions v join private.legal_publications p on p.version_id=v.id where v.document_key='terms' and v.requires_acceptance and p.effective_at<=now() and not exists(select 1 from private.legal_acceptances a join private.legal_publications accepted on accepted.version_id=a.terms_version_id where a.user_id=$1 and accepted.effective_at>=p.effective_at) order by p.effective_at desc,p.published_at desc limit 1`,[userId])).rows[0];
 return q??null;
}
export async function onboardWithLegal(actor:Actor,input:unknown){const p=legalOnboardingSchema.parse(input);return transaction(async c=>{
 await c.query('select * from private.admission_lock where id=1 for share');
 requireThat((await c.query("select data->'platform'->>'registrationOpen' enabled from private.system_settings where key='settings'")).rows[0]?.enabled!=='false','registration_closed',403,'Nieuwe registraties zijn tijdelijk gesloten.');
 const row=(await c.query('select * from public.profiles where id=$1 for update',[actor.id])).rows[0];requireThat(row?.status==='active','banned',403);
 // A retry after a completed transaction does not change a profile or enqueue
 // another welcome. Provider metadata never supplies the public name.
 if(row.onboarded_at)return {id:row.id,username:row.username,role:actor.role,rating:Number((await c.query('select rating from public.player_ratings where user_id=$1',[actor.id])).rows[0]?.rating??1500)};
 await assertContentAllowed(c,actor,p.username,'name','profile.onboard');const name=usernameSchema.parse(p.username);
 await recordLegalAcceptanceInTransaction(c,actor.id,{termsVersionId:p.termsVersionId,privacyVersionId:p.privacyVersionId,age16Confirmed:p.age16Confirmed,termsAccepted:p.termsAccepted,language:p.language??p.locale,termsTranslationId:p.termsTranslationId,privacyTranslationId:p.privacyTranslationId});
 await c.query('update public.profiles set username=$2,onboarded_at=now(),updated_at=now(),version=version+1 where id=$1',[actor.id,name]);
 await c.query('insert into public.player_ratings(user_id) values($1) on conflict do nothing',[actor.id]);
 const defaults=(await c.query("select data->'platform'->>'privateMessages' policy from private.system_settings where key='settings'")).rows[0]?.policy??'everyone';
 await c.query('insert into public.preferences(user_id,data) values($1,$2) on conflict do nothing',[actor.id,JSON.stringify({privateMessages:defaults,...(p.locale?{locale:p.locale}:{})})]);
 await audit(c,actor.id,'profile.onboard',actor.id,{username:name});await outbox(c,'welcome:'+actor.id,'welcome',actor.id,{username:name});return {id:actor.id,username:name,role:'player',rating:1500};
});}
/** New participation only. Existing match commands deliberately do not call this gate. */
export async function assertLegalParticipation(userIds:string[],client?:import('pg').PoolClient){const c=client??db();for(const id of userIds){const required=(await c.query(`select 1 from private.legal_versions v join private.legal_publications p on p.version_id=v.id where v.document_key='terms' and v.requires_acceptance and p.effective_at<=now() and not exists(select 1 from private.legal_acceptances a join private.legal_publications accepted on accepted.version_id=a.terms_version_id where a.user_id=$1 and accepted.effective_at>=p.effective_at) limit 1`,[id])).rowCount;requireThat(!required,'legal_acceptance_required',409,'Voor nieuwe deelname moeten de actuele voorwaarden eerst zijn aanvaard.');}}

const translationSchema=z.object({sourceVersionId:z.string().uuid(),revision:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/),title:z.string().trim().min(3).max(150),summary:z.string().trim().min(5).max(2000),markdown:z.string().trim().min(50).max(100000),reason:z.string().trim().min(5).max(500)}).strict();
export async function saveLegalTranslation(actor:Actor,input:unknown){const p=translationSchema.parse(input);return transaction(async c=>{
 await legalPermission(c,actor);const source=(await c.query('select * from private.legal_versions where id=$1',[p.sourceVersionId])).rows[0];requireThat(source,'not_found',404);
 const hash=createHash('sha256').update(source.markdown.trim()).digest('hex');
 const result=(await c.query(`insert into private.legal_translations(source_version_id,language,revision,source_hash,title,summary,markdown,created_by) values($1,'en',$2,$3,$4,$5,$6,$7) returning id`,[source.id,p.revision,hash,p.title,p.summary,p.markdown,actor.id])).rows[0];await audit(c,actor.id,'legal.translation.save',result.id,{sourceVersionId:source.id,revision:p.revision},p.reason);return result;
});}
export async function publishLegalTranslation(actor:Actor,input:unknown){const p=z.object({translationId:z.string().uuid(),reason:z.string().trim().min(5).max(500)}).strict().parse(input);return transaction(async c=>{
 await legalPermission(c,actor,true);const translation=(await c.query(`select t.id from private.legal_translations t join private.legal_publications p on p.version_id=t.source_version_id join private.legal_versions v on v.id=t.source_version_id where t.id=$1 and t.source_hash=encode(sha256(convert_to(btrim(v.markdown,E' \\t\\r\\n'),'UTF8')),'hex')`,[p.translationId])).rows[0];requireThat(translation,'legal_source_not_published',409);
 await c.query('insert into private.legal_translation_publications(translation_id,published_by,reason) values($1,$2,$3)',[p.translationId,actor.id,p.reason]);await audit(c,actor.id,'legal.translation.publish',p.translationId,{},p.reason);return {ok:true};
});}

/** Deterministic release content: only byte-equivalent, reviewed source editions
 * acquire their bundled translation. New or edited legal content stays missing. */
export async function seedKnownLegalTranslation(c:PoolClient,source:any,actorId?:string){
 const hash=createHash('sha256').update(source.markdown.trim()).digest('hex');
 const known=knownLegalTranslations.find(t=>t.key===source.document_key&&t.sourceSha256===hash);if(!known)return;
 await c.query(`insert into private.legal_translations(source_version_id,language,revision,source_hash,title,summary,markdown,created_by) values($1,'en',$2,$3,$4,$5,$6,$7) on conflict(source_version_id,language,revision) do nothing`,[source.id,known.revision,hash,known.title,'English translation of the same substantive version; no new acceptance required.',known.markdown,actorId??null]);
 await c.query(`insert into private.legal_translation_publications(translation_id,published_by,reason) select t.id,$3,'Bundled translation checked against the exact published Dutch source; no legal approval claimed.' from private.legal_translations t join private.legal_publications p on p.version_id=t.source_version_id where t.source_version_id=$1 and t.revision=$2 and t.source_hash=$4 and t.markdown=$5 on conflict do nothing`,[source.id,known.revision,actorId??null,hash,known.markdown]);
}
