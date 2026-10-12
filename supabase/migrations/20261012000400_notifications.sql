-- expand-only: preference timestamps and idempotent outbox notifications.
alter table public.preferences add column updated_at timestamptz not null default now();
alter table public.notifications add column source_event uuid unique references private.outbox_events(id);
