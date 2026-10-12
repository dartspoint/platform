-- expand-only initial schema. Auth UUIDs, never display names, own all resources.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='dartspoint_app') then
    create role dartspoint_app nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
create table public.profiles (
 id uuid primary key references auth.users(id), username text,
 username_key text generated always as (lower(username)) stored unique,
 onboarded_at timestamptz, status text not null default 'active' check(status in('active','suspended','deleted')),
 session_version integer not null default 1, country text not null default 'Nederland',
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((username is null and onboarded_at is null) or (username ~ '^[A-Za-z0-9_-]{3,20}$' and onboarded_at is not null)),
 check(username_key is null or username_key not in ('admin','administrator','moderator','mod','owner','eigenaar','support','system','dartspoint','beheer','beheerder','helpdesk','security','dartspointteam'))
);
create table public.user_roles(user_id uuid references profiles(id), role text check(role in('owner','admin')), granted_by uuid references profiles(id), granted_at timestamptz default now(), revoked_at timestamptz, primary key(user_id,role));
create table public.vip_entitlements(user_id uuid primary key references profiles(id), starts_at timestamptz not null default now(), ends_at timestamptz, source text not null, status text not null default 'active');
create table public.player_ratings(user_id uuid primary key references profiles(id), rating numeric(20,10) not null default 1500, ranked_played integer not null default 0 check(ranked_played>=0), policy_version integer not null default 1);
create table public.preferences(user_id uuid primary key references profiles(id), data jsonb not null default '{}'::jsonb, version bigint not null default 1);
create table private.profile_private(user_id uuid primary key references public.profiles(id), data jsonb not null default '{}'::jsonb);
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), kind text not null, payload jsonb not null, read_at timestamptz, created_at timestamptz default now());
create table public.friend_requests(id uuid primary key default gen_random_uuid(), sender_id uuid not null references profiles(id), recipient_id uuid not null references profiles(id), state text not null default 'pending' check(state in('pending','accepted','rejected','cancelled')), created_at timestamptz default now(), check(sender_id<>recipient_id));
create unique index friend_request_pair_pending on friend_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id)) where state='pending';
create table public.friendships(user_low uuid references profiles(id), user_high uuid references profiles(id), created_at timestamptz default now(), primary key(user_low,user_high), check(user_low<user_high));
create table public.user_blocks(blocker_id uuid references profiles(id), blocked_id uuid references profiles(id), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id));
create table public.personal_mutes(user_id uuid references profiles(id), muted_id uuid references profiles(id), primary key(user_id,muted_id), check(user_id<>muted_id));
create table public.community_rooms(id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique, description text not null default '', category text not null default 'social' check(category in('social','ranked','beginners','tournament')), status text not null default 'open' check(status in('open','closed','private')), capacity integer not null default 50 check(capacity between 2 and 50), min_rating integer not null default 0, max_rating integer not null default 4000, rules text not null default '', version bigint not null default 1);
create table public.room_memberships(user_id uuid primary key references profiles(id), room_id uuid not null references community_rooms(id), presence text not null default 'available', lease_until timestamptz not null, joined_at timestamptz not null default now());
create index room_membership_room on room_memberships(room_id,lease_until);
create table public.room_moderators(room_id uuid references community_rooms(id), user_id uuid references profiles(id), primary key(room_id,user_id));
create table public.room_access(room_id uuid references community_rooms(id), user_id uuid references profiles(id), primary key(room_id,user_id));
create table public.channels(id uuid primary key default gen_random_uuid(), kind text not null check(kind in('private','community','match')), room_id uuid references community_rooms(id), match_id uuid, user_low uuid references profiles(id), user_high uuid references profiles(id), cursor bigint not null default 0,
 check((kind='private' and user_low<user_high and room_id is null and match_id is null) or (kind='community' and room_id is not null and match_id is null and user_low is null and user_high is null) or (kind='match' and match_id is not null and room_id is null and user_low is null and user_high is null)));
