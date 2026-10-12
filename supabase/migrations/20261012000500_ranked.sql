-- expand-only: keep competition mode separate from ranked policy.
alter table public.matches add column ranked boolean not null default false;
update public.matches set ranked=true where mode='ranked';
