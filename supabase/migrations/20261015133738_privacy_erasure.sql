-- expand-only: preserve minimal historical opponent results while permitting
-- final Auth erasure. The profile becomes an inaccessible UUID tombstone.
do $$ declare fk record; begin
 for fk in select conname from pg_constraint where conrelid='public.profiles'::regclass and confrelid='auth.users'::regclass and contype='f' loop
  execute format('alter table public.profiles drop constraint %I',fk.conname);
 end loop;
end $$;

-- This is the only authenticated browser function granted in private. It has
-- no subject argument and cannot query another user's account or session.
create function private.auth_session_live() returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb; subject uuid; sid uuid;
begin
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 subject:=auth.uid(); sid:=(claims->>'session_id')::uuid;
 if subject is null or sid is null then return false; end if;
 return exists(select 1 from public.profiles p where p.id=subject and p.status='active')
  and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=subject and (s.not_after is null or s.not_after>now()))
  and not exists(select 1 from private.revoked_sessions r where r.session_id=sid)
  and not exists(select 1 from public.sanctions s where s.target_id=subject and s.room_id is null and s.kind='suspend' and s.starts_at<=now() and s.ends_at>now() and s.revoked_at is null);
exception when others then return false;
end $$;
revoke all on function private.auth_session_live() from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.auth_session_live() to authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['profiles','preferences','notifications','channels','chat_messages'] loop
  execute format('create policy live_session_required on public.%I as restrictive for select to authenticated using((select private.auth_session_live()))',tbl);
 end loop;
end $$;

-- Replace identifying scalar text while keeping numeric scores and JSON shape.
-- SQL parameters are data, never SQL fragments or regular expressions.
create function private.scrub_subject_json(value jsonb,tokens text[]) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; item record; text_value text; token text;
begin
 if value is null then return value; end if;
 case jsonb_typeof(value)
 when 'object' then
  result:='{}'::jsonb;
  for item in select key,v from jsonb_each(value) as e(key,v) loop
   result:=result||jsonb_build_object(item.key,private.scrub_subject_json(item.v,tokens));
  end loop;
  return result;
 when 'array' then
  select coalesce(jsonb_agg(private.scrub_subject_json(v,tokens) order by ord),'[]'::jsonb) into result from jsonb_array_elements(value) with ordinality e(v,ord);
  return result;
 when 'string' then
  text_value:=value#>>'{}';
  foreach token in array tokens loop
   if token is not null and length(token)>=3 then text_value:=replace(text_value,token,'[verwijderd]'); end if;
  end loop;
  return to_jsonb(text_value);
 else return value;
 end case;
end $$;
revoke all on function private.scrub_subject_json(jsonb,text[]) from public,anon,authenticated;

create function private.minimal_match_result(value jsonb,tokens text[]) returns jsonb language sql immutable set search_path='' as $$
 select private.scrub_subject_json(coalesce(jsonb_object_agg(key,val),'{}'::jsonb),tokens)||'{"events":[],"history":[],"pendingDart":null,"privacyMinimized":true}'::jsonb
 from jsonb_each(value) e(key,val) where key=any(array['names','winner','totalLegs','sets','setsWon','legs','legsWon','phase','kind','rules','startScore','bestOfLegs','bestOfSets','doubleIn','doubleOut','useSets','format','totalSets'])
$$;
revoke all on function private.minimal_match_result(jsonb,text[]) from public,anon,authenticated;