create unique index channel_private_pair on channels(user_low,user_high) where kind='private';
create unique index channel_room on channels(room_id) where kind='community';
create unique index channel_match on channels(match_id) where kind='match';
create table public.channel_memberships(channel_id uuid references channels(id), user_id uuid references profiles(id), joined_at timestamptz default now(), left_at timestamptz, last_read_cursor bigint not null default 0, primary key(channel_id,user_id));
create table public.chat_preferences(channel_id uuid references channels(id), user_id uuid references profiles(id), closed_at timestamptz, draft text not null default '', primary key(channel_id,user_id));
create table public.chat_messages(id uuid primary key default gen_random_uuid(), channel_id uuid not null references channels(id), sender_id uuid not null references profiles(id), client_message_id uuid not null, seq bigint not null, body text not null check(length(body) between 1 and 2000), redacted_at timestamptz, created_at timestamptz default now(), unique(channel_id,seq), unique(sender_id,client_message_id));
create index chat_history on chat_messages(channel_id,seq desc);
create table public.game_invites(id uuid primary key default gen_random_uuid(), inviter_id uuid not null references profiles(id), invitee_id uuid not null references profiles(id), room_id uuid not null references community_rooms(id), rules jsonb not null, ranked boolean not null, state text not null default 'pending' check(state in('pending','accepted','rejected','cancelled','expired')), expires_at timestamptz not null, match_id uuid, check(inviter_id<>invitee_id));
create table public.matches(id uuid primary key default gen_random_uuid(), game_number bigint generated always as identity unique, room_id uuid not null references community_rooms(id), mode text not null check(mode in('ranked','casual','tournament','division')), rules jsonb not null, protocol_version integer not null default 1, rules_version integer not null default 1, lifecycle text not null default 'assigned' check(lifecycle in('assigned','playing','paused','completed','abandoned','cancelled')), state jsonb not null, state_version bigint not null default 1, writer_fence bigint not null default 0, writer_id uuid, lease_until timestamptz, competition jsonb, started_at timestamptz, ended_at timestamptz, created_at timestamptz default now());
alter table channels add foreign key(match_id) references matches(id);
alter table game_invites add foreign key(match_id) references matches(id);
create table public.match_players(match_id uuid references matches(id), user_id uuid not null references profiles(id), seat integer not null check(seat in(0,1)), ready boolean not null default false, disconnected_at timestamptz, reconnect_used_ms integer not null default 0, primary key(match_id,seat), unique(match_id,user_id));
create index match_player_user on match_players(user_id);
create table public.active_player_reservations(user_id uuid primary key references profiles(id), match_id uuid not null references matches(id), created_at timestamptz default now());
create table private.match_commands(match_id uuid references public.matches(id), actor_id uuid references public.profiles(id), command_id uuid, payload_hash text not null, receipt jsonb not null, primary key(match_id,actor_id,command_id));
create table public.match_events(match_id uuid references matches(id), sequence bigint not null, kind text not null, actor_id uuid references profiles(id), payload jsonb not null, server_at timestamptz default now(), primary key(match_id,sequence));
create table public.match_darts(match_id uuid references matches(id), dart_id bigint, player_id uuid not null references profiles(id), hit jsonb not null, impact_at timestamptz not null, impacted_at timestamptz, primary key(match_id,dart_id));
create table public.match_results(match_id uuid primary key references matches(id), kind text not null check(kind in('played','forfeit','disconnect','no-show','bye','abandoned','system-invalid','correction')), winner_id uuid references profiles(id), result_hash text not null, final_version bigint not null, data jsonb not null, created_at timestamptz default now());
create table public.rating_ledger(match_id uuid references matches(id), user_id uuid references profiles(id), before numeric(20,10) not null, after numeric(20,10) not null, delta numeric(20,10) not null, policy_version integer not null, primary key(match_id,user_id), check(after=before+delta));
create table public.player_opponents(user_id uuid references profiles(id), opponent_id uuid references profiles(id), first_match_id uuid references matches(id), primary key(user_id,opponent_id), check(user_id<>opponent_id));
create table public.match_statistics(match_id uuid references matches(id), user_id uuid references profiles(id), data jsonb not null, primary key(match_id,user_id));
create table public.tournaments(id uuid primary key default gen_random_uuid(), room_id uuid not null references community_rooms(id), name text not null, status text not null default 'draft', published boolean not null default false, model jsonb not null, version bigint not null default 1, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.tournament_entries(tournament_id uuid references tournaments(id), user_id uuid references profiles(id), state text not null, ready boolean not null default false, accepted_rules_version bigint, primary key(tournament_id,user_id));
create table public.tournament_nodes(tournament_id uuid references tournaments(id), node_id text, match_id uuid references matches(id), model jsonb not null, primary key(tournament_id,node_id));
create table public.boards(id uuid primary key default gen_random_uuid(), tournament_id uuid not null references tournaments(id), number integer not null check(number between 1 and 16), unique(tournament_id,number));
create table public.board_reservations(board_id uuid primary key references boards(id), match_id uuid not null unique references matches(id), created_at timestamptz default now());
create table public.seasons(id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'draft', model jsonb not null, version bigint not null default 1, previous_season_id uuid references seasons(id));
create unique index single_live_season on seasons(status) where status='live';
create table public.divisions(id uuid primary key default gen_random_uuid(), season_id uuid references seasons(id), level integer not null, name text not null, color text not null, unique(season_id,level));
create table public.division_memberships(season_id uuid references seasons(id), user_id uuid references profiles(id), division_id uuid not null references divisions(id), withdrawn_at timestamptz, primary key(season_id,user_id));
create table public.division_fixtures(id uuid primary key default gen_random_uuid(), season_id uuid not null references seasons(id), division_id uuid not null references divisions(id), player_low uuid references profiles(id), player_high uuid references profiles(id), match_id uuid unique references matches(id), model jsonb not null, unique(season_id,player_low,player_high));
create table private.competition_decisions(id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), context jsonb not null, reason text not null check(length(reason)>=5), created_at timestamptz default now());
create table public.sanctions(id uuid primary key default gen_random_uuid(), target_id uuid not null references profiles(id), actor_id uuid not null references profiles(id), room_id uuid references community_rooms(id), kind text not null check(kind in('warn','mute','suspend','remove')), reason text not null check(length(reason)>=5), starts_at timestamptz default now(), ends_at timestamptz not null, revoked_at timestamptz);
create index effective_sanctions on sanctions(target_id,ends_at) where revoked_at is null;
create table private.moderation_cases(id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), target_id uuid not null references public.profiles(id), message_id uuid references public.chat_messages(id), match_id uuid references public.matches(id), reason text not null, detail text not null default '', state text not null default 'open', assigned_to uuid references public.profiles(id), resolution text, created_at timestamptz default now());
create table private.audit_events(id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null, subject text not null, data jsonb not null default '{}'::jsonb, reason text, created_at timestamptz default now());
create table private.system_settings(key text primary key, data jsonb not null, version bigint not null default 1);
create table private.outbox_events(id uuid primary key default gen_random_uuid(), dedupe_key text unique not null, kind text not null, user_id uuid references public.profiles(id), payload jsonb not null, attempts integer not null default 0, next_try timestamptz default now(), locked_until timestamptz, delivered_at timestamptz, last_error text);
create index outbox_pending on private.outbox_events(next_try) where delivered_at is null;
create table private.scheduled_jobs(id uuid primary key default gen_random_uuid(), dedupe_key text unique not null, kind text not null, aggregate_id uuid, due_at timestamptz not null, payload jsonb not null default '{}'::jsonb, locked_until timestamptz, attempts integer not null default 0, completed_at timestamptz);
create table private.email_deliveries(event_id uuid primary key references private.outbox_events(id), provider_id text, state text not null, updated_at timestamptz default now());
create table private.idempotency_keys(actor_id uuid references public.profiles(id), scope text, key uuid, payload_hash text not null, response jsonb not null, created_at timestamptz default now(), primary key(actor_id,scope,key));
create table private.owner_bootstrap_events(environment text primary key, user_id uuid not null references public.profiles(id), created_at timestamptz default now());
create table private.worker_heartbeats(worker_id text primary key, release text not null, at timestamptz not null);

