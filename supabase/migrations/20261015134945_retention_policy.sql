-- expand-only: fixed policy capabilities, never broad deletion grants.
alter table public.match_players alter column user_id drop not null;
create function private.guard_archived_match_seat() returns trigger language plpgsql set search_path='' as $$begin
 if new.user_id is null and not exists(select 1 from public.matches m where m.id=new.match_id and m.lifecycle in('completed','abandoned','cancelled') and m.ended_at<now()-interval '24 months') then raise exception 'only expired historical seats can lose identity' using errcode='23514';end if;return new;
end$$;
revoke all on function private.guard_archived_match_seat() from public,anon,authenticated;
create trigger archived_match_seat before insert or update of user_id on public.match_players for each row execute function private.guard_archived_match_seat();

alter table public.chat_preferences add column draft_updated_at timestamptz not null default now();
create function private.touch_chat_draft() returns trigger language plpgsql set search_path='' as $$begin if new.draft is distinct from old.draft then new.draft_updated_at:=now();end if;return new;end$$;
revoke all on function private.touch_chat_draft() from public,anon,authenticated;
create trigger chat_draft_timestamp before update of draft on public.chat_preferences for each row execute function private.touch_chat_draft();
alter table private.outbox_events add column created_at timestamptz not null default now();
alter table private.match_commands add column created_at timestamptz not null default now();
alter table private.privacy_requests add column verification_method text not null default 'mailbox_and_reauth' check(verification_method in('mailbox_and_reauth','retention_policy'));
alter table private.support_tickets add column retention_minimized_at timestamptz;
alter table private.support_tickets add column retention_expires_at timestamptz;
create table private.retention_account_actions(
 user_id uuid primary key references public.profiles(id),kind text not null check(kind in('unfinished','inactive')),
 warning_event_id uuid references private.outbox_events(id) on delete set null,last_active_at_at_warning timestamptz not null,
 warning_accepted_at timestamptz,eligible_after timestamptz,state text not null default 'warning_pending' check(state in('warning_pending','warned','confirmed','completed','cancelled','review_required')),
 request_id uuid references private.privacy_requests(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table private.retention_account_actions enable row level security;
revoke all on private.retention_account_actions from public,anon,authenticated;
grant select on private.retention_account_actions to dartspoint_app;
create policy backend_read on private.retention_account_actions for select to dartspoint_app using(true);
create index retention_chat_created on public.chat_messages(created_at,id);
create index retention_draft_updated on public.chat_preferences(draft_updated_at) where draft<>'';
create index retention_match_ended on public.matches(ended_at,id) where lifecycle in('completed','abandoned','cancelled');
create index retention_darts_impact on public.match_darts(impact_at);
create index retention_events_at on public.match_events(server_at);
create index retention_commands_created on private.match_commands(created_at);
create index retention_ingress_received on private.command_ingress(received_at);
create index retention_visits_created on private.room_visits(created_at);
create index retention_outbox_created on private.outbox_events(created_at) where delivered_at is not null;
create index retention_support_requests_created on private.support_requests(created_at);
create index retention_audit_created on private.audit_events(created_at);
create index retention_exception_ids on private.privacy_retention_exceptions using gin(retained_ids);
create index retention_support_closed on private.support_tickets(closed_at,id) where status in('resolved','closed');
-- Only record-specific, unexpired exceptions qualify; a category alone is not a blanket hold.
create function private.retention_held(p_category text,p_id text) returns boolean language sql stable set search_path='' as $$select exists(select 1 from private.privacy_retention_exceptions e where e.category=p_category and e.expires_at>now() and p_id=any(e.retained_ids))$$;
revoke all on function private.retention_held(text,text) from public,anon,authenticated,dartspoint_app;
create function private.retention_ticket_due(p_id uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from private.support_tickets t left join private.privacy_requests p on p.ticket_id=t.id where t.id=p_id and (t.retention_hold_until is null or t.retention_hold_until<=now()) and not private.retention_held('support',t.id::text) and
 ((t.protected_kind='privacy' and (p.completed_at<now()-interval '6 months' or t.retention_expires_at<=now())) or (t.protected_kind is distinct from 'privacy' and t.status in('resolved','closed') and t.closed_at<now()-interval '12 months') or(t.requester_id is null and t.guest_verified_at is null and t.protected_kind is null and t.created_at<now()-interval '7 days')))
$$;
revoke all on function private.retention_ticket_due(uuid) from public,anon,authenticated,dartspoint_app;
-- A fixed batch bound, fixed database clock, fixed tables and age predicates.
-- SKIP LOCKED avoids waiting for a throw or an active support operation.
create function private.run_retention_batch(p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='150ms' as $$
declare lim integer:=greatest(1,least(coalesce(p_limit,50),200));counts jsonb:='{}';n integer;ids uuid[];
begin
 if not pg_try_advisory_xact_lock(910257734) then return jsonb_build_object('busy',true);end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from(select m.id from public.chat_messages m join public.channels c on c.id=m.channel_id where ((c.kind='private' and m.created_at<now()-interval '12 months')or(c.kind<>'private' and m.created_at<now()-interval '90 days')) and not private.retention_held('chat',m.id::text) order by m.created_at,m.id limit lim for update of m skip locked) picked;
 update private.moderation_cases set message_id=null where message_id=any(ids);
 delete from public.chat_messages where id=any(ids);get diagnostics n=row_count;counts:=counts||jsonb_build_object('chatMessages',n);
 with picked as(select t.ctid from public.chat_preferences t where t.draft<>'' and t.draft_updated_at<now()-interval '7 days' order by draft_updated_at limit lim for update skip locked) update public.chat_preferences t set draft='' from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('drafts',n);
 with picked as(select t.ctid from private.support_messages t where private.retention_ticket_due(t.ticket_id) and not private.retention_held('support',t.id::text) order by created_at limit lim for update skip locked) delete from private.support_messages t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('supportMessages',n);
 with picked as(select t.ctid from private.support_events t where private.retention_ticket_due(t.ticket_id) order by created_at limit lim for update skip locked) delete from private.support_events t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('supportEvents',n);
 -- Unverified ordinary guest tickets expire after seven days. Remove only
 -- their own idempotency row, never every request from the same mailbox.
 with picked as(select r.ctid from private.support_requests r join private.support_tickets t on r.response->>'id'=t.id::text where r.actor_key='email:'||encode(pg_catalog.sha256(convert_to(lower(btrim(t.guest_email)),'UTF8')),'hex') and t.requester_id is null and t.guest_verified_at is null and t.protected_kind is null and t.created_at<now()-interval '7 days' and private.retention_ticket_due(t.id) order by r.created_at limit lim for update of r skip locked) delete from private.support_requests r using picked p where r.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('unverifiedGuestRequests',n);
 with picked as(select t.ctid from private.support_tickets t where private.retention_ticket_due(t.id) and t.retention_minimized_at is null and not exists(select 1 from private.support_messages m where m.ticket_id=t.id) order by t.closed_at nulls first limit lim for update skip locked) update private.support_tickets t set title='Afgehandeld verzoek',guest_name=null,guest_email=case when t.requester_id is null then 'verwijderd@example.invalid' else null end,context='{}',retention_minimized_at=now(),retention_expires_at=case when t.protected_kind='privacy' then (select p.completed_at+interval '24 months' from private.privacy_requests p where p.ticket_id=t.id) else now() end from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('supportMinimized',n);
 with picked as(select t.ctid from private.privacy_requests t where t.completed_at<now()-interval '6 months' and (t.contact_email is not null or t.review_notes is not null or t.confirmation_hash is not null or t.decision_reason is distinct from 'Afhandeling afgerond; inhoud volgens bewaarbeleid verwijderd') and not private.retention_held('support',t.ticket_id::text) order by completed_at limit lim for update skip locked) update private.privacy_requests t set contact_email=null,review_notes=null,confirmation_hash=null,confirmation_expires_at=null,decision_reason='Afhandeling afgerond; inhoud volgens bewaarbeleid verwijderd' from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('privacyContent',n);
 with picked as(select t.ctid from private.support_requests t where t.created_at<now()-interval '30 days' order by created_at limit lim for update skip locked) delete from private.support_requests t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('supportRequests',n);
 with picked as(select t.ctid from private.support_guest_verifications t where t.expires_at<now()-interval '7 days' order by expires_at limit lim for update skip locked) delete from private.support_guest_verifications t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('guestVerifications',n);
 with picked as(select t.ctid from private.support_guest_sessions t where t.expires_at<now() order by expires_at limit lim for update skip locked) delete from private.support_guest_sessions t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('guestSessions',n);
 with picked as(select t.ctid from private.privacy_exports t where t.expires_at<=now() order by expires_at limit lim for update skip locked) delete from private.privacy_exports t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('privacyExports',n);
 with picked as(select t.ctid from private.privacy_reauths t where t.expires_at<now()-interval '30 days' order by expires_at limit lim for update skip locked) delete from private.privacy_reauths t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('privacyReauth',n);
 with picked as(select t.ctid from private.privacy_retention_exceptions t where t.expires_at<=now() order by expires_at limit lim for update skip locked) delete from private.privacy_retention_exceptions t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('expiredExceptions',n);
 with picked as(select t.ctid from private.privacy_sanction_identifiers t where t.expires_at<=now() order by expires_at limit lim for update skip locked) delete from private.privacy_sanction_identifiers t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('expiredSanctionIdentifiers',n);
 with picked as(select t.ctid from private.room_visits t where t.created_at<now()-interval '30 days' order by created_at limit lim for update skip locked) delete from private.room_visits t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('roomVisits',n);
 with picked as(select t.ctid from private.revoked_sessions t where t.expires_at<now()-interval '30 days' order by expires_at limit lim for update skip locked) delete from private.revoked_sessions t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('revokedSessions',n);
 with picked as(select t.ctid from private.idempotency_keys t where t.created_at<now()-interval '12 months' order by created_at limit lim for update skip locked) delete from private.idempotency_keys t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('idempotencyKeys',n);
 with picked as(select t.ctid from private.command_ingress t where t.received_at<now()-interval '12 months' order by received_at limit lim for update skip locked) delete from private.command_ingress t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('commandIngress',n);
 with picked as(select t.ctid from private.match_commands t where coalesce(t.received_at,t.created_at)<now()-interval '12 months' and exists(select 1 from public.matches m where m.id=t.match_id and m.lifecycle in('completed','abandoned','cancelled')) order by coalesce(received_at,created_at) limit lim for update skip locked) delete from private.match_commands t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('matchCommands',n);
 with picked as(select t.ctid from private.practice_commands t where t.created_at<now()-interval '12 months' order by created_at limit lim for update skip locked) delete from private.practice_commands t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('practiceCommands',n);
 with picked as(select t.ctid from public.match_darts t where t.impact_at<now()-interval '12 months' and exists(select 1 from public.matches m where m.id=t.match_id and m.lifecycle in('completed','abandoned','cancelled')) and not private.retention_held('matches',t.match_id::text) order by impact_at limit lim for update skip locked) delete from public.match_darts t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('matchDarts',n);
 with picked as(select t.ctid from public.match_events t where t.server_at<now()-interval '12 months' and exists(select 1 from public.matches m where m.id=t.match_id and m.lifecycle in('completed','abandoned','cancelled')) and not private.retention_held('matches',t.match_id::text) order by server_at limit lim for update skip locked) delete from public.match_events t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('matchEvents',n);
 with picked as(select t.ctid from public.matches t where t.ended_at<now()-interval '12 months' and t.lifecycle in('completed','abandoned','cancelled') and coalesce(t.state->>'privacyMinimized','false')<>'true' and not private.retention_held('matches',t.id::text) order by ended_at limit lim for update skip locked) update public.matches t set state=private.minimal_match_result(t.state,'{}'::text[]) from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('matchStateMinimized',n);
 with picked as(select t.ctid from public.match_results t where t.created_at<now()-interval '12 months' and coalesce(t.data->>'privacyMinimized','false')<>'true' and not private.retention_held('matches',t.match_id::text) order by created_at limit lim for update skip locked) update public.match_results t set data=private.minimal_match_result(t.data,'{}'::text[]),result_hash=encode(pg_catalog.sha256(convert_to(private.minimal_match_result(t.data,'{}'::text[])::text,'UTF8')),'hex') from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('matchResultMinimized',n);
 with picked as(select t.ctid from public.practice_results t where t.created_at<now()-interval '12 months' order by created_at limit lim for update skip locked) delete from public.practice_results t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('practiceResults',n);
 with picked as(select t.ctid from public.practice_sessions t where t.started_at<now()-interval '12 months' and t.completed_at is not null and not exists(select 1 from public.practice_results r where r.session_id=t.id) order by started_at limit lim for update skip locked) delete from public.practice_sessions t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('practiceSessions',n);
 with picked as(select t.ctid from private.moderation_cases t where t.resolved_at<now()-interval '12 months' and not private.retention_held('moderation',t.id::text) and (t.evidence<>'{}'::jsonb or t.detail<>'[Verlopen volgens bewaarbeleid]') order by resolved_at limit lim for update skip locked) update private.moderation_cases t set evidence='{}',detail='[Verlopen volgens bewaarbeleid]',reason='Afgehandelde melding',resolution=null,message_id=null from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('moderationEvidence',n);
 with picked as(select t.ctid from private.support_inbound_events t where t.processed_at<now()-interval '30 days' and (t.raw_payload is not null or t.original_email is not null or t.payload<>'{}'::jsonb) order by processed_at limit lim for update skip locked) update private.support_inbound_events t set raw_payload=null,original_email=null,payload='{}',last_error=null from picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('rawInboundMail',n);
 with picked as(select t.ctid from private.support_inbound_events t where t.processed_at<now()-interval '90 days' order by processed_at limit lim for update skip locked) delete from private.support_inbound_events t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('inboundMetadata',n);
 with picked as(select t.ctid from private.email_deliveries t where t.updated_at<now()-interval '90 days' order by updated_at limit lim for update skip locked) delete from private.email_deliveries t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('emailMetadata',n);
 with picked as(select t.ctid from private.privacy_mail t where t.created_at<now()-interval '90 days' order by created_at limit lim for update skip locked) delete from private.privacy_mail t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('privacyMail',n);
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from(select e.id from private.outbox_events e where e.delivered_at<now()-interval '90 days' and not exists(select 1 from private.email_deliveries d where d.event_id=e.id) and not exists(select 1 from private.retention_account_actions a where a.warning_event_id=e.id and a.state in('warning_pending','warned')) and not private.retention_held('mail',e.id::text) order by e.delivered_at limit lim for update skip locked) picked;
 update public.notifications set source_event=null where source_event=any(ids);
 delete from private.outbox_events where id=any(ids);get diagnostics n=row_count;counts:=counts||jsonb_build_object('outboxPayloads',n);
 with picked as(select t.ctid from private.audit_events t where t.created_at<now()-interval '12 months' and not private.retention_held('audit',t.id::text) order by created_at limit lim for update skip locked) delete from private.audit_events t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('audit',n);
 with picked as(select t.ctid from private.legal_acceptances t where exists(select 1 from public.profiles p where p.id=t.user_id and p.status='deleted' and p.closed_at<now()-interval '24 months') order by accepted_at limit lim for update skip locked) delete from private.legal_acceptances t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('legalAcceptances',n);
 -- Detach the expired closed subject while retaining the historical seat and
 -- the opponent's current rating and aggregate statistics. Remove the complete
 -- old paired ledger together so its zero-sum/count invariant remains true.
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from(select m.id from public.matches m where m.ended_at<now()-interval '24 months' and m.lifecycle in('completed','abandoned','cancelled') and exists(select 1 from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=m.id and p.status='deleted') and not private.retention_held('matches',m.id::text) order by m.ended_at,m.id limit lim for update of m skip locked) picked;
 delete from public.rating_ledger where match_id=any(ids);get diagnostics n=row_count;counts:=counts||jsonb_build_object('expiredPairedLedgerRows',n);
 delete from public.match_statistics st using public.profiles p where st.match_id=any(ids) and p.id=st.user_id and p.status='deleted';get diagnostics n=row_count;counts:=counts||jsonb_build_object('deletedSubjectStatistics',n);
 with picked as(select po.ctid from public.player_opponents po where exists(select 1 from public.profiles p where (po.user_id=p.id or po.opponent_id=p.id) and p.status='deleted') and exists(select 1 from public.matches m where m.id=po.first_match_id and m.ended_at<now()-interval '24 months') order by po.user_id,po.opponent_id limit lim for update of po skip locked) delete from public.player_opponents po using picked where po.ctid=picked.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('deletedOpponentReferences',n);
 update public.matches m set state=private.scrub_subject_json(private.minimal_match_result(m.state,'{}'::text[]),array(select mp.user_id::text from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=m.id and p.status='deleted')),competition=private.scrub_subject_json(m.competition,array(select mp.user_id::text from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=m.id and p.status='deleted')) where m.id=any(ids);
 update public.match_results r set winner_id=case when exists(select 1 from public.profiles p where p.id=r.winner_id and p.status='deleted') then null else r.winner_id end,data=private.scrub_subject_json(private.minimal_match_result(r.data,'{}'::text[]),array(select mp.user_id::text from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=r.match_id and p.status='deleted')) where r.match_id=any(ids);
 update public.match_results set result_hash=encode(pg_catalog.sha256(convert_to(data::text,'UTF8')),'hex') where match_id=any(ids);
 update public.match_players mp set user_id=null where mp.match_id=any(ids) and exists(select 1 from public.profiles p where p.id=mp.user_id and p.status='deleted');get diagnostics n=row_count;counts:=counts||jsonb_build_object('deletedSubjectParticipants',n);
 with picked as(select t.ctid from private.privacy_requests t where t.completed_at<now()-interval '24 months' and exists(select 1 from private.support_tickets st where st.id=t.ticket_id and st.retention_minimized_at is not null) and not exists(select 1 from private.support_messages sm where sm.ticket_id=t.ticket_id) and not private.retention_held('support',t.ticket_id::text) and not exists(select 1 from private.privacy_erasure_ledger l where l.request_id=t.id) and not exists(select 1 from private.privacy_mail m where m.request_id=t.id) order by completed_at limit lim for update skip locked) delete from private.privacy_requests t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('privacyRequests',n);
 with picked as(select t.ctid from private.support_tickets t where private.retention_ticket_due(t.id) and t.retention_minimized_at is not null and not exists(select 1 from private.support_messages m where m.ticket_id=t.id) and not exists(select 1 from private.privacy_requests p where p.ticket_id=t.id) order by closed_at nulls first limit lim for update skip locked) delete from private.support_tickets t using picked p where t.ctid=p.ctid;get diagnostics n=row_count;counts:=counts||jsonb_build_object('supportTickets',n);
 counts:=counts||jsonb_build_object('overdueExceptionReviews',(select count(*) from private.privacy_retention_exceptions where review_at<=now() and expires_at>now()),'overdueSanctionReviews',(select count(*) from private.privacy_sanction_identifiers where review_at<=now() and expires_at>now()),'overdueExpiredChat',(select count(*) from(select 1 from public.chat_messages m join public.channels c on c.id=m.channel_id where m.created_at<now()-case when c.kind='private' then interval '12 months' else interval '90 days' end and not private.retention_held('chat',m.id::text) limit 10001) q),'overdueExpiredAudit',(select count(*) from(select 1 from private.audit_events a where a.created_at<now()-interval '12 months' and not private.retention_held('audit',a.id::text) limit 10001) q));
 return counts;
end$$;
revoke all on function private.run_retention_batch(integer) from public,anon,authenticated;
grant execute on function private.run_retention_batch(integer) to dartspoint_app;

-- Schedule notices with a durable event ID. A login cancels the pending policy.
-- Never touch an owner, including when another owner could replace them.
create function private.prepare_retention_accounts(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='150ms' as $$
declare lim integer:=greatest(1,least(coalesce(p_limit,10),50));subject_row record;event_id uuid;queued integer:=0;unfinished integer:=0;
begin
 if not pg_try_advisory_xact_lock(910257735) then return jsonb_build_object('busy',true);end if;
 with picked as(select a.user_id from private.retention_account_actions a join public.profiles p on p.id=a.user_id where a.state in('warning_pending','warned') and (p.last_active_at<>a.last_active_at_at_warning or p.status='deleted' or exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='owner' and r.revoked_at is null)) order by a.user_id limit lim for update of a skip locked) update private.retention_account_actions a set state='cancelled',updated_at=now() from picked where a.user_id=picked.user_id;
 for subject_row in select p.* from public.profiles p where p.status in('active','suspended') and not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='owner' and r.revoked_at is null) and not exists(select 1 from private.retention_account_actions a where a.user_id=p.id and a.state not in('cancelled')) and ((p.onboarded_at is null and p.created_at<now()-interval '30 days') or(p.onboarded_at is not null and p.last_active_at<now()-interval '24 months')) order by p.last_active_at,p.id limit lim for update skip locked loop
  if subject_row.onboarded_at is null then
   insert into private.retention_account_actions(user_id,kind,last_active_at_at_warning,eligible_after,state) values(subject_row.id,'unfinished',subject_row.last_active_at,now(),'warned') on conflict(user_id) do update set kind='unfinished',last_active_at_at_warning=excluded.last_active_at_at_warning,eligible_after=now(),state='warned',request_id=null,warning_event_id=null,warning_accepted_at=null,updated_at=now();unfinished:=unfinished+1;
  else
   event_id:=gen_random_uuid();
   insert into private.outbox_events(id,dedupe_key,kind,user_id,payload) values(event_id,'retention-warning:'||event_id::text,'retention-warning',subject_row.id,jsonb_build_object('userId',subject_row.id));
   insert into private.retention_account_actions(user_id,kind,warning_event_id,last_active_at_at_warning,state) values(subject_row.id,'inactive',event_id,subject_row.last_active_at,'warning_pending') on conflict(user_id) do update set kind='inactive',warning_event_id=excluded.warning_event_id,last_active_at_at_warning=excluded.last_active_at_at_warning,state='warning_pending',request_id=null,eligible_after=null,warning_accepted_at=null,updated_at=now();queued:=queued+1;
  end if;
 end loop;
 -- Resend accepted is durable delivery evidence. Failed/unknown sends never
 -- start the 30-day notice period and can never close an account.
 with picked as(select a.user_id,d.updated_at from private.retention_account_actions a join private.email_deliveries d on a.warning_event_id=d.event_id where d.state='accepted' and a.state='warning_pending' order by a.user_id limit lim for update of a skip locked) update private.retention_account_actions a set warning_accepted_at=picked.updated_at,eligible_after=picked.updated_at+interval '30 days',state='warned',updated_at=now() from picked where a.user_id=picked.user_id;
 return jsonb_build_object('noticesQueued',queued,'unfinishedScheduled',unfinished);
end$$;
revoke all on function private.prepare_retention_accounts(integer) from public,anon,authenticated;
grant execute on function private.prepare_retention_accounts(integer) to dartspoint_app;

-- A separate proof method records an authorized retention policy. It does not
-- claim that the user recently logged in or confirmed an e-mail code.
create function private.confirm_retention_account(p_user uuid) returns uuid language plpgsql security definer set search_path='' set lock_timeout='150ms' as $$
declare p public.profiles%rowtype;a private.retention_account_actions%rowtype;ticket uuid;request uuid;email text;topic_roles text[];
begin
 select * into p from public.profiles where id=p_user for update;
 select * into a from private.retention_account_actions where user_id=p_user for update;
 if p.id is null or a.user_id is null then return null;end if;
 if a.state in('confirmed','completed') then return a.request_id;end if;
 if a.state<>'warned' or a.eligible_after is null or a.eligible_after>now() or p.status not in('active','suspended') or p.last_active_at<>a.last_active_at_at_warning or exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='owner' and r.revoked_at is null) then return null;end if;
 if a.kind='unfinished' then
  if p.onboarded_at is not null or p.created_at>=now()-interval '30 days' then return null;end if;
 else
  if p.onboarded_at is null or p.last_active_at>=now()-interval '24 months' or a.warning_accepted_at is null or a.warning_accepted_at>now()-interval '30 days' or not exists(select 1 from private.email_deliveries d where d.event_id=a.warning_event_id and d.state='accepted' and d.updated_at<=now()-interval '30 days') then return null;end if;
 end if;
 if exists(select 1 from private.privacy_retention_exceptions e where e.user_id=p.id and e.category='account' and e.expires_at>now()) then update private.retention_account_actions set state='review_required',updated_at=now() where user_id=p.id;return null;end if;
 select u.email into email from auth.users u where u.id=p.id;
 select roles into topic_roles from private.support_topics where id='privacy';
 insert into private.support_tickets(requester_id,topic_id,title,acl_roles,protected_kind,context) values(p.id,'privacy','Account afsluiten volgens bewaarbeleid',topic_roles,'privacy',jsonb_build_object('privacyKind','delete_account','retentionPolicy',a.kind)) returning id into ticket;
 insert into private.support_messages(ticket_id,author_kind,body) values(ticket,'system',case when a.kind='unfinished' then 'Onvoltooide registratie is meer dan 30 dagen oud. Dit is een verwerking volgens het bewaarbeleid, geen door de gebruiker bevestigde e-mailcode.' else 'Account is meer dan 24 maanden inactief. De waarschuwing is door de e-mailprovider aanvaard, de 30 dagen zijn verstreken en het account is niet opnieuw gebruikt. Dit is een verwerking volgens het bewaarbeleid.' end);
 insert into private.privacy_requests(ticket_id,user_id,contact_email,kind,state,received_at,due_at,identity_verified_at,confirmed_at,verification_method,decision_at,decision_reason,scopes) values(ticket,p.id,email,'delete_account','confirmed',now(),now()+interval '1 month',now(),now(),'retention_policy',now(),'Vaste bewaartermijn gecontroleerd; afzonderlijk vastgelegd als retentiebeleid, niet als gebruikersbevestiging',array['account','chat','support','technical']) returning id into request;
 update private.retention_account_actions set state='confirmed',request_id=request,updated_at=now() where user_id=p.id;
 insert into private.audit_events(action,subject,data) values('privacy.retention_policy',p.id::text,jsonb_build_object('kind',a.kind,'requestId',request));
 return request;
end$$;
revoke all on function private.confirm_retention_account(uuid) from public,anon,authenticated;
grant execute on function private.confirm_retention_account(uuid) to dartspoint_app;
create function private.complete_retention_account(p_request uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from private.privacy_requests r join private.privacy_jobs j on j.request_id=r.id where r.id=p_request and r.verification_method='retention_policy' and r.state='completed' and j.kind='erase' and j.state='completed') then raise exception 'completed retention erasure required' using errcode='42501';end if;
 update private.retention_account_actions set state='completed',updated_at=now() where request_id=p_request and state='confirmed';
end$$;
revoke all on function private.complete_retention_account(uuid) from public,anon,authenticated;
grant execute on function private.complete_retention_account(uuid) to dartspoint_app;
