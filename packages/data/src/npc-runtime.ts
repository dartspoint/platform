import {inviteInTransaction,respondInviteInTransaction} from './matches';
import {normalizeGameRules} from '../../game-core/src/darts-match-rules';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db,transaction,draining,outbox} from './db';
import {npcActor} from './npc-auth';
import {audienceLock,refreshAudience,audienceMatches} from './npc-audience';
import {sendMessageInTransaction,joinRoomInTransaction} from './community';
import {decryptIntegration,encryptionStatus} from './integration-crypto';
import {generateNpcText} from './npc-provider';
import {canonicalizeNpcText,fingerprint,nearDuplicate,textFamily,safeConversationText} from './npc-text';
import {requireThat,DomainError} from '../../contracts/src/index';
import {npcSettingsSchema} from '../../contracts/src/npc';
async function activity(c:PoolClient,kind:string,reason:string|null=null,userId:string|null=null,roomId:string|null=null){await c.query('insert into private.npc_activity(kind,reason,user_id,room_id) values($1,$2,$3,$4)',[kind,reason,userId,roomId]);}
export async function validateNpcJob(c:PoolClient,job:any){
 const audiences=await refreshAudience(c);requireThat(audienceMatches(audiences,job),'audience-epoch-changed',409);
 const config=(await c.query('select * from private.npc_director_settings where id=1 for share')).rows[0];requireThat(config.enabled&&!config.emergency_stop&&Number(config.version)===Number(job.director_version),'context-expired',409);
 const secret=(await c.query("select * from private.integration_secrets where provider='openai' for share")).rows[0];requireThat(secret.ciphertext&&secret.test_status==='working'&&Number(secret.version)===Number(job.secret_version),'ai_not_configured',409);
 const definition=(await c.query('select * from private.npc_definitions where user_id=$1 for share',[job.user_id])).rows[0];requireThat(definition?.enabled&&Number(definition.version)===Number(job.persona_version),'context-expired',409);
 if(job.thread_id)requireThat((await c.query("select 1 from private.npc_conversation_threads where id=$1 and room_id=$2 and state='active' and remaining>0 and expires_at>clock_timestamp()",[job.thread_id,job.room_id])).rowCount,'context-expired',409);
 if(job.source_id)requireThat(!(await c.query("select 1 from chat_messages source where source.id=$1 and (source.redacted_at is not null or exists(select 1 from user_blocks b where (b.blocker_id=$2 and b.blocked_id=source.sender_id) or (b.blocked_id=$2 and b.blocker_id=source.sender_id)) or exists(select 1 from personal_mutes m where m.user_id=source.sender_id and m.muted_id=$2))",[job.source_id,job.user_id])).rowCount,'context-expired',409);
 const room=(await c.query("select * from community_rooms where id=$1 and status='open' and category<>'tournament' for share",[job.room_id])).rows[0];requireThat(room,'context-expired',409);
 requireThat(!(await c.query('select 1 from active_player_reservations where user_id=$1',[job.user_id])).rowCount,'context-expired',409);
 const channel=(await c.query('select * from channels where id=$1 for update',[job.channel_id])).rows[0];requireThat(channel?.kind==='community'&&channel.room_id===job.room_id&&Number(channel.cursor)===Number(job.context_cursor),'context-expired',409);
 const current=(await c.query("select *,expires_at>clock_timestamp() fresh,lease_until>clock_timestamp() owned from private.npc_action_jobs where id=$1",[job.id])).rows[0];requireThat(current?.state==='running'&&current.lease_token===job.lease_token&&current.fresh&&current.owned,'context-expired',409);
 requireThat((await c.query('select 1 from room_memberships where user_id=$1 and room_id=$2 and lease_until>clock_timestamp()',[job.user_id,job.room_id])).rowCount,'context-expired',409);
 return {config,secret,definition,room};
}
export async function planNpcActions(){
 if(await draining()||!encryptionStatus())return;
 return transaction(async c=>{
 await audienceLock(c);const audiences=await refreshAudience(c),global=audiences.find(r=>r.id==='global');if(!global?.awake)return;
 const config=(await c.query('select * from private.npc_director_settings where id=1 for share')).rows[0];if(!config.enabled||config.emergency_stop)return;
 const secret=(await c.query("select version from private.integration_secrets where provider='openai' and ciphertext is not null and test_status='working' and tested_version=version")).rows[0];if(!secret)return;
 const settings=npcSettingsSchema.parse(config.data),hour=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',hour:'numeric',hourCycle:'h23'}).format(new Date()));
 const cap=hour<7?settings.nightCap:hour>=18?settings.eveningCap:settings.dayCap;
 const desired=Math.max(0,cap-Math.max(0,Number(global.humans)-1)*settings.humanReduction);
 const rooms=(await c.query("select r.*,ch.id channel_id,ch.cursor from community_rooms r join channels ch on ch.room_id=r.id and ch.kind='community' where r.status='open' and r.category<>'tournament' order by r.id")).rows.filter(r=>audiences.find(a=>a.id===r.id)?.awake);
 const online=Number((await c.query('select count(*) n from room_memberships m join private.npc_definitions d on d.user_id=m.user_id where lease_until>clock_timestamp()')).rows[0].n);
 // At most one arrival/departure per director tick; every action reuses room policy.
 if(online<desired&&rooms.length){
 const next=(await c.query("select d.user_id,d.persona from private.npc_definitions d join private.npc_runtime rt on rt.user_id=d.user_id where d.enabled and rt.next_action_at<=now() and not exists(select 1 from room_memberships m where m.user_id=d.user_id and m.lease_until>now()) and not exists(select 1 from active_player_reservations where user_id=d.user_id) order by rt.next_action_at,d.id limit 1")).rows[0];
 if(next){const roomsByLoad=[...rooms].sort((a,b)=>Number(a.cursor)-Number(b.cursor));for(const room of roomsByLoad){
 if(!next.persona.languages?.includes(room.primary_language??'nl'))continue;
 await c.query('savepoint npc_join');try{await joinRoomInTransaction(c,await npcActor(next.user_id,c),{roomId:room.id});await c.query("update private.npc_runtime set next_action_at=now()+interval '30 seconds',intent='social',leave_at=now()+interval '45 minutes' where user_id=$1",[next.user_id]);await activity(c,'joined',null,next.user_id,room.id);await c.query('release savepoint npc_join');break;}catch{await c.query('rollback to savepoint npc_join');await c.query('release savepoint npc_join');}
 }}
 }
 // Renew only awake allowed sessions, using native room policy; asleep presence expires.
 await c.query("update room_memberships m set last_activity_at=clock_timestamp(),lease_until=clock_timestamp()+interval '5 minutes' from private.npc_definitions d where d.user_id=m.user_id and d.enabled and m.room_id=any($1::uuid[]) and m.lease_until>now() and not exists(select 1 from sanctions s where s.target_id=m.user_id and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now() and s.kind in('suspend','remove'))",[rooms.map(r=>r.id)]);
 if(online>desired){const leave=(await c.query("select m.user_id,m.room_id from room_memberships m join private.npc_definitions d on d.user_id=m.user_id where m.room_id=any($1::uuid[]) and m.lease_until>now() and not exists(select 1 from active_player_reservations where user_id=m.user_id) order by m.joined_at limit 1",[rooms.map(r=>r.id)])).rows[0];if(leave){await c.query('update room_memberships set lease_until=clock_timestamp() where user_id=$1',[leave.user_id]);await c.query("update private.npc_runtime set next_action_at=now()+interval '5 minutes',intent='rest' where user_id=$1",[leave.user_id]);await activity(c,'left',null,leave.user_id,leave.room_id);}}
 for(const room of rooms){
 if((await c.query("select 1 from private.npc_action_jobs where room_id=$1 and (state in('pending','running') or due_at>now()-($2::text||' seconds')::interval)",[room.id,settings.conversationSeconds])).rowCount)continue;
 const latest=(await c.query("select m.* from chat_messages m where channel_id=$1 and kind in('human','npc') and redacted_at is null order by seq desc limit 1",[room.channel_id])).rows[0];
 const character=(await c.query(`select d.* from private.npc_definitions d join room_memberships m on m.user_id=d.user_id join private.npc_runtime rt on rt.user_id=d.user_id where d.enabled and m.room_id=$1 and m.lease_until>clock_timestamp() and rt.next_action_at<=now() and ($2::uuid is null or d.user_id<>$2) and not exists(select 1 from active_player_reservations where user_id=d.user_id) and not exists(select 1 from user_blocks b where (b.blocker_id=d.user_id and b.blocked_id=$2) or(b.blocked_id=d.user_id and b.blocker_id=$2)) order by rt.next_action_at,d.id limit 1`,[room.id,latest?.sender_id??null])).rows[0];if(!character)continue;
 let thread:any;
 if(latest?.kind==='npc'){
 thread=(await c.query("select t.* from private.npc_conversation_threads t where t.room_id=$1 and t.last_message_id=$2 and t.state='active' and remaining>0 and expires_at>now()",[room.id,latest.id])).rows[0];if(!thread)continue;
 }else{
 if(latest&&Date.now()-new Date(latest.created_at).getTime()>90000)continue;
 if(latest&&(await c.query('select 1 from private.npc_action_jobs where source_id=$1',[latest.id])).rowCount)continue;
 thread=(await c.query('insert into private.npc_conversation_threads(room_id,channel_id,remaining) values($1,$2,$3) returning *',[room.id,room.channel_id,2+Math.floor(Math.random()*3)])).rows[0];
 }
 const audience=audiences.find(r=>r.id===room.id),delay=4000+Math.floor(Math.random()*14000);
 await c.query(`insert into private.npc_action_jobs(opportunity,user_id,room_id,channel_id,thread_id,source_id,context_cursor,global_epoch,room_epoch,director_version,persona_version,secret_version,due_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+($13::text||' milliseconds')::interval,now()+interval '60 seconds') on conflict(opportunity) do nothing`,[latest?'reply:'+latest.id:'start:'+thread.id,character.user_id,room.id,room.channel_id,thread.id,latest?.id??null,room.cursor,global.epoch,audience.epoch,config.version,character.version,secret.version,delay]);
 }
 });
}
export async function claimNpcJob(){return transaction(async c=>{await audienceLock(c);await refreshAudience(c);return (await c.query(`update private.npc_action_jobs set state='running',lease_token=$1,lease_until=clock_timestamp()+interval '40 seconds',attempts=attempts+1 where id=(select id from private.npc_action_jobs where (state='pending' or state='running' and lease_until<clock_timestamp()) and due_at<=clock_timestamp() and expires_at>clock_timestamp() and attempts<3 order by due_at for update skip locked limit 1) returning *`,[randomUUID()])).rows[0];});}
export async function publishNpcCandidate(job:any,body:string,replyTo:string|null){return transaction(async c=>{
 await audienceLock(c);const {definition}=await validateNpcJob(c,job);
 requireThat(replyTo===(job.source_id??null),'context-expired',409);
 const source=job.source_id?(await c.query('select body from chat_messages where id=$1 and redacted_at is null',[job.source_id])).rows[0]:null;
 requireThat(!job.source_id||source,'context-expired',409);requireThat(safeConversationText(body,source?.body??''),'grounding',409);
 const names=(await c.query("select username from profiles where username is not null union select persona->>'displayName' username from private.npc_definitions")).rows.map(r=>r.username);
 const canonical=canonicalizeNpcText(body,names);requireThat(canonical,'duplicate',409);const family=textFamily(canonical);
 const history=(await c.query('select canonical,family from private.npc_utterance_history where expires_at>clock_timestamp()')).rows;
 requireThat(!history.some(r=>r.canonical===canonical||family&&family===r.family),'duplicate',409);requireThat(!history.some(r=>nearDuplicate(canonical,r.canonical)),'near-duplicate',409);
 const message=await sendMessageInTransaction(c,await npcActor(job.user_id,c),{channelId:job.channel_id,clientMessageId:job.id,body},'npc');
 await c.query(`insert into private.npc_utterance_history(opportunity,message_id,user_id,channel_id,body,canonical,fingerprint,family,language,published_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval '12 hours')`,[job.id,message.id,job.user_id,job.channel_id,body,canonical,fingerprint(canonical),family,definition.persona.languages?.[0]??'nl']);
 await c.query("update private.npc_action_jobs set state='published',message_id=$2 where id=$1",[job.id,message.id]);
 await c.query("update private.npc_conversation_threads set last_message_id=$2,remaining=remaining-1,state=case when remaining<=1 then 'closed' else state end where id=$1",[job.thread_id,message.id]);
 await c.query("update private.npc_runtime set next_action_at=now()+interval '30 seconds' where user_id=$1",[job.user_id]);
 await outbox(c,'npc-chat:'+job.id,'npc-chat-published',null,{channelId:job.channel_id,messageId:message.id,seq:Number(message.seq),cursor:Number(message.cursor)});await activity(c,'published',null,job.user_id,job.room_id);return message;
 });}
