-- expand-only: snapshot the alternating first starter of an accepted rematch.
alter table public.game_invites add column first_starter_id uuid references profiles(id);
