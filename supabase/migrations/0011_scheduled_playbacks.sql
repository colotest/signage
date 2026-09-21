-- One-off timed playback: at run_at, a screen's playlist_items (its "Now
-- Playing") is emptied and replaced wholesale with a library playlist's
-- entries, in their order and with their durations. A playlist can hold at
-- most one pending timer per screen — setting a new time replaces it.
create table scheduled_playbacks (
  id uuid primary key default gen_random_uuid(),
  screen_id bigint not null references screens(id) on delete cascade,
  playlist_id uuid not null references playlists(id) on delete cascade,
  run_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (screen_id, playlist_id)
);

create index idx_scheduled_playbacks_run_at on scheduled_playbacks(run_at);

-- Only the dashboard (service_role) ever reads or writes these; the player
-- just sees the resulting playlist_items change over Realtime as usual.
alter table scheduled_playbacks enable row level security;

-- Fires every timer that's come due, oldest first — so if two for the same
-- screen are both overdue (say the cron job was paused), the later one is
-- what's left playing. Each timer is deleted once it's run, which is what
-- turns its countdown back into the alarm clock on the dashboard. SKIP
-- LOCKED keeps the cron job and a dashboard-triggered run (see
-- runDueScheduledPlaybacks) from both firing the same timer.
create or replace function run_due_scheduled_playbacks()
returns int language plpgsql as $$
declare
  due record;
  ran int := 0;
begin
  for due in
    select * from scheduled_playbacks
    where run_at <= now()
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

    delete from scheduled_playbacks where id = due.id;
    ran := ran + 1;
  end loop;
  return ran;
end;
$$;

-- What fires timers when no dashboard is open to do it. Every 5 seconds
-- (pg_cron 1.5+ accepts second intervals), so a screen switches within ~5s
-- of its time even unattended; an open dashboard fires it on the dot
-- itself. Re-running this migration just updates the job (same name).
create extension if not exists pg_cron;

select cron.schedule(
  'run-due-scheduled-playbacks',
  '5 seconds',
  $$select run_due_scheduled_playbacks()$$
);
