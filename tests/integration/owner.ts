import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {authAdmin} from '../../packages/data/src/auth';
import {db} from '../../packages/data/src/db';
assert.equal(process.env.APP_ENV,'development');
const image=JSON.parse(await readFile('ops/image-pins.json','utf8')).POSTGRES_IMAGE,name='dartspoint-owner-qa-'+randomUUID().slice(0,8);let isolated:Pool|undefined;
function docker(args:string[]){const r=spawnSync('docker',args,{encoding:'utf8'});assert.equal(r.status,0,'Owned test database command failed');return r.stdout.trim();}
try{
 docker(['run','-d','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust',image]);
 // The entrypoint's temporary init server accepts Unix sockets before it shuts
 // down. TCP becomes ready only when the final server is actually running.
 let ready=false;for(let i=0;i<150;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
 assert.equal(ready,true,'Disposable owner database did not become TCP-ready');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),url=`postgresql://postgres@127.0.0.1:${port}/postgres`;isolated=new Pool({connectionString:url,max:1});
 await isolated.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;");
 const env={...process.env,DATABASE_URL:url,MIGRATION_DATABASE_URL:url};const migrate=spawnSync('node',['node_modules/tsx/dist/cli.mjs','scripts/migrate.ts','--expand-only'],{env,encoding:'utf8'});assert.equal(migrate.status,0,'Fresh checksum migrations failed');
 const id=(await db().query("select p.id from profiles p where p.username like 'qa%' and p.status='active' order by p.created_at desc limit 1")).rows[0].id;const user=await authAdmin().auth.admin.getUserById(id);assert.ok(user.data.user?.email_confirmed_at);
 await isolated.query('insert into auth.users(id) values($1)',[id]);await isolated.query("update profiles set username='OwnerQA',onboarded_at=now() where id=$1",[id]);
 const boot={...env,BOOTSTRAP_OWNER_USER_ID:id,BOOTSTRAP_OWNER_EMAIL:user.data.user!.email!,BOOTSTRAP_OWNER_CONFIRM:'development:'+id};
 const wrong=spawnSync('node',['node_modules/tsx/dist/cli.mjs','scripts/owner-bootstrap.ts'],{env:{...boot,BOOTSTRAP_OWNER_EMAIL:'not-the-identity@dartspoint.local'},encoding:'utf8'});assert.notEqual(wrong.status,0);assert.equal((await isolated.query('select count(*) n from user_roles')).rows[0].n,'0');
 const result=spawnSync('node',['node_modules/tsx/dist/cli.mjs','scripts/owner-bootstrap.ts'],{env:boot,encoding:'utf8'});assert.equal(result.status,0,'Verified owner bootstrap failed');assert.equal((await isolated.query("select count(*) n from user_roles where role='owner'")).rows[0].n,'1');
 assert.equal((await isolated.query("select count(*) n from private.audit_events where action='owner.bootstrap'")).rows[0].n,'1');assert.equal((await isolated.query('select count(*) n from private.owner_bootstrap_events')).rows[0].n,'1');
 assert.notEqual(spawnSync('node',['node_modules/tsx/dist/cli.mjs','scripts/owner-bootstrap.ts'],{env:boot,stdio:'ignore'}).status,0,'Bootstrap is permanently one-time');
 await assert.rejects(isolated.query('update user_roles set revoked_at=now() where user_id=$1',[id]));
 await writeFile('artifacts/owner-result.json',JSON.stringify({ok:true,isolatedFreshDatabase:true,verifiedProviderIdentity:true,mismatchRejected:true,ownerCreatedOnce:true,audited:true,repeatRejected:true,lastOwnerProtected:true},null,2));console.log('One-time owner bootstrap with actual verified Auth identity passed on a fresh disposable database');
}finally{await isolated?.end();await db().end();spawnSync('docker',['rm','--force','--volumes',name],{stdio:'ignore'});}
