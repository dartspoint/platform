-- expand-only: preserve existing migration checksums and old release compatibility.
create table private.launch_subscriptions (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check (length(email) between 3 and 254 and email=lower(btrim(email))),
 subscribed_at timestamptz not null default now(),
 source text not null,
 consent_version text not null,
 unsubscribe_hash text not null unique check (unsubscribe_hash ~ '^[0-9a-f]{64}$')
);
revoke all on private.launch_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on private.launch_subscriptions to dartspoint_app;

alter table public.practice_sessions add column room_id uuid references public.community_rooms(id);
alter table private.match_commands add column received_at timestamptz;
alter table private.match_commands add column admitted_at timestamptz;
alter table private.match_commands add column timing_version text;
alter table private.practice_commands add column received_at timestamptz;
alter table private.practice_commands add column admitted_at timestamptz;
alter table private.practice_commands add column timing_version text;

-- Persist ingress before admission, including across transaction retries/process recovery.
create table private.command_ingress (
 scope text not null check (scope in ('match','practice')),
 actor_id uuid not null references public.profiles(id),
 command_id uuid not null,
 payload_hash text not null,
 received_at timestamptz not null,
 latency_ms integer not null default 0 check (latency_ms between 0 and 90),
 timing_version text not null,
 primary key(scope,actor_id,command_id)
);
revoke all on private.command_ingress from public,anon,authenticated;
grant select,insert on private.command_ingress to dartspoint_app;
create index chat_unread_readable on public.chat_messages(channel_id,seq,sender_id) where redacted_at is null;
