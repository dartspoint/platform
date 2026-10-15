-- expand-only: durable signed webhook receipts, original message references and support digests.
create table private.support_inbound_events(id uuid primary key default gen_random_uuid(),webhook_id text not null unique,event_type text not null,provider_email_id text not null,payload_hash text not null,raw_payload text,payload jsonb not null,received_at timestamptz not null default now(),provider_received_at timestamptz,processed_at timestamptz,ticket_id uuid references private.support_tickets(id) on delete set null,message_id uuid references private.support_messages(id) on delete set null,state text not null default 'pending' check(state in('pending','processing','processed','ignored','error')),attempts integer not null default 0,next_try timestamptz not null default now(),locked_until timestamptz,last_error text,original_email jsonb,unique(event_type,provider_email_id));
create index support_inbound_pending on private.support_inbound_events(next_try) where state in('pending','error','processing');
create table private.support_email_references(message_id text primary key,event_id uuid not null references private.outbox_events(id) on delete cascade,ticket_id uuid not null references private.support_tickets(id) on delete cascade,created_at timestamptz not null default now());
create table private.support_digest_state(user_id uuid primary key references public.profiles(id),last_queued_at timestamptz not null default 'epoch');
do $$ declare tbl text; begin foreach tbl in array array['support_inbound_events','support_email_references','support_digest_state'] loop
 execute format('alter table private.%I enable row level security',tbl);
 execute format('revoke all on private.%I from public,anon,authenticated',tbl);
 execute format('grant select,insert,update,delete on private.%I to dartspoint_app',tbl);
 execute format('create policy support_backend on private.%I for all to dartspoint_app using(true) with check(true)',tbl);
 end loop; end $$;
