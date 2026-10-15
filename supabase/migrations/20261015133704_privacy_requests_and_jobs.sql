-- expand-only
create table private.privacy_requests (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null unique references private.support_tickets(id) on delete cascade,
 user_id uuid references public.profiles(id), contact_email text,
 kind text not null check(kind in('access','export','correct','delete_account','delete_data','object','restrict')),
 state text not null default 'received' check(state in('received','identity_pending','confirmed','in_progress','completed','denied','needs_information')),
 received_at timestamptz not null, due_at timestamptz not null, extended_due_at timestamptz,
 identity_verified_at timestamptz, confirmed_at timestamptz, decision_by uuid references public.profiles(id), decision_at timestamptz, decision_reason text,
 scopes text[] not null default '{}', updated_at timestamptz not null default now(), completed_at timestamptz,
 confirmation_hash text, confirmation_expires_at timestamptz, confirmation_sent_at timestamptz, confirmation_attempts integer not null default 0,
 review_notes text, reminder_at timestamptz, escalation_at timestamptz,
 check(due_at=received_at+interval '1 month'), check(extended_due_at is null or (extended_due_at>due_at and extended_due_at<=received_at+interval '3 months'))
);
create index privacy_requests_pending on private.privacy_requests(due_at) where completed_at is null;
create table private.privacy_reauths (
 user_id uuid not null references public.profiles(id),session_id uuid not null, verified_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes', primary key(user_id,session_id)
);
create table private.privacy_jobs (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references private.privacy_requests(id) on delete cascade,
 kind text not null check(kind in('export','erase')),state text not null default 'pending' check(state in('pending','running','retry','review_required','failed','completed','waiting_ledger')),
 attempts integer not null default 0,next_try timestamptz not null default now(),locked_until timestamptz,progress jsonb not null default '{}',last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(request_id,kind)
);
create table private.privacy_exports (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references private.privacy_requests(id) on delete cascade,user_id uuid references public.profiles(id),
 data bytea not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',reviewed_by uuid references public.profiles(id),
 check(expires_at<=created_at+interval '7 days')
);
create table private.privacy_erasure_ledger (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references private.privacy_requests(id),user_id uuid not null references public.profiles(id),
 scopes text[] not null,created_at timestamptz not null default now(),durable_at timestamptz,receipt text,completed_at timestamptz,
 expires_at timestamptz not null default now()+interval '37 days',check(expires_at<=created_at+interval '37 days')
);
create table private.privacy_mail (
 event_id uuid primary key references private.outbox_events(id) on delete cascade,request_id uuid not null references private.privacy_requests(id),
 kind text not null check(kind in('confirmation','completion','extension','inactive_warning')),recipient text not null,body text not null,created_at timestamptz not null default now()
);
create table private.privacy_retention_runs (
 id uuid primary key default gen_random_uuid(),started_at timestamptz not null default now(),completed_at timestamptz,counts jsonb not null default '{}',error_code text
);
alter table public.profiles add column last_active_at timestamptz not null default now();
alter table public.profiles add column inactivity_warned_at timestamptz;
alter table public.profiles add column closed_at timestamptz;
create index profiles_inactivity on public.profiles(last_active_at) where status='active';
do $$declare t text;begin foreach t in array array['privacy_requests','privacy_reauths','privacy_jobs','privacy_exports','privacy_erasure_ledger','privacy_mail','privacy_retention_runs'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on private.%I to dartspoint_app',t);
 execute format('create policy backend_access on private.%I for all to dartspoint_app using(true) with check(true)',t);
 end loop;end$$;
