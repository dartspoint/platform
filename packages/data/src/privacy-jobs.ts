import {notificationLocale} from './notification-locale';
import {db,transaction,outbox} from './db';
import {authAdmin} from './auth';
import {requireThat} from '../../contracts/src/index';
import {applyDatabaseErasure} from './privacy-erasure';
import {supportEvent} from './support';
type Progress={stage?:'database_erased'|'provider_erased';result?:Record<string,unknown>};
const approvedSql=`select * from private.privacy_requests r where r.id=$1 and r.confirmed_at is not null and r.decision_at is not null and (r.decision_by is not null or r.verification_method='retention_policy' and exists(select 1 from private.retention_account_actions a where a.request_id=r.id and a.user_id=r.user_id and a.state='confirmed'))`;
function retainedExplanation(result:unknown,locale:'nl'|'en'='nl'){const exceptions=(result as {retainedExceptions?:{category:string;purpose:string;legalBasis:string;expiresAt:string}[]})?.retainedExceptions??[];if(locale==='en')return exceptions.length?'\n\nTemporarily retained data:\n'+exceptions.map(e=>`${e.category}: ${e.purpose}. Legal basis: ${e.legalBasis}. No later than ${new Date(e.expiresAt).toLocaleDateString('en-GB',{timeZone:'Europe/Amsterdam'})}.`).join('\n'):'\n\nNo separate retention exceptions have been recorded.';return exceptions.length?'\n\nTijdelijk bewaarde gegevens:\n'+exceptions.map(e=>`${e.category}: ${e.purpose}. Grondslag: ${e.legalBasis}. Uiterlijk tot ${new Date(e.expiresAt).toLocaleDateString('nl-NL',{timeZone:'Europe/Amsterdam'})}.`).join('\n'):'\n\nEr zijn geen afzonderlijke bewaarexcepties vastgelegd.';}
async function finish(job:any,result:any,ledgerId?:string){return transaction(async c=>{
 const r=(await c.query('select * from private.privacy_requests where id=$1 for update',[job.request_id])).rows[0];
 const fresh=(await c.query('select state from private.privacy_jobs where id=$1 for update',[job.id])).rows[0];if(fresh?.state==='completed')return;
 await c.query("update private.privacy_jobs set state='completed',locked_until=null,progress=$2,updated_at=now(),last_error=null where id=$1",[job.id,JSON.stringify(result)]);
 await c.query("update private.privacy_requests set state='completed',completed_at=now(),updated_at=now() where id=$1",[r.id]);
 if(ledgerId)await c.query('update private.privacy_erasure_ledger set completed_at=coalesce(completed_at,now()) where id=$1',[ledgerId]);
 if(r.verification_method==='retention_policy')await c.query('select private.complete_retention_account($1)',[r.id]);
 await supportEvent(c,r.ticket_id,null,'privacy_completed',result);
 if(r.contact_email){const key='privacy-complete:'+r.id;await outbox(c,key,'privacy-mail',null,{requestId:r.id,mailKind:'completion'});
  const locale=await notificationLocale(c,r.user_id,r.locale),en=locale==='en';
  const until=result.expiresAt?new Date(result.expiresAt).toLocaleString(en?'en-GB':'nl-NL',{timeZone:'Europe/Amsterdam'}):null;
  const body=en?(job.kind==='export'?`Your data copy is ready${until?' until '+until+' (Europe/Amsterdam)':' in your restricted privacy ticket'}. Sign in again or confirm your mailbox using a new one-time link to download it.`:`Your deletion request has been completed for the agreed categories. ${r.kind==='delete_account'?'Your account and linked sign-in methods have been deleted. ':''}Limited match results may be kept for up to 24 months after the match. Backups may retain data for up to 30 additional days; deletions are reapplied after restoration.${retainedExplanation(result,'en')}`):job.kind==='export'?`Je gegevenskopie staat klaar${until?' tot '+until:' in je afgeschermde privacyticket'}. Log opnieuw in of bevestig je mailbox via een nieuwe eenmalige link om de kopie te downloaden.`:`Je verwijderverzoek is uitgevoerd voor de afgesproken categorieën. ${r.kind==='delete_account'?'Je account en de gekoppelde inlogmogelijkheden zijn verwijderd. ':''}Beperkte wedstrijdresultaten kunnen maximaal 24 maanden na de wedstrijd blijven bestaan. Back-ups hebben een uitloop van maximaal 30 dagen; verwijderingen worden bij herstel opnieuw toegepast.${retainedExplanation(result)}`;
  await c.query("insert into private.privacy_mail(event_id,request_id,kind,recipient,body,locale) select id,$2,'completion',$3,$4,$5 from private.outbox_events where dedupe_key=$1 on conflict do nothing",[key,r.id,r.contact_email,body,locale]);
 }
});}
async function createExport(approved:any){return transaction(async c=>{
 // Erasure uses the same subject lock, so copying and purging commit in order.
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,489128))',[approved.user_id]);
 const r=(await c.query(approvedSql+' for update of r',[approved.id])).rows[0];
 requireThat(r&&r.state==='in_progress'&&r.decision_by===approved.decision_by&&new Date(r.decision_at).getTime()===new Date(approved.decision_at).getTime()&&r.review_notes===approved.review_notes,'approved_request_changed',409);
 const profile=(await c.query('select status,closed_at from public.profiles where id=$1 for share',[r.user_id])).rows[0];
 requireThat(profile&&['active','suspended'].includes(profile.status)&&!profile.closed_at,'account_closed',409,'De gegevenskopie kan na accountsluiting niet opnieuw worden aangemaakt.');
 const existing=(await c.query('select expires_at from private.privacy_exports where request_id=$1 and expires_at>now() order by created_at desc limit 1',[r.id])).rows[0];
 if(existing)return {exportCreated:true,expiresAt:existing.expires_at};
 await c.query('delete from private.privacy_exports where request_id=$1',[r.id]);
 const queries:[string,string,unknown[]][]=[
  ['profile','select username,country,status,created_at,onboarded_at,last_active_at from public.profiles where id=$1',[r.user_id]],
  ['preferences','select data from public.preferences where user_id=$1',[r.user_id]],
  ['matches','select m.game_number,m.rules,m.created_at,m.ended_at,p.seat,s.data statistics from public.match_players p join public.matches m on m.id=p.match_id left join public.match_statistics s on s.match_id=p.match_id and s.user_id=p.user_id where p.user_id=$1 order by m.created_at',[r.user_id]],
  ['ownChatMessages','select id,channel_id,body,created_at,redacted_at from public.chat_messages where sender_id=$1 order by created_at',[r.user_id]],
  ['tickets','select id,number,title,status,created_at,closed_at from private.support_tickets where requester_id=$1 order by created_at',[r.user_id]],
  ['ownTicketMessages',"select m.ticket_id,m.body,m.created_at from private.support_messages m join private.support_tickets t on t.id=m.ticket_id where t.requester_id=$1 and m.author_id=$1 and visibility='public' order by m.created_at",[r.user_id]],
  ['ownReleaseIdeas',"select id,number,title,description,category,status,created_at,updated_at from private.release_cards where submitter_id=$1 and source='player' order by created_at",[r.user_id]],
  ['legalAcceptances','select terms_version_id,privacy_version_id,accepted_at,age16_confirmed from private.legal_acceptances where user_id=$1',[r.user_id]],
  ['sanctions','select kind,reason,starts_at,ends_at,revoked_at from public.sanctions where target_id=$1',[r.user_id]]
 ];
 const data:Record<string,unknown>={format:'DartsPoint-persoonsgegevens-1',createdAt:new Date().toISOString(),reviewedAdditionalPersonalData:JSON.parse(r.review_notes??'[]')};
 for(const [key,sql,args]of queries){const q=await c.query(sql+' limit 10001',args);requireThat(q.rows.length<=10000,'export_manual_batch_required',409);data[key]=q.rows;}
 const {data:auth,error}=await authAdmin().auth.admin.getUserById(r.user_id);requireThat(!error&&auth.user,'identity_unavailable',503);
 data.account={email:auth.user!.email,providers:auth.user!.identities?.map(i=>i.provider),createdAt:auth.user!.created_at};
 const bytes=Buffer.from(JSON.stringify(data,null,2));requireThat(bytes.length<=20*1024*1024,'export_manual_batch_required',409);
 const result=(await c.query('insert into private.privacy_exports(request_id,user_id,data,reviewed_by) values($1,$2,$3,$4) returning expires_at',[r.id,r.user_id,bytes,r.decision_by])).rows[0];return {exportCreated:true,expiresAt:result.expires_at};
});}
async function freshLedger(r:any){
 let ledger=(await db().query('insert into private.privacy_erasure_ledger(request_id,user_id,scopes) values($1,$2,$3) on conflict(request_id) do update set request_id=excluded.request_id returning *',[r.id,r.user_id,r.scopes])).rows[0];requireThat(ledger,'ledger_required',409);
 requireThat(JSON.stringify(ledger.scopes)===JSON.stringify(r.scopes),'ledger_scope_mismatch',409);
 if(new Date(ledger.expires_at).getTime()-Date.now()<35*86400000||ledger.durable_at&&Date.now()-new Date(ledger.durable_at).getTime()>=86400000){
  ledger=(await db().query("update private.privacy_erasure_ledger set created_at=now(),expires_at=now()+interval '37 days',durable_at=null,receipt=null where id=$1 and completed_at is null returning *",[ledger.id])).rows[0];requireThat(ledger,'erasure_already_completed',409);
 }
 return ledger;
}
async function completionReport(r:any){
 const retainedExceptions=(await db().query(`select id,category,purpose,legal_basis "legalBasis",review_at "reviewAt",expires_at "expiresAt" from private.privacy_retention_exceptions where user_id=$1 and expires_at>now()`,[r.user_id])).rows;
 return {userId:r.user_id,scopes:r.scopes,databaseErased:true,retainedExceptions,authErasureRequired:r.kind==='delete_account'};
}
/** Separate worker lane: durable stages recover without repeating partial erasure. */
export async function processPrivacyJobs(){
 const job=await transaction(async c=>(await c.query("update private.privacy_jobs set state='running',attempts=attempts+1,locked_until=now()+interval '10 minutes',updated_at=now() where id=(select id from private.privacy_jobs where state in('pending','retry','waiting_ledger','running') and next_try<=now() and (locked_until is null or locked_until<now()) order by next_try for update skip locked limit 1) returning *")).rows[0]);if(!job)return;
 try{
  const r=(await db().query(approvedSql,[job.request_id])).rows[0];requireThat(r,'approved_request_required',409);
  if(job.kind==='export'){await finish(job,await createExport(r));return;}
  const progress=(job.progress??{}) as Progress,existing=(await db().query('select * from private.privacy_erasure_ledger where request_id=$1',[r.id])).rows[0];
  if(existing?.completed_at||progress.stage==='provider_erased'||r.kind!=='delete_account'&&progress.stage==='database_erased'){
   await finish(job,progress.result??await completionReport(r),existing?.id);return;
  }
  const ledger=await freshLedger(r);
  if(!ledger.durable_at||!ledger.receipt){await db().query("update private.privacy_jobs set state='waiting_ledger',next_try=now()+interval '1 minute',locked_until=null where id=$1",[job.id]);return;}
  let result=progress.result;
  if(progress.stage!=='database_erased'){
   result=await applyDatabaseErasure(r.id,ledger.id);
   await db().query("update private.privacy_jobs set progress=$2,updated_at=now() where id=$1",[job.id,JSON.stringify({stage:'database_erased',result})]);
  }
  requireThat(result,'erasure_result_required',409);
  if(r.kind==='delete_account'){
   const deleted=await authAdmin().auth.admin.deleteUser(r.user_id,false);if(deleted.error){const found=await authAdmin().auth.admin.getUserById(r.user_id);requireThat(found.error?.status===404||!found.error&&!found.data.user,'provider_erasure_pending',503);}
   await db().query('update private.privacy_jobs set progress=$2,updated_at=now() where id=$1',[job.id,JSON.stringify({stage:'provider_erased',result})]);
  }
  await finish(job,result,ledger.id);
 }catch(e){
  const code=typeof(e as {code?:unknown})?.code==='string'?(e as {code:string}).code:'privacy_job_failed';
  await db().query("update private.privacy_jobs set state=$2,locked_until=null,next_try=now()+interval '5 minutes',last_error=$3,updated_at=now() where id=$1",[job.id,job.attempts>=10||['export_manual_batch_required','approved_request_changed','ledger_scope_mismatch','account_closed'].includes(code)?'review_required':'retry',code]);
  console.error(JSON.stringify({event:'privacy_job_failed',jobId:job.id,category:code}));
 }
}
