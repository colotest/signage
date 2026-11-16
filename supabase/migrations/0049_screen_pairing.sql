-- Pairing a TV with a screen, so the player can stop being open to anyone
-- who guesses /screen/<id>.
--
-- A TV that isn't paired asks for a code (screen_pairings): it shows the
-- code, and holds a secret for it in a cookie. Someone on the dashboard
-- types the code into that screen's wrench menu, which claims it for the
-- screen. The TV, still asking, then trades its code and secret for a
-- device of its own (screen_devices) and a long-lived cookie naming it.
-- Only hashes of the secrets are stored.
--
-- Neither table is readable with the anon key: no policies, so only the
-- service role (the Server Actions and route handlers) touches them.

create table screen_pairings (
  code text primary key,
  secret_hash text not null,
  -- Set once the code has been entered on the dashboard.
  screen_id bigint references screens(id) on delete cascade,
  claimed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table screen_devices (
  id uuid primary key default gen_random_uuid(),
  screen_id bigint not null references screens(id) on delete cascade,
  secret_hash text not null,
  -- What it is, roughly (from its user agent), to tell two TVs apart.
  label text,
  paired_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index idx_screen_devices_screen on screen_devices(screen_id, created_at);

alter table screen_pairings enable row level security;
alter table screen_devices enable row level security;

-- A paired TV talks to the database with a token of its own (role
-- "authenticated", see src/lib/supabase/token.ts) rather than the anon key,
-- so the status reports it sends need that role too.
grant execute on function report_screen_status(bigint, uuid, uuid, boolean, integer) to authenticated;
grant execute on function report_screen_offline(bigint, uuid) to authenticated;
grant execute on function report_screen_viewport(bigint, uuid, integer, integer) to authenticated;
