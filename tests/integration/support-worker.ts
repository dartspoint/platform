import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {pendingSupportWorkSql,supportWorkBits,dueTournamentRemindersSql,dueDivisionRemindersFromSql,dueDivisionRemindersSql} from '../../packages/data/src/support-work';

const source=new URL(process.env.MIGRATION_DATABASE_URL!);
assert.equal(process.env.APP_ENV,'development');assert.ok(['127.0.0.1','localhost'].includes(source.hostname));
const database='support_worker_test_'+randomUUID().replaceAll('-','');
const control=new Pool({...postgresOptions(source.toString()),max:1});
await control.query('create database '+database);
const isolated=new URL(source);isolated.pathname='/'+database;
const pool=new Pool({...postgresOptions(isolated.toString()),max:1}),c=await pool.connect();
let checks=0;
async function ready(bit:number,expected:boolean,scanner=true){
 const result=await c.query(pendingSupportWorkSql,[scanner]);
 assert.deepEqual(result.fields.map(field=>field.name),['ready']);
 assert.equal(Boolean(result.rows[0].ready&bit),expected);checks++;
}
async function scenario(fn:()=>Promise<void>){await c.query('savepoint support_work_case');try{await fn();}finally{await c.query('rollback to savepoint support_work_case');}}
try{
 // A separate database makes global readiness assertions independent of queued
 // mail and active workers in the developer/CI database.
 await c.query('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$');
 for(const file of ['20261012000100_platform.sql','20261012000200_domain.sql','20261012000900_queue_delivery.sql','20261015133111_support_tickets_team.sql','20261015133704_privacy_requests_and_jobs.sql','20261015134124_support_inbound_mail.sql'])await c.query(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await c.query('begin');
 // Fixture changes also roll back before the disposable database is removed.
 const players=[randomUUID(),randomUUID()].sort(),roomId=randomUUID(),suffix=randomUUID();
 for(const id of players){await c.query('insert into auth.users(id) values($1)',[id]);await c.query('insert into profiles(id) values($1) on conflict do nothing',[id]);}
 await c.query('insert into community_rooms(id,name,slug) values($1,$2,$2)',[roomId,'egress-'+suffix]);
 const topicId='egress-'+suffix,ticketId=randomUUID(),requestId=randomUUID();
 await c.query("insert into private.support_topics(id,name,roles) values($1,'Egress fixture',array['platform'])",[topicId]);
 await c.query("insert into private.support_tickets(id,guest_email,topic_id,title,acl_roles) values($1,'fixture@example.invalid',$2,'Egress fixture',array['platform'])",[ticketId,topicId]);
 await c.query("insert into private.privacy_requests(id,ticket_id,kind,received_at,due_at) values($1,$2,'export',now(),now()+interval '1 month')",[requestId,ticketId]);

 await scenario(async()=>{
  const id=randomUUID();await c.query("insert into private.outbox_events(id,dedupe_key,kind,payload) values($1,$2,'fixture','{}')",[id,'egress-'+id]);
  await ready(supportWorkBits.outbox,true);
  await c.query("update private.outbox_events set next_try=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.outbox,false);
  await c.query("update private.outbox_events set next_try=now(),locked_until=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.outbox,false);
  await c.query("update private.outbox_events set locked_until=now()-interval '1 second' where id=$1",[id]);await ready(supportWorkBits.outbox,true);
  await c.query('update private.outbox_events set delivered_at=now() where id=$1',[id]);await ready(supportWorkBits.outbox,false);
 });
 await scenario(async()=>{
  const id=randomUUID();await c.query("insert into game_invites(id,inviter_id,invitee_id,room_id,rules,ranked,expires_at) values($1,$2,$3,$4,'{}',false,now()-interval '1 second')",[id,...players,roomId]);
  await ready(supportWorkBits.queues,true);
  await c.query("update game_invites set expires_at=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.queues,false);
  await c.query("update game_invites set expires_at=now()-interval '1 second',state='accepted' where id=$1",[id]);await ready(supportWorkBits.queues,false);
 });
 await scenario(async()=>{
  const id=randomUUID();await c.query("insert into matches(id,room_id,mode,rules,state,lifecycle) values($1,$2,'casual','{}','{}','completed')",[id,roomId]);
  await c.query("insert into match_results(match_id,kind,winner_id,result_hash,final_version,data) values($1,'played',$2,'fixture',1,'{}')",[id,players[0]]);
  await ready(supportWorkBits.queues,false);
  await c.query('insert into match_queues(match_id,user_id) values($1,$2)',[id,players[1]]);await ready(supportWorkBits.queues,true);
  await c.query("update matches set competition='{}' where id=$1",[id]);await ready(supportWorkBits.queues,false);
  await c.query('update matches set competition=null where id=$1',[id]);await c.query('delete from match_queues where match_id=$1',[id]);
  await c.query('insert into private.queue_advances(match_id) values($1)',[id]);await ready(supportWorkBits.queues,true);
  await c.query('update private.queue_advances set finished=true where match_id=$1',[id]);await ready(supportWorkBits.queues,false);
 });
 await scenario(async()=>{
  const id=randomUUID(),model={participants:[{id:players[0],status:'confirmed'}],settings:{startsAt:new Date(Date.now()+10*60000).toISOString()}};
  await c.query("insert into tournaments(id,room_id,name,status,published,model) values($1,$2,'Egress fixture','live',true,$3)",[id,roomId,JSON.stringify(model)]);
  await ready(supportWorkBits.competitions,true);await ready(supportWorkBits.reminders,false);
  await c.query("update tournaments set status='registration' where id=$1",[id]);await ready(supportWorkBits.competitions,false);await ready(supportWorkBits.reminders,true);
  // Delivery state is irrelevant: an existing durable outbox event is already
  // queued, and must not cause the tournament JSON to be read every second.
  await c.query("insert into private.outbox_events(dedupe_key,kind,payload) values($1,'fixture','{}')",['tournament-reminder:'+id+':'+players[0]]);
  await ready(supportWorkBits.reminders,false);
  assert.equal((await c.query(`select t.id from tournaments t where ${dueTournamentRemindersSql} and t.id=$1`,[id])).rowCount,0);checks++;
  model.participants.push({id:players[1],status:'checkedin'});await c.query('update tournaments set model=$2 where id=$1',[id,JSON.stringify(model)]);await ready(supportWorkBits.reminders,true);
  assert.equal((await c.query(`select t.id from tournaments t where ${dueTournamentRemindersSql} and t.id=$1`,[id])).rowCount,1);checks++;
  await c.query('update tournaments set published=false where id=$1',[id]);await ready(supportWorkBits.reminders,false);
  model.settings.startsAt=new Date(Date.now()+60*60000).toISOString();await c.query('update tournaments set published=true,model=$2 where id=$1',[id,JSON.stringify(model)]);await ready(supportWorkBits.reminders,false);
 });
 await scenario(async()=>{
  const seasonId=randomUUID(),divisionId=randomUUID(),fixtureId=randomUUID();
  await c.query("insert into seasons(id,name,status,model) values($1,'Egress fixture','live','{}')",[seasonId]);
  await c.query("insert into divisions(id,season_id,level,name,color) values($1,$2,1,'Egress fixture','gold')",[divisionId,seasonId]);
  await c.query("insert into division_fixtures(id,season_id,division_id,player_low,player_high,model) values($1,$2,$3,$4,$5,jsonb_build_object('status','scheduled','dueOn',current_date::text))",[fixtureId,seasonId,divisionId,...players]);
  await ready(supportWorkBits.reminders,true);
  for(const player of players){await c.query("insert into private.outbox_events(dedupe_key,kind,payload) values($1,'fixture','{}')",['division-reminder:'+fixtureId+':'+player]);await ready(supportWorkBits.reminders,player!==players[1]);}
  assert.equal((await c.query(`select f.id from ${dueDivisionRemindersFromSql} where ${dueDivisionRemindersSql} and f.id=$1`,[fixtureId])).rowCount,0);checks++;
 });
 await scenario(async()=>{
  const id=randomUUID();await c.query("insert into private.support_inbound_events(id,webhook_id,event_type,provider_email_id,payload_hash,payload) values($1,$2,'email.received',$2,'fixture','{}')",[id,'egress-'+id]);
  for(const state of ['pending','error','processing','processed','ignored']){await c.query('update private.support_inbound_events set state=$2 where id=$1',[id,state]);await ready(supportWorkBits.inbound,['pending','error','processing'].includes(state));}
  await c.query("update private.support_inbound_events set state='processing',locked_until=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.inbound,false);
  await c.query("update private.support_inbound_events set locked_until=now()-interval '1 second' where id=$1",[id]);await ready(supportWorkBits.inbound,true);
  await c.query("update private.support_inbound_events set next_try=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.inbound,false);
 });
 await scenario(async()=>{
  const id=randomUUID();await c.query("insert into private.privacy_jobs(id,request_id,kind) values($1,$2,'export')",[id,requestId]);
  for(const state of ['pending','retry','waiting_ledger','running','review_required','failed','completed']){await c.query('update private.privacy_jobs set state=$2 where id=$1',[id,state]);await ready(supportWorkBits.privacy,['pending','retry','waiting_ledger','running'].includes(state));}
  await c.query("update private.privacy_jobs set state='running',locked_until=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.privacy,false);
  await c.query("update private.privacy_jobs set locked_until=now()-interval '1 second' where id=$1",[id]);await ready(supportWorkBits.privacy,true);
  await c.query("update private.privacy_jobs set next_try=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.privacy,false);
 });
 await scenario(async()=>{
  const messageId=randomUUID(),id=randomUUID();await c.query("insert into private.support_messages(id,ticket_id,author_kind,body) values($1,$2,'requester','Egress fixture')",[messageId,ticketId]);
  await c.query("insert into private.support_attachments(id,ticket_id,message_id,name,mime,bytes,checksum,data) values($1,$2,$3,'fixture.pdf','application/pdf',1,'fixture',$4)",[id,ticketId,messageId,Buffer.from('x')]);
  await ready(supportWorkBits.attachments,false,false);
  for(const status of ['pending','error','clean','rejected']){await c.query('update private.support_attachments set scan_status=$2 where id=$1',[id,status]);await ready(supportWorkBits.attachments,['pending','error'].includes(status));}
  await c.query("update private.support_attachments set scan_status='pending',scan_locked_until=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.attachments,false);
  await c.query("update private.support_attachments set scan_locked_until=now()-interval '1 second' where id=$1",[id]);await ready(supportWorkBits.attachments,true);
  await c.query("update private.support_attachments set scan_after=now()+interval '1 minute' where id=$1",[id]);await ready(supportWorkBits.attachments,false);
 });
 console.log(JSON.stringify({event:'support_worker_integration_passed',checks,isolatedDatabase:true}));
}finally{await c.query('rollback');c.release();await pool.end();await control.query('drop database '+database);await control.end();}
