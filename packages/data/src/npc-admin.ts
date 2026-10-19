import {encryptionStatus} from './integration-crypto';
import {z} from 'zod';
import {db,transaction,audit} from './db';
import type {Actor} from './auth';
import {requireNpcOwner} from './npc-auth';
import {npcSettingsSchema} from '../../contracts/src/npc';
import {requireThat,uuid} from '../../contracts/src/index';
import {audienceLock,refreshAudience} from './npc-audience';
export async function npcAdmin(actor:Actor){await requireNpcOwner(actor);return transaction(async c=>{
 await requireNpcOwner(actor,c);await audienceLock(c);const audience=await refreshAudience(c);
 return {provider:(await c.query("select test_status,model,ciphertext is not null configured from private.integration_secrets where provider='openai'")).rows[0],settings:(await c.query('select * from private.npc_director_settings where id=1')).rows[0],characters:(await c.query('select d.*,p.username,r.intent,r.next_action_at,m.room_id,m.lease_until>now() online from private.npc_definitions d join profiles p on p.id=d.user_id join private.npc_runtime r on r.user_id=d.user_id left join room_memberships m on m.user_id=d.user_id order by p.username')).rows,audience,activity:(await c.query('select * from private.npc_activity order by id desc limit 100')).rows,quality:(await c.query("select (select count(*) from private.npc_utterance_history where expires_at>now()) unique_texts,(select count(*) from private.npc_action_jobs where reason in('duplicate','near-duplicate')) suppressed,(select coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) from private.ai_usage where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') daily_tokens,(select coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) from private.ai_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') monthly_tokens")).rows[0]};
 });}
export async function npcAdminAction(actor:Actor,input:unknown){await requireNpcOwner(actor);
 const p=z.discriminatedUnion('action',[
 z.object({action:z.literal('settings'),expectedVersion:z.number().int(),enabled:z.boolean(),emergencyStop:z.boolean(),data:npcSettingsSchema}).strict(),
 z.object({action:z.literal('character'),userId:uuid,expectedVersion:z.number().int(),enabled:z.boolean(),publicProfile:z.object({displayName:z.string().min(1).max(100),age:z.number().int().min(18).max(40),country:z.string().min(2).max(60),city:z.string().max(100),languages:z.array(z.enum(['nl','en'])).min(1),bio:z.string().max(1500),bioEn:z.string().max(1500),interests:z.array(z.string().max(60)).max(12)}).strict(),persona:z.record(z.string(),z.unknown())}).strict()
 ]).parse(input);
 await transaction(async c=>{await requireNpcOwner(actor,c);await audienceLock(c);
 if(p.action==='settings'){
 if(p.enabled){const ready=(await c.query("select ciphertext is not null and test_status='working' and tested_version=version ready from private.integration_secrets where provider='openai'")).rows[0];requireThat(ready?.ready&&encryptionStatus(),'ai_not_configured',409);}
 const r=await c.query('update private.npc_director_settings set enabled=$2,emergency_stop=$3,data=$4,version=version+1 where id=1 and version=$1',[p.expectedVersion,p.enabled,p.emergencyStop,JSON.stringify(p.data)]);requireThat(r.rowCount,'revision_conflict',409);
 }else{const r=await c.query('update private.npc_definitions set enabled=$3,public_profile=$4,persona=$5,version=version+1,updated_at=now() where user_id=$1 and version=$2',[p.userId,p.expectedVersion,p.enabled,JSON.stringify(p.publicProfile),JSON.stringify(p.persona)]);requireThat(r.rowCount,'revision_conflict',409);}
 await c.query("update private.npc_action_jobs set state='cancelled',reason='configuration-changed' where state in('pending','running') and ($1::uuid is null or user_id=$1)",[p.action==='character'?p.userId:null]);
 await audit(c,actor.id,'npc.'+p.action,p.action==='character'?p.userId:'director',{version:p.expectedVersion+1});
 });return npcAdmin(actor);
}
