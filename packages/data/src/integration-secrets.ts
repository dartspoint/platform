import {z} from 'zod';
import type {Actor} from './auth';
import {transaction,db,audit,rateLimit} from './db';
import {requireThat} from '../../contracts/src/index';
import {requireNpcOwner} from './npc-auth';
import {encryptIntegration,decryptIntegration,encryptionStatus} from './integration-crypto';
import {generateNpcText,NPC_MODELS} from './npc-provider';
import type {OpenAiMetadata} from '../../contracts/src/npc';
export async function openAiMetadata(actor:Actor):Promise<OpenAiMetadata>{
 await requireNpcOwner(actor);const r=(await db().query("select version,ciphertext is not null configured,last_four,model,test_status,tested_version,updated_at from private.integration_secrets where provider='openai'")).rows[0];
 return {version:Number(r.version),configured:r.configured,lastFour:r.last_four,model:r.model,testStatus:r.test_status,testedVersion:r.tested_version===null?null:Number(r.tested_version),encryptionReady:encryptionStatus(),updatedAt:new Date(r.updated_at).toISOString(),models:NPC_MODELS};
}
export async function openAiAction(actor:Actor,action:string,input:unknown){
 await requireNpcOwner(actor,db(),true);await rateLimit('openai-settings:'+actor.id,6,60);
 const versioned=z.object({expectedVersion:z.number().int().nonnegative()}).strict();
 if(action==='save'||action==='rotate'){
  const p=versioned.extend({key:z.string().min(20).max(1024).regex(/^sk-[A-Za-z0-9_-]+$/),model:z.enum(NPC_MODELS as [string,...string[]])}).parse(input);
  const before=(await db().query("select version,ciphertext is not null configured from private.integration_secrets where provider='openai'")).rows[0];requireThat(Number(before.version)===p.expectedVersion,'revision_conflict',409);requireThat(action==='rotate'?before.configured:!before.configured,'revision_conflict',409);
  // Encryption validation happens before any provider call.
  const next=p.expectedVersion+1,encrypted=encryptIntegration(p.key,next);
  if(action==='rotate')await generateNpcText(p.key,p.model,{task:'Return decision silent, text null, replyToMessageId null, topic connection-test.'});
  await transaction(async c=>{await requireNpcOwner(actor,c,true);const r=await c.query("update private.integration_secrets set version=$2,ciphertext=$3,nonce=$4,tag=$5,key_id=$6,last_four=$7,model=$8,test_status=$9,tested_version=$10,updated_by=$11,updated_at=now() where provider='openai' and version=$1",[p.expectedVersion,next,encrypted.ciphertext,encrypted.nonce,encrypted.tag,encrypted.keyId,p.key.slice(-4),p.model,action==='rotate'?'working':'untested',action==='rotate'?next:null,actor.id]);requireThat(r.rowCount,'revision_conflict',409);await audit(c,actor.id,'integration.openai.'+action,'openai',{version:next});});
 }else if(action==='delete'){
  const p=versioned.parse(input);await transaction(async c=>{await requireNpcOwner(actor,c,true);await c.query('update private.npc_director_settings set enabled=false,version=version+1 where id=1');const r=await c.query("update private.integration_secrets set version=version+1,ciphertext=null,nonce=null,tag=null,key_id=null,last_four=null,model=null,test_status='not_configured',tested_version=null,updated_by=$2,updated_at=now() where provider='openai' and version=$1",[p.expectedVersion,actor.id]);requireThat(r.rowCount,'revision_conflict',409);await c.query("update private.npc_action_jobs set state='cancelled',reason='credential-deleted' where state in('pending','running')");await audit(c,actor.id,'integration.openai.delete','openai',{version:p.expectedVersion+1});});
 }else if(action==='test'){
  const p=versioned.parse(input),r=(await db().query("select * from private.integration_secrets where provider='openai'")).rows[0];requireThat(r.ciphertext&&Number(r.version)===p.expectedVersion,'revision_conflict',409);
  let status='working';try{await generateNpcText(decryptIntegration(r),r.model,{task:'Return decision silent, text null, replyToMessageId null, topic connection-test.'});}catch(e){status=(e as {code?:string}).code??'ai_provider';}
  await transaction(async c=>{await requireNpcOwner(actor,c,true);const changed=await c.query("update private.integration_secrets set test_status=$2,tested_version=version where provider='openai' and version=$1",[p.expectedVersion,status]);requireThat(changed.rowCount,'revision_conflict',409);await audit(c,actor.id,'integration.openai.test','openai',{version:p.expectedVersion,status});});
 }else requireThat(false,'not_found',404);
 return openAiMetadata(actor);
}