create table private.privacy_retention_exceptions(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), category text not null check(category in('account','chat','support','moderation','matches','files','mail','audit')),
 purpose text not null check(length(purpose)>=10), legal_basis text not null check(length(legal_basis)>=5), retained_fields text[] not null check(cardinality(retained_fields)>0),
 retained_ids text[] not null default '{}', authorized_roles text[] not null default array['platform'], review_at timestamptz not null, expires_at timestamptz not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(review_at<=expires_at),check(expires_at<=created_at+interval '6 months')
);
create table private.privacy_retained_data(
 exception_id uuid primary key references private.privacy_retention_exceptions(id) on delete cascade,data jsonb not null,created_at timestamptz not null default now()
);
alter table private.privacy_retention_exceptions enable row level security;
alter table private.privacy_retained_data enable row level security;
create policy backend on private.privacy_retention_exceptions for all to dartspoint_app using(true) with check(true);
create policy backend on private.privacy_retained_data for all to dartspoint_app using(true) with check(true);
revoke all on private.privacy_retention_exceptions,private.privacy_retained_data from public,anon,authenticated;
grant select,insert,update,delete on private.privacy_retention_exceptions,private.privacy_retained_data to dartspoint_app;
create function private.retained_fields(value jsonb,fields text[]) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,val),'{}'::jsonb) from jsonb_each(value) e(key,val) where key=any(fields)
$$;
revoke all on function private.retained_fields(jsonb,text[]) from public,anon,authenticated;

create table private.privacy_sanction_identifiers(email_hash text primary key,user_id uuid references public.profiles(id),expires_at timestamptz not null,review_at timestamptz not null,created_at timestamptz not null default now());
alter table private.privacy_sanction_identifiers enable row level security;
create policy backend on private.privacy_sanction_identifiers for all to dartspoint_app using(true) with check(true);
revoke all on private.privacy_sanction_identifiers from public,anon,authenticated;
grant select,insert,update,delete on private.privacy_sanction_identifiers to dartspoint_app;
create function private.block_sanctioned_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is not null and exists(select 1 from private.privacy_sanction_identifiers s where s.email_hash=encode(pg_catalog.sha256(convert_to(lower(btrim(new.email)),'UTF8')),'hex') and s.expires_at>now()) then raise exception 'Neem contact op met DartsPoint Support.' using errcode='P0001';end if;
 return new;
end $$;
revoke all on function private.block_sanctioned_signup() from public,anon,authenticated,dartspoint_app;
create trigger dartspoint_sanction_admission before insert on auth.users for each row execute function private.block_sanctioned_signup();

-- Durable proof of request+identity+mail confirmation and an offsite ledger
-- receipt is required before this narrowly granted maintenance capability runs.
create function private.erase_subject(p_request uuid,p_ledger uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare req private.privacy_requests%rowtype; ledger private.privacy_erasure_ledger%rowtype; v_subject uuid; tokens text[]; scopes text[]; full_account boolean;
 old_profile jsonb; old_email text; match_ids uuid[]; ticket_ids uuid[]; chat_ids uuid[]; file_ids uuid[]; held_chat uuid[]; held_support uuid[]; held_moderation uuid[]; held_matches uuid[]; held_files uuid[]; held_mail uuid[]; held_audit text[];
 hold record; retained jsonb; category text; result jsonb; match_until timestamptz;
begin
 select * into req from private.privacy_requests where id=p_request for update;
 select * into ledger from private.privacy_erasure_ledger where id=p_ledger and request_id=p_request for update;
 if req.id is null or req.user_id is null or req.identity_verified_at is null or req.confirmed_at is null or req.decision_at is null or req.kind not in('delete_account','delete_data') or req.state not in('confirmed','in_progress','completed') then raise exception 'confirmed privacy deletion required' using errcode='42501';end if;
 if ledger.id is null or ledger.user_id<>req.user_id or ledger.durable_at is null or ledger.durable_at<=now()-interval '24 hours' or ledger.expires_at<=now() or coalesce(length(ledger.receipt),0)<10 then raise exception 'durable erasure ledger required' using errcode='42501';end if;
 v_subject:=req.user_id; scopes:=ledger.scopes;full_account:='account'=any(scopes);
 if cardinality(scopes)=0 or not scopes<@array['account','chat','support','technical']::text[] then raise exception 'invalid erasure scope' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_subject::text,489128));
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
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_chat from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='chat' and e.expires_at>now();
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_support from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='support' and e.expires_at>now();
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_moderation from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='moderation' and e.expires_at>now();
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_matches from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='matches' and e.expires_at>now();
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_files from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='files' and e.expires_at>now();
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into held_mail from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='mail' and e.expires_at>now();
 select coalesce(array_agg(distinct x),'{}'::text[]) into held_audit from private.privacy_retention_exceptions e cross join lateral unnest(e.retained_ids) x where e.user_id=v_subject and e.category='audit' and e.expires_at>now();

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
 return result;
