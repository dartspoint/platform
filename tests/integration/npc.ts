import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import {postgresOptions} from '../../packages/data/src/postgres';
import {db,transaction,redis} from '../../packages/data/src/db';
import {actorById,type Actor} from '../../packages/data/src/auth';
import {npcActor} from '../../packages/data/src/npc-auth';
import {openAiMetadata,openAiAction} from '../../packages/data/src/integration-secrets';
import {npcAdmin,npcAdminAction} from '../../packages/data/src/npc-admin';
import {roomSubscription,removeRoomSubscription,audienceLock,refreshAudience} from '../../packages/data/src/npc-audience';
import {joinRoom,privateChannel} from '../../packages/data/src/community';
import {publishNpcCandidate,planNpcActions,claimNpcJob,runNpcJob} from '../../packages/data/src/npc-runtime';
import {createMatch,acquireMatch,npcMatchTick,settleImpacts} from '../../packages/data/src/matches';
import {normalizeGameRules} from '../../packages/game-core/src/darts-match-rules';
import {bootstrap} from '../../packages/data/src/projections';
import {DomainError} from '../../packages/contracts/src/index';
assert.equal(process.env.APP_ENV,'development');
for(const name of ['DATABASE_URL','MIGRATION_DATABASE_URL'])assert.equal(new URL(process.env[name]!).hostname,'127.0.0.1');
const control=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:2}),checks:Record<string,boolean>={};
const prefix='Npc'+randomUUID().replaceAll('-','').slice(0,7),room=randomUUID(),ownerId=randomUUID(),humanId=randomUUID(),sessionId=randomUUID(),humanSession=randomUUID(),connectionId=randomUUID();
process.env.AI_INTEGRATION_MASTER_KEY_B64=randomBytes(32).toString('base64');process.env.AI_INTEGRATION_MASTER_KEY_ID='acceptance-v1';
const owner:Actor={id:ownerId,username:prefix+'O',role:'owner',sessionVersion:1,expiresAt:Date.now()+3600000,onboarded:true,sessionId};
const human:Actor={...owner,id:humanId,username:prefix+'H',role:'player',sessionId:humanSession};
const fakeKey='sk-fixed-fictitious-provider-key-for-owned-tests',fetchOriginal=globalThis.fetch;
let providerMode='ok',calls=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));assert.equal(url.href,'https://api.openai.com/v1/responses');assert.equal(init?.redirect,'error');const body=JSON.parse(init!.body as string);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);calls++;
 if(providerMode==='fail')return Response.json({error:{message:'PRIVATE UPSTREAM '+fakeKey}},{status:401});
 return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({decision:providerMode==='say'?'say':'silent',text:providerMode==='say'?'Misschien pak ik later mijn gitaar er weer bij.':null,replyToMessageId:null,topic:'test'})}]}],usage:{total_tokens:12}});
};
async function deny(fn:()=>Promise<unknown>,code?:string){await assert.rejects(fn,e=>e instanceof DomainError&&(!code||e.code===code));}
async function jobFor(npc:string,channel:string){return transaction(async c=>{
 await audienceLock(c);const a=await refreshAudience(c),s=(await c.query('select * from private.npc_director_settings where id=1')).rows[0],d=(await c.query('select * from private.npc_definitions where user_id=$1',[npc])).rows[0],secret=(await c.query("select version from private.integration_secrets where provider='openai'")).rows[0];
 return (await c.query(`insert into private.npc_action_jobs(opportunity,user_id,room_id,channel_id,context_cursor,global_epoch,room_epoch,director_version,persona_version,secret_version,state,due_at,expires_at,lease_until,lease_token) values($1,$2,$3,$4,(select cursor from channels where id=$4),$5,$6,$7,$8,$9,'running',now(),now()+interval '60 seconds',now()+interval '40 seconds',$10) returning *`,[randomUUID(),npc,room,channel,a.find(r=>r.id==='global').epoch,a.find(r=>r.id===room).epoch,s.version,d.version,secret.version,randomUUID()])).rows[0];
});}
try{
 await control.query("update private.integration_secrets set version=0,ciphertext=null,nonce=null,tag=null,key_id=null,last_four=null,model=null,test_status='not_configured',tested_version=null where provider='openai'");
 await control.query("insert into auth.users(id,email) values($1,$2),($3,$4)",[ownerId,prefix+'-owner@example.test',humanId,prefix+'-human@example.test']);
 for(const [id,name,sid] of [[ownerId,prefix+'O',sessionId],[humanId,prefix+'H',humanSession]]){await control.query('update profiles set username=$2,onboarded_at=now() where id=$1',[id,name]);await control.query('insert into player_ratings(user_id) values($1)',[id]);await control.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,id]);}
 await control.query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[ownerId]);await control.query('insert into private.privacy_reauths(user_id,session_id) values($1,$2)',[ownerId,sessionId]);
 const chars=(await control.query('select * from private.npc_definitions order by id')).rows;assert.equal(chars.length,25);assert.equal(chars.filter(c=>c.persona.gender==='man').length,13);assert.equal(chars.filter(c=>c.persona.gender==='vrouw').length,12);assert(chars.every(c=>c.public_profile.age>=18&&c.public_profile.age<=40));
 assert.equal((await control.query("select count(*)::int n from profiles p join auth.users u on u.id=p.id where p.actor_kind='npc'")).rows[0].n,0);checks.fixed25WithoutAuth=true;
 await assert.rejects(()=>control.query('update profiles set auth_user_id=null where id=$1',[humanId]));await assert.rejects(()=>control.query('update profiles set auth_user_id=$2 where id=$1',[humanId,ownerId]));await assert.rejects(()=>control.query('update profiles set auth_user_id=$2 where id=$1',[chars[0].user_id,humanId]));await assert.rejects(()=>control.query("insert into user_roles(user_id,role) values($1,'admin')",[chars[0].user_id]));
 await deny(()=>actorById(chars[0].user_id,Date.now()+60000),'unauthenticated');checks.identityAndImpersonationGuard=true;
 for(const role of ['player','vip','admin','owner'] as const){const forged={...human,role};await deny(()=>openAiMetadata(forged),'forbidden');await deny(()=>npcAdmin(forged),'forbidden');await deny(()=>npcAdminAction(forged,{}),'forbidden');}
 await deny(()=>openAiAction({...owner,sessionId:undefined},'save',{}),'verified_session_required');checks.freshOwnerAuthorization=true;
 let meta=await openAiAction(owner,'save',{expectedVersion:0,key:fakeKey,model:'gpt-4.1-mini'});assert.equal(meta.testStatus,'untested');assert(!JSON.stringify(meta).includes(fakeKey));
 meta=await openAiAction(owner,'test',{expectedVersion:meta.version});assert.equal(meta.testStatus,'working');providerMode='fail';await deny(()=>openAiAction(owner,'rotate',{expectedVersion:meta.version,key:fakeKey+'-invalid',model:meta.model}),'ai_credentials');assert.equal((await openAiMetadata(owner)).version,meta.version);providerMode='ok';checks.writeOnlyEncryptedRotation=true;
 const snapshot=JSON.stringify(await bootstrap(owner));assert(!snapshot.includes(fakeKey));assert(!snapshot.includes('ciphertext'));assert(!snapshot.includes('behaviorNotes'));checks.safeBootstrap=true;
 await control.query('insert into community_rooms(id,name,slug,capacity) values($1,$2,$2,50)',[room,prefix]);const channel=(await control.query("insert into channels(kind,room_id) values('community',$1) returning id",[room])).rows[0].id;
 await joinRoom(human,{roomId:room});await roomSubscription(human,connectionId,room);const bot=await npcActor(chars[0].user_id);await joinRoom(bot,{roomId:room});await deny(()=>privateChannel(human,{targetId:bot.id}),'private_messages_closed');
 await control.query('update private.npc_director_settings set enabled=true,emergency_stop=false where id=1');
 const generatedJob=await jobFor(bot.id,channel);providerMode='say';await runNpcJob(generatedJob);providerMode='ok';assert.equal((await control.query('select state from private.npc_action_jobs where id=$1',[generatedJob.id])).rows[0].state,'published');assert.equal((await control.query('select actual_tokens from private.ai_usage where job_id=$1',[generatedJob.id])).rows[0].actual_tokens,12);checks.workerConsumesGenerationAndAccountsUsage=true;
 const job=await jobFor(bot.id,channel),body='Wat luister jij meestal tijdens het koken?';const results=await Promise.allSettled(Array.from({length:100},()=>publishNpcCandidate(job,body,null)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await control.query('select count(*)::int n from private.npc_utterance_history where opportunity=$1',[job.id])).rows[0].n,1);assert.equal((await control.query("select count(*)::int n from private.outbox_events where dedupe_key=$1",['npc-chat:'+job.id])).rows[0].n,1);checks.atomicConcurrentPublication=true;
 const duplicate=await jobFor(bot.id,channel);await deny(()=>publishNpcCandidate(duplicate,'WÁT luister jij meestal tijdens het koken! 😊',null),'duplicate');
 const different=await jobFor(bot.id,channel);await publishNpcCandidate(different,'Ik zou graag een wandeling langs de kust maken.',null);checks.sharedHistoryAllowsDifferentTexts=true;
 const opponent=await npcActor(chars[1].user_id);await joinRoom(opponent,{roomId:room});
 const otherDuplicate=await jobFor(opponent.id,channel);await deny(()=>publishNpcCandidate(otherDuplicate,body,null),'duplicate');checks.historySharedAcrossCharacters=true;
 const budgetJob=await jobFor(opponent.id,channel),callsBeforeBudget=calls;await control.query("update private.npc_director_settings set data=jsonb_set(data,'{dailyTokenLimit}','0') where id=1");await runNpcJob(budgetJob);assert.equal(calls,callsBeforeBudget);assert.equal((await control.query('select reason from private.npc_action_jobs where id=$1',[budgetJob.id])).rows[0].reason,'ai_budget');await control.query("update private.npc_director_settings set data=jsonb_set(data,'{dailyTokenLimit}','20000') where id=1");checks.hardBudgetStopsBeforeProvider=true;
 const match=await transaction(c=>createMatch(c,bot,opponent.id,room,normalizeGameRules({startScore:301,doubleIn:true,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1}),'casual'));
 const writer=randomUUID(),fence=await acquireMatch(match.matchId,writer);await npcMatchTick(match.matchId,writer,fence);await npcMatchTick(match.matchId,writer,fence);
 const launched=(await control.query('select state,state_version from matches where id=$1',[match.matchId])).rows[0];assert(launched.state.pendingDart);assert.equal((await control.query('select count(*)::int n from match_darts where match_id=$1',[match.matchId])).rows[0].n,1);
 await removeRoomSubscription(connectionId);await npcMatchTick(match.matchId,writer,fence);const sleeping=(await control.query('select state,state_version from matches where id=$1',[match.matchId])).rows[0];assert(sleeping.state.npcSleepAt);await control.query('update match_darts set impact_at=now() where match_id=$1',[match.matchId]);await settleImpacts();assert.equal((await control.query('select state_version from matches where id=$1',[match.matchId])).rows[0].state_version,sleeping.state_version);
 await roomSubscription(human,connectionId,room);await npcMatchTick(match.matchId,writer,fence);assert.equal((await control.query('select state from matches where id=$1',[match.matchId])).rows[0].state.npcSleepAt,undefined);await deny(()=>npcMatchTick(match.matchId,writer,fence+1),'stale_writer');
 await control.query('update match_darts set impact_at=now() where match_id=$1',[match.matchId]);await settleImpacts();assert.equal((await control.query('select count(*)::int n from match_darts where match_id=$1 and impacted_at is not null',[match.matchId])).rows[0].n,1);checks.nativeClientlessGameplaySleepAndFencing=true;
 await control.query("update matches set lifecycle='cancelled',ended_at=now() where id=$1",[match.matchId]);await control.query('delete from active_player_reservations where match_id=$1',[match.matchId]);
 const stale=await jobFor(bot.id,channel);await removeRoomSubscription(connectionId);await roomSubscription(human,connectionId,room);await deny(()=>publishNpcCandidate(stale,'Welke boeken lees je graag in de trein?',null));checks.departureReturnInvalidatesOldJobs=true;
 const c2=randomUUID();await roomSubscription(human,c2,room);await removeRoomSubscription(connectionId);const audience=await transaction(async c=>{await audienceLock(c);return refreshAudience(c);});assert.equal(audience.find(a=>a.id===room).humans,1);await removeRoomSubscription(c2);const before=calls;await planNpcActions();const next=await claimNpcJob();if(next)await runNpcJob(next);assert.equal(calls,before);checks.multitabAndEmptySleep=true;
 meta=await openAiAction(owner,'delete',{expectedVersion:meta.version});assert.equal(meta.configured,false);checks.keyDeletion=true;
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/npc-native-result.json',JSON.stringify({checks,providerCalls:calls,liveProviderCalls:0},null,2));console.log(JSON.stringify({checks,providerCalls:calls,liveProviderCalls:0}));
}finally{globalThis.fetch=fetchOriginal;await control.query('update private.npc_director_settings set enabled=false where id=1');await db().end();await control.end();await(await redis()).quit();}
