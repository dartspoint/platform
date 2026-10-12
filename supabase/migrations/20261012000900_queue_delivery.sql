-- expand-only: durable queue handover and bounded provider retries.
create table private.queue_advances(match_id uuid primary key references public.matches(id),invite_id uuid references public.game_invites(id),finished boolean not null default false);
grant select,insert,update on private.queue_advances to dartspoint_app;
alter table private.email_deliveries add column first_attempt_at timestamptz;
