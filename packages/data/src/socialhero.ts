import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {transaction,audit} from './db';
import {authorizeBlogTokenOwnerInTransaction,blogIdentity,type BlogPrincipal} from './blog';
import {currentSocialHeroPolicy,type SocialHeroPolicy} from './socialhero-policy';
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
  const row=(await c.query(`select t.connection_id,t.destination_id,t.credential_state,t.revoked_at,t.expires_at,t.last_checked_at,p.draft_enabled,p.publish_enabled
    from private.blog_tokens t left join private.socialhero_destination_policies p on p.site_id=t.site_id and p.environment=t.environment and p.destination_id=t.destination_id
    where t.site_id=$1 and t.environment=$2 and t.connection_id is not null
    order by case when t.revoked_at is null and t.credential_state='pending' and t.provisioning_expires_at>now() then 0 when t.revoked_at is null and t.credential_state='active' and t.expires_at>now() then 1 else 2 end,t.created_at desc,t.id desc limit 1`,[i.siteId,i.environment])).rows[0];
  const policy=row?{draftEnabled:!!row.draft_enabled,publishEnabled:!!row.draft_enabled&&!!row.publish_enabled}:{draftEnabled:true,publishEnabled:true};
  const status=row?(row.credential_state==='expired'||new Date(row.expires_at).getTime()<=Date.now()?'expired':row.revoked_at?'revoked':row.credential_state):null;
  return {configured,pairingDefaults:policy,connection:row?{connectionId:row.connection_id,destinationId:row.destination_id,status,siteId:i.siteId,environment:i.environment,origin,...policy,lastCheckedAt:row.last_checked_at?new Date(row.last_checked_at).toISOString():null,scopes:['active','pending'].includes(status)?scopesFor(policy):[]}:null};
}
export async function socialHeroAdminStatus(actor:Actor){return transaction(async c=>{await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);await expirePending(c);return summary(c);});}
function translate(error:unknown):never{if(error instanceof ConnectorError)throw new DomainError(error.code,error.status,error.message);throw error;}
const codeSchema=z.string().trim().min(4).max(512).regex(/^[\x21-\x7e]+$/);
const choices=z.object({draftEnabled:z.boolean(),publishEnabled:z.boolean()});
const scopesFor=(p:SocialHeroPolicy)=>['read',...(p.draftEnabled?['draft']:[]),...(p.draftEnabled&&p.publishEnabled?['publish']:[])];
function validateChoices(p:SocialHeroPolicy){requireThat(!p.publishEnabled||p.draftEnabled,'INVALID_REQUEST',400,'Sta concepten aanleveren toe voordat je automatisch publiceren inschakelt.');}

