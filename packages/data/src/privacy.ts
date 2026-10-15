import {createHash,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {db,transaction,audit,outbox,rateLimit} from './db';
import {authAdmin,type Actor} from './auth';
import {supportCreateTicket,supportTicketAccess,supportFreshIdentity,supportCanExecutePrivacy,supportEvent,supportNotifyStaff,type SupportIdentity} from './support';
import {finishMatch,persist} from './matches';
import {dartsGameReducer} from '../../game-core/src/darts-game-state';
import {DomainError,requireThat,uuid} from '../../contracts/src/index';
const kinds=['access','export','correct','delete_account','delete_data','object','restrict'] as const;
const scopes=['account','chat','support','technical'] as const;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const supportKind={access:'access',export:'export',correct:'correction',delete_account:'delete_account',delete_data:'delete_data',object:'objection',restrict:'restriction'} as const;
const labels={access:'Mijn gegevens inzien',export:'Een kopie van mijn gegevens',correct:'Gegevens laten corrigeren',delete_account:'Account verwijderen',delete_data:'Gegevens laten verwijderen',object:'Bezwaar tegen verwerking',restrict:'Verwerking beperken'};
async function verifiedEmail(userId:string){const {data,error}=await authAdmin().auth.admin.getUserById(userId);requireThat(!error&&data.user?.email_confirmed_at&&data.user.email,'verified_mailbox_required',409,'Bevestig eerst je e-mailadres.');return data.user!.email!.toLowerCase();}
/** Called exclusively after a successful OTP verification or PKCE code exchange, never on refresh. */
export async function markRecentReauthentication(actor:Actor){requireThat(actor.sessionId,'verified_session_required',401);await db().query("update profiles set last_active_at=now(),inactivity_warned_at=null where id=$1 and status in('active','suspended')",[actor.id]);await db().query("insert into private.privacy_reauths(user_id,session_id) values($1,$2) on conflict(user_id,session_id) do update set verified_at=now(),expires_at=now()+interval '10 minutes'",[actor.id,actor.sessionId]);}
export async function hasRecentReauthentication(actor:Actor|null){return !!actor?.sessionId&&!!(await db().query('select 1 from private.privacy_reauths where user_id=$1 and session_id=$2 and expires_at>now() and not exists(select 1 from private.revoked_sessions where session_id=$2)',[actor.id,actor.sessionId])).rowCount;}
async function requireRecent(actor:Actor|null){requireThat(actor&&await hasRecentReauthentication(actor),'reauthentication_required',403,'Log opnieuw in voordat je deze gevoelige actie uitvoert.');}
/** Registration of the legal receipt is separate from identity verification; unverified mail is never lost. */
export async function ensurePrivacyRequestForTicket(ticketId:string){return transaction(async c=>{
 const t=(await c.query("select * from private.support_tickets where id=$1 and protected_kind='privacy' for update",[uuid.parse(ticketId)])).rows[0];if(!t)return null;
 const aliases:Record<string,string>={correction:'correct',objection:'object',restriction:'restrict'},raw=t.context.privacyKind??'access',kind=aliases[raw]??raw;requireThat((kinds as readonly string[]).includes(kind),'invalid_privacy_kind',400);
 const predecessor=t.context.linkedTicketId?(await c.query('select received_at from private.privacy_requests where ticket_id=$1',[t.context.linkedTicketId])).rows[0]:null;
 const received=predecessor?.received_at??t.created_at;
 return (await c.query(`insert into private.privacy_requests(ticket_id,user_id,contact_email,kind,received_at,due_at,state) values($1,$2,$3,$4,$5,$5::timestamptz+interval '1 month','identity_pending') on conflict(ticket_id) do update set ticket_id=excluded.ticket_id returning id`,[t.id,t.requester_id,t.guest_email,kind,received])).rows[0].id as string;
});}
export async function privacyRequest(identity:SupportIdentity,input:unknown){const p=z.object({kind:z.enum(kinds),body:z.string().trim().max(12000).default(''),clientRequestId:uuid}).strict().parse(input);requireThat(identity.actor,'unauthenticated',401);
 const result=await supportCreateTicket(identity,{clientRequestId:p.clientRequestId,topicId:'privacy',title:labels[p.kind],body:p.body||labels[p.kind],context:{privacyKind:supportKind[p.kind]}}),id=await ensurePrivacyRequestForTicket(result.id);
 return {ok:true,requestId:id,ticketId:result.id};}
async function requestAccess(c:PoolClient,identity:SupportIdentity,id:string,lock=false){const r=(await c.query(`select * from private.privacy_requests where id=$1 ${lock?'for update':''}`,[uuid.parse(id)])).rows[0];requireThat(r,'not_found',404);const ticket=await supportTicketAccess(c,identity,r.ticket_id);return {r,ticket};}
function dto(r:any){return {id:r.id,ticketId:r.ticket_id,kind:r.kind,state:r.state,receivedAt:r.received_at,dueAt:r.due_at,extendedDueAt:r.extended_due_at,identityVerifiedAt:r.identity_verified_at,confirmedAt:r.confirmed_at,scope:r.scopes,decisionReason:r.decision_reason,completedAt:r.completed_at};}
export async function privacyDetail(identity:SupportIdentity,ticketId:string){const canExecute=await supportCanExecutePrivacy(identity),recent=await hasRecentReauthentication(identity.actor);return transaction(async c=>{
 const t=await supportTicketAccess(c,identity,uuid.parse(ticketId)),r=(await c.query('select * from private.privacy_requests where ticket_id=$1',[ticketId])).rows[0];if(!r)return {request:null,canExecute:false,canConfirm:false,reauthRequired:false};
 const own=r.user_id===identity.actor?.id,guest=identity.guest?.ticketId===ticketId&&t.guest_verified_at;
 const exports=own||guest?(await c.query('select id,expires_at "expiresAt" from private.privacy_exports where request_id=$1 and expires_at>now()',[r.id])).rows:[];
 const job=(await c.query('select state,last_error "error",progress from private.privacy_jobs where request_id=$1 order by created_at desc limit 1',[r.id])).rows[0];
 const exceptions=t.can_staff?(await c.query('select id,category,purpose,legal_basis "legalBasis",retained_fields "retainedFields",retained_ids "retainedIds",review_at "reviewAt",expires_at "expiresAt" from private.privacy_retention_exceptions where user_id=$1',[r.user_id])).rows:[];
 return {request:{...dto(r),executionState:job?.state??null,executionError:t.can_staff?job?.error:null,exports,exportAvailableUntil:exports[0]?.expiresAt??null,exceptions},canExecute:!!(t.can_staff&&canExecute),canReviewIdentity:!!(t.can_staff&&canExecute&&t.requester_id===null),guestVerified:!!t.guest_verified_at,canConfirm:!!(own||!identity.actor&&guest&&r.identity_verified_at&&r.user_id),reauthRequired:!!identity.actor&&!recent};
});}
async function queuePrivacyMail(c:PoolClient,r:any,kind:'confirmation'|'completion'|'extension'|'inactive_warning',body:string,key:string,recipient?:string){const to=recipient??r.contact_email;requireThat(to,'verified_mailbox_required',409);await outbox(c,key,'privacy-mail',null,{requestId:r.id,mailKind:kind});await c.query('insert into private.privacy_mail(event_id,request_id,kind,recipient,body) select id,$2,$3,$4,$5 from private.outbox_events where dedupe_key=$1 on conflict(event_id) do nothing',[key,r.id,kind,to,body]);}
export async function privacyIdentityReview(identity:SupportIdentity,input:unknown){
 const p=z.object({requestId:uuid,subjectUserId:uuid,method:z.enum(['verified_mailbox','alternative_evidence']),evidenceReason:z.string().trim().min(30).max(4000),confirmedIdentity:z.literal(true)}).strict().parse(input);
 await requireRecent(identity.actor);requireThat(await supportCanExecutePrivacy(identity),'privacy_execution_forbidden',403);
 const providerEmail=p.method==='verified_mailbox'?await verifiedEmail(p.subjectUserId):null;
 return transaction(async c=>{const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ticket.can_staff,'forbidden',403);requireThat(!r.confirmed_at&&!['completed','denied'].includes(r.state),'request_finished',409);
  requireThat(ticket.requester_id===null&&ticket.guest_verified_at&&ticket.guest_email,'verified_correspondence_required',409,'Bevestig eerst het correspondentieadres via de eenmalige gastverificatie.');
  requireThat((await c.query('select 1 from profiles where id=$1',[p.subjectUserId])).rowCount,'subject_not_found',404);
  requireThat(!providerEmail||providerEmail===ticket.guest_email.toLowerCase(),'identity_evidence_required',409,'Dit correspondentieadres komt niet overeen. Beoordeel proportioneel alternatief bewijs; koppel nooit alleen op een ingevuld adres.');
  requireThat(!r.user_id||r.user_id===p.subjectUserId,'subject_already_bound',409);
  await c.query("update private.privacy_requests set user_id=$2,contact_email=$3,identity_verified_at=now(),state='identity_pending',review_notes=$4,updated_at=now() where id=$1",[r.id,p.subjectUserId,ticket.guest_email,JSON.stringify([{source:'Handmatige identiteitsbeoordeling: '+p.method,content:p.evidenceReason}])]);
  await supportEvent(c,r.ticket_id,identity.actor!.id,'privacy_identity_reviewed',{subjectUserId:p.subjectUserId,method:p.method},p.evidenceReason);
  return {ok:true,requestId:r.id,confirmationRequired:true};
 });
}
function ownPrivacyRequest(identity:SupportIdentity,r:any,ticket:any){if(identity.actor)return identity.actor.id===r.user_id;return !!(identity.guest?.ticketId===r.ticket_id&&ticket.guest_verified_at&&r.identity_verified_at&&r.user_id);}
export async function privacyConfirmation(identity:SupportIdentity,input:unknown){const p=z.object({requestId:uuid}).strict().parse(input);if(identity.actor)await requireRecent(identity.actor);else requireThat(identity.guest,'unauthenticated',401);const providerEmail=identity.actor?await verifiedEmail(identity.actor.id):null;const code=String(randomInt(100000,1000000));await rateLimit('privacy-confirm:'+(identity.actor?.id??identity.guest!.id),5,3600);return transaction(async c=>{
 const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ownPrivacyRequest(identity,r,ticket),'identity_review_required',403,'Laat de identiteit eerst door een bevoegde medewerker beoordelen.');const to=providerEmail??ticket.guest_email;requireThat(to,'verified_mailbox_required',409);requireThat(!r.confirmed_at&&!['completed','denied'].includes(r.state),'already_confirmed',409);requireThat(!r.confirmation_sent_at||Date.now()-new Date(r.confirmation_sent_at).getTime()>=60000,'resend_too_soon',429,'Wacht één minuut voordat je nog een code aanvraagt.');
 await c.query("update private.privacy_requests set contact_email=$2,confirmation_hash=$3,confirmation_expires_at=now()+interval '20 minutes',confirmation_sent_at=now(),confirmation_attempts=0,updated_at=now() where id=$1",[r.id,to,hash(r.id+':'+code)]);
 await queuePrivacyMail(c,r,'confirmation',`Bevestig je privacyverzoek met deze code: ${code}\n\nDe code is twintig minuten geldig. DartsPoint vraagt nooit om deze code via chat. Heb je dit niet aangevraagd? Negeer deze mail.`, 'privacy-confirm:'+r.id+':'+randomUUID(),to);
 return {ok:true};
});}
async function closeAccount(c:PoolClient,r:any){
 const owner=(await c.query("select 1 from user_roles where user_id=$1 and role='owner' and revoked_at is null",[r.user_id])).rowCount;
 if(owner){await c.query('select pg_advisory_xact_lock(741928411)');requireThat(Number((await c.query("select count(*) n from user_roles r join profiles p on p.id=r.user_id where role='owner' and revoked_at is null and p.status='active'")).rows[0].n)>1,'last_owner_protected',409,'Draag eerst het eigenaarschap over aan een andere eigenaar.');}
 const games=(await c.query("select m.*,mp.seat from matches m join match_players mp on mp.match_id=m.id where mp.user_id=$1 and m.lifecycle in('assigned','playing','paused') order by m.id for update of m",[r.user_id])).rows;
 for(const m of games){const s={...m.state,...dartsGameReducer({...m.state,pendingDart:null},{type:'forfeit',player:m.seat}),pendingDart:null,phaseToken:randomUUID(),lastResult:'De tegenstander heeft het account afgesloten.'};await c.query('delete from match_darts where match_id=$1 and impacted_at is null',[m.id]);await finishMatch(c,m,s,'forfeit',s.winner);await persist(c,m,s,'privacy-account-closed',r.user_id);}
 await c.query("update profiles set status='deleted',closed_at=coalesce(closed_at,now()),session_version=session_version+1,updated_at=now() where id=$1",[r.user_id]);
 await c.query("update game_invites set state='cancelled' where state='pending' and (inviter_id=$1 or invitee_id=$1)",[r.user_id]);
 await c.query('delete from room_memberships where user_id=$1',[r.user_id]);await c.query('delete from match_queues where user_id=$1',[r.user_id]);await c.query('delete from active_player_reservations where user_id=$1',[r.user_id]);
 await c.query('select private.close_subject_sessions($1,$2)',[r.user_id,r.id]);
}
/** Internal retention lane, after the database has proved the exact policy prerequisites. */
export async function closeAccountForRetention(requestId:string){return transaction(async c=>{
 const r=(await c.query(`select r.* from private.privacy_requests r join private.retention_account_actions a on a.request_id=r.id and a.user_id=r.user_id where r.id=$1 and r.kind='delete_account' and r.verification_method='retention_policy' and r.identity_verified_at is not null and r.confirmed_at is not null and a.state='confirmed' for update of r`,[uuid.parse(requestId)])).rows[0];requireThat(r,'retention_proof_required',403);
 await c.query('select id from profiles where id=$1 for update',[r.user_id]);requireThat(!(await c.query("select 1 from user_roles where user_id=$1 and role='owner' and revoked_at is null",[r.user_id])).rowCount,'retention_owner_protected',403);
 await closeAccount(c,r);const all=[...scopes];
 await c.query("update private.privacy_requests set state='in_progress',scopes=$2,decision_at=coalesce(decision_at,now()),decision_reason='Geautomatiseerd bewaarbeleid: databasecontrole van onvoltooide registratie of aangekondigde inactiviteit.',updated_at=now() where id=$1",[r.id,all]);
 await c.query("insert into private.privacy_jobs(request_id,kind) values($1,'erase') on conflict(request_id,kind) do nothing",[r.id]);
 await c.query('insert into private.privacy_erasure_ledger(request_id,user_id,scopes) values($1,$2,$3) on conflict(request_id) do nothing',[r.id,r.user_id,all]);
 return {ok:true,requestId:r.id,accountClosed:true};
});}
export async function privacyConfirm(identity:SupportIdentity,input:unknown){const p=z.object({requestId:uuid,code:z.string().regex(/^\d{6}$/)}).strict().parse(input);if(identity.actor)await requireRecent(identity.actor);else requireThat(identity.guest,'unauthenticated',401);const result=await transaction(async c=>{
 const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ownPrivacyRequest(identity,r,ticket),'forbidden',403);if(r.confirmed_at)return {ok:true,accountClosed:r.kind==='delete_account'};
 if(!r.confirmation_hash||!r.confirmation_expires_at||new Date(r.confirmation_expires_at).getTime()<Date.now()||r.confirmation_attempts>=5)return {invalid:true};
 const actual=hash(r.id+':'+p.code);if(!timingSafeEqual(Buffer.from(actual),Buffer.from(r.confirmation_hash))){await c.query('update private.privacy_requests set confirmation_attempts=confirmation_attempts+1 where id=$1',[r.id]);return {invalid:true};}
 await c.query("update private.privacy_requests set confirmed_at=now(),identity_verified_at=now(),state='confirmed',confirmation_hash=null,updated_at=now() where id=$1",[r.id]);
 if(r.kind==='delete_account')await closeAccount(c,r);
 await supportEvent(c,r.ticket_id,identity.actor?.id??null,'privacy_identity_confirmed',{accountClosed:r.kind==='delete_account'});await supportNotifyStaff(c,{id:r.ticket_id,...(await c.query('select * from private.support_tickets where id=$1',[r.ticket_id])).rows[0]},r.id);
 return {ok:true,accountClosed:r.kind==='delete_account'};
 });if('invalid'in result)throw new DomainError('invalid_confirmation',400,'Deze bevestigingscode klopt niet of is verlopen.');return result;}
