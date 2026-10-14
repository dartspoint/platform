-- expand-only durable lobby drafts/publications, real reactions and image assets.
-- Browser roles have no direct access; fresh Actor/room checks remain at the service boundary.
create table private.lobby_configuration (
 id smallint primary key check(id=1), draft jsonb not null,
 draft_version bigint not null default 1 check(draft_version>0), published_revision bigint not null default 0 check(published_revision>=0),
 updated_by uuid references public.profiles(id), saved_at timestamptz, published_at timestamptz
);
create table private.lobby_revisions (
 revision bigint primary key check(revision>0), layout jsonb not null,
 actor_id uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table private.media_assets (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 mime text not null check(mime='image/webp'), bytes integer not null check(bytes between 1 and 8388608),
 width integer not null check(width between 1 and 1600), height integer not null check(height between 1 and 900),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'), image_data bytea not null, mobile_data bytea not null,
 mobile_width integer not null check(mobile_width between 1 and 720), mobile_height integer not null check(mobile_height between 1 and 405),
 created_at timestamptz not null default now(), check(octet_length(image_data)=bytes), check(octet_length(mobile_data) between 1 and 8388608)
);
create index media_assets_creator on private.media_assets(created_by,created_at desc);
create table private.media_references (
 asset_id uuid not null references private.media_assets(id), scope text not null check(scope in('lobby-draft','lobby-revision','tournament')),
 subject text not null, primary key(asset_id,scope,subject)
);
create index media_references_subject on private.media_references(scope,subject);
create table private.lobby_votes (
 widget_id text not null, poll_version text not null check(poll_version ~ '^[a-f0-9]{64}$'), user_id uuid not null references public.profiles(id),
 option_index smallint not null check(option_index between 0 and 4), updated_at timestamptz not null default now(),
 primary key(widget_id,poll_version,user_id)
);
create index lobby_votes_user on private.lobby_votes(user_id);
create table private.lobby_applause (
 widget_id text not null, moment_version text not null check(moment_version ~ '^[a-f0-9]{64}$'), user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), primary key(widget_id,moment_version,user_id)
);
create index lobby_applause_user on private.lobby_applause(user_id);
-- Presentation concurrency is independent of bracket/results/entry versions.
alter table public.tournaments add column hero_version bigint not null default 1 check(hero_version>0);
revoke all on private.lobby_configuration,private.lobby_revisions,private.media_assets,private.media_references,private.lobby_votes,private.lobby_applause from public,anon,authenticated;
grant select,insert,update,delete on private.lobby_configuration,private.media_assets,private.media_references,private.lobby_votes,private.lobby_applause to dartspoint_app;
grant select,insert on private.lobby_revisions to dartspoint_app;
alter table private.lobby_configuration enable row level security;
alter table private.lobby_revisions enable row level security;
alter table private.media_assets enable row level security;
alter table private.media_references enable row level security;
alter table private.lobby_votes enable row level security;
alter table private.lobby_applause enable row level security;
create policy backend on private.lobby_configuration for all to dartspoint_app using(true) with check(true);
create policy backend on private.lobby_revisions for all to dartspoint_app using(true) with check(true);
create policy backend on private.media_assets for all to dartspoint_app using(true) with check(true);
create policy backend on private.media_references for all to dartspoint_app using(true) with check(true);
create policy backend on private.lobby_votes for all to dartspoint_app using(true) with check(true);
create policy backend on private.lobby_applause for all to dartspoint_app using(true) with check(true);
insert into private.lobby_configuration(id,draft) values(1,'{
 "headline":"Goed dat je er bent.","eyebrow":"JOUW KAMER. JOUW CLUB.","articles":[],"widgets":[
 {"id":"lobby-announcement","type":"announcement","enabled":true,"size":"wide","audience":{"mode":"all","roomIds":[]},"title":"Van het team","description":"","settings":{"announcementSource":"platform"}},
 {"id":"lobby-tournament","type":"tournament","enabled":true,"size":"wide","audience":{"mode":"all","roomIds":[]},"title":"","description":"","settings":{"tournamentImageMode":"inherit"}},
 {"id":"lobby-players","type":"players","enabled":true,"size":"wide","audience":{"mode":"all","roomIds":[]},"title":"Al zin in een potje?","description":"Vind je volgende tegenstander in deze kamer.","settings":{"ctaLabel":"Zoek een speler"}},
 {"id":"lobby-challenge","type":"challenge","enabled":true,"size":"half","audience":{"mode":"all","roomIds":[]},"title":"Vijf dubbels. Eén lekker gevoel.","description":"Oefen tussen twee potjes door.","settings":{"ctaLabel":"Pak je pijlen","ctaHref":"/oefenen?uitdaging=1"}},
 {"id":"lobby-moment","type":"moment","enabled":false,"size":"half","audience":{"mode":"all","roomIds":[]},"title":"Een moment uit de community","description":"Redactioneel communitymoment.","settings":{}},
 {"id":"lobby-news","type":"news","enabled":true,"size":"wide","audience":{"mode":"all","roomIds":[]},"title":"Van het prikbord","description":"Nieuws & updates","settings":{"articleIds":[]}},
 {"id":"lobby-poll","type":"poll","enabled":false,"size":"half","audience":{"mode":"all","roomIds":[]},"title":"Jouw stem telt.","description":"","settings":{"pollOptions":[]}},
 {"id":"lobby-divisions","type":"divisions","enabled":true,"size":"half","audience":{"mode":"all","roomIds":[]},"title":"Jouw plek op de ladder.","description":"Een vaste divisie en nieuwe tegenstanders.","settings":{"ctaLabel":"Bekijk de divisies","ctaHref":"/divisies"}}
 ]}'::jsonb);
insert into private.lobby_revisions(revision,layout) select 1,draft from private.lobby_configuration where id=1;
update private.lobby_configuration set published_revision=1,published_at=now() where id=1;
