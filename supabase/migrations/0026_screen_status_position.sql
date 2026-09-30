-- Where in the current video a screen's player is, so the dashboard's
-- preview can play in step with it — and, while paused, sit on the same
-- frame. Null for anything that isn't a video.
--
-- position_ms is read the moment the report is sent, and last_seen_at is
-- when it arrived, so "position now" is position_ms plus however long ago
-- that was (unless paused). The dashboard re-aligns on every report.
alter table screen_status add column position_ms integer;

create or replace view screen_status_live with (security_invoker = true) as
select
  screen_id,
  media_item_id,
  paused,
  disconnected_at is not null as disconnected,
  (extract(epoch from clock_timestamp() - last_seen_at) * 1000)::bigint as age_ms,
  position_ms
from screen_status;

-- Replaced rather than overloaded, with the new argument defaulted, so a
-- player still running the previous build (four arguments) keeps
-- reporting through this same function until it's reloaded.
drop function report_screen_status(bigint, uuid, uuid, boolean);

create function report_screen_status(
  p_screen_id bigint,
  p_session_id uuid,
  p_media_item_id uuid,
  p_paused boolean,
  p_position_ms integer default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into screen_status (screen_id, session_id, media_item_id, paused, position_ms, last_seen_at, disconnected_at)
  values (p_screen_id, p_session_id, p_media_item_id, p_paused, p_position_ms, now(), null)
  on conflict (screen_id) do update set
    session_id = excluded.session_id,
    media_item_id = excluded.media_item_id,
    paused = excluded.paused,
    position_ms = excluded.position_ms,
    last_seen_at = excluded.last_seen_at,
    disconnected_at = null;
$$;

grant execute on function report_screen_status(bigint, uuid, uuid, boolean, integer) to anon;
