-- expand-only: account-bound authoritative practice and command receipts.
create table public.practice_progress(user_id uuid primary key references profiles(id),data jsonb not null,updated_at timestamptz not null default now());
alter table public.practice_progress enable row level security;
create policy backend on public.practice_progress for all to dartspoint_app using(true) with check(true);
revoke all on public.practice_progress from anon,authenticated;
grant select,insert,update on public.practice_progress to dartspoint_app;
create table private.practice_commands(user_id uuid references profiles(id),command_id uuid,request_hash text not null,receipt jsonb not null,created_at timestamptz default now(),primary key(user_id,command_id));
grant select,insert on private.practice_commands to dartspoint_app;
