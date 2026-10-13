-- expand-only: keep edits discoverable by a reconnecting chat consumer.
-- Original seq remains the immutable message order; change_cursor belongs to
-- the same channel sequence and advances only for an actual moderation edit.
alter table public.chat_messages add column change_cursor bigint
 check(change_cursor is null or change_cursor>=seq);
create index chat_message_changes on public.chat_messages(channel_id,(coalesce(change_cursor,seq)));
