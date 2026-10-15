-- expand-only: freeze the approved erasure scope and commit an idempotent
-- outcome with the database erasure, including partial requests on active accounts.
alter function private.scrub_subject_json(jsonb,text[]) stable;
alter function private.minimal_match_result(jsonb,text[]) stable;
create table private.privacy_erasure_outcomes(
 ledger_id uuid primary key references private.privacy_erasure_ledger(id) on delete cascade on update cascade,
 request_id uuid not null references private.privacy_requests(id) on delete cascade,
 user_id uuid not null references public.profiles(id),result jsonb not null,erased_at timestamptz not null default now()
);
alter table private.privacy_erasure_outcomes enable row level security;
create policy backend_read on private.privacy_erasure_outcomes for select to dartspoint_app using(true);
revoke all on private.privacy_erasure_outcomes from public,anon,authenticated;
grant select on private.privacy_erasure_outcomes to dartspoint_app;
create or replace function private.erase_subject(p_request uuid,p_ledger uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare req private.privacy_requests%rowtype; ledger private.privacy_erasure_ledger%rowtype; v_subject uuid; tokens text[]; scopes text[]; full_account boolean;
 old_profile jsonb; old_email text; match_ids uuid[]; ticket_ids uuid[]; chat_ids uuid[]; file_ids uuid[]; previous_result jsonb;
 hold record; retained jsonb; result jsonb; match_until timestamptz;
begin
 select * into req from private.privacy_requests where id=p_request for update;
 select * into ledger from private.privacy_erasure_ledger where id=p_ledger and request_id=p_request for update;
 if req.id is null or req.user_id is null or req.identity_verified_at is null or req.confirmed_at is null or req.decision_at is null or req.kind not in('delete_account','delete_data') or req.state not in('confirmed','in_progress','completed') then raise exception 'confirmed privacy deletion required' using errcode='42501';end if;
 if ledger.id is null or ledger.user_id<>req.user_id or ledger.durable_at is null or ledger.durable_at<=now()-interval '24 hours' or ledger.expires_at<=now() or coalesce(length(ledger.receipt),0)<10 then raise exception 'durable erasure ledger required' using errcode='42501';end if;
 if ledger.scopes is distinct from req.scopes then raise exception 'erasure scopes differ from approved decision' using errcode='42501';end if;
 v_subject:=req.user_id; scopes:=ledger.scopes;full_account:='account'=any(scopes);
 if cardinality(scopes)=0 or not scopes<@array['account','chat','support','technical']::text[] then raise exception 'invalid erasure scope' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_subject::text,489128));
 select o.result into previous_result from private.privacy_erasure_outcomes o where o.ledger_id=p_ledger;
 if found then return previous_result;end if;
 if (full_account or 'technical'=any(scopes)) and exists(select 1 from public.matches m join public.match_players p on p.match_id=m.id where p.user_id=v_subject and m.lifecycle in('assigned','playing','paused')) then raise exception 'active matches must finish through normal rules first' using errcode='55000';end if;
 select to_jsonb(p) into old_profile from public.profiles p where p.id=v_subject for update;
 select email into old_email from auth.users where id=v_subject;
 tokens:=array_remove(array[old_profile->>'username',lower(old_profile->>'username'),upper(old_profile->>'username'),old_email,lower(old_email)],null);
 select coalesce(array_agg(match_id),'{}'::uuid[]) into match_ids from public.match_players where user_id=v_subject;
 -- Guest correspondence needs a separate verified linking/review action. A
 -- matching email alone never gives an account authority over that dossier.
 select coalesce(array_agg(id),'{}'::uuid[]) into ticket_ids from private.support_tickets where requester_id=v_subject;
 select coalesce(array_agg(id),'{}'::uuid[]) into chat_ids from public.chat_messages where sender_id=v_subject or actor_id=v_subject;
 select coalesce(array_agg(id),'{}'::uuid[]) into file_ids from private.media_assets where created_by=v_subject;
 -- Unbounded category exemptions are not silently interpreted as a right to
 -- keep a complete account. Record IDs (or specific account fields) are needed.
 for hold in select * from private.privacy_retention_exceptions where user_id=v_subject and expires_at>now() loop
  if hold.review_at<=now() then raise exception 'retention exception review overdue' using errcode='55000';end if;
  if hold.category<>'account' and cardinality(hold.retained_ids)=0 then raise exception 'retention exception requires specific record identifiers' using errcode='55000';end if;
  case hold.category
  when 'account' then retained:=private.retained_fields(old_profile,hold.retained_fields);
  when 'chat' then select coalesce(jsonb_agg(jsonb_build_object('recordId',m.id,'fields',private.retained_fields(to_jsonb(m),hold.retained_fields))),'[]'::jsonb) into retained from public.chat_messages m where m.id::text=any(hold.retained_ids) and (m.sender_id=v_subject or m.actor_id=v_subject);
  when 'support' then select coalesce(jsonb_agg(jsonb_build_object('recordId',s.id,'fields',private.retained_fields(to_jsonb(s),hold.retained_fields))),'[]'::jsonb) into retained from private.support_messages s where (s.id::text=any(hold.retained_ids) or s.ticket_id::text=any(hold.retained_ids)) and (s.ticket_id=any(ticket_ids) or s.author_id=v_subject);
  when 'moderation' then select coalesce(jsonb_agg(jsonb_build_object('recordId',m.id,'fields',private.retained_fields(to_jsonb(m),hold.retained_fields))),'[]'::jsonb) into retained from private.moderation_cases m where m.id::text=any(hold.retained_ids) and (m.target_id=v_subject or m.reporter_id=v_subject or m.message_id=any(chat_ids));
  when 'matches' then select coalesce(jsonb_agg(jsonb_build_object('recordId',m.id,'fields',private.retained_fields(to_jsonb(m),hold.retained_fields))),'[]'::jsonb) into retained from public.matches m where m.id::text=any(hold.retained_ids) and m.id=any(match_ids);
  when 'files' then select coalesce(jsonb_agg(private.retained_fields(item,hold.retained_fields)),'[]'::jsonb) into retained from (select to_jsonb(a) item from private.support_attachments a where a.id::text=any(hold.retained_ids) and (a.ticket_id=any(ticket_ids) or a.uploaded_by=v_subject) union all select to_jsonb(a) from private.media_assets a where a.id::text=any(hold.retained_ids) and a.created_by=v_subject) records;
  when 'mail' then select coalesce(jsonb_agg(jsonb_build_object('recordId',e.id,'fields',private.retained_fields(to_jsonb(e),hold.retained_fields))),'[]'::jsonb) into retained from private.outbox_events e where e.id::text=any(hold.retained_ids) and (e.user_id=v_subject or e.payload->>'ticketId'=any(array(select unnest(ticket_ids)::text)));
  when 'audit' then select coalesce(jsonb_agg(jsonb_build_object('recordId',a.id,'fields',private.retained_fields(to_jsonb(a),hold.retained_fields))),'[]'::jsonb) into retained from private.audit_events a where a.id::text=any(hold.retained_ids) and (a.actor_id=v_subject or a.subject=v_subject::text);
  else retained:='{}'::jsonb;
  end case;
  -- Replays cannot overwrite the already reviewed evidence with a scrubbed
  -- copy. Source rows are always minimized below, including held records.
  insert into private.privacy_retained_data(exception_id,data) values(hold.id,retained) on conflict(exception_id) do nothing;
 end loop;

 if full_account or 'chat'=any(scopes) then
  -- Detach evidence references before deleting content; retained evidence can
  -- keep its own explicitly justified snapshot, never an invisible chat copy.
  update private.moderation_cases set message_id=null,evidence='{}'::jsonb,detail='[verwijderd]',reason='Privacyverzoek uitgevoerd',resolution=null where (target_id=v_subject or reporter_id=v_subject or message_id=any(chat_ids));
  delete from public.chat_messages where id=any(chat_ids);
  delete from public.chat_preferences where user_id=v_subject;
  delete from public.channel_memberships where user_id=v_subject;
  delete from private.room_visits where user_id=v_subject;
 end if;
 if full_account or 'support'=any(scopes) then
  delete from private.support_attachments where ticket_id=any(ticket_ids) or uploaded_by=v_subject;
  update private.support_messages set body='[Gegevens verwijderd op privacyverzoek]',first_name=null where ticket_id=any(ticket_ids);
  update private.support_messages set first_name=null,body=private.scrub_subject_json(to_jsonb(body),tokens)#>>'{}' where author_id=v_subject;
  update private.support_tickets set guest_email=null,guest_name=null,title='Afgehandeld privacyverzoek',context='{}'::jsonb where id=any(ticket_ids);
  update private.support_events set data='{}'::jsonb,reason=null where ticket_id=any(ticket_ids) or actor_id=v_subject;
  delete from private.support_guest_verifications where ticket_id=any(ticket_ids);
  delete from private.support_guest_sessions where ticket_id=any(ticket_ids);
  delete from private.support_followers where user_id=v_subject;
  delete from private.support_reads where reader_key in(v_subject::text,'user:'||v_subject::text);
  delete from private.support_requests where actor_key in(v_subject::text,'user:'||v_subject::text) or response->>'id'=any(array(select unnest(ticket_ids)::text));
  if to_regclass('private.support_inbound_events') is not null then
   update private.support_inbound_events set raw_payload=null,original_email=null,payload='{}'::jsonb,last_error=null,state='processed',processed_at=coalesce(processed_at,now()) where ticket_id=any(ticket_ids);
   delete from private.support_digest_state where user_id=v_subject;
  end if;
 end if;
 delete from private.privacy_exports where user_id=v_subject;
 if full_account or 'technical'=any(scopes) then
  delete from public.match_darts where player_id=v_subject;
  delete from private.match_commands where actor_id=v_subject;
  delete from private.command_ingress where actor_id=v_subject;
  delete from private.practice_commands where user_id=v_subject;
  delete from public.practice_results where user_id=v_subject;
  delete from public.practice_sessions where user_id=v_subject;
  delete from public.practice_progress where user_id=v_subject;
  update public.match_events set payload=jsonb_build_object('state',private.minimal_match_result(payload->'state',tokens),'privacyMinimized',true) where match_id=any(match_ids);
  update public.matches set state=private.minimal_match_result(state,tokens),writer_id=null,lease_until=null where id=any(match_ids);
  update public.match_results set data=private.minimal_match_result(data,tokens),result_hash=encode(pg_catalog.sha256(convert_to(private.minimal_match_result(data,tokens)::text,'UTF8')),'hex') where match_id=any(match_ids);
  -- Public aggregate stats of the other player are untouched. Their scores,
  -- winner and balanced rating ledger remain usable as minimal match history.
  delete from public.match_statistics where user_id=v_subject;
  delete from private.idempotency_keys where actor_id=v_subject;
  update private.audit_events set data=case when actor_id=v_subject or private.audit_events.subject=v_subject::text then '{}'::jsonb else private.scrub_subject_json(data,tokens) end,reason=case when actor_id=v_subject or private.audit_events.subject=v_subject::text then null else reason end where actor_id=v_subject or private.audit_events.subject=v_subject::text or data::text like '%'||coalesce(old_profile->>'username','<none>')||'%';
  update private.outbox_events set payload='{}'::jsonb,delivered_at=coalesce(delivered_at,now()),last_error=null where (user_id=v_subject or payload->>'ticketId'=any(array(select unnest(ticket_ids)::text))) and kind not like 'privacy-%';
  update public.tournaments set model=private.scrub_subject_json(model,tokens) where model::text like '%'||v_subject::text||'%';
  update public.seasons set model=private.scrub_subject_json(model,tokens) where model::text like '%'||v_subject::text||'%';
  update private.lobby_configuration set draft=private.scrub_subject_json(draft,tokens);
  update private.lobby_revisions set layout=private.scrub_subject_json(layout,tokens);
  delete from private.media_references where asset_id=any(file_ids);
  delete from private.media_assets where id=any(file_ids);
 end if;
 if full_account then
  if old_email is not null then
   insert into private.privacy_sanction_identifiers(email_hash,user_id,expires_at,review_at)
    select encode(pg_catalog.sha256(convert_to(lower(btrim(old_email)),'UTF8')),'hex'),v_subject,max(ends_at),least(max(ends_at),now()+interval '6 months') from public.sanctions where target_id=v_subject and room_id is null and kind='suspend' and starts_at<=now() and ends_at>now() and revoked_at is null having max(ends_at) is not null
    on conflict(email_hash) do update set expires_at=greatest(privacy_sanction_identifiers.expires_at,excluded.expires_at),review_at=least(privacy_sanction_identifiers.review_at,excluded.review_at);
   delete from private.launch_subscriptions where lower(email)=lower(old_email);
  end if;
  delete from private.privacy_reauths where user_id=v_subject;
  update public.user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=v_subject;
  update private.support_team_roles set revoked_at=coalesce(revoked_at,now()),reason='Account verwijderd' where user_id=v_subject;
  delete from private.support_team_members where user_id=v_subject;
  delete from private.legal_publishers where user_id=v_subject;
  delete from public.room_moderators where user_id=v_subject;
  delete from public.room_access where user_id=v_subject;
  delete from public.room_memberships where user_id=v_subject;
  delete from public.match_queues where user_id=v_subject;
  delete from public.friend_requests where sender_id=v_subject or recipient_id=v_subject;
  delete from public.friendships where user_low=v_subject or user_high=v_subject;
  delete from public.user_blocks where blocker_id=v_subject or blocked_id=v_subject;
  delete from public.personal_mutes where user_id=v_subject or muted_id=v_subject;
  delete from public.notifications where user_id=v_subject;
  delete from public.preferences where user_id=v_subject;
  delete from private.profile_private where user_id=v_subject;
  delete from public.vip_entitlements where user_id=v_subject;
  delete from public.user_badges where user_id=v_subject;
  delete from public.player_opponents where user_id=v_subject or opponent_id=v_subject;
  delete from public.player_ratings where user_id=v_subject;
  delete from private.lobby_votes where user_id=v_subject;
  delete from private.lobby_applause where user_id=v_subject;
  update public.game_invites set state='cancelled' where (inviter_id=v_subject or invitee_id=v_subject) and state='pending';
  update public.tournament_entries set state='withdrawn',ready=false where user_id=v_subject;
  update public.division_memberships set withdrawn_at=coalesce(withdrawn_at,now()) where user_id=v_subject;
  update public.sanctions set reason='Beperkte sanctieregistratie na accountverwijdering' where target_id=v_subject;
  update public.profiles set username=null,onboarded_at=null,country='',rename_required=false,status='deleted',session_version=session_version+1,updated_at=now(),closed_at=coalesce(closed_at,now()),last_active_at=now(),inactivity_warned_at=null where id=v_subject;
 end if;
 select max(coalesce(ended_at,created_at)+interval '24 months') into match_until from public.matches where id=any(match_ids);
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'category',e.category,'purpose',e.purpose,'legalBasis',e.legal_basis,'reviewAt',e.review_at,'expiresAt',e.expires_at)),'[]'::jsonb) into retained from private.privacy_retention_exceptions e where e.user_id=v_subject and e.expires_at>now();
 result:=jsonb_build_object('userId',v_subject,'scopes',scopes,'databaseErased',true,'retainedExceptions',retained,'minimalMatchRetentionUntil',match_until,'authErasureRequired',full_account);
 insert into private.privacy_erasure_outcomes(ledger_id,request_id,user_id,result) values(p_ledger,p_request,v_subject,result);
 -- Persist the worker stage in this same transaction. The bounded marker and
 -- its outcome may expire while a crashed job is waiting to resume; a partial
 -- request must still never erase content created after this execution.
 update private.privacy_jobs set progress=jsonb_build_object('stage','database_erased','result',result),updated_at=now() where request_id=p_request and kind='erase' and state<>'completed';
 return result;
end $$;
revoke all on function private.erase_subject(uuid,uuid) from public,anon,authenticated;
grant execute on function private.erase_subject(uuid,uuid) to dartspoint_app;
