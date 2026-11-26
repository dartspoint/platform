-- Expand-only: preserve existing choices; defaults apply only after visible pairing consent.
alter table private.socialhero_pairing_attempts
 add column draft_enabled boolean not null default true,
 add column publish_enabled boolean not null default false,
 add column rights_confirmed_at timestamptz;
alter table private.blog_tokens add column last_checked_at timestamptz;
create table private.socialhero_destination_policies (
 site_id text not null, environment text not null, destination_id text not null check(length(destination_id) between 1 and 200),
 draft_enabled boolean not null, publish_enabled boolean not null,
 decided_by uuid references public.profiles(id), decided_at timestamptz not null default now(),
 source text not null check(source in('migration','pairing','admin')),
 primary key(site_id,environment,destination_id), check(not publish_enabled or draft_enabled)
);
-- Older false values have no reliable provenance. Never turn these on in a migration.
insert into private.socialhero_destination_policies(site_id,environment,destination_id,draft_enabled,publish_enabled,source)
 select distinct t.site_id,t.environment,t.destination_id,true,coalesce(s.publish_enabled,false),'migration'
 from private.blog_tokens t left join private.socialhero_settings s using(site_id,environment)
 where t.destination_id is not null;
revoke all on private.socialhero_destination_policies from public,anon,authenticated;
grant select,insert,update on private.socialhero_destination_policies to dartspoint_app;
alter table private.socialhero_destination_policies enable row level security;
create policy backend on private.socialhero_destination_policies for all to dartspoint_app using(true) with check(true);

create table private.blog_taxonomy (
 site_id text not null, environment text not null,
 kind text not null check(kind in('author','category')),
 id text not null check(id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 name text not null check(length(trim(name)) between 1 and 100), active boolean not null default true,
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(site_id,environment,kind,id)
);
create unique index blog_taxonomy_name on private.blog_taxonomy(site_id,environment,kind,lower(name));
revoke all on private.blog_taxonomy from public,anon,authenticated;
grant select,insert,update on private.blog_taxonomy to dartspoint_app;
alter table private.blog_taxonomy enable row level security;
create policy backend on private.blog_taxonomy for all to dartspoint_app using(true) with check(true);

-- A draft reservation is not a public alias. Recover only genuinely published history.
alter table private.blog_slug_reservations add column is_public boolean not null default false;
update private.blog_slug_reservations s set is_public=true where exists(
 select 1 from public.blog_live l where l.post_id=s.post_id and l.locale=s.locale and l.slug=s.slug
) or exists(
 select 1 from private.audit_events a join private.blog_revisions r
 on r.post_id::text=a.subject and r.revision::text=a.data->>'revision'
 where a.action='blog.publish' and r.post_id=s.post_id
 and r.document->>'locale'=s.locale and r.document->>'slug'=s.slug
);
grant update(is_public) on private.blog_slug_reservations to dartspoint_app;

create table private.blog_publications (
 id uuid primary key, post_id uuid not null references private.blog_posts(id), revision bigint not null,
 site_id text not null, environment text not null, destination_id text,
 token_id uuid references private.blog_tokens(id), public_url text not null,
 proof_token text not null unique, state text not null check(state in('publishing','published','superseded')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 last_error_code text, verified_at timestamptz, created_at timestamptz not null default now(),
 unique(post_id,revision), foreign key(post_id,revision) references private.blog_revisions(post_id,revision)
);
create index blog_publications_pending on private.blog_publications(next_attempt_at) where state='publishing';
create index blog_live_paging on public.blog_live(site_id,environment,locale,published_at desc,post_id);
create index blog_posts_paging on private.blog_posts(site_id,environment,updated_at desc,id);
revoke all on private.blog_publications from public,anon,authenticated;
grant select,insert,update on private.blog_publications to dartspoint_app;
alter table private.blog_publications enable row level security;
create policy backend on private.blog_publications for all to dartspoint_app using(true) with check(true);