end $$;
revoke all on function private.erase_subject(uuid,uuid) from public,anon,authenticated;
grant execute on function private.erase_subject(uuid,uuid) to dartspoint_app;

create function private.close_subject_sessions(p_user uuid,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.privacy_requests r where r.id=p_request and r.user_id=p_user and r.kind='delete_account' and r.identity_verified_at is not null and r.confirmed_at is not null and r.state in('confirmed','in_progress','completed')) then raise exception 'confirmed account closure required' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_user and status='deleted') then raise exception 'close account before revoking sessions' using errcode='42501';end if;
 delete from auth.refresh_tokens where user_id=p_user::text;
 delete from auth.sessions where user_id=p_user;
end $$;
revoke all on function private.close_subject_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function private.close_subject_sessions(uuid,uuid) to dartspoint_app;

-- Restore operator only. The operator decrypts a trusted offsite marker and
-- invokes this inside the isolated restore database before serving any data.
-- This function never contacts GoTrue, Google, mail providers or the network.
create function private.replay_erasure_marker(p_marker jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare marker_id uuid; marker_request_id uuid; subject_id uuid; marker_created_at timestamptz; marker_expires_at timestamptz; selected_scopes text[]; full_account boolean; ticket uuid; existing_user uuid; existing_marker_at timestamptz; result jsonb; game record; minimized jsonb;
begin
 if current_user<>session_user or current_user not in('postgres','supabase_admin') then raise exception 'restore operator required' using errcode='42501';end if;
 if jsonb_typeof(p_marker)<>'object' or exists(select 1 from jsonb_object_keys(p_marker) k where k not in('id','requestId','userId','scopes','createdAt','expiresAt')) or not(p_marker?&array['id','requestId','userId','scopes','createdAt','expiresAt']) then raise exception 'invalid restore erasure marker' using errcode='22023';end if;
 marker_id:=(p_marker->>'id')::uuid;marker_request_id:=(p_marker->>'requestId')::uuid;subject_id:=(p_marker->>'userId')::uuid;marker_created_at:=(p_marker->>'createdAt')::timestamptz;marker_expires_at:=(p_marker->>'expiresAt')::timestamptz;
 if jsonb_typeof(p_marker->'scopes')<>'array' then raise exception 'invalid restore erasure scopes' using errcode='22023';end if;
 select array_agg(value) into selected_scopes from jsonb_array_elements_text(p_marker->'scopes');
 if cardinality(selected_scopes) not between 1 and 4 or not selected_scopes<@array['account','chat','support','technical']::text[] or marker_created_at>now()+interval '1 minute' or marker_expires_at>marker_created_at+interval '37 days' or marker_expires_at<=marker_created_at then raise exception 'invalid restore erasure bounds' using errcode='22023';end if;
 if marker_expires_at<=now() then return jsonb_build_object('skippedExpired',true,'id',marker_id);end if;
 select l.created_at into existing_marker_at from private.privacy_erasure_ledger l where l.request_id=marker_request_id and l.completed_at is not null;
 if date_trunc('milliseconds',existing_marker_at)>date_trunc('milliseconds',marker_created_at) then return jsonb_build_object('skippedOlder',true,'id',marker_id);end if;
 full_account:='account'=any(selected_scopes);
 if not exists(select 1 from public.profiles where id=subject_id) then
  if not exists(select 1 from auth.users where id=subject_id) then return jsonb_build_object('alreadyAbsent',true,'id',marker_id);end if;
  insert into public.profiles(id,status) values(subject_id,'deleted');
 end if;
 perform pg_advisory_xact_lock(hashtextextended(subject_id::text,489128));
 select user_id,ticket_id into existing_user,ticket from private.privacy_requests where id=marker_request_id;
 if found and existing_user is distinct from subject_id then raise exception 'restore marker subject mismatch' using errcode='22023';end if;
 if ticket is null then
  insert into private.support_tickets(requester_id,topic_id,title,status,closed_at,acl_roles,protected_kind) values(subject_id,'privacy','Herstelcontrole privacyverzoek','closed',now(),array['platform'],'privacy') returning id into ticket;
  insert into private.privacy_requests(id,ticket_id,user_id,kind,state,received_at,due_at,identity_verified_at,confirmed_at,decision_at,decision_reason,scopes) values(marker_request_id,ticket,subject_id,case when full_account then 'delete_account' else 'delete_data' end,'in_progress',marker_created_at,marker_created_at+interval '1 month',marker_created_at,marker_created_at,marker_created_at,'Herstelcontrole van een vertrouwd offsite verwijderbewijs',selected_scopes);
 else
  update private.privacy_requests set state='in_progress',identity_verified_at=coalesce(identity_verified_at,marker_created_at),confirmed_at=coalesce(confirmed_at,marker_created_at),decision_at=coalesce(decision_at,marker_created_at),scopes=selected_scopes where id=marker_request_id and kind in('delete_account','delete_data');
 end if;
 insert into private.privacy_erasure_ledger(id,request_id,user_id,scopes,created_at,expires_at,durable_at,receipt) values(marker_id,marker_request_id,subject_id,selected_scopes,marker_created_at,marker_expires_at,now(),'restic-restore-marker:'||marker_id::text) on conflict(request_id) do update set id=excluded.id,scopes=excluded.scopes,created_at=excluded.created_at,expires_at=excluded.expires_at,durable_at=now(),receipt=excluded.receipt;
 if not exists(select 1 from private.privacy_erasure_ledger l where l.id=marker_id and l.request_id=marker_request_id and l.user_id=subject_id) then raise exception 'restore marker identity mismatch' using errcode='22023';end if;
 if full_account then
  -- The historical backup may precede the real closure. No speculative winner
  -- or rating change is invented when that later result is not in the backup.
  for game in select m.* from public.matches m join public.match_players p on p.match_id=m.id where p.user_id=subject_id and m.lifecycle in('assigned','playing','paused') order by m.id for update of m loop
   minimized:=private.minimal_match_result(game.state,'{}'::text[])||'{"phase":"won","winner":null,"kind":"abandoned"}'::jsonb;
   insert into public.match_results(match_id,kind,winner_id,result_hash,final_version,data) values(game.id,'abandoned',null,encode(pg_catalog.sha256(convert_to(minimized::text,'UTF8')),'hex'),game.state_version+1,minimized) on conflict(match_id) do nothing;
   update public.matches set lifecycle='abandoned',ended_at=coalesce(ended_at,now()),state=minimized,state_version=state_version+1,writer_id=null,lease_until=null where id=game.id;
   delete from public.active_player_reservations where match_id=game.id;
   delete from public.board_reservations where match_id=game.id;
  end loop;
  update public.profiles set status='deleted',closed_at=coalesce(closed_at,marker_created_at) where id=subject_id;
  perform private.close_subject_sessions(subject_id,marker_request_id);
 end if;
 result:=private.erase_subject(marker_request_id,marker_id);
 if full_account then delete from auth.users where id=subject_id;end if;
 update private.privacy_requests set state='completed',completed_at=coalesce(completed_at,now()) where id=marker_request_id;
 update private.privacy_erasure_ledger set completed_at=coalesce(completed_at,now()) where id=marker_id;
 return result||jsonb_build_object('restoreReplayed',true,'id',marker_id);
end $$;
revoke all on function private.replay_erasure_marker(jsonb) from public,anon,authenticated,dartspoint_app;
