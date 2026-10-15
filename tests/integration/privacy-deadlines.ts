import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../../scripts/migrate';
import {db} from '../../packages/data/src/db';
import {ensurePrivacyRequestForTicket} from '../../packages/data/src/privacy';
import {reconcilePrivacyReceipts,remindPrivacyDeadlines} from '../../packages/data/src/privacy-deadlines';

assert.equal(process.env.APP_ENV,'development');
const image=JSON.parse(await readFile('ops/image-pins.json','utf8')).POSTGRES_IMAGE;
const name='dartspoint-deadline-qa-'+randomUUID().slice(0,8),realNow=Date.now;
let admin:Pool|undefined;
function docker(args:string[]){const result=spawnSync('docker',args,{encoding:'utf8'});assert.equal(result.status,0,'Owned deadline database operation failed');return result.stdout.trim();}
try{
 docker(['run','-d','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust',image]);
 let ready=false;for(let n=0;n<150;n++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),url=`postgresql://postgres@127.0.0.1:${port}/postgres`;
 admin=new Pool({connectionString:url,max:2});
 await admin.query("create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.refresh_tokens(id bigint generated always as identity,user_id text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;");
 process.env.MIGRATION_DATABASE_URL=url;process.argv.push('--expand-only');await migrate();
 const base=new Date(),owner=randomUUID(),player=randomUUID();
 await admin.query("insert into auth.users(id,email) values($1,'deadline-owner@example.test'),($2,'deadline-player@example.test')",[owner,player]);
 await admin.query("update profiles set username=case when id=$1 then 'DeadlineOwner' else 'DeadlinePlayer' end,onboarded_at=now() where id=any($2::uuid[])",[owner,[owner,player]]);
 await admin.query("insert into user_roles(user_id,role) values($1,'owner')",[owner]);
 // Test-only wall clock lets the real SQL and JS follow one unchanged deadline.
 // No production function or timestamp source is replaced in the application.
 await admin.query("create schema deadline_clock;create table deadline_clock.current_time(value timestamptz not null);create function deadline_clock.now() returns timestamptz language sql stable as $$select value from deadline_clock.current_time$$;grant usage on schema deadline_clock to dartspoint_app;grant select on deadline_clock.current_time to dartspoint_app;grant execute on function deadline_clock.now() to dartspoint_app");await admin.query('insert into deadline_clock.current_time values($1)',[base]);
 const appUrl=new URL(url);appUrl.searchParams.set('options','-c search_path=deadline_clock,pg_catalog,public');process.env.DATABASE_URL=appUrl.href;process.env.DATABASE_ROLE='dartspoint_app';
 async function ticket(privacy:boolean,createdAt:Date,context:Record<string,string>={}){return (await admin!.query("insert into private.support_tickets(requester_id,topic_id,title,acl_roles,protected_kind,context,created_at) values($1,$2,'Deadline integration fixture',array['platform'],$3,$4,$5) returning id,number",[player,privacy?'privacy':'general',privacy?'privacy':null,JSON.stringify(context),createdAt])).rows[0] as {id:string;number:string};}
 const lostResponse=await ticket(true,new Date(base.getTime()-2*86400000),{privacyKind:'export'}),ordinary=await ticket(false,base);
 assert.deepEqual(await reconcilePrivacyReceipts(),{reconciled:1});assert.deepEqual(await reconcilePrivacyReceipts(),{reconciled:0});
 const receipt=(await admin.query('select * from private.privacy_requests where ticket_id=$1',[lostResponse.id])).rows[0];
 assert.equal(receipt.received_at.getTime(),base.getTime()-2*86400000);assert.equal(receipt.state,'identity_pending');assert.equal(receipt.kind,'export');
 assert.equal((await admin.query('select count(*) n from private.privacy_requests where ticket_id=$1',[ordinary.id])).rows[0].n,'0');
 assert.equal((await admin.query("select due_at=received_at+interval '1 month' correct from private.privacy_requests where id=$1",[receipt.id])).rows[0].correct,true,'An identity question never postpones the calendar month');
 const continuation=await ticket(true,base,{linkedTicketId:lostResponse.id,privacyKind:'export'});await reconcilePrivacyReceipts();
 const linked=(await admin.query('select received_at,due_at from private.privacy_requests where ticket_id=$1',[continuation.id])).rows[0];assert.equal(linked.received_at.getTime(),receipt.received_at.getTime());assert.equal(linked.due_at.getTime(),receipt.due_at.getTime(),'A linked continuation keeps the original legal receipt deadline');
 await admin.query("update private.privacy_requests set state='completed',completed_at=now() where ticket_id=any($1::uuid[])",[[lostResponse.id,continuation.id]]);
 const execution=await ticket(true,new Date(base.getTime()-8*86400000),{privacyKind:'delete_data'}),request=await ensurePrivacyRequestForTicket(execution.id);
 await admin.query("update private.privacy_requests set state='in_progress',identity_verified_at=received_at,confirmed_at=received_at where id=$1",[request]);
 assert.deepEqual(await remindPrivacyDeadlines(),{notified:1});assert.deepEqual(await remindPrivacyDeadlines(),{notified:0});
 async function notifications(){return (await admin!.query("select dedupe_key,payload from private.outbox_events where kind='support-notification' and payload->>'ticketId'=$1 order by dedupe_key",[execution.id])).rows;}
 const first=await notifications();assert.equal(first.length,1);assert.equal(first[0].payload.number,Number(execution.number),'A deadline notification carries the actual ticket number');
 const internal=(await admin.query("select data from private.support_events where ticket_id=$1 and kind='privacy_deadline_escalation'",[execution.id])).rows;assert.equal(internal.length,1);assert.equal(internal[0].data.legalDeadlineExceeded,false);assert.equal(internal[0].data.internalExecutionTargetExceeded,true);
 // Move both clocks past the same due_at; changing due_at would hide the old
 // collision because the timestamp is itself part of the notification key.
 const due=(await admin.query('select due_at from private.privacy_requests where id=$1',[request])).rows[0].due_at as Date,next=new Date(due.getTime()+86400000);
 await admin.query('update deadline_clock.current_time set value=$1',[next]);Date.now=()=>next.getTime();
 assert.deepEqual(await remindPrivacyDeadlines(),{notified:1});assert.deepEqual(await remindPrivacyDeadlines(),{notified:0});
 const final=await notifications();assert.equal(final.length,2,'The actual legal deadline breach sends a new notification after the earlier execution target');assert.notEqual(final[0].dedupe_key,final[1].dedupe_key);
 const events=(await admin.query("select data from private.support_events where ticket_id=$1 and kind='privacy_deadline_escalation'",[execution.id])).rows;assert.equal(events.length,2);assert.equal(events.filter(row=>row.data.legalDeadlineExceeded===true).length,1);
 assert.equal((await admin.query('select due_at from private.privacy_requests where id=$1',[request])).rows[0].due_at.getTime(),due.getTime());
 console.log('Privacy deadline integration passed: receipt reconciliation, original calendar/continuation deadlines, actual ticket number, distinct day-seven and overdue notifications, and idempotent reminders on isolated PostgreSQL.');
}finally{Date.now=realNow;await db().end();await admin?.end();spawnSync('docker',['rm','--force','--volumes',name],{stdio:'ignore'});}
