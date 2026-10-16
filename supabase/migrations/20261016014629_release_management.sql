-- expand-only: shared release cards, private histories and explicit public snapshots.
create table private.release_board(id smallint primary key check(id=1),revision bigint not null default 1 check(revision>0));
insert into private.release_board(id) values(1);
create table private.release_cards(
 id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
 title text not null check(length(btrim(title)) between 3 and 140),description text not null default '' check(length(description)<=3000),
 category text not null check(category in('game','community','tournaments','account','other')),
 status text not null default 'ideas' check(status in('ideas','considering','doing','added')),
 priority text not null default 'normal' check(priority in('low','normal','high')),
 source text not null check(source in('player','team')),submitter_id uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 version text not null default '' check(length(version)<=40),release_title text not null default '' check(length(release_title)<=140),
 release_summary text not null default '' check(length(release_summary)<=800),notes text not null default '' check(length(notes)<=5000),
 revision bigint not null default 1 check(revision>0),publication_id uuid,
 check(publication_id is null or status='added'),check(updated_at>=created_at)
);
create index release_cards_submitter on private.release_cards(submitter_id,number desc);
create index release_cards_status on private.release_cards(status,number desc);
create table private.release_publications(
 id uuid primary key default gen_random_uuid(),card_id uuid not null references private.release_cards(id) on delete cascade,
 number bigint not null,title text not null check(length(btrim(title)) between 3 and 140),
 summary text not null check(length(btrim(summary)) between 20 and 800),
 category text not null check(category in('game','community','tournaments','account','other')),
 version text not null default '' check(length(version)<=40),published_at timestamptz not null default now(),
 unique(card_id,id)
);
-- The composite reference prevents attaching another card's snapshot.
alter table private.release_cards add constraint release_card_own_publication foreign key(id,publication_id) references private.release_publications(card_id,id) deferrable initially deferred;
create index release_publications_card on private.release_publications(card_id);
create index release_publications_latest on private.release_publications(published_at desc,id desc);
create table private.release_history(
 id uuid primary key default gen_random_uuid(),card_id uuid not null references private.release_cards(id) on delete cascade,
 actor_id uuid references public.profiles(id),text text not null check(length(text) between 1 and 500),revision bigint not null check(revision>0),
 created_at timestamptz not null default now()
);
create index release_history_card on private.release_history(card_id,created_at desc);
create index release_history_actor on private.release_history(actor_id);
create index release_audit_latest on private.audit_events(id desc) where action like 'release.%';
alter table private.release_board enable row level security;
alter table private.release_cards enable row level security;
alter table private.release_publications enable row level security;
alter table private.release_history enable row level security;
create policy backend on private.release_board for all to dartspoint_app using(true) with check(true);
create policy backend on private.release_cards for all to dartspoint_app using(true) with check(true);
create policy backend on private.release_publications for select to dartspoint_app using(true);
create policy backend_insert on private.release_publications for insert to dartspoint_app with check(true);
create policy backend on private.release_history for select to dartspoint_app using(true);
create policy backend_insert on private.release_history for insert to dartspoint_app with check(true);
revoke all on private.release_board,private.release_cards,private.release_publications,private.release_history from public,anon,authenticated;
grant select,update on private.release_board to dartspoint_app;
grant select,insert,update on private.release_cards to dartspoint_app;
grant select,insert on private.release_publications,private.release_history to dartspoint_app;
grant usage,select on sequence private.release_cards_number_seq to dartspoint_app;

-- A once-only migration extends each current layout independently. Existing
-- drafts, ordering, audiences and archived publication revisions stay intact.
-- A later deliberately removed widget is never restored by a runtime default.
do $$
declare config private.lobby_configuration%rowtype;published jsonb;draft_next jsonb;published_next jsonb;
 widget jsonb:='{"id":"lobby-releases","type":"releases","enabled":true,"size":"wide","audience":{"mode":"all","roomIds":[]},"title":"Laatste toevoegingen","description":"DartsPoint blijft in beweging. Dit is er nieuw bijgekomen.","settings":{"releaseLimit":3,"allowIdeas":true}}'::jsonb;
begin
 select * into config from private.lobby_configuration where id=1 for update;
 if not found then return;end if;
 select layout into published from private.lobby_revisions where revision=config.published_revision;
 if exists(select 1 from jsonb_array_elements(config.draft->'widgets') w where w->>'id'=widget->>'id') or exists(select 1 from jsonb_array_elements(published->'widgets') w where w->>'id'=widget->>'id') then
  widget:=jsonb_set(widget,'{id}',to_jsonb('lobby-releases-'||gen_random_uuid()::text));
 end if;
 draft_next:=config.draft;
 if not exists(select 1 from jsonb_array_elements(config.draft->'widgets') w where w->>'type'='releases') and jsonb_array_length(config.draft->'widgets')<30 then
  draft_next:=jsonb_set(config.draft,'{widgets}',(config.draft->'widgets')||jsonb_build_array(widget));
 end if;
 published_next:=published;
 if published is not null and not exists(select 1 from jsonb_array_elements(published->'widgets') w where w->>'type'='releases') and jsonb_array_length(published->'widgets')<30 then
  published_next:=jsonb_set(published,'{widgets}',(published->'widgets')||jsonb_build_array(widget));
 end if;
 if published_next is distinct from published then
  insert into private.lobby_revisions(revision,layout) values(config.published_revision+1,published_next);
 end if;
 update private.lobby_configuration set draft=draft_next,draft_version=draft_version+case when draft_next is distinct from config.draft then 1 else 0 end,
  published_revision=published_revision+case when published_next is distinct from published then 1 else 0 end,
  published_at=case when published_next is distinct from published then now() else published_at end where id=1;
end $$;

-- The existing erasure function alone may insert an outcome after it has
-- validated the approved scope, live durable receipt and subject lock. Extend
-- that same transaction without changing account/match/chat erasure rules.
create function private.erase_release_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not(new.result->'scopes' ? 'account') then return new;end if;
 delete from private.release_cards where source='player' and submitter_id=new.user_id;
 update private.release_cards set submitter_id=null where submitter_id=new.user_id;
 update private.release_history set actor_id=null where actor_id=new.user_id;
 update private.release_board set revision=revision+1 where id=1;
 return new;
end $$;
revoke all on function private.erase_release_subject() from public,anon,authenticated,dartspoint_app;
create trigger erase_release_subject after insert on private.privacy_erasure_outcomes for each row execute function private.erase_release_subject();
