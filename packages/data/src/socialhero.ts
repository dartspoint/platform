import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {transaction,audit} from './db';
import {authorizeBlogTokenOwnerInTransaction,blogIdentity,type BlogPrincipal} from './blog';
import {DomainError,requireThat} from '../../contracts/src/index';
import {ConnectorError,connectorOrigin,credentialHash,openCredential,pairingClaimSchema,providerRequest,sealCredential} from '../../socialhero/src/index';

export function socialHeroConfig(){
  try{
  const identity=blogIdentity(),development=identity.environment==='development';
  const origin=connectorOrigin(process.env.NEXT_PUBLIC_APP_URL??'',development);
  const providerOrigin=connectorOrigin(process.env.SOCIALHERO_SERVER_URL??'https://socialhero.dgwebservices.nl',development);
  const secret=process.env.SOCIALHERO_PROVISIONING_KEY??process.env.SUPABASE_SECRET_KEY??process.env.INTERNAL_DEPLOY_TOKEN??'';
  requireThat(secret.length>=32,'SOCIALHERO_CONFIGURATION_INVALID',503,'De SocialHero-serverconfiguratie is onvolledig.');
  return {...identity,origin,providerOrigin,secret};
  }catch(error){translate(error);}
}
async function lockedSettings(c:PoolClient){
  const i=blogIdentity();
  await c.query('insert into private.socialhero_settings(site_id,environment) values($1,$2) on conflict do nothing',[i.siteId,i.environment]);
  return (await c.query('select * from private.socialhero_settings where site_id=$1 and environment=$2 for update',[i.siteId,i.environment])).rows[0];
}
async function expirePending(c:PoolClient){
  const i=blogIdentity();
  await c.query("update private.blog_tokens set credential_state='expired',encrypted_token=null,revoked_at=coalesce(revoked_at,now()) where site_id=$1 and environment=$2 and credential_state='pending' and provisioning_expires_at<=now()",[i.siteId,i.environment]);
}
async function summary(c:PoolClient){
  const i=blogIdentity();let configured=true,origin='';try{origin=socialHeroConfig().origin;}catch{configured=false;}
  await expirePending(c);
  const settings=(await c.query('select publish_enabled from private.socialhero_settings where site_id=$1 and environment=$2',[i.siteId,i.environment])).rows[0];
  const row=(await c.query("select connection_id,destination_id,credential_state,revoked_at from private.blog_tokens where site_id=$1 and environment=$2 and connection_id is not null order by case when revoked_at is null and credential_state='pending' then 0 when revoked_at is null and credential_state='active' then 1 else 2 end,created_at desc,id desc limit 1",[i.siteId,i.environment])).rows[0];
  const publishEnabled=!!settings?.publish_enabled;
  return {configured,connection:row?{connectionId:row.connection_id,destinationId:row.destination_id,status:row.credential_state==='expired'?'expired':row.revoked_at?'revoked':row.credential_state,siteId:i.siteId,environment:i.environment,origin,publishEnabled,scopes:row.revoked_at?[]:['read','draft',...(publishEnabled?['publish']:[])]}:null};
}
export async function socialHeroAdminStatus(actor:Actor){return transaction(async c=>{await authorizeBlogTokenOwnerInTransaction(c,actor);return summary(c);});}
function translate(error:unknown):never{if(error instanceof ConnectorError)throw new DomainError(error.code,error.status,error.message);throw error;}
const codeSchema=z.string().trim().min(4).max(512).regex(/^[\x21-\x7e]+$/);