export async function privacyExecute(identity:SupportIdentity,input:unknown){const p=z.object({requestId:uuid,decision:z.enum(['approve','deny','needs_information']),reason:z.string().trim().min(10).max(4000),scopes:z.array(z.enum(scopes)).max(4).refine(v=>new Set(v).size===v.length).optional(),reviewedPersonalData:z.array(z.object({source:z.string().max(250),content:z.string().max(12000)})).max(100).optional(),internalReviewComplete:z.boolean().optional()}).strict().parse(input);await requireRecent(identity.actor);requireThat(await supportCanExecutePrivacy(identity),'privacy_execution_forbidden',403);return transaction(async c=>{
 const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ticket.can_staff,'forbidden',403);requireThat(!['completed','denied'].includes(r.state),'request_finished',409);
 const selected=p.scopes??(r.kind==='delete_account'?[...scopes]:[]),approvedScopes=r.kind==='delete_account'?[...scopes]:selected;
 if((await c.query('select 1 from private.privacy_jobs where request_id=$1',[r.id])).rowCount){
  const same=p.decision==='approve'&&r.decision_by===identity.actor!.id&&r.decision_reason===p.reason&&JSON.stringify([...r.scopes].sort())===JSON.stringify([...approvedScopes].sort())&&r.review_notes===JSON.stringify(p.reviewedPersonalData??[]);
  requireThat(same,'request_execution_locked',409,'De uitvoering is al gestart. Leg een gewijzigde beslissing of gegevenscategorie vast als een nieuw gekoppeld verzoek.');return {ok:true,alreadyQueued:true};
 }
 if(p.decision!=='approve'){
  const final=p.decision==='deny',text=p.reason+(final?'\n\nJe kunt een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl) of naar de bevoegde rechter gaan.':'');
  await c.query('update private.privacy_requests set state=$2,decision_by=$3,decision_at=now(),decision_reason=$4,completed_at=case when $5 then now() else null end,updated_at=now() where id=$1',[r.id,final?'denied':'needs_information',identity.actor!.id,text,final]);
  await c.query("insert into private.support_messages(ticket_id,author_kind,visibility,body) values($1,'system','public',$2)",[r.ticket_id,text]);await supportNotifyStaff(c,ticket,r.id+':decision');return {ok:true};
 }
 requireThat(r.identity_verified_at&&r.confirmed_at,'identity_review_required',409,'De identiteit en afzonderlijke bevestiging moeten eerst zijn afgerond.');
 if(r.kind==='delete_data')requireThat(selected.length>0&&!selected.includes('account'),'partial_scopes_required',400,'Kies de te verwijderen gegevenscategorieën.');
 if(['export','access'].includes(r.kind))requireThat(p.internalReviewComplete===true,'internal_data_review_required',409,'Beoordeel eigen persoonsgegevens in interne notities en bescherm gegevens van anderen.');
 await c.query("update private.privacy_requests set state='in_progress',scopes=$2,decision_by=$3,decision_at=now(),decision_reason=$4,review_notes=$5,updated_at=now() where id=$1",[r.id,approvedScopes,identity.actor!.id,p.reason,JSON.stringify(p.reviewedPersonalData??[])]);
 if(['export','access','delete_account','delete_data'].includes(r.kind)){
  const kind=['export','access'].includes(r.kind)?'export':'erase';requireThat(r.user_id,'manual_identity_review_required',409,'Voor een gastaanvraag moet de identiteit en de betrokken gegevens eerst afzonderlijk worden vastgesteld.');
  await c.query("insert into private.privacy_jobs(request_id,kind) values($1,$2) on conflict(request_id,kind) do nothing",[r.id,kind]);
  if(kind==='erase')await c.query("insert into private.privacy_erasure_ledger(request_id,user_id,scopes) values($1,$2,$3) on conflict(request_id) do nothing",[r.id,r.user_id,approvedScopes]);
 }else{await c.query("update private.privacy_requests set state='completed',completed_at=now() where id=$1",[r.id]);await c.query("insert into private.support_messages(ticket_id,author_kind,visibility,body) values($1,'system','public',$2)",[r.ticket_id,p.reason]);}
 await supportEvent(c,r.ticket_id,identity.actor!.id,'privacy_decision',{decision:p.decision,scopes:approvedScopes},p.reason);return {ok:true};
});}
export async function privacyExtend(identity:SupportIdentity,input:unknown){const p=z.object({requestId:uuid,reason:z.string().trim().min(20).max(4000)}).strict().parse(input);await requireRecent(identity.actor);requireThat(await supportCanExecutePrivacy(identity),'privacy_execution_forbidden',403);return transaction(async c=>{
 const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ticket.can_staff,'forbidden',403);requireThat(!r.extended_due_at&&new Date(r.due_at).getTime()>Date.now()&&!r.completed_at,'extension_unavailable',409,'Een verlenging moet gemotiveerd binnen de eerste maand worden meegedeeld.');
 requireThat(r.contact_email&&(r.identity_verified_at||ticket.guest_verified_at),'verified_mailbox_required',409,'Verifieer een veilig correspondentieadres voordat je de verlenging verzendt.');
 await c.query("update private.privacy_requests set extended_due_at=received_at+interval '3 months',updated_at=now() where id=$1",[r.id]);await queuePrivacyMail(c,r,'extension','De behandeling van je privacyverzoek vraagt maximaal twee extra maanden. Reden: '+p.reason,'privacy-extension:'+r.id);
 await c.query("insert into private.support_messages(ticket_id,author_kind,visibility,body) values($1,'system','public',$2)",[r.ticket_id,'De reactietermijn is met maximaal twee maanden verlengd. '+p.reason]);await supportEvent(c,r.ticket_id,identity.actor!.id,'privacy_extended',{},p.reason);return {ok:true};
});}
export async function privacyException(identity:SupportIdentity,input:unknown){const p=z.object({requestId:uuid,category:z.enum(['account','chat','support','moderation','matches','files','mail','audit']),purpose:z.string().trim().min(10).max(2000),legalBasis:z.string().trim().min(5).max(1000),retainedFields:z.array(z.string().max(100)).min(1).max(40),retainedIds:z.array(z.string().min(1).max(100)).max(100).default([]),authorizedRoles:z.array(z.literal('platform')).min(1).max(1),reviewAt:z.string().datetime(),expiresAt:z.string().datetime()}).strict().parse(input);await requireRecent(identity.actor);requireThat(await supportCanExecutePrivacy(identity),'privacy_execution_forbidden',403);return transaction(async c=>{const {r,ticket}=await requestAccess(c,identity,p.requestId,true);requireThat(ticket.can_staff&&r.user_id,'forbidden',403);requireThat(new Date(p.reviewAt).getTime()>Date.now()&&new Date(p.reviewAt)<=new Date(p.expiresAt)&&new Date(p.expiresAt).getTime()<Date.now()+184*86400000,'exception_dates',400);await c.query('insert into private.privacy_retention_exceptions(user_id,category,purpose,legal_basis,retained_fields,retained_ids,authorized_roles,review_at,expires_at,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.user_id,p.category,p.purpose,p.legalBasis,p.retainedFields,p.retainedIds,p.authorizedRoles,p.reviewAt,p.expiresAt,identity.actor!.id]);await supportEvent(c,r.ticket_id,identity.actor!.id,'privacy_exception',{category:p.category,reviewAt:p.reviewAt,expiresAt:p.expiresAt},p.purpose);return {ok:true};});}
export async function privacyExportDownload(identity:SupportIdentity,id:string){if(identity.actor)await requireRecent(identity.actor);else requireThat(identity.guest,'unauthenticated',401);return transaction(async c=>{const r=(await c.query('select e.*,r.ticket_id from private.privacy_exports e join private.privacy_requests r on r.id=e.request_id where e.id=$1 and e.expires_at>now()',[uuid.parse(id)])).rows[0];requireThat(r,'not_found',404);await supportTicketAccess(c,identity,r.ticket_id);if(identity.actor)requireThat(identity.actor.id===r.user_id,'not_found',404);else requireThat(identity.guest?.ticketId===r.ticket_id&&(await c.query("select 1 from private.support_guest_sessions where id=$1 and ticket_id=$2 and created_at>now()-interval '10 minutes' and expires_at>now() and revoked_at is null",[identity.guest!.id,r.ticket_id])).rowCount,'guest_reverification_required',403,'Bevestig je mailbox opnieuw via een nieuwe eenmalige link voor deze gevoelige download.');return {id:r.id,data:r.data as Buffer};});}