export async function runNpcJob(job:any){
 let usageId:string|undefined;
 try{
 if(await draining())throw new DomainError('maintenance',503);
 const context=await transaction(async c=>{
 await audienceLock(c);const valid=await validateNpcJob(c,job),settings=npcSettingsSchema.parse(valid.config.data);
 // Conservative whole request bound. Unknown usage keeps the reservation charged.
 const reservation=16384;
 const budget=(await c.query(`select coalesce(sum(coalesce(actual_tokens,reserved_tokens)) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)::int day,coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)::int month,count(*) filter(where created_at>now()-interval '1 minute') rpm,count(*) filter(where state='reserved' and completed_at is null and created_at>now()-interval '40 seconds') inflight from private.ai_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'`)).rows[0];
 requireThat(budget.day+reservation<=settings.dailyTokenLimit&&budget.month+reservation<=settings.monthlyTokenLimit&&Number(budget.rpm)<settings.requestsPerMinute&&Number(budget.inflight)<2,'ai_budget',409);
 const recent=(await c.query("select m.id,m.body,p.username from chat_messages m join profiles p on p.id=m.sender_id where m.channel_id=$1 and m.kind in('human','npc') and m.redacted_at is null order by m.seq desc limit 8",[job.channel_id])).rows.reverse();
 const persona={...valid.definition.persona};delete persona.responseExamples;
 const prompt={persona,language:valid.room.primary_language??'nl',messages:recent,replyToMessageId:job.source_id??null,task:job.source_id?'Respond to the latest message, or stay silent.':'Start a brief casual conversation about a persona interest, without claiming prior events.'};
 requireThat(Buffer.byteLength(JSON.stringify(prompt),'utf8')<12000,'ai_context_limit',409);
 usageId=(await c.query('insert into private.ai_usage(job_id,secret_version,reserved_tokens) values($1,$2,$3) returning id',[job.id,job.secret_version,reservation])).rows[0].id;
 return {...valid,prompt};
 });
 const controller=new AbortController();let checking=false;
 const timer=setInterval(()=>{if(checking)return;checking=true;void transaction(async c=>{await audienceLock(c);await validateNpcJob(c,job);}).catch(()=>controller.abort()).finally(()=>{checking=false;});},1500);
 let generated:Awaited<ReturnType<typeof generateNpcText>>;
 try{generated=await generateNpcText(decryptIntegration(context.secret),context.secret.model,context.prompt,controller.signal);}finally{clearInterval(timer);}
 await db().query("update private.ai_usage set state=$2,actual_tokens=$3,completed_at=now() where id=$1 and state='reserved'",[usageId,generated.tokens===null?'uncertain':'completed',generated.tokens]);
 if(generated.output.decision==='silent')throw new DomainError('silent',409);
 await publishNpcCandidate(job,generated.output.text!.trim(),generated.output.replyToMessageId);
 }catch(e){
 const reason=e instanceof DomainError?e.code:'provider';
 if(usageId)await db().query("update private.ai_usage set state='uncertain',completed_at=now() where id=$1 and state='reserved'",[usageId]);
 await transaction(async c=>{await c.query("update private.npc_action_jobs set state='suppressed',reason=$3 where id=$1 and lease_token=$2 and state='running'",[job.id,job.lease_token,reason]);await activity(c,'suppressed',reason,job.user_id,job.room_id);});
 }
}

