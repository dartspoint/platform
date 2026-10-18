-- expand-only: immutable per-leg results; legacy match ledgers remain unchanged.
-- Seats and numeric results only: names, addresses and free user text are absent.
create table private.match_leg_settlements (
 match_id uuid not null references public.matches(id) on delete cascade,
 leg_number integer not null check(leg_number between 1 and 147),
 winner_seat integer not null check(winner_seat in(0,1)),
 kind text not null check(kind in('played','forfeit')),
 before_a numeric(20,10), after_a numeric(20,10),
 before_b numeric(20,10), after_b numeric(20,10), delta_a numeric(20,10),
 primary key(match_id,leg_number),
 check ((delta_a is null and before_a is null and after_a is null and before_b is null and after_b is null)
     or (delta_a is not null and before_a is not null and after_a is not null and before_b is not null and after_b is not null
         and after_a=before_a+delta_a and after_b=before_b-delta_a))
);
alter table private.match_leg_settlements enable row level security;
revoke all on private.match_leg_settlements from public,anon,authenticated,dartspoint_app;
grant select,insert on private.match_leg_settlements to dartspoint_app;
create policy backend_read on private.match_leg_settlements for select to dartspoint_app using(true);
create policy backend_insert on private.match_leg_settlements for insert to dartspoint_app with check(true);

-- The existing 24-month retention procedure detaches expired closed subjects.
-- Remove the complete paired leg audit at that same boundary, including casual
-- matches, without granting runtime code permission to rewrite this audit.
create function private.expire_detached_leg_settlements() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 delete from private.match_leg_settlements where match_id=old.match_id;
 return new;
end $$;
revoke all on function private.expire_detached_leg_settlements() from public,anon,authenticated,dartspoint_app;
create trigger expire_detached_leg_settlements after update of user_id on public.match_players
 for each row when (old.user_id is not null and new.user_id is null)
 execute function private.expire_detached_leg_settlements();
