import {deliverRetentionWarning} from '../../../packages/data/src/retention-accounts';
import {db,transaction} from '../../../packages/data/src/db';
import {authAdmin} from '../../../packages/data/src/auth';
import {competitionResult} from '../../../packages/data/src/competitions';
import {renderDartsEmail,type DartsEmailInput} from '../../../packages/emails/src/templates';
import {deliverGameInviteNotification} from '../../../packages/data/src/notifications';
import {deliverSupportOutbox} from '../../../packages/data/src/support-mail';
import {deliverPrivacyOutbox} from '../../../packages/data/src/privacy-mail';
const local=process.env.APP_ENV==='development'&&process.env.MAIL_PROVIDER==='local';
async function send(event:any){
 if(await deliverSupportOutbox(event)||await deliverPrivacyOutbox(event)||await deliverRetentionWarning(event))return;
 if(event.kind==='match-result'){await transaction(c=>competitionResult(c,event));return;}
 if(event.kind==='game-invite'){await deliverGameInviteNotification(event);return;}
 if(event.user_id){
  await db().query('insert into notifications(user_id,kind,payload,source_event) values($1,$2,$3,$4) on conflict(source_event) do nothing',[event.user_id,event.kind,JSON.stringify(event.payload),event.id]);
 }
 let template:DartsEmailInput|undefined;
 const profile=event.user_id?(await db().query('select username from profiles where id=$1',[event.user_id])).rows[0]:null;
 if(event.kind==='welcome')template={type:'welcome',username:profile.username};
 if(event.kind==='friend-request')template={type:'friend-request',username:profile.username,fromUsername:event.payload.name};
 if(event.kind==='moderation')template={type:'moderation',username:profile.username,...event.payload};
 if(event.kind==='tournament-reminder')template={type:'tournament-reminder',username:profile.username,...event.payload};
 if(event.kind==='match-reminder')template={type:'match-reminder',username:profile.username,...event.payload};
 if(event.kind==='announcement')template={type:'announcement',...event.payload};
 if(!template)return;
 const delivery=(await db().query('select * from private.email_deliveries where event_id=$1',[event.id])).rows[0];if(delivery?.state==='accepted')return;
 if(!local&&delivery?.first_attempt_at&&Date.now()-new Date(delivery.first_attempt_at).getTime()>23*3600000){await db().query("update private.email_deliveries set state='review-required',updated_at=now() where event_id=$1",[event.id]);throw new Error('provider_reconciliation_required');}
 await db().query("insert into private.email_deliveries(event_id,state,first_attempt_at) values($1,'pending',now()) on conflict(event_id) do update set first_attempt_at=coalesce(email_deliveries.first_attempt_at,now())",[event.id]);
 const {data,error}=await authAdmin().auth.admin.getUserById(event.user_id);if(error||!data.user?.email_confirmed_at||!data.user.email)throw new Error('recipient_unavailable');
 const message=renderDartsEmail(template,{origin:process.env.NEXT_PUBLIC_APP_URL,localDevelopment:local});
 let providerId:string;
 if(local){
  const from=(process.env.MAIL_FROM??'DartsPoint <noreply@dartspoint.local>').match(/<([^>]+)>/)?.[1]??process.env.MAIL_FROM!;
  const response=await fetch(process.env.LOCAL_MAILPIT_URL+'/api/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:from,Name:'DartsPoint'},To:[{Email:data.user.email}],Subject:message.subject,HTML:message.html,Text:message.text,Headers:{'Message-ID':`<${event.id}@dartspoint.local>`}}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('mail_provider_unavailable');providerId=String((await response.json()).ID??event.id);
 }else{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'dartspoint-'+event.id},body:JSON.stringify({from:process.env.MAIL_FROM,to:[data.user.email],reply_to:process.env.MAIL_REPLY_TO,subject:message.subject,html:message.html,text:message.text}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('mail_provider_unavailable');providerId=String((await response.json()).id);
 }
 await db().query("insert into private.email_deliveries(event_id,provider_id,state) values($1,$2,'accepted') on conflict(event_id) do update set provider_id=$2,state='accepted',updated_at=now()",[event.id,providerId]);
}
export async function deliverOutbox(){
 const events=await transaction(async c=>(await c.query("update private.outbox_events set locked_until=now()+interval '60 seconds',attempts=attempts+1 where id in(select id from private.outbox_events where delivered_at is null and next_try<=now() and (locked_until is null or locked_until<now()) order by next_try for update skip locked limit 16) returning *")).rows);
 for(const e of events){try{await send(e);await db().query('update private.outbox_events set delivered_at=now(),locked_until=null,last_error=null where id=$1',[e.id]);}catch{await db().query("update private.outbox_events set locked_until=null,next_try=now()+($2::integer*interval '1 second'),last_error='delivery_failed' where id=$1",[e.id,Math.min(3600,2**Math.min(e.attempts,11))]);}}
}
