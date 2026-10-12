import {postgresOptions} from '../packages/data/src/postgres';
import { Pool } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function migrate(directory=fileURLToPath(new URL('../supabase/migrations/',import.meta.url))) {
 if(!process.argv.includes('--expand-only')) throw new Error('Only --expand-only migrations are supported');
 const url=process.env.MIGRATION_DATABASE_URL;
 if(!url) throw new Error('MIGRATION_DATABASE_URL is required');
 const p=new Pool({...postgresOptions(url),max:1});
 const c=await p.connect();
 try {
  await c.query('select pg_advisory_lock(1247281198)');
  await c.query('create schema if not exists dartspoint_migrations');
  await c.query('revoke all on schema dartspoint_migrations from public');
  await c.query('create table if not exists dartspoint_migrations.applied(name text primary key,sha256 text not null,applied_at timestamptz not null default now())');
  const names=(await readdir(directory)).filter(f=>/^\d+_[a-z0-9_-]+\.sql$/.test(f)).sort();
  const existing=await c.query('select name,sha256 from dartspoint_migrations.applied');
  for(const entry of existing.rows) if(!names.includes(entry.name)) throw new Error('Applied migration missing from release');
  for(const name of names) {
   const sql=await readFile(directory+'/'+name,'utf8');const hash=createHash('sha256').update(sql).digest('hex');
   const prior=existing.rows.find(r=>r.name===name);
   if(prior) {if(prior.sha256!==hash) throw new Error('Applied migration checksum mismatch');continue;}
   if(!sql.startsWith('-- expand-only') && !sql.startsWith('-- Expand-only')) throw new Error('Migration lacks expand-only declaration');
   if(/\b(drop\s+(table|column|schema|type)|rename\s+(column|table)|truncate)\b/i.test(sql)) throw new Error('Destructive migration rejected');
   await c.query('begin');
   try {await c.query(sql);await c.query('insert into dartspoint_migrations.applied(name,sha256) values($1,$2)',[name,hash]);await c.query('commit');}
   catch(e){await c.query('rollback');throw e;}
   console.log(JSON.stringify({event:'migration_applied',name}));
  }
 }finally{await c.query('select pg_advisory_unlock(1247281198)');c.release();await p.end();}
}
if(import.meta.url===new URL(process.argv[1],'file:').href) await migrate();
