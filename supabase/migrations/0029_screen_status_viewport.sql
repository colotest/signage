-- The size each screen's player lays its page out at, in CSS pixels, so
-- the dashboard's preview can draw the empty-screen placeholder at the
-- same proportions the TV shows it. A 1080p TV whose browser scales by 2×
-- lays out at 960×540, and everything on it comes out twice as large as
-- on one that doesn't.
--
-- Sent once per page load, separately from the heartbeat, which never
-- touches these columns — so they survive every report in between.
alter table screen_status
  add column viewport_width integer,
  add column viewport_height integer;

create or replace view screen_status_live with (security_invoker = true) as
select
  screen_id,
  media_item_id,
  paused,
  disconnected_at is not null as disconnected,
  (extract(epoch from clock_timestamp() - last_seen_at) * 1000)::bigint as age_ms,
  position_ms,
  viewport_width,
  viewport_height
from screen_status;

-- Called right after the player's first status report has landed, so its
-- row is already there. Matching the session keeps a player that's been
-- superseded (an old tab left open) from overwriting the current one's.
create function report_screen_viewport(
  p_screen_id bigint,
  p_session_id uuid,
  p_width integer,
  p_height integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update screen_status
  set viewport_width = p_width, viewport_height = p_height
  where screen_id = p_screen_id and session_id = p_session_id;
$$;

grant execute on function report_screen_viewport(bigint, uuid, integer, integer) to anon;
