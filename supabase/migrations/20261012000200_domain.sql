-- expand-only: durable practice, queue, owner protections and initial room configuration.
create table public.match_queues(match_id uuid references matches(id),user_id uuid references profiles(id),joined_at timestamptz not null default now(),primary key(match_id,user_id));
create table public.practice_sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),mode text not null,state jsonb not null,state_version bigint not null default 1,started_at timestamptz default now(),completed_at timestamptz);
create table public.practice_results(session_id uuid primary key references practice_sessions(id),user_id uuid not null references profiles(id),week text not null,data jsonb not null,created_at timestamptz default now());
create table public.user_badges(user_id uuid references profiles(id),badge text,match_id uuid references matches(id),earned_at timestamptz default now(),primary key(user_id,badge));
create table private.admission_lock(id integer primary key check(id=1));
insert into private.admission_lock values(1);
create function private.protect_owner() returns trigger language plpgsql set search_path='' as $$ begin
 if old.role='owner' and old.revoked_at is null and (TG_OP='DELETE' or new.revoked_at is not null) then
   perform pg_advisory_xact_lock(1247281199);
   if not exists(select 1 from public.user_roles where role='owner' and revoked_at is null and user_id<>old.user_id) then raise exception 'last owner protected' using errcode='23514';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
create trigger protect_last_owner before update or delete on user_roles for each row execute function private.protect_owner();
revoke all on function private.protect_owner() from public;
do $$ declare t text; begin
 foreach t in array array['match_queues','practice_sessions','practice_results','user_badges'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy backend on public.%I for all to dartspoint_app using(true) with check(true)',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to dartspoint_app',t);
 end loop;
end $$;
grant select on private.admission_lock to dartspoint_app;
insert into community_rooms(name,slug,description,category,rules) values
 ('Nederland 1','nederland-1','De huiskamer voor een gezellige partij.','social','Respecteer elkaar en speel eerlijk.'),
 ('Afterhours','afterhours','Nog één potje.','ranked','Officiële ratingpartijen. Respecteer elkaar.'),
 ('Beginners','beginners','Leer het bord kennen.','beginners','Geef nieuwe spelers de ruimte.'),
 ('Toernooien','toernooien','Officiële toernooipartijen.','tournament','De planner bepaalt de wedstrijden.');
insert into channels(kind,room_id) select 'community',id from community_rooms;
