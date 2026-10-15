import {db,transaction} from './db';
import {ensurePrivacyRequestForTicket} from './privacy';
import {supportEvent,supportNotifyStaff} from './support';
/** Reconcile a receipt even if a process stopped between ticket commit and API response. */
export async function reconcilePrivacyReceipts(limit=50){const tickets=(await db().query("select t.id from private.support_tickets t left join private.privacy_requests r on r.ticket_id=t.id where t.protected_kind='privacy' and r.id is null order by t.created_at limit $1",[Math.max(1,Math.min(limit,100))])).rows;for(const t of tickets)await ensurePrivacyRequestForTicket(t.id);return {reconciled:tickets.length};}
/** Calendar deadlines never pause for an identity question or topic transfer.
 * Notifications are neutral and resolve through the live ticket ACL at delivery. */
export async function remindPrivacyDeadlines(limit=50){return transaction(async c=>{const rows=(await c.query(`select r.*,t.number,t.assigned_to,t.requester_id,t.acl_roles,t.protected_kind from private.privacy_requests r join private.support_tickets t on t.id=r.ticket_id where r.completed_at is null and r.state not in('completed','denied') and (coalesce(r.extended_due_at,r.due_at)<=now()+interval '7 days' and (r.reminder_at is null or r.reminder_at<coalesce(r.extended_due_at,r.due_at)-interval '7 days') or coalesce(r.extended_due_at,r.due_at)<=now() and (r.escalation_at is null or r.escalation_at<coalesce(r.extended_due_at,r.due_at)) or r.confirmed_at<=now()-interval '7 days' and r.escalation_at is null) order by coalesce(r.extended_due_at,r.due_at) for update of r skip locked limit $1`,[Math.max(1,Math.min(limit,100))])).rows;
 for(const r of rows){const overdue=new Date(r.extended_due_at??r.due_at).getTime()<=Date.now(),executionTarget=r.confirmed_at&&new Date(r.confirmed_at).getTime()<=Date.now()-7*86400000,escalate=overdue||executionTarget;
  const key='privacy-deadline:'+r.id+':'+new Date(r.extended_due_at??r.due_at).toISOString()+':'+(overdue?'overdue':executionTarget?'execution-target':'reminder');
  await supportNotifyStaff(c,{...r,id:r.ticket_id},key,true);
  await supportEvent(c,r.ticket_id,null,escalate?'privacy_deadline_escalation':'privacy_deadline_reminder',{dueAt:r.extended_due_at??r.due_at,legalDeadlineExceeded:overdue,internalExecutionTargetExceeded:!!executionTarget});
  await c.query('update private.privacy_requests set reminder_at=now(),escalation_at=case when $2 then now() else escalation_at end where id=$1',[r.id,escalate]);
 }
 return {notified:rows.length};
});}
