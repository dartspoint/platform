import type {PoolClient} from 'pg';
import {z} from 'zod';
import {requireThat,uuid} from '../../contracts/src/index';
import {transaction} from './db';
import {supportEvent,supportTicketAccess,type SupportIdentity} from './support';

const ms=(value:unknown)=>value?new Date(value as string).getTime():null;
const providerTerminal=new Set(['accepted','delivered','bounced','failed','suppressed','complained','delivery_delayed']);
const belongsToTicket=`((e.kind in ('support-mail','support-staff-mail') and e.payload->>'ticketId'=$1) or (e.kind='privacy-mail' and exists(select 1 from private.privacy_requests pr where pr.id::text=e.payload->>'requestId' and pr.ticket_id=$1::uuid)))`;
async function recoveryPermission(c:PoolClient,identity:SupportIdentity){
 if(!identity.actor)return {canReconcileMail:false,mailReauthRequired:false};
 const row=(await c.query(`select exists(select 1 from user_roles where user_id=$1 and role in ('owner','admin') and revoked_at is null) eligible,exists(select 1 from private.privacy_reauths where user_id=$1 and session_id=$2 and expires_at>now()) fresh`,[identity.actor.id,identity.actor.sessionId??null])).rows[0];
 return {canReconcileMail:!!row.eligible,mailReauthRequired:!!row.eligible&&!row.fresh};
}
function deliveryDto(row:any){
 const attempted=ms(row.first_attempt_at),busy=!!row.locked_until&&ms(row.locked_until)!>Date.now();
 const terminal=providerTerminal.has(row.state),requiresReconciliation=!row.delivered_at&&!terminal&&(row.state==='review-required'||!!attempted&&attempted<Date.now()-23*3600000);
 const status=requiresReconciliation?'review-required':row.state==='delivery_delayed'?'delayed':terminal?row.state:row.delivered_at?'completed':row.last_error?'retry':'pending';
 return {id:row.id,kind:row.kind==='privacy-mail'?'privacy':row.kind==='support-staff-mail'?'staff':row.mail_kind??'support',status,attempts:row.attempts,nextTry:row.delivered_at?null:ms(row.next_try),firstAttemptAt:attempted,updatedAt:ms(row.updated_at),busy,requiresReconciliation,canRetry:!row.delivered_at&&!terminal&&!row.provider_id&&!requiresReconciliation&&!busy&&!!row.last_error};
}
/** The caller already resolved the live ticket ACL. Return metadata only, never payloads or provider errors. */
export async function supportDeliverySummary(c:PoolClient,identity:SupportIdentity,ticketId:string){
 const rows=(await c.query(`select e.id,e.kind,e.payload->>'mailKind' mail_kind,e.attempts,e.next_try,e.locked_until,e.delivered_at,e.last_error,d.state,d.provider_id,d.first_attempt_at,d.updated_at from private.outbox_events e left join private.email_deliveries d on d.event_id=e.id where ${belongsToTicket} order by coalesce(d.updated_at,e.next_try) desc,e.id desc limit 100`,[ticketId])).rows;
 return {...await recoveryPermission(c,identity),deliveries:rows.map(deliveryDto)};
}
const reason=z.string().trim().min(10).max(1000);
const recoveryInput=z.discriminatedUnion('action',[
 z.object({eventId:uuid,action:z.literal('retry'),reason}).strict(),
 z.object({eventId:uuid,action:z.literal('provider_accepted'),reason,confirmed:z.literal(true),providerId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)}).strict(),
 z.object({eventId:uuid,action:z.literal('verified_not_sent'),reason,confirmed:z.literal(true)}).strict(),
]);
export async function supportRecoverDelivery(identity:SupportIdentity,ticketId:string,input:unknown){
 const p=recoveryInput.parse(input);
 return transaction(async c=>{
  const ticket=await supportTicketAccess(c,identity,ticketId,true),actor=identity.actor;
  requireThat(actor&&ticket.can_staff&&ticket.requester_id!==actor.id,'forbidden',403);
  const row=(await c.query(`select e.*,d.state,d.provider_id,d.first_attempt_at,d.updated_at from private.outbox_events e left join private.email_deliveries d on d.event_id=e.id where e.id=$2 and ${belongsToTicket} for update of e`,[ticketId,p.eventId])).rows[0];
  requireThat(row,'mail_unavailable',404,'Deze e-mailtaak is niet beschikbaar.');
  const status=deliveryDto(row);
  requireThat(!status.busy,'mail_busy',409,'Deze e-mailtaak wordt verwerkt. Wacht even en vernieuw de status.');
  if(p.action==='retry'){
   requireThat(!status.requiresReconciliation,'mail_reconciliation_required',409,'Controleer eerst bij de e-mailprovider of dit bericht is geaccepteerd.');
   requireThat(status.canRetry,'mail_retry_unavailable',409,'Deze e-mailtaak kan niet opnieuw worden ingepland.');
  }else{
   const permission=await recoveryPermission(c,identity);
   requireThat(permission.canReconcileMail,'forbidden',403);
   requireThat(!permission.mailReauthRequired,'reauthentication_required',401,'Log opnieuw in voordat je de providercontrole vastlegt.');
   requireThat(status.requiresReconciliation,'mail_reconciliation_unavailable',409,'Alleen onzekere verzendingen worden met providercontrole hersteld.');
   if(p.action==='provider_accepted'){
    await c.query(`insert into private.email_deliveries(event_id,state,provider_id) values($1,'accepted',$2) on conflict(event_id) do update set state='accepted',provider_id=$2,updated_at=now()`,[row.id,p.providerId]);
    await c.query('update private.outbox_events set delivered_at=now(),locked_until=null,last_error=null where id=$1',[row.id]);
    if(row.kind==='privacy-mail')await c.query('delete from private.privacy_mail where event_id=$1',[row.id]);
    else await c.query('insert into private.support_email_references(message_id,event_id,ticket_id) values($1,$2,$3) on conflict(message_id) do nothing',[`<dp-support-${row.id}@dartspoint.nl>`,row.id,ticketId]);
    await supportEvent(c,ticketId,actor.id,'mail_reconciled_accepted',{outboxEventId:row.id,providerId:p.providerId},p.reason);
    return {ok:true,status:'accepted'};
   }
   await c.query(`insert into private.email_deliveries(event_id,state) values($1,'pending') on conflict(event_id) do update set state='pending',provider_id=null,first_attempt_at=null,updated_at=now()`,[row.id]);
  }
  if(row.kind==='privacy-mail')requireThat((await c.query('select 1 from private.privacy_mail where event_id=$1',[row.id])).rowCount,'mail_content_unavailable',409,'Deze tijdelijke e-mailinhoud is niet meer beschikbaar.');
  await c.query('update private.outbox_events set delivered_at=null,next_try=now(),locked_until=null,last_error=null where id=$1',[row.id]);
  await supportEvent(c,ticketId,actor.id,p.action==='retry'?'mail_retry_queued':'mail_reconciled_not_sent',{outboxEventId:row.id},p.reason);
  return {ok:true,status:'pending'};
 });
}
