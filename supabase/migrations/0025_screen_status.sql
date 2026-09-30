-- What each screen is actually showing right now, as reported by its own
-- player — for the dashboard's live preview and Online/Offline.
--
-- This replaces an earlier attempt built on Realtime presence, which kept
-- missing screens coming and going: presence only knows what a websocket
-- tells it, and join/leave events that are lost while either side is
-- reconnecting are simply gone. Here the player writes a plain row instead
-- (on every slide/pause change, plus a heartbeat), and "offline" isn't an
-- event anyone has to deliver at all: it's a heartbeat that's gone quiet,
-- which the dashboard works out for itself. A TV that loses power sends
-- nothing, and that's exactly the case this has to catch.
--
-- One row per screen, last writer wins — a second player opened on the
-- same URL (say, a laptop checking it) just takes turns with the TV.
create table screen_status (
  screen_id bigint primary key references screens(id) on delete cascade,
  -- One per page load, so a closing page's "going away" (see
  -- report_screen_offline) can't clobber a newer page that's already
  -- reported in, e.g. across a reload.
  session_id uuid not null,
  -- Deliberately not a foreign key: a player can report an item that's
  -- deleted a moment later, and that report shouldn't fail.
  media_item_id uuid,
  paused boolean not null default false,
  last_seen_at timestamptz not null default now(),
  -- Set when a page closes cleanly (reload, tab closed) so it reads as
  -- offline straight away instead of after the heartbeat timeout. A power
  -- cut never gets this far — that's what the timeout is for.
  disconnected_at timestamptz
);

-- Same public-read rule as every other table the player and dashboard
-- read with the anon key. There's no write policy: the player (which has
-- no login) writes only through the two functions below.
alter table screen_status enable row level security;
create policy "public read screen_status" on screen_status for select using (true);

-- Realtime for immediacy only — the dashboard also polls, so a dropped
-- event costs a few seconds, never a wrong answer. Replica identity full
-- for the same reason as 0002.
alter publication supabase_realtime add table screen_status;
alter table screen_status replica identity full;

-- The dashboard reads through this view so staleness is measured on the
-- database's own clock: age_ms is how long ago the last report was, and
-- neither the TV's nor the dashboard's clock (either can be minutes out)
-- comes into it.
create view screen_status_live with (security_invoker = true) as
select
  screen_id,
  media_item_id,
  paused,
  disconnected_at is not null as disconnected,
  (extract(epoch from clock_timestamp() - last_seen_at) * 1000)::bigint as age_ms
from screen_status;

-- Called by the player on load, on every slide or pause change, and on a
-- heartbeat. Security definer so the anon key can write this one table,
-- and only through here. Anyone who can open a player URL can already
-- claim to be that screen, so this trusts the caller the same amount.
create or replace function report_screen_status(
  p_screen_id bigint,
  p_session_id uuid,
  p_media_item_id uuid,
  p_paused boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into screen_status (screen_id, session_id, media_item_id, paused, last_seen_at, disconnected_at)
  values (p_screen_id, p_session_id, p_media_item_id, p_paused, now(), null)
  on conflict (screen_id) do update set
    session_id = excluded.session_id,
    media_item_id = excluded.media_item_id,
    paused = excluded.paused,
    last_seen_at = excluded.last_seen_at,
    disconnected_at = null;
$$;

-- Sent as a page closes. Only applies if nothing newer has reported in
-- since — a reload's new page can easily get its first report in before
-- the old page's goodbye lands.
create or replace function report_screen_offline(p_screen_id bigint, p_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update screen_status
  set disconnected_at = now()
  where screen_id = p_screen_id and session_id = p_session_id;
$$;

grant execute on function report_screen_status(bigint, uuid, uuid, boolean) to anon;
grant execute on function report_screen_offline(bigint, uuid) to anon;