/** Claim retries retain the server-generated attempt UUID without retaining the one-time code. */
export async function pairSocialHero(actor:Actor,input:unknown){
  const parsed=choices.extend({code:codeSchema}).strict().safeParse(input);requireThat(parsed.success,'INVALID_PAIRING_CODE',400,'Vul een geldige koppelcode in en bevestig de toegestane functies.');
  const selection=parsed.data,code=selection.code,config=socialHeroConfig();validateChoices(selection);
  const attempt=await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);await expirePending(c);
    const prior=(await c.query('select * from private.socialhero_pairing_attempts where site_id=$1 and environment=$2 and code_hash=$3',[config.siteId,config.environment,credentialHash(code)])).rows[0];
    if(prior){requireThat(prior.id===settings.latest_attempt_id&&prior.rights_confirmed_at&&new Date(prior.expires_at).getTime()>Date.now(),'PAIRING_EXPIRED',410,'Maak in SocialHero een nieuwe koppelcode.');requireThat(prior.draft_enabled===selection.draftEnabled&&prior.publish_enabled===selection.publishEnabled,'IDEMPOTENCY_CONFLICT',409,'Deze code is al met andere keuzes bevestigd. Behoud die keuzes of maak een nieuwe code.');return prior;}
    const id=randomUUID();
    await c.query("update private.blog_tokens set revoked_at=now(),credential_state='revoked',encrypted_token=null where site_id=$1 and environment=$2 and credential_state='pending'",[config.siteId,config.environment]);
    const created=(await c.query('insert into private.socialhero_pairing_attempts(id,site_id,environment,code_hash,created_by,expires_at,draft_enabled,publish_enabled,rights_confirmed_at) values($1,$2,$3,$4,$5,now()+interval \'10 minutes\',$6,$7,now()) returning *',[id,config.siteId,config.environment,credentialHash(code),actor.id,selection.draftEnabled,selection.publishEnabled])).rows[0];
    await c.query('update private.socialhero_settings set latest_attempt_id=$3 where site_id=$1 and environment=$2',[config.siteId,config.environment,id]);return created;
  });
  const attemptId=attempt.id as string;
  let claim:z.infer<typeof pairingClaimSchema>;
  try{
    const response=await providerRequest(config.providerOrigin,'/api/integrations/blog/v1/pairings/claim',{code,attemptId,siteId:config.siteId,origin:config.origin,environment:config.environment,contractVersion:1});
    const result=pairingClaimSchema.safeParse(response);if(!result.success)throw new ConnectorError('SOCIALHERO_UNAVAILABLE',503,'SocialHero gaf geen geldige koppelbevestiging.');claim=result.data;
    requireThat(Date.parse(claim.expiresAt)>Date.now()&&Date.parse(claim.expiresAt)<=Date.now()+11*60_000,'PAIRING_EXPIRED',410,'De installatie is verlopen. Maak een nieuwe koppelcode.');
  }catch(error){translate(error);}
  await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);
    requireThat(settings.latest_attempt_id===attemptId,'PAIRING_EXPIRED',410,'Deze koppelactie is vervangen. Gebruik de nieuwste code.');
    const attempt=(await c.query('select * from private.socialhero_pairing_attempts where id=$1 and site_id=$2 and environment=$3',[attemptId,config.siteId,config.environment])).rows[0];
    const deadline=new Date(Math.min(Date.parse(claim.expiresAt),new Date(attempt.expires_at).getTime()));
    requireThat(deadline.getTime()>Date.now(),'PAIRING_EXPIRED',410,'De installatie is verlopen. Maak een nieuwe code.');
    // A known destination retains its prior decision, even when a new wizard defaults to on.
    await c.query("insert into private.socialhero_destination_policies(site_id,environment,destination_id,draft_enabled,publish_enabled,decided_by,decided_at,source) values($1,$2,$3,$4,$5,$6,$7,'pairing') on conflict do nothing",[config.siteId,config.environment,claim.destinationId,attempt.draft_enabled,attempt.publish_enabled,attempt.created_by,attempt.rights_confirmed_at]);
    const policy=await currentSocialHeroPolicy(c,claim.destinationId,'update');
    const prior=(await c.query('select id,site_id,environment,pairing_attempt_id,token_hash,destination_id,credential_state,revoked_at from private.blog_tokens where connection_id=$1',[claim.connectionId])).rows[0];
    if(prior){requireThat(prior.site_id===config.siteId&&prior.environment===config.environment&&prior.pairing_attempt_id===attemptId&&prior.token_hash===credentialHash(claim.accessToken)&&prior.destination_id===claim.destinationId,'DESTINATION_MISMATCH',409);requireThat(!prior.revoked_at&&['active','pending'].includes(prior.credential_state),'PAIRING_EXPIRED',410,'Deze verbinding is ingetrokken. Maak een nieuwe code.');return;}
    const previous=(await c.query("select id from private.blog_tokens where site_id=$1 and environment=$2 and connection_id is not null and credential_state='active' and revoked_at is null order by created_at desc limit 1 for update",[config.siteId,config.environment])).rows[0];
    await c.query(`insert into private.blog_tokens(site_id,environment,label,token_hash,scopes,created_by,expires_at,connection_id,destination_id,credential_state,provisioning_expires_at,encrypted_token,previous_token_id,pairing_attempt_id)
      values($1,$2,'SocialHero',$3,$4,$5,$6,$7,$8,'pending',$6,$9,$10,$11)`,[config.siteId,config.environment,credentialHash(claim.accessToken),scopesFor(policy),actor.id,deadline.toISOString(),claim.connectionId,claim.destinationId,sealCredential(claim.accessToken,config.secret,claim.connectionId),previous?.id??null,attemptId]);
    await audit(c,actor.id,'socialhero.pair.pending',claim.connectionId,{environment:config.environment,destinationId:claim.destinationId,...policy});
  });
  return checkSocialHeroConnection(actor);
}

