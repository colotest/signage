-- Lets a screen's player see its own pending timers, so it can preload the
-- timed playlist's media about a minute ahead and switch over locally on
-- the dot, instead of only reacting once run_due_scheduled_playbacks (see
-- 0011) has swapped playlist_items a few seconds later.

-- Same public-read rule as every other table the unauthenticated player
-- reads; writes stay service_role-only.
create policy "public read scheduled_playbacks" on scheduled_playbacks for select using (true);

-- Realtime, so a timer set, moved or cancelled reaches an already-running
-- player. Replica identity full for the same reason as 0002: filtered
-- DELETE events (a cancelled or fired timer) otherwise don't get through.
alter publication supabase_realtime add table scheduled_playbacks;
alter table scheduled_playbacks replica identity full;

-- The database's own clock, for the player to measure how far off its
-- device clock is — a TV's clock can easily drift by seconds or more, and
-- switching "on time" means on the server's time, which is also what the
-- timers are fired against.
create or replace function server_now()
returns timestamptz language sql volatile as $$
  select clock_timestamp()
$$;
