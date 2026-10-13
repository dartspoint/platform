-- expand-only: old matches/receipts keep receive-v1 or bounded-latency-v2.
-- Persist the original server-derived window and transport binding before queuing.
alter table private.command_ingress add column connection_id uuid;
alter table private.command_ingress add column admission_window_ms integer not null default 0 check (admission_window_ms between 0 and 124);
