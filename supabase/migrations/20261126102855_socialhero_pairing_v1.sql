-- expand-only SocialHero v1 provisioning and stable destination isolation.
alter table private.blog_tokens
 add column connection_id text unique,
 add column destination_id text,
 add column credential_state text not null default 'active' check(credential_state in('pending','active','expired','revoked')),
 add column provisioning_expires_at timestamptz,
 add column encrypted_token text,
 add column previous_token_id uuid references private.blog_tokens(id),
 add column pairing_attempt_id uuid;
alter table private.blog_tokens add constraint blog_connection_identity check(
 (connection_id is null and destination_id is null) or
 (connection_id is not null and destination_id is not null and provisioning_expires_at is not null and pairing_attempt_id is not null)
);
alter table private.blog_tokens add constraint blog_provisioning_secret check(encrypted_token is null or credential_state='pending');
alter table private.blog_posts add column destination_id text;
alter table private.blog_media add column destination_id text;
-- Keeps the legacy NULL destination unique while allowing distinct SocialHero projects.
alter table private.blog_posts drop constraint blog_posts_site_id_environment_external_id_key;
create unique index blog_posts_destination_external on private.blog_posts(site_id,environment,coalesce(destination_id,''),external_id);
create index blog_media_destination on private.blog_media(site_id,environment,destination_id);
create index blog_provisioning_expiry on private.blog_tokens(provisioning_expires_at) where credential_state='pending';
create table private.socialhero_pairing_attempts (
 id uuid primary key, site_id text not null, environment text not null,
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 unique(site_id,environment,code_hash)
);
create table private.socialhero_settings (
 site_id text not null, environment text not null,
 publish_enabled boolean not null default false,
 latest_attempt_id uuid references private.socialhero_pairing_attempts(id),
 primary key(site_id,environment)
);
alter table private.blog_tokens add constraint blog_pairing_attempt foreign key(pairing_attempt_id) references private.socialhero_pairing_attempts(id);
revoke all on private.socialhero_pairing_attempts,private.socialhero_settings from public,anon,authenticated;
grant select,insert on private.socialhero_pairing_attempts to dartspoint_app;
grant select,insert,update on private.socialhero_settings to dartspoint_app;
alter table private.socialhero_pairing_attempts enable row level security;
alter table private.socialhero_settings enable row level security;
create policy backend on private.socialhero_pairing_attempts for all to dartspoint_app using(true) with check(true);
create policy backend on private.socialhero_settings for all to dartspoint_app using(true) with check(true);
