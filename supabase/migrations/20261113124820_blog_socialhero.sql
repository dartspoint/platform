-- expand-only blog drafts, immutable revisions, atomic public projection and integration receipts.
create table private.blog_posts (
 id uuid primary key default gen_random_uuid(), site_id text not null, environment text not null,
 external_id text, source text not null check(source in('redactie','socialhero')),
 draft_revision bigint not null default 0, published_revision bigint,
 published_at timestamptz, updated_at timestamptz not null default now(),
 unique(site_id,environment,external_id)
);
create table private.blog_revisions (
 post_id uuid not null references private.blog_posts(id), revision bigint not null check(revision>0),
 document jsonb not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 primary key(post_id,revision)
);
alter table private.blog_posts add constraint blog_draft_revision foreign key(id,draft_revision) references private.blog_revisions(post_id,revision) deferrable initially deferred;
alter table private.blog_posts add constraint blog_live_revision foreign key(id,published_revision) references private.blog_revisions(post_id,revision) deferrable initially deferred;
create table private.blog_slug_reservations (
 site_id text not null, environment text not null, locale text not null check(locale in('nl-NL','en-GB')),
 slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), post_id uuid not null references private.blog_posts(id),
 primary key(site_id,environment,locale,slug)
);
create table private.blog_tokens (
 id uuid primary key default gen_random_uuid(), site_id text not null, environment text not null,
 label text not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), scopes text[] not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz
);
create table private.blog_operation_receipts (
 site_id text not null, environment text not null, principal text not null, operation text not null, key text not null,
 fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(site_id,environment,principal,operation,key)
);
-- Existing lobby media stores landscape-specific variants. Blog originals retain independent true dimensions.
create table private.blog_media (
 id uuid primary key default gen_random_uuid(), site_id text not null, environment text not null,
 created_by uuid references public.profiles(id), token_id uuid references private.blog_tokens(id),
 mime text not null check(mime='image/webp'), image_data bytea not null,
 width integer not null check(width between 1 and 12000), height integer not null check(height between 1 and 12000),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
 check(octet_length(image_data) between 1 and 8388608), check(width::bigint*height<=50000000)
);
create table private.blog_media_references (
 asset_id uuid not null references private.blog_media(id), post_id uuid not null, revision bigint not null,
 primary key(asset_id,post_id,revision), foreign key(post_id,revision) references private.blog_revisions(post_id,revision)
);
-- This table contains only canonical live snapshots: no draft, tokens, receipts or authors' private fields.
create table public.blog_live (
 post_id uuid primary key references private.blog_posts(id), site_id text not null, environment text not null,
 locale text not null check(locale in('nl-NL','en-GB')), slug text not null, revision bigint not null,
 article jsonb not null, published_at timestamptz not null,
 unique(site_id,environment,locale,slug)
);
revoke all on private.blog_posts,private.blog_revisions,private.blog_slug_reservations,private.blog_tokens,private.blog_operation_receipts,private.blog_media,private.blog_media_references,public.blog_live from public,anon,authenticated;
grant select,insert,update on private.blog_posts,private.blog_tokens to dartspoint_app;
grant select,insert on private.blog_revisions,private.blog_slug_reservations,private.blog_operation_receipts,private.blog_media,private.blog_media_references to dartspoint_app;
grant select,insert,update,delete on public.blog_live to dartspoint_app;
grant select on public.blog_live to anon,authenticated;
alter table private.blog_posts enable row level security;
alter table private.blog_revisions enable row level security;
alter table private.blog_slug_reservations enable row level security;
alter table private.blog_tokens enable row level security;
alter table private.blog_operation_receipts enable row level security;
alter table private.blog_media enable row level security;
alter table private.blog_media_references enable row level security;
alter table public.blog_live enable row level security;
create policy backend on private.blog_posts for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_revisions for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_slug_reservations for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_tokens for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_operation_receipts for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_media for all to dartspoint_app using(true) with check(true);
create policy backend on private.blog_media_references for all to dartspoint_app using(true) with check(true);
create policy backend on public.blog_live for all to dartspoint_app using(true) with check(true);
create policy public_live on public.blog_live for select to anon,authenticated using(true);
create index blog_posts_scope on private.blog_posts(site_id,environment,updated_at desc);
create index blog_media_references_public on private.blog_media_references(post_id,revision,asset_id);
create table private.blog_translation_pairs (
 nl_post_id uuid primary key references private.blog_posts(id), en_post_id uuid not null unique references private.blog_posts(id),
 check(nl_post_id<>en_post_id)
);
revoke all on private.blog_translation_pairs from public,anon,authenticated;
grant select,insert on private.blog_translation_pairs to dartspoint_app;
alter table private.blog_translation_pairs enable row level security;
create policy backend on private.blog_translation_pairs for all to dartspoint_app using(true) with check(true);
alter table private.blog_media add column color text check(color ~ '^#[a-f0-9]{6}$');