/** Claim retries retain the server-generated attempt UUID without retaining the one-time code. */
export async function pairSocialHero(actor:Actor,input:unknown){
  const parsed=codeSchema.safeParse(input);requireThat(parsed.success,'INVALID_PAIRING_CODE',400,'Vul een geldige eenmalige koppelcode in.');
  const code=parsed.data,config=socialHeroConfig();
  const attemptId=await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);await expirePending(c);
    const prior=(await c.query('select * from private.socialhero_pairing_attempts where site_id=$1 and environment=$2 and code_hash=$3',[config.siteId,config.environment,credentialHash(code)])).rows[0];
    if(prior){requireThat(prior.id===settings.latest_attempt_id&&new Date(prior.expires_at).getTime()>Date.now(),'PAIRING_EXPIRED',410,'Maak in SocialHero een nieuwe koppelcode.');return prior.id as string;}
    const id=randomUUID();
    await c.query("update private.blog_tokens set revoked_at=now(),credential_state='revoked',encrypted_token=null where site_id=$1 and environment=$2 and credential_state='pending'",[config.siteId,config.environment]);
    await c.query('insert into private.socialhero_pairing_attempts(id,site_id,environment,code_hash,created_by,expires_at) values($1,$2,$3,$4,$5,now()+interval \'10 minutes\')',[id,config.siteId,config.environment,credentialHash(code),actor.id]);
    await c.query('update private.socialhero_settings set latest_attempt_id=$3 where site_id=$1 and environment=$2',[config.siteId,config.environment,id]);return id;
  });
  let claim:z.infer<typeof pairingClaimSchema>;
  try{
    const response=await providerRequest(config.providerOrigin,'/api/integrations/blog/v1/pairings/claim',{code,attemptId,siteId:config.siteId,origin:config.origin,environment:config.environment,contractVersion:1});
    const result=pairingClaimSchema.safeParse(response);if(!result.success)throw new ConnectorError('SOCIALHERO_UNAVAILABLE',503,'SocialHero gaf geen geldige koppelbevestiging.');claim=result.data;
    requireThat(Date.parse(claim.expiresAt)>Date.now()&&Date.parse(claim.expiresAt)<=Date.now()+11*60_000,'PAIRING_EXPIRED',410,'De installatie is verlopen. Maak een nieuwe koppelcode.');
  }catch(error){translate(error);}
  await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);
    requireThat(settings.latest_attempt_id===attemptId,'PAIRING_EXPIRED',410,'Deze koppelactie is vervangen. Gebruik de nieuwste code.');
    const attempt=(await c.query('select expires_at from private.socialhero_pairing_attempts where id=$1 and site_id=$2 and environment=$3',[attemptId,config.siteId,config.environment])).rows[0];
    const deadline=new Date(Math.min(Date.parse(claim.expiresAt),new Date(attempt.expires_at).getTime()));
    requireThat(deadline.getTime()>Date.now(),'PAIRING_EXPIRED',410,'De installatie is verlopen. Maak een nieuwe code.');
    const prior=(await c.query('select id,site_id,environment,pairing_attempt_id,token_hash,destination_id from private.blog_tokens where connection_id=$1',[claim.connectionId])).rows[0];
    if(prior){requireThat(prior.site_id===config.siteId&&prior.environment===config.environment&&prior.pairing_attempt_id===attemptId&&prior.token_hash===credentialHash(claim.accessToken)&&prior.destination_id===claim.destinationId,'DESTINATION_MISMATCH',409);return;}
    const previous=(await c.query("select id from private.blog_tokens where site_id=$1 and environment=$2 and connection_id is not null and credential_state='active' and revoked_at is null order by created_at desc limit 1 for update",[config.siteId,config.environment])).rows[0];
    await c.query(`insert into private.blog_tokens(site_id,environment,label,token_hash,scopes,created_by,expires_at,connection_id,destination_id,credential_state,provisioning_expires_at,encrypted_token,previous_token_id,pairing_attempt_id)
      values($1,$2,'SocialHero',$3,$4,$5,$6,$7,$8,'pending',$6,$9,$10,$11)`,[config.siteId,config.environment,credentialHash(claim.accessToken),['read','draft',...(settings.publish_enabled?['publish']:[])],actor.id,deadline.toISOString(),claim.connectionId,claim.destinationId,sealCredential(claim.accessToken,config.secret,claim.connectionId),previous?.id??null,attemptId]);
    await audit(c,actor.id,'socialhero.pair.pending',claim.connectionId,{environment:config.environment});
  });
  return checkSocialHeroConnection(actor);
}

