-- expand-only: preserve issued unsubscribe links across later private exports.
create table private.launch_unsubscribe_tokens (
 token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
 subscription_id uuid not null references private.launch_subscriptions(id) on delete cascade,
 issued_at timestamptz not null default now()
);
revoke all on private.launch_unsubscribe_tokens from public,anon,authenticated;
grant select,insert,delete on private.launch_unsubscribe_tokens to dartspoint_app;
