-- Expand-only. Heartbeat connectivity and actual user activity are separate.
alter table public.room_memberships add column last_activity_at timestamptz not null default now();
create index room_membership_last_activity on public.room_memberships(last_activity_at);

-- The existing identity is the sole public counter; UUIDs remain resource keys.
alter table public.matches add constraint matches_public_number_positive check(game_number>0) not valid;
alter table public.matches validate constraint matches_public_number_positive;
do $$ declare public_counter text; begin
 public_counter:=pg_get_serial_sequence('public.matches','game_number');
 if public_counter is null then raise exception 'matches public identity missing'; end if;
 execute format('revoke all on sequence %s from public,anon,authenticated',public_counter);
 execute format('grant usage,select on sequence %s to dartspoint_app',public_counter);
end $$;
