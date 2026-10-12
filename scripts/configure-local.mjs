import {execFileSync,spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
// Rebinding published ports restarts Postgres. A successful `start` predates
// that restart, so wait for the provider's health checks before reading keys.
let status;
for(let attempt=0;attempt<120;attempt++){
 try{
  status=JSON.parse(execFileSync(process.env.SUPABASE_CLI??new URL('../node_modules/.bin/supabase',import.meta.url).pathname,['status','--output','json'],{stdio:['ignore','pipe','ignore']}).toString());
  break;
 }catch{await new Promise(resolve=>setTimeout(resolve,1000));}
}
if(!status)throw new Error('Local Supabase did not become ready within the startup budget');
if(status.API_URL!=='http://127.0.0.1:62421') throw new Error('Wrong local Supabase project');
const migrated=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/migrate.ts','--expand-only'],{env:{...process.env,APP_ENV:"development",MIGRATION_DATABASE_URL:status.DB_URL},stdio:'inherit'});if(migrated.status!==0)process.exit(migrated.status??1);
const password=randomBytes(32).toString('base64url');
const p=new pg.Pool({connectionString:status.DB_URL,max:1});
// Password is generated safe base64url, never printed or committed.
const role=await p.query("select 1 from pg_roles where rolname='dartspoint_local'");
if(role.rowCount)await p.query(`alter role dartspoint_local password '${password}'`);else await p.query(`create role dartspoint_local login password '${password}' nosuperuser nocreatedb nocreaterole nobypassrls in role dartspoint_app`);
await p.end();
const env={APP_ENV:'development',RELEASE_SHA:'local-development',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:4300',NEXT_PUBLIC_REALTIME_URL:'ws://127.0.0.1:42567',NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,NEXT_PUBLIC_TURNSTILE_SITE_KEY:'',SUPABASE_SECRET_KEY:status.SECRET_KEY,DATABASE_URL:`postgresql://dartspoint_local:${password}@127.0.0.1:62422/postgres`,MIGRATION_DATABASE_URL:status.DB_URL,REDIS_URL:'redis://127.0.0.1:62479',INTERNAL_DEPLOY_TOKEN:randomBytes(32).toString('base64url'),REALTIME_HEALTH_URL:'http://127.0.0.1:42567',WORKER_ID:'dartspoint-development',MAIL_PROVIDER:'local',LOCAL_MAILPIT_URL:'http://127.0.0.1:62424',MAIL_FROM:'DartsPoint <noreply@dartspoint.local>',MAIL_REPLY_TO:'support@dartspoint.local'};
const content=Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n';
writeFileSync('.env.local',content,{mode:0o600});
mkdirSync('apps/web',{recursive:true});writeFileSync('apps/web/.env.local',content,{mode:0o600});
console.log(JSON.stringify({event:'local_configuration_written',secretsPrinted:false}));