/** Short social actions share the audience publication lock and native invite transaction. */
export async function npcSocialTick(){
 if(await draining())return;
 await transaction(async c=>{
 await audienceLock(c);const audience=await refreshAudience(c),global=audience.find(a=>a.id==='global');if(!global?.awake)return;
 const config=(await c.query('select * from private.npc_director_settings where id=1 for share')).rows[0];if(!config.enabled||config.emergency_stop)return;
 const settings=npcSettingsSchema.parse(config.data);
 const pending=(await c.query(`select i.* from game_invites i join private.npc_definitions d on d.user_id=i.invitee_id where d.enabled and i.state='pending' and i.expires_at>now() and i.expires_at<now()+interval '54 seconds' order by i.expires_at limit 1`)).rows[0];
 if(pending&&audience.find(a=>a.id===pending.room_id)?.awake){await c.query('savepoint npc_accept');try{const actor=await npcActor(pending.invitee_id,c);await respondInviteInTransaction(c,actor,{inviteId:pending.id,action:pending.ranked&&!settings.ranked?'reject':'accept'});await c.query('release savepoint npc_accept');}catch{await c.query('rollback to savepoint npc_accept');await c.query("update game_invites set state='rejected' where id=$1 and state='pending'",[pending.id]);}return;}
 const roomIds=audience.filter(a=>a.id!=='global'&&a.awake).map(a=>a.id);
 const pair=(await c.query(`select d.user_id,m.room_id,target.user_id target_id,p.actor_kind from private.npc_definitions d join private.npc_runtime rt on rt.user_id=d.user_id join room_memberships m on m.user_id=d.user_id join community_rooms room on room.id=m.room_id join room_memberships target on target.room_id=m.room_id and target.user_id<>m.user_id join profiles p on p.id=target.user_id
 where d.enabled and m.room_id=any($1::uuid[]) and room.status='open' and room.category<>'tournament' and rt.next_action_at<=now() and m.lease_until>now() and target.lease_until>now() and p.status='active'
 and not exists(select 1 from active_player_reservations where user_id in(d.user_id,target.user_id))
 and not exists(select 1 from private.npc_user_cooldowns where user_id in(d.user_id,target.user_id) and until_at>now())
 and not exists(select 1 from game_invites where state='pending' and expires_at>now() and (inviter_id in(d.user_id,target.user_id) or invitee_id in(d.user_id,target.user_id)))
 order by rt.next_action_at,d.id limit 1`,[roomIds])).rows[0];if(!pair)return;
 // Shared recipient cooldown prevents a different character from immediately retrying a rejection.
 await c.query('savepoint npc_invite');try{
 await inviteInTransaction(c,await npcActor(pair.user_id,c),{targetId:pair.target_id,roomId:pair.room_id,rules:normalizeGameRules({startScore:501,bestOf:1,format:'legs',bestOfSets:1,doubleIn:false,doubleOut:true}),ranked:false});
 for(const id of [pair.user_id,pair.target_id])await c.query("insert into private.npc_user_cooldowns(user_id,until_at) values($1,now()+($2::text||' seconds')::interval) on conflict(user_id) do update set until_at=excluded.until_at",[id,settings.inviteSeconds]);
 await c.query("update private.npc_runtime set next_action_at=now()+interval '60 seconds' where user_id=$1",[pair.user_id]);await c.query('release savepoint npc_invite');
 }catch{await c.query('rollback to savepoint npc_invite');}
 });
}