/** A pending hash commits before the provider calls back to capabilities. */
export async function checkSocialHeroConnection(actor:Actor){
  const config=socialHeroConfig();
  const pending=await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);await expirePending(c);
    return (await c.query("select t.* from private.blog_tokens t join private.socialhero_settings s on s.site_id=t.site_id and s.environment=t.environment and s.latest_attempt_id=t.pairing_attempt_id where t.site_id=$1 and t.environment=$2 and t.credential_state='pending' and t.revoked_at is null order by t.created_at desc limit 1",[config.siteId,config.environment])).rows[0];
  });
  if(!pending)return socialHeroAdminStatus(actor);
  try{
    const token=openCredential(pending.encrypted_token,config.secret,pending.connection_id);
    const result=await providerRequest(config.providerOrigin,'/api/integrations/blog/v1/pairings/'+pending.connection_id+'/verify',{},token);
    requireThat(result&&typeof result==='object'&&'connectionId' in result&&result.connectionId===pending.connection_id&&'status' in result&&result.status==='verified','DESTINATION_MISMATCH',409,'De bevestiging hoort niet bij deze verbinding.');
  }catch(error){
    const code=error instanceof ConnectorError||error instanceof DomainError?error.code:'';
    if(['INVALID_CREDENTIAL','PAIRING_EXPIRED','DESTINATION_MISMATCH','PERMISSION_DENIED','INVALID_PAIRING_CODE'].includes(code))await transaction(async c=>{
      await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and credential_state='pending'",[pending.id]);
    });
    translate(error);
  }
  return transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);
    requireThat(settings.latest_attempt_id===pending.pairing_attempt_id,'PAIRING_EXPIRED',410,'Deze installatie is vervangen of ontkoppeld.');
    const row=(await c.query('select * from private.blog_tokens where id=$1 for update',[pending.id])).rows[0];
    requireThat(row&&!row.revoked_at&&new Date(row.provisioning_expires_at).getTime()>Date.now(),'PAIRING_EXPIRED',410,'De installatie is verlopen. Koppel opnieuw.');
    await c.query("update private.blog_tokens set credential_state='active',encrypted_token=null,expires_at='9999-12-31T00:00:00Z' where id=$1",[pending.id]);
    if(row.previous_token_id)await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and site_id=$2 and environment=$3",[row.previous_token_id,config.siteId,config.environment]);
    await audit(c,actor.id,'socialhero.pair.active',pending.connection_id,{environment:config.environment});return summary(c);
  });
}
export async function disconnectSocialHero(actor:Actor){return transaction(async c=>{
  await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);const i=blogIdentity();
  await c.query('update private.socialhero_settings set latest_attempt_id=null where site_id=$1 and environment=$2',[i.siteId,i.environment]);
  await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where site_id=$1 and environment=$2 and connection_id is not null and revoked_at is null",[i.siteId,i.environment]);
  await audit(c,actor.id,'socialhero.disconnect',i.siteId);return summary(c);
});}
export async function setSocialHeroPolicy(actor:Actor,publishEnabled:boolean){z.boolean().parse(publishEnabled);return transaction(async c=>{
  await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);const i=blogIdentity();
  await c.query('update private.socialhero_settings set publish_enabled=$3 where site_id=$1 and environment=$2',[i.siteId,i.environment,publishEnabled]);
  await c.query('update private.blog_tokens set scopes=$3 where site_id=$1 and environment=$2 and connection_id is not null and revoked_at is null',[i.siteId,i.environment,['read','draft',...(publishEnabled?['publish']:[])]]);
  await audit(c,actor.id,'socialhero.policy',i.siteId,{publishEnabled});return summary(c);
});}
export async function revokeSocialHeroCredential(principal:BlogPrincipal){return transaction(async c=>{
  const i=blogIdentity();requireThat(principal.siteId===i.siteId&&principal.environment===i.environment,'INVALID_CREDENTIAL',401);
  await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and site_id=$2 and environment=$3",[principal.tokenId,i.siteId,i.environment]);
});}
