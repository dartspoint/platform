/** Explicit test fixture publication, never called by migration or production. */
import {randomUUID} from 'node:crypto';
import {authAdmin,actorById} from '../packages/data/src/auth';
import {onboard} from '../packages/data/src/community';
import {db} from '../packages/data/src/db';
import {getLegalPublicBundle,getLegalAdminBundle,saveLegalDraft,publishLegalVersion} from '../packages/data/src/legal';
if(process.env.APP_ENV!=='development'||new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin!=='http://127.0.0.1:62421'||!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error('Legal test fixtures require the owned local provider');
try{const current=await getLegalPublicBundle();if(current.current.terms&&current.current.privacy&&current.current.guide){console.log('Local legal fixture already published');}else{
 const made=await authAdmin().auth.admin.createUser({email:'qa-legal-publisher-'+randomUUID()+'@dartspoint.local',email_confirm:true});if(made.error||!made.data.user)throw new Error('Local legal fixture identity failed');const id=made.data.user.id;
 await onboard(await actorById(id,Date.now()+3600000,false),{username:'LegalQA'+randomUUID().replaceAll('-','').slice(0,8)});await db().query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[id]);const actor=await actorById(id,Date.now()+3600000),bundle=await getLegalAdminBundle(actor);
 for(const key of ['terms','privacy','guide'] as const){if(current.current[key])continue;const original=bundle.versions.find(v=>v.key===key)!;const version=await saveLegalDraft(actor,{key,title:original.title,version:'test-'+randomUUID().slice(0,8),language:'nl',markdown:original.markdown,summary:'Uitsluitend lokale testinrichting; geen productiepublicatie.',material:false,requiresAcceptance:false,reason:'Expliciete lokale fixture voor geautomatiseerde acceptatie'});await publishLegalVersion(actor,{versionId:version.id,effectiveAt:new Date().toISOString(),reason:'Expliciete lokale fixture voor geautomatiseerde acceptatie'});}
 console.log('Local-only legal fixtures published; no production configuration changed');
}}finally{await db().end();}
