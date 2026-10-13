-- expand-only: typed membership visits and editable private moderation rules.
alter table public.profiles add column rename_required boolean not null default false;
alter table public.room_memberships add column visit_id uuid not null default gen_random_uuid();
alter table public.chat_messages alter column sender_id drop not null;
alter table public.chat_messages alter column client_message_id drop not null;
alter table public.chat_messages add column kind text not null default 'human' check(kind in ('human','room.member_joined'));
alter table public.chat_messages add column event_id uuid;
alter table public.chat_messages add column actor_id uuid references public.profiles(id);
alter table public.chat_messages add column actor_name text;
alter table public.chat_messages add column room_id uuid references public.community_rooms(id);
alter table public.chat_messages add column normalized_body text;
alter table public.chat_messages add constraint chat_message_kind_context check (
 (kind='human' and sender_id is not null and client_message_id is not null and event_id is null)
 or (kind='room.member_joined' and sender_id is null and client_message_id is null and event_id is not null and actor_id is not null and actor_name is not null and room_id is not null)
);
create unique index chat_membership_visit_event on public.chat_messages(event_id) where event_id is not null;
create index chat_sender_created on public.chat_messages(sender_id,created_at desc) where kind='human';
create table private.room_visits(
 id uuid primary key, user_id uuid not null references public.profiles(id),room_id uuid not null references public.community_rooms(id),created_at timestamptz not null default now()
);
create index room_visit_budget on private.room_visits(user_id,created_at desc);
create table private.content_filter_rules (
 id uuid primary key default gen_random_uuid(), seed_key text unique,
 term text not null check(length(term) between 1 and 80),category text not null check(length(category) between 1 and 80),
 scope text not null check(scope in ('chat','name','both')),
 match_type text not null check(match_type in ('word','phrase','name-prefix','exact')),
 aliases jsonb not null default '[]'::jsonb check(jsonb_typeof(aliases)='array'),
 active boolean not null default true,allow boolean not null default false,
 description text not null check(length(description) between 1 and 300),version bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table private.room_visits enable row level security;
alter table private.content_filter_rules enable row level security;
create policy backend on private.room_visits for all to dartspoint_app using(true) with check(true);
create policy backend on private.content_filter_rules for all to dartspoint_app using(true) with check(true);
revoke all on private.room_visits,private.content_filter_rules from public,anon,authenticated;
grant select,insert on private.room_visits to dartspoint_app;
grant select,insert,update on private.content_filter_rules to dartspoint_app;
insert into private.system_settings(key,data) values('content-filter','{}') on conflict(key) do nothing;
update private.system_settings set data=jsonb_set(data,'{platform}',jsonb_build_object('chatBurstCount',3,'chatBurstSeconds',2,'chatDuplicateSeconds',2) || coalesce(data->'platform','{}'::jsonb)) where key='settings';
-- Stable seed keys only insert missing rules: future seeds never overwrite admin edits.
insert into private.content_filter_rules(seed_key,term,category,scope,match_type,description)
select 'chat-word:'||word,word,category,'chat','word','Volledig woord; Unicode/case en gecontroleerde eenvoudige ontwijkvormen.'
from (values
 ('geil','Seksueel/grof'),('geile','Seksueel/grof'),('geilheid','Seksueel/grof'),('seks','Seksueel/grof'),('sex','Seksueel/grof'),('sexy','Seksueel/grof'),('porno','Seksueel/grof'),('porn','Seksueel/grof'),('neuken','Seksueel/grof'),('neuk','Seksueel/grof'),('geneukt','Seksueel/grof'),('pijpen','Seksueel/grof'),('beffen','Seksueel/grof'),('aftrekken','Seksueel/grof'),('klaarkomen','Seksueel/grof'),('hoer','Seksueel/grof'),('slet','Seksueel/grof'),
 ('kanker','Schelden/ziekte'),('kankerlijer','Schelden/ziekte'),('kankerzooi','Schelden/ziekte'),('tyfus','Schelden/ziekte'),('tering','Schelden/ziekte'),('kut','Schelden/ziekte'),('lul','Schelden/ziekte'),('klootzak','Schelden/ziekte'),('eikel','Schelden/ziekte'),('fuck','Schelden/ziekte'),('fucking','Schelden/ziekte')
) words(word,category) on conflict(seed_key) do nothing;
insert into private.content_filter_rules(seed_key,term,category,scope,match_type,description)
select 'name-prefix:'||term,term,category,'name','name-prefix','Expliciete samengestelde naam: dit woord aan het begin van de gebruikersnaam.' from private.content_filter_rules where seed_key like 'chat-word:%' on conflict(seed_key) do nothing;
insert into private.content_filter_rules(seed_key,term,category,scope,match_type,description)
select 'chat-phrase:'||phrase,phrase,'Ernstige verwensing/bedreiging','chat','phrase','Expliciete woordgroep; geen automatische ban.' from (values ('krijg kanker'),('ga dood'),('ik maak je dood')) phrases(phrase) on conflict(seed_key) do nothing;
insert into private.content_filter_rules(seed_key,term,category,scope,match_type,description,allow)
values('allow:essex','Essex','Geldige plaats/naam','both','word','Expliciete uitzondering voor Essex; overige woorden in dezelfde tekst worden wel beoordeeld.',true) on conflict(seed_key) do nothing;