/** A pending hash commits before the provider calls back to capabilities. */
export async function checkSocialHeroConnection(actor:Actor){
  const config=socialHeroConfig();
  const pending=await transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);await expirePending(c);
    return (await c.query("select t.* from private.blog_tokens t join private.socialhero_settings s on s.site_id=t.site_id and s.environment=t.environment and s.latest_attempt_id=t.pairing_attempt_id where t.site_id=$1 and t.environment=$2 and t.credential_state='pending' and t.revoked_at is null order by t.created_at desc limit 1",[config.siteId,config.environment])).rows[0];
  });
  if(!pending)return transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);
    const checked=(await c.query("update private.blog_tokens set last_checked_at=now() where site_id=$1 and environment=$2 and connection_id is not null and credential_state='active' and revoked_at is null and expires_at>now() returning connection_id,destination_id",[config.siteId,config.environment])).rows;
    for(const row of checked)await audit(c,actor.id,'socialhero.check.local',row.connection_id,{destinationId:row.destination_id,environment:config.environment});
    return summary(c);
  });
  try{
    const token=openCredential(pending.encrypted_token,config.secret,pending.connection_id);
    const result=await providerRequest(config.providerOrigin,'/api/integrations/blog/v1/pairings/'+pending.connection_id+'/verify',{},token);
    requireThat(result&&typeof result==='object'&&'connectionId' in result&&result.connectionId===pending.connection_id&&'status' in result&&result.status==='verified','DESTINATION_MISMATCH',409,'De bevestiging hoort niet bij deze verbinding.');
  }catch(error){
    const code=error instanceof ConnectorError||error instanceof DomainError?error.code:'';
    if(['INVALID_CREDENTIAL','PAIRING_EXPIRED','DESTINATION_MISMATCH','PERMISSION_DENIED','INVALID_PAIRING_CODE'].includes(code))await transaction(async c=>{
      await lockedSettings(c);
      await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and credential_state='pending'",[pending.id]);
    });
    translate(error);
  }
  return transaction(async c=>{
    await authorizeBlogTokenOwnerInTransaction(c,actor);const settings=await lockedSettings(c);
    requireThat(settings.latest_attempt_id===pending.pairing_attempt_id,'PAIRING_EXPIRED',410,'Deze installatie is vervangen of ontkoppeld.');
    const policy=await currentSocialHeroPolicy(c,pending.destination_id);
    const row=(await c.query('select * from private.blog_tokens where id=$1 for update',[pending.id])).rows[0];
    requireThat(row&&!row.revoked_at&&['active','pending'].includes(row.credential_state),'PAIRING_EXPIRED',410,'De installatie is verlopen. Koppel opnieuw.');
    if(row.credential_state==='active')return summary(c);
    requireThat(new Date(row.provisioning_expires_at).getTime()>Date.now(),'PAIRING_EXPIRED',410,'De installatie is verlopen. Koppel opnieuw.');
    await c.query("update private.blog_tokens set credential_state='active',scopes=$2,encrypted_token=null,expires_at='9999-12-31T00:00:00Z',last_checked_at=now() where id=$1",[pending.id,scopesFor(policy)]);
    if(row.previous_token_id)await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and site_id=$2 and environment=$3",[row.previous_token_id,config.siteId,config.environment]);
    await audit(c,actor.id,'socialhero.pair.active',pending.connection_id,{environment:config.environment,destinationId:pending.destination_id,...policy});return summary(c);
  });
}
export async function disconnectSocialHero(actor:Actor){return transaction(async c=>{
  await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);const i=blogIdentity();
  await c.query('update private.socialhero_settings set latest_attempt_id=null where site_id=$1 and environment=$2',[i.siteId,i.environment]);
  await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where site_id=$1 and environment=$2 and connection_id is not null and revoked_at is null",[i.siteId,i.environment]);
  await audit(c,actor.id,'socialhero.disconnect',i.siteId);return summary(c);
});}
export async function setSocialHeroPolicy(actor:Actor,input:unknown){const policy=choices.extend({destinationId:z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)}).strict().parse(input);validateChoices(policy);return transaction(async c=>{
  await authorizeBlogTokenOwnerInTransaction(c,actor);await lockedSettings(c);const i=blogIdentity();
  requireThat((await c.query('select destination_id from private.socialhero_destination_policies where site_id=$1 and environment=$2 and destination_id=$3 for update',[i.siteId,i.environment,policy.destinationId])).rowCount,'INVALID_REQUEST',400,'Deze bestemming is niet aan deze website gekoppeld.');
  await c.query("update private.socialhero_destination_policies set draft_enabled=$4,publish_enabled=$5,decided_by=$6,decided_at=now(),source='admin' where site_id=$1 and environment=$2 and destination_id=$3",[i.siteId,i.environment,policy.destinationId,policy.draftEnabled,policy.publishEnabled,actor.id]);
  await c.query('update private.blog_tokens set scopes=$4 where site_id=$1 and environment=$2 and destination_id=$3 and connection_id is not null and revoked_at is null',[i.siteId,i.environment,policy.destinationId,scopesFor(policy)]);
  await audit(c,actor.id,'socialhero.policy',policy.destinationId,{siteId:i.siteId,environment:i.environment,draftEnabled:policy.draftEnabled,publishEnabled:policy.publishEnabled});return summary(c);
});}
export async function revokeSocialHeroCredential(principal:BlogPrincipal){return transaction(async c=>{
  const i=blogIdentity();requireThat(principal.siteId===i.siteId&&principal.environment===i.environment,'INVALID_CREDENTIAL',401);
  await c.query("update private.blog_tokens set revoked_at=coalesce(revoked_at,now()),credential_state='revoked',encrypted_token=null where id=$1 and site_id=$2 and environment=$3 and destination_id is not distinct from $4 and connection_id is not distinct from $5",[principal.tokenId,i.siteId,i.environment,principal.destinationId??null,principal.connectionId??null]);
});}
