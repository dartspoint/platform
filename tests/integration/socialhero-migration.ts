import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client,Pool} from 'pg';
import {migrate} from '../../scripts/migrate';

// Apply the exact committed baseline first, then upgrade representative old data.
// Never edit applied repository migrations to emulate an upgrade.
assert.equal(process.env.APP_ENV,'development');
const source=new URL(process.env.MIGRATION_DATABASE_URL!);assert.equal(source.hostname,'127.0.0.1');
const database='socialhero_migration_'+randomUUID().replaceAll('-',''),control=new Pool({connectionString:source.toString(),max:1});await control.query('create database '+database);
const url=new URL(source);url.pathname='/'+database;const setup=new Client({connectionString:url.toString()});process.env.MIGRATION_DATABASE_URL=url.toString();process.argv.push('--expand-only');
const directory=fileURLToPath(new URL('../../supabase/migrations/',import.meta.url)),upgrade='20261126113210_socialhero_complete_blog.sql';
const baseline=await mkdtemp(join(tmpdir(),'dartspoint-socialhero-baseline-')),tampered=await mkdtemp(join(tmpdir(),'dartspoint-socialhero-checksum-'));
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');const checks:string[]=[];
try{
 const files=(await readdir(directory)).filter(name=>/^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();assert.ok(files.includes(upgrade));
 for(const name of files)if(name!==upgrade)await copyFile(join(directory,name),join(baseline,name));
 await setup.connect();await setup.query("create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(user_id text);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$");await migrate(baseline);
 const before=(await setup.query('select name,sha256,applied_at from dartspoint_migrations.applied order by name')).rows;assert.equal(before.length,files.length-1);
 const owner=randomUUID();await setup.query('insert into auth.users(id,email) values($1,$2)',[owner,owner+'@example.test']);await setup.query("insert into profiles(id,username,onboarded_at) values($1,'MigrationOwner',now()) on conflict(id) do update set username=excluded.username,onboarded_at=excluded.onboarded_at",[owner]);
 const destinations=[{site:'migration-off',environment:'staging',destination:'off-a',publish:false},{site:'migration-off',environment:'staging',destination:'off-b',publish:false},{site:'migration-on',environment:'production',destination:'on-a',publish:true},{site:'migration-missing',environment:'staging',destination:'missing-policy',publish:null}];
 const tokens:string[]=[];
 for(const item of destinations){
  const attempt=randomUUID(),token=randomUUID();tokens.push(token);
  if(item.publish!==null)await setup.query('insert into private.socialhero_settings(site_id,environment,publish_enabled) values($1,$2,$3) on conflict do nothing',[item.site,item.environment,item.publish]);
  await setup.query("insert into private.socialhero_pairing_attempts(id,site_id,environment,code_hash,created_by,expires_at) values($1,$2,$3,$4,$5,now()+interval '10 minutes')",[attempt,item.site,item.environment,sha(attempt),owner]);
  await setup.query("insert into private.blog_tokens(id,site_id,environment,label,token_hash,scopes,created_by,expires_at,connection_id,destination_id,credential_state,provisioning_expires_at,pairing_attempt_id) values($1,$2,$3,'Prior connection',$4,$5,$6,now()+interval '1 year',$7,$8,'active',now()+interval '10 minutes',$9)",[token,item.site,item.environment,sha(token),['read','draft',...(item.publish?['publish']:[])],owner,'prior-'+token,item.destination,attempt]);
 }
 // Legacy credentials without destination identity must not gain a new policy.
 const manual=randomUUID();await setup.query("insert into private.blog_tokens(id,site_id,environment,label,token_hash,scopes,created_by,expires_at) values($1,'legacy-manual','staging','Legacy',$2,$3,$4,now()+interval '1 year')",[manual,sha(manual),['capabilities:read'],owner]);
 const post=randomUUID(),draftPost=randomUUID();
 await setup.query('begin');
 await setup.query("insert into private.blog_posts(id,site_id,environment,source,draft_revision,published_revision,published_at) values($1,'migration-posts','development','redactie',3,2,now()),($2,'migration-posts','development','redactie',1,null,null)",[post,draftPost]);
 for(const [revision,slug] of [[1,'prior-public-url'],[2,'current-public-url'],[3,'private-draft-url']] as const){
  await setup.query('insert into private.blog_revisions(post_id,revision,document,created_by) values($1,$2,$3,$4)',[post,revision,{locale:'nl-NL',slug,title:'Historical revision '+revision},owner]);
  await setup.query("insert into private.blog_slug_reservations(site_id,environment,locale,slug,post_id) values('migration-posts','development','nl-NL',$1,$2)",[slug,post]);
 }
 await setup.query("insert into private.blog_revisions(post_id,revision,document,created_by) values($1,1,$2,$3)",[draftPost,{locale:'nl-NL',slug:'never-public'},owner]);
 await setup.query("insert into private.blog_slug_reservations(site_id,environment,locale,slug,post_id) values('migration-posts','development','nl-NL','never-public',$1)",[draftPost]);
 await setup.query("insert into public.blog_live(post_id,site_id,environment,locale,slug,revision,article,published_at) values($1,'migration-posts','development','nl-NL','current-public-url',2,$2,now())",[post,{id:post,revision:2,locale:'nl-NL',slug:'current-public-url'}]);
 await setup.query("insert into private.audit_events(actor_id,action,subject,data) values($1,'blog.publish',$2,$3),($1,'blog.draft.save',$2,$4),($1,'blog.publish',$5,$6)",[owner,post,{revision:1},{revision:3},draftPost,{revision:'invalid-historical-value'}]);
 await setup.query('commit');
 checks.push('exact old baseline with existing destination policies and publication history');

 await migrate(directory);
 const policies=(await setup.query('select site_id,environment,destination_id,draft_enabled,publish_enabled,decided_by,source from private.socialhero_destination_policies order by destination_id')).rows;assert.equal(policies.length,destinations.length);
 for(const item of destinations){const policy=policies.find(row=>row.destination_id===item.destination);assert.ok(policy);assert.equal(policy.site_id,item.site);assert.equal(policy.environment,item.environment);assert.equal(policy.draft_enabled,true);assert.equal(policy.publish_enabled,item.publish??false);assert.equal(policy.source,'migration');assert.equal(policy.decided_by,null);}
 assert.equal((await setup.query('select count(*)::int n from private.blog_tokens where id=any($1::uuid[]) and revoked_at is null',[tokens])).rows[0].n,tokens.length);
 const attempts=(await setup.query('select draft_enabled,publish_enabled,rights_confirmed_at from private.socialhero_pairing_attempts')).rows;assert.ok(attempts.every(row=>row.draft_enabled&&!row.publish_enabled&&row.rights_confirmed_at===null));
 assert.ok((await setup.query('select last_checked_at from private.blog_tokens')).rows.every(row=>row.last_checked_at===null));
 checks.push('explicit false/true and missing policy preserved without invented confirmation or checks');

 const aliases=(await setup.query('select slug,is_public from private.blog_slug_reservations order by slug')).rows;const flags=Object.fromEntries(aliases.map(row=>[row.slug,row.is_public]));assert.deepEqual(flags,{'current-public-url':true,'never-public':false,'prior-public-url':true,'private-draft-url':false});
 assert.equal((await setup.query('select draft_revision,published_revision from private.blog_posts where id=$1',[post])).rows[0].draft_revision,'3');assert.equal((await setup.query('select count(*)::int n from private.blog_revisions')).rows[0].n,4);
 checks.push('only genuine live or historically published slugs become public aliases');

 const upgraded=(await setup.query('select name,sha256,applied_at from dartspoint_migrations.applied order by name')).rows;
 for(const entry of before){const after=upgraded.find(row=>row.name===entry.name);assert.ok(after);assert.equal(after.sha256,entry.sha256);assert.equal(new Date(after.applied_at).getTime(),new Date(entry.applied_at).getTime());}
 await migrate(directory);assert.deepEqual((await setup.query('select name,sha256,applied_at from dartspoint_migrations.applied order by name')).rows,upgraded);assert.deepEqual((await setup.query('select site_id,environment,destination_id,draft_enabled,publish_enabled,decided_by,source from private.socialhero_destination_policies order by destination_id')).rows,policies);
 for(const name of files)await copyFile(join(directory,name),join(tampered,name));
 const original=await readFile(join(tampered,files[0]),'utf8');await writeFile(join(tampered,files[0]),original+'\n-- Deliberate test-only tampering of a temporary copy.\n');await assert.rejects(migrate(tampered),/Applied migration checksum mismatch/);
 assert.equal((await readFile(join(directory,files[0]),'utf8')),original);checks.push('rerun idempotence, immutable prior checksums and rejection of changed applied SQL');
 for(const table of ['socialhero_destination_policies','blog_taxonomy','blog_publications']){assert.equal((await setup.query("select rowsecurity from pg_tables where schemaname='private' and tablename=$1",[table])).rows[0].rowsecurity,true);for(const role of ['anon','authenticated'])assert.equal((await setup.query("select has_table_privilege($1,$2,'select') allowed",[role,'private.'+table])).rows[0].allowed,false);}
 checks.push('new private table grants and RLS remain closed');
 console.log(JSON.stringify({event:'socialhero_existing_data_migration_passed',checks,scope:'isolated PostgreSQL, exact previous migration baseline and real upgrade'}));
}finally{await setup.end();await control.query('drop database '+database+' with (force)');await control.end();await rm(baseline,{recursive:true,force:true});await rm(tampered,{recursive:true,force:true});}
