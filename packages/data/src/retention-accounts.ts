import {db} from './db';
import {authAdmin} from './auth';
import {closeAccountForRetention} from './privacy';
import {assertSupportMailTrackingDisabled} from './support-mail';
import {requireThat} from '../../contracts/src/index';
/** Only fixed database policy criteria can create a confirmed retention proof.
 * Normal account closure, match handling, durable ledger and erasure are reused. */
export async function processRetentionAccounts(limit=5){
 const bounded=Math.max(1,Math.min(Math.trunc(limit)||5,20));
 const scheduled=(await db().query('select private.prepare_retention_accounts($1) result',[bounded])).rows[0].result;
 const actions=(await db().query("select user_id from private.retention_account_actions where (state='confirmed' and not exists(select 1 from private.privacy_jobs j where j.request_id=retention_account_actions.request_id and j.kind='erase')) or state='warned' and eligible_after<=now() order by eligible_after nulls last,user_id limit $1",[bounded])).rows;
 let closed=0;
 for(const action of actions){const requestId=(await db().query('select private.confirm_retention_account($1) id',[action.user_id])).rows[0].id;if(!requestId)continue;await closeAccountForRetention(requestId);closed++;}
 return {...scheduled,closuresQueued:closed};
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
/** This service notice is idempotent and has no open or click tracking. The
 * deletion window starts only after accepted delivery is durably recorded. */
export async function deliverRetentionWarning(event:{id:string;kind:string;user_id:string|null}):Promise<boolean>{
 if(event.kind!=='retention-warning')return false;
 const action=(await db().query("select a.*,p.last_active_at,p.status from private.retention_account_actions a join profiles p on p.id=a.user_id where a.warning_event_id=$1 and a.kind='inactive' and a.state in('warning_pending','warned') and p.status in('active','suspended') and p.last_active_at=a.last_active_at_at_warning and not exists(select 1 from user_roles r where r.user_id=p.id and r.role='owner' and r.revoked_at is null)",[event.id])).rows[0];if(!action)return true;
 const previous=(await db().query('select * from private.email_deliveries where event_id=$1',[event.id])).rows[0];if(previous?.state==='accepted')return true;
 const local=process.env.APP_ENV==='development'&&process.env.MAIL_PROVIDER==='local';
 requireThat(local||!previous?.first_attempt_at||Date.now()-new Date(previous.first_attempt_at).getTime()<23*3600000,'provider_reconciliation_required',503);
 const {data,error}=await authAdmin().auth.admin.getUserById(action.user_id);requireThat(!error&&data.user?.email_confirmed_at&&data.user.email,'recipient_unavailable',503);
 const origin=process.env.NEXT_PUBLIC_APP_URL;requireThat(origin&&new URL(origin).origin===origin.replace(/\/$/,''),'retention_mail_configuration',503);
 const subject='Wil je je DartsPoint-account behouden?',text=`Je hebt je DartsPoint-account ruim twee jaar niet gebruikt. Wil je het behouden? Log dan binnen 30 dagen na deze e-mail opnieuw in.\n\n${origin}/inloggen\n\nAls je niet opnieuw inlogt, sluiten we je account en verwijderen we je gegevens volgens ons bewaarbeleid. Beperkte wedstrijdresultaten van andere spelers kunnen bewaard blijven. Je hoeft niets te betalen of je aan te melden voor nieuws.\n\nHeb je hulp nodig of wil je een gegevenskopie? Neem contact op via support@dartspoint.nl.\n\nPrivacy: ${origin}/privacy`,html='<html lang="nl"><body><p>'+escapeHtml(text).replaceAll('\n','<br>')+'</p></body></html>';
 await db().query("insert into private.email_deliveries(event_id,state,first_attempt_at) values($1,'pending',now()) on conflict(event_id) do update set first_attempt_at=coalesce(email_deliveries.first_attempt_at,now())",[event.id]);
 let providerId:string;
 if(local){const from=(process.env.MAIL_FROM??'DartsPoint <noreply@dartspoint.local>').match(/<([^>]+)>/)?.[1]??'noreply@dartspoint.local';const response=await fetch(process.env.LOCAL_MAILPIT_URL+'/api/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:from,Name:'DartsPoint'},To:[{Email:data.user.email}],Subject:subject,Text:text,HTML:html,Headers:{'Message-ID':`<retention-${event.id}@dartspoint.local>`,'Reply-To':'support@dartspoint.nl'}}),signal:AbortSignal.timeout(10000)});requireThat(response.ok,'mail_provider_unavailable',503);providerId=String((await response.json()).ID??event.id);}
 else{await assertSupportMailTrackingDisabled();requireThat(process.env.RESEND_API_KEY&&process.env.MAIL_FROM,'mail_configuration',503);const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'dartspoint-retention-'+event.id},body:JSON.stringify({from:process.env.MAIL_FROM,to:[data.user.email],reply_to:'support@dartspoint.nl',subject,text,html,headers:{'Auto-Submitted':'auto-generated','X-Auto-Response-Suppress':'All'}}),signal:AbortSignal.timeout(15000)});requireThat(response.ok,'mail_provider_unavailable',503);providerId=String((await response.json()).id);}
 await db().query("insert into private.email_deliveries(event_id,provider_id,state) values($1,$2,'accepted') on conflict(event_id) do update set provider_id=$2,state='accepted',updated_at=now()",[event.id,providerId]);
 return true;
}
