import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,chmod,unlink,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {db} from '../../packages/data/src/db';
assert.equal(process.env.APP_ENV,'development');
const url=new URL(process.env.MIGRATION_DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
const file='artifacts/local-restore.dump';await mkdir('artifacts',{recursive:true});
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
const image={stdout:JSON.parse(await readFile('ops/image-pins.json','utf8')).POSTGRES_IMAGE};
const network=spawnSync('docker',['inspect','supabase_db_dartspoint-development','--format','{{range $key,$value := .NetworkSettings.Networks}}{{$key}}{{end}}'],{encoding:'utf8'});assert.equal(network.status,0);
const dump=spawnSync('docker',['run','--rm','--network',network.stdout.trim(),...['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'].flatMap(k=>['--env',k]),image.stdout.trim(),'pg_dump','--format=custom','--schema=auth','--schema=public','--schema=private','--schema=dartspoint_migrations','--no-owner','--no-privileges'],{env:{...env,PGHOST:'supabase_db_dartspoint-development',PGPORT:'5432'},maxBuffer:64*1024*1024});assert.equal(dump.status,0,'pg_dump failed');await writeFile(file,dump.stdout);await chmod(file,0o600);
try{
 const restored=spawnSync('python3',['ops/scripts/restore-db.py',file,image.stdout.trim()],{encoding:'utf8',timeout:120000});assert.equal(restored.status,0,restored.stderr);const result=JSON.parse(restored.stdout);assert.ok(result.results>0);assert.ok(result.ledger>=2);assert.equal(result.badLedger,0);assert.equal(result.launchSubscriptions,Number((await db().query('select count(*) n from private.launch_subscriptions')).rows[0].n));assert.equal(result.launchPrivateAccessVerified,true);assert.equal(result.badLaunchTokens,0);await writeFile('artifacts/restore-result.json',JSON.stringify(result,null,2));console.log('Real database dump, isolated restore, auth rows, RLS and Elo integrity passed');
}finally{await unlink(file);await db().end();}
