-- expand-only: persist state transition times on friend requests.
alter table public.friend_requests add column updated_at timestamptz not null default now();
