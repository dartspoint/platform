import {z} from 'zod';
import type {PoolClient} from 'pg';
import {db,transaction,audit} from './db';
import {staff,publicPlayerName,type Actor} from './auth';
import {DomainError,requireThat,uuid,usernameSchema} from '../../contracts/src/index';
import {DEFAULT_ADMIN_SETTINGS} from './settings-model';

export type FilterScope='chat'|'name';
export type FilterRule={id:string;term:string;category:string;scope:FilterScope|'both';matchType:'word'|'phrase'|'name-prefix'|'exact';active:boolean;allow:boolean;description:string;aliases:string[];version:number};
// Only documented substitutions. Dot-separated single letters are joined, never entire words.
export function normalizeFilterText(text:string){return text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').toLowerCase().replace(/[3@01$]/g,c=>({'3':'e','@':'a','0':'o','1':'i','$':'s'}[c]!)).replace(/(?<![\p{L}\p{N}])(?:[a-z]\.){2,19}[a-z](?![\p{L}\p{N}])/gu,s=>s.replaceAll('.','')).replace(/\s+/g,' ').trim();}
export function normalizeDuplicateText(text:string){return text.normalize('NFKC').replace(/[\u200b-\u200f\u2060-\u206f\ufeff]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function spans(text:string,rule:FilterRule,scope:FilterScope){
 const results:Array<[number,number]>=[];
 for(const raw of [rule.term,...rule.aliases]){
  const term=normalizeFilterText(raw);if(!term)continue;
  if(rule.matchType==='exact'){if(text===term)results.push([0,text.length]);continue;}
  if(rule.matchType==='name-prefix'){if(scope==='name'&&text.startsWith(term))results.push([0,term.length]);continue;}
  const pattern=escape(term).replace(/ /g,'\\s+');
  const re=new RegExp('(?<![\\p{L}\\p{N}])'+pattern+'(?![\\p{L}\\p{N}])','gu');
  for(const match of text.matchAll(re))results.push([match.index,match.index+match[0].length]);
 }
 return results;
}
export function matchingFilterRules(text:string,scope:FilterScope,rules:FilterRule[]){
 const normalized=normalizeFilterText(text),eligible=rules.filter(r=>r.active&&(r.scope===scope||r.scope==='both'));
 const allowed=eligible.filter(r=>r.allow).flatMap(r=>spans(normalized,r,scope));
 return eligible.filter(r=>!r.allow&&spans(normalized,r,scope).some(([a,b])=>!allowed.some(([x,y])=>a>=x&&b<=y)));
}
export async function filterRules(c:PoolClient){return (await c.query('select * from private.content_filter_rules order by category,term,id')).rows.map(r=>({id:r.id,term:r.term,category:r.category,scope:r.scope,matchType:r.match_type,active:r.active,allow:r.allow,description:r.description,aliases:r.aliases,version:Number(r.version)})) as FilterRule[];}
export async function assertContentAllowed(c:PoolClient,actor:Actor,text:string,scope:FilterScope,context:string){
 const matches=matchingFilterRules(text,scope,await filterRules(c));
 if(matches.length){
  // Operational evidence contains rule IDs and resource IDs, never rejected text or DM content.
  console.info(JSON.stringify({event:'content_filter_rejected',actorId:actor.id,scope,context,ruleIds:matches.map(r=>r.id)}));
  throw new DomainError(scope==='name'?'username_filtered':'message_filtered',400,scope==='name'?'Deze gebruikersnaam is niet toegestaan. Kies een andere naam.':'Je bericht bevat woorden die hier niet zijn toegestaan. Pas je tekst aan.');
 }
}
const ruleSchema=z.object({id:uuid.optional(),term:z.string().trim().min(1).max(80),category:z.string().trim().min(1).max(80),scope:z.enum(['chat','name','both']),matchType:z.enum(['word','phrase','name-prefix','exact']),active:z.boolean(),allow:z.boolean(),description:z.string().trim().min(1).max(300),aliases:z.array(z.string().trim().min(1).max(80)).max(20).default([]),version:z.number().int().positive().optional()}).strict();
const reason=z.string().trim().min(5).max(500);
const limitSchema=z.object({chatBurstCount:z.number().int().min(1).max(30),chatBurstSeconds:z.number().int().min(1).max(10),chatDuplicateSeconds:z.number().int().min(0).max(30),chatSlowMode:z.number().int().min(0).max(60)}).strict();
function ruleSnapshot(r:any){return r?{term:r.term,category:r.category,scope:r.scope,matchType:r.match_type,active:r.active,allow:r.allow,description:r.description,aliases:r.aliases,version:Number(r.version)}:null;}
export async function moderationSettings(actor:Actor){staff(actor,true);return transaction(async c=>{
 const settings=(await c.query("select key,data,version from private.system_settings where key in ('settings','content-filter')")).rows;
 const platform=settings.find(r=>r.key==='settings')?.data?.platform??{};
 return {rules:await filterRules(c),version:Number(settings.find(r=>r.key==='content-filter')?.version??1),limits:{chatBurstCount:platform.chatBurstCount??3,chatBurstSeconds:platform.chatBurstSeconds??2,chatDuplicateSeconds:platform.chatDuplicateSeconds??2,chatSlowMode:platform.chatSlowMode??0}};
});}
export async function filterAction(actor:Actor,input:unknown){
 staff(actor,true);
 const action=z.object({action:z.enum(['save','test','scan','require-rename','limits'])}).passthrough().parse(input).action;
 return transaction(async c=>{
  if(action==='test'){const p=z.object({action:z.literal('test'),text:z.string().max(2000),scope:z.enum(['chat','name'])}).strict().parse(input);const matches=matchingFilterRules(p.text,p.scope,await filterRules(c));return {allowed:!matches.length,matches:matches.map(({id,term,description})=>({id,term,description}))};}
  if(action==='scan'){z.object({action:z.literal('scan')}).strict().parse(input);const rules=await filterRules(c),rows=(await c.query('select id,username,rename_required from profiles where onboarded_at is not null and status<>\'deleted\' order by username_key')).rows;return {users:rows.flatMap(p=>{const matches=matchingFilterRules(p.username,'name',rules);return matches.length||p.rename_required?[{id:p.id,name:p.username,renameRequired:p.rename_required,rules:matches.map(({id,term,description})=>({id,term,description}))}]:[]})};}
  if(action==='require-rename'){
   const p=z.object({action:z.literal('require-rename'),targetId:uuid,reason}).strict().parse(input);
   const profile=(await c.query('select id,rename_required,version from profiles where id=$1 and onboarded_at is not null for update',[p.targetId])).rows[0];requireThat(profile,'player_not_found',404);
   if(!profile.rename_required){const changed=(await c.query('update profiles set rename_required=true,version=version+1,updated_at=now() where id=$1 returning version',[p.targetId])).rows[0];await audit(c,actor.id,'profile.rename-required',p.targetId,{before:{renameRequired:false,version:Number(profile.version)},after:{renameRequired:true,version:Number(changed.version)}},p.reason);}return {ok:true};
  }
  const filterVersion=Number((await c.query("select version from private.system_settings where key='content-filter' for update")).rows[0].version)+1;
  if(action==='limits'){
   const p=z.object({action:z.literal('limits'),limits:limitSchema,reason}).strict().parse(input);
   const defaults={...DEFAULT_ADMIN_SETTINGS,platform:{...DEFAULT_ADMIN_SETTINGS.platform,...p.limits}};
   const before=(await c.query("select data->'platform' limits,version from private.system_settings where key='settings' for update")).rows[0];
   const changed=(await c.query("insert into private.system_settings(key,data) values('settings',$2::jsonb) on conflict(key) do update set data=jsonb_set(system_settings.data,'{platform}',coalesce(system_settings.data->'platform','{}'::jsonb) || $1::jsonb),version=system_settings.version+1 returning version",[JSON.stringify(p.limits),JSON.stringify(defaults)])).rows[0];
   await audit(c,actor.id,'chat.limits','platform',{subjectName:'Chatlimieten',filterVersion,limits:p.limits,before:{limits:{chatBurstCount:before?.limits?.chatBurstCount??3,chatBurstSeconds:before?.limits?.chatBurstSeconds??2,chatDuplicateSeconds:before?.limits?.chatDuplicateSeconds??2,chatSlowMode:before?.limits?.chatSlowMode??0},version:Number(before?.version??0)},after:{limits:p.limits,version:Number(changed.version)}},p.reason);
  }else{
   const p=z.object({action:z.literal('save'),rule:ruleSchema,reason}).strict().parse(input),r=p.rule;
   requireThat(r.matchType!=='name-prefix'||r.scope==='name','invalid_filter_scope',400,'Naamvoorvoegsels gelden alleen voor namen.');
   const previous=r.id?(await c.query('select * from private.content_filter_rules where id=$1 for update',[r.id])).rows[0]:null;
   if(r.id){requireThat(previous,'filter_rule_not_found',404);if(r.version!==undefined)requireThat(Number(previous.version)===r.version,'filter_rule_changed',409,'Deze regel is intussen gewijzigd. Laad de regels opnieuw.');}
   const id=r.id??crypto.randomUUID();
   const changed=(await c.query('insert into private.content_filter_rules(id,term,category,scope,match_type,active,allow,description,aliases) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set term=$2,category=$3,scope=$4,match_type=$5,active=$6,allow=$7,description=$8,aliases=$9,version=content_filter_rules.version+1,updated_at=now() returning *',[id,r.term,r.category,r.scope,r.matchType,r.active,r.allow,r.description,JSON.stringify(r.aliases)])).rows[0];
   await audit(c,actor.id,'chat.filter.save',id,{created:!r.id,filterVersion,before:ruleSnapshot(previous),after:ruleSnapshot(changed)},p.reason);
  }
  const version=Number((await c.query("update private.system_settings set version=version+1 where key='content-filter' returning version")).rows[0].version);
  // Rules are read per operation: changes take effect at the next request, with no stale cache.
  return {ok:true,version};
 });
}
export async function renameProfile(actor:Actor,input:unknown){
 const p=z.object({username:z.string().max(80)}).strict().parse(input);
 return transaction(async c=>{
  await assertContentAllowed(c,actor,p.username,'name','profile.rename');const username=usernameSchema.parse(p.username);
  const existing=(await c.query('select id,username,rename_required,version from profiles where id=$1 and onboarded_at is not null for update',[actor.id])).rows[0];requireThat(existing,'profile_incomplete',403);
  const changed=(await c.query('update profiles set username=$2,rename_required=false,version=version+1,updated_at=now() where id=$1 returning version',[actor.id,username])).rows[0];
  await audit(c,actor.id,'profile.rename',actor.id,{before:{username:publicPlayerName(actor.id,existing.username,existing.rename_required),renameRequired:existing.rename_required,version:Number(existing.version)},after:{username,renameRequired:false,version:Number(changed.version)}});return {ok:true,username,renameRequired:false};
 });
}
