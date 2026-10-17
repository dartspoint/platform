import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {readFile,readdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {db} from '../../packages/data/src/db';
import {getLegalAdminBundle,getLegalPublicBundle,saveLegalDraft,publishLegalVersion,onboardWithLegal,getRequiredLegalAcceptance,recordLegalAcceptance,updateLegalAuthority,verifyLegalRolloutCheck} from '../../packages/data/src/legal';
import type {Actor} from '../../packages/data/src/auth';
import {migrate} from '../../scripts/migrate';
assert.equal(process.env.APP_ENV,'development');
const image=JSON.parse(await readFile('ops/image-pins.json','utf8')).POSTGRES_IMAGE,name='dartspoint-legal-qa-'+randomUUID().slice(0,8),directory=await mkdtemp(join(tmpdir(),'dartspoint-legal-'));
let admin:Pool|undefined;
function docker(args:string[]){const result=spawnSync('docker',args,{encoding:'utf8'});assert.equal(result.status,0,'Owned legal test database command failed');return result.stdout.trim();}
const actor=(id:string,role:Actor['role']):Actor=>({id,role,username:null,sessionVersion:1,expiresAt:Date.now()+3600000,onboarded:false});
try{
 docker(['run','-d','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust',image]);
 let ready=false;for(let i=0;i<150;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),url=`postgresql://postgres@127.0.0.1:${port}/postgres`;admin=new Pool({connectionString:url,max:2});
 await admin.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;");
 // Test only this module and the existing baseline. Parallel sprint migrations
 // can still be in progress and are validated by the combined suite separately.
 for(const file of await readdir('supabase/migrations'))if(file<'20261015000000'||file.endsWith('_legal_documents_google_registration.sql'))await cp('supabase/migrations/'+file,join(directory,file));
 process.env.MIGRATION_DATABASE_URL=url;process.argv.push('--expand-only');await migrate(directory);
 process.env.DATABASE_URL=url;process.env.DATABASE_ROLE='dartspoint_app';
 const owner=actor(randomUUID(),'owner'),editor=actor(randomUUID(),'admin'),player=actor(randomUUID(),'player');
 for(const user of [owner,editor,player])await admin.query('insert into auth.users(id) values($1)',[user.id]);
 await admin.query("insert into public.user_roles(user_id,role) values($1,'owner'),($2,'admin')",[owner.id,editor.id]);
 const initial=await getLegalPublicBundle();assert.equal(initial.history.length,0);assert.equal(initial.current.privacy,null);assert.equal(initial.company.chamberOfCommerce,'88135713');
 const drafts=(await getLegalAdminBundle(owner)).versions;assert.equal(drafts.length,3);assert.ok(drafts.find(v=>v.key==='privacy')?.markdown.includes('Cloudflare Turnstile Privacy Addendum'));
 await assert.rejects(publishLegalVersion(editor,{versionId:drafts[0].id,effectiveAt:new Date().toISOString(),reason:'Test onbevoegde publicatie'}),/publiceren/);
 const terms=drafts.find(v=>v.key==='terms')!,privacy=drafts.find(v=>v.key==='privacy')!;
 await publishLegalVersion(owner,{versionId:terms.id,effectiveAt:new Date().toISOString(),reason:'Test eerste publicatie'});await publishLegalVersion(owner,{versionId:privacy.id,effectiveAt:new Date().toISOString(),reason:'Test eerste publicatie'});
 await assert.rejects(admin.query("update private.legal_versions set markdown='changed' where id=$1",[terms.id]));await assert.rejects(admin.query('delete from private.legal_publications where version_id=$1',[terms.id]));
 const acceptance={termsVersionId:terms.id,privacyVersionId:privacy.id,age16Confirmed:true,termsAccepted:true};
 await assert.rejects(onboardWithLegal(player,{username:'LegalPlayer',...acceptance,age16Confirmed:false}));
 const [first,retry]=await Promise.all([onboardWithLegal(player,{username:'LegalPlayer',...acceptance}),onboardWithLegal(player,{username:'LegalPlayer',...acceptance})]);assert.equal(first.id,retry.id);
 assert.equal((await admin.query('select count(*) n from private.legal_acceptances where user_id=$1',[player.id])).rows[0].n,'1');assert.equal((await admin.query("select count(*) n from private.outbox_events where dedupe_key=$1",['welcome:'+player.id])).rows[0].n,'1');
 assert.equal(await getRequiredLegalAcceptance(player.id),null);
 await assert.rejects(saveLegalDraft(editor,{key:'terms',title:'Algemene voorwaarden',version:'2.0.1',language:'nl',markdown:terms.markdown,summary:'Test kleine tekstcorrectie',material:false,requiresAcceptance:true,reason:'Test correctie mag geen nieuwe aanvaarding vragen'}),/tekstcorrectie/);
 const correction=await saveLegalDraft(editor,{key:'terms',title:'Algemene voorwaarden',version:'2.0.1',language:'nl',markdown:terms.markdown,summary:'Alleen een kleine tekstcorrectie',material:false,requiresAcceptance:false,reason:'Test kleine correctie'});await publishLegalVersion(owner,{versionId:correction.id,effectiveAt:new Date().toISOString(),reason:'Test kleine correctie publiceren'});assert.equal(await getRequiredLegalAcceptance(player.id),null);
 const changed=await saveLegalDraft(editor,{key:'terms',title:'Algemene voorwaarden',version:'2.1',language:'nl',markdown:terms.markdown,summary:'Test wezenlijke wijziging met nieuwe aanvaarding',material:true,requiresAcceptance:true,reason:'Test wijzigingsproces'});
 await assert.rejects(publishLegalVersion(owner,{versionId:changed.id,effectiveAt:new Date().toISOString(),reason:'Test korte termijn'}),/30 dagen/);
 await publishLegalVersion(owner,{versionId:changed.id,effectiveAt:new Date().toISOString(),exceptionReason:'Noodzakelijke beveiligingswijziging voor test',reason:'Test gemotiveerde uitzondering'});
 assert.equal((await getRequiredLegalAcceptance(player.id))?.id,changed.id);await assert.rejects(recordLegalAcceptance(player.id,acceptance),/gewijzigd/);
 await recordLegalAcceptance(player.id,{...acceptance,termsVersionId:changed.id});assert.equal(await getRequiredLegalAcceptance(player.id),null);
 // Existing admin can publish only after an explicit owner grant.
 await updateLegalAuthority(owner,{userId:editor.id,enabled:true,reason:'Test expliciete machtiging'});assert.equal((await getLegalAdminBundle(editor)).canPublish,true);
 // Production publication requires explicit authority, without manual rollout checks.
 await updateLegalAuthority(owner,{userId:editor.id,enabled:false,reason:'Test ingetrokken publicatiemachtiging'});assert.equal((await getLegalAdminBundle(editor)).canPublish,false);
 const guide=drafts.find(v=>v.key==='guide')!;process.env.APP_ENV='production';
 assert.equal((await admin.query("select count(*) n from private.legal_rollout_checks where environment='production'")).rows[0].n,'0');
 await assert.rejects(publishLegalVersion(player,{versionId:guide.id,effectiveAt:new Date().toISOString(),reason:'Test speler mag niet publiceren'}),{code:'forbidden',status:403});
 await assert.rejects(publishLegalVersion(editor,{versionId:guide.id,effectiveAt:new Date().toISOString(),reason:'Test beheerder zonder publicatiemachtiging'}),{code:'legal_publish_forbidden',status:403});
 await publishLegalVersion(owner,{versionId:guide.id,effectiveAt:new Date().toISOString(),reason:'Test eigenaar publiceert zonder handmatige uitrolcontroles'});
 assert.equal((await getLegalPublicBundle()).current.guide?.id,guide.id);
 await assert.rejects(publishLegalVersion(owner,{versionId:guide.id,effectiveAt:new Date().toISOString(),reason:'Test dubbele publicatie blijft geweigerd'}),{code:'already_published',status:409});
 process.env.APP_ENV='development';
 await verifyLegalRolloutCheck(owner,{environment:'staging',key:'staging_review',evidence:'Geïsoleerde geautomatiseerde werkingstest uitgevoerd.'});
 // Direct Auth insertion, representing any provider, obeys closed admission.
 await admin.query(`insert into private.system_settings(key,data) values('settings','{"platform":{"registrationOpen":false}}') on conflict(key) do update set data=excluded.data`);
 await assert.rejects(admin.query('insert into auth.users(id) values($1)',[randomUUID()]),/registraties.*gesloten/);
 assert.equal((await admin.query('select username from public.profiles where id=$1',[owner.id])).rows[0].username,null,'Provider metadata is never an automatic public username');
 console.log('Legal drafts, immutable publication/evidence, explicit authority, atomic onboarding/retries, acceptance version checks, production publication without manual rollout checks and provider-independent closed registration passed on isolated PostgreSQL.');
}finally{process.env.APP_ENV='development';await db().end();await admin?.end();await rm(directory,{recursive:true,force:true});spawnSync('docker',['rm','--force','--volumes',name],{stdio:'ignore'});}
