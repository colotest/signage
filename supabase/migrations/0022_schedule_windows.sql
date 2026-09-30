-- Timed playback gets a length. A timer now reserves its screen from run_at
-- until ends_at, and no other playlist can be scheduled on that screen for
-- any part of that window until this one is cancelled. The window only
-- reserves: when it ends, nothing changes on screen — the playlist simply
-- keeps playing until something else replaces it.
--
-- Because the reservation outlives the moment the timer fires, a fired
-- timer is no longer deleted (0011): it's marked fired_at and kept until its
-- window is over, so it still blocks overlapping schedules — and still shows
-- in the Playback Menu's Calendar as playing now.

alter table scheduled_playbacks add column ends_at timestamptz;
alter table scheduled_playbacks add column fired_at timestamptz;

-- Anything already pending gets a 4-hour window, cut short where it would
-- run into the next timer on the same screen, so the rule below can apply.
update scheduled_playbacks s
set ends_at = coalesce(least(s.run_at + interval '4 hours', nxt.next_run), s.run_at + interval '4 hours')
from (
  select id, lead(run_at) over (partition by screen_id order by run_at) as next_run
  from scheduled_playbacks
) nxt
where nxt.id = s.id;

alter table scheduled_playbacks alter column ends_at set not null;
alter table scheduled_playbacks
  add constraint scheduled_playbacks_window_positive check (ends_at > run_at);

-- No two windows on the same screen may overlap. Enforced here rather than
-- only in the dashboard, so two people scheduling at once can't both win.
-- (btree_gist lets the plain screen_id equality share a GiST index with the
-- range overlap.)
create extension if not exists btree_gist;
alter table scheduled_playbacks
  add constraint scheduled_playbacks_no_overlap
  exclude using gist (screen_id with =, tstzrange(run_at, ends_at) with &&);

-- Same swap as before, with the new bookkeeping: windows that have run
-- their course free their screen first, then each due, unfired timer
-- replaces Now Playing and is marked fired rather than deleted.
create or replace function run_due_scheduled_playbacks()
returns int language plpgsql as $$
declare
  due record;
  ran int := 0;
begin
  delete from scheduled_playbacks where ends_at <= now();

  for due in
    select * from scheduled_playbacks
    where fired_at is null and run_at <= now()
    order by run_at
    for update skip locked
  loop
    delete from playlist_items where screen_id = due.screen_id;

    insert into playlist_items (screen_id, media_item_id, position, duration_seconds)
    select
      due.screen_id,
      e.media_item_id,
      (row_number() over (order by e.position, e.created_at) - 1)::int,
      e.duration_seconds
    from playlist_entries e
    where e.playlist_id = due.playlist_id;

    update scheduled_playbacks set fired_at = now() where id = due.id;
    ran := ran + 1;
  end loop;
  return ran;
end;
$$;
