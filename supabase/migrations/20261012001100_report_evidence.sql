-- expand-only: preserve authorized evidence independently of message retention.
alter table private.moderation_cases add column room_id uuid references public.community_rooms(id);
alter table private.moderation_cases add column evidence jsonb not null default '{}'::jsonb;
alter table private.moderation_cases add column resolved_at timestamptz;
create index moderation_reporter_created on private.moderation_cases(reporter_id,created_at desc);
