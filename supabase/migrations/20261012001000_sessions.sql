-- expand-only: revoke signed Auth sessions immediately at every application boundary.
create table private.revoked_sessions(session_id uuid primary key,user_id uuid not null references public.profiles(id),expires_at timestamptz not null,revoked_at timestamptz not null default now());
grant select,insert on private.revoked_sessions to dartspoint_app;