create function private.new_auth_user() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id) values(new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.new_auth_user() from public,anon,authenticated;
create trigger dartspoint_auth_user after insert on auth.users for each row execute function private.new_auth_user();
insert into profiles(id) select id from auth.users on conflict do nothing;

-- Browser access is read-only and scoped. All domain writes go through authorized services.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
   execute format('alter table public.%I enable row level security',t.tablename);
   execute format('create policy backend on public.%I for all to dartspoint_app using(true) with check(true)',t.tablename);
 end loop;
end $$;
grant usage on schema public,private to dartspoint_app;
grant select,insert,update,delete on all tables in schema public,private to dartspoint_app;
revoke update,delete on private.audit_events,public.rating_ledger,public.match_events from dartspoint_app;
grant usage,select on all sequences in schema public,private to dartspoint_app;
create policy own_profile on profiles for select to authenticated using(id=auth.uid());
create policy own_preferences on preferences for select to authenticated using(user_id=auth.uid());
create policy own_notifications on notifications for select to authenticated using(user_id=auth.uid());
create policy own_private_history on chat_messages for select to authenticated using(exists(select 1 from channels c where c.id=channel_id and c.kind='private' and auth.uid() in(c.user_low,c.user_high)));
create policy own_private_channel on channels for select to authenticated using(kind='private' and auth.uid() in(user_low,user_high));
grant select on profiles,preferences,notifications,channels,chat_messages to authenticated;
create view public.public_players with (security_barrier=true) as
 select p.username,p.country,r.rating,r.ranked_played from profiles p join player_ratings r on r.user_id=p.id where p.status='active' and p.onboarded_at is not null;
revoke all on public.public_players from anon,authenticated;
-- Public projections are returned by the server allowlist; no broad Data API grants.
