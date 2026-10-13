-- Screen groups, and playback setups that only go on air when committed.
--
-- Until now a Playback Menu edited a screen's live state directly: every
-- change to Now Playing or the playback settings reached the TV at once.
-- With groups that stops working — a screen can be set up one way on its
-- own and another way as part of a group, and both setups have to survive
-- side by side. So:
--
--   * Every screen and every group owns one *setup*: its playlist plus the
--     settings in its Playback Menu (background, transition, speed, slide
--     direction). Menus edit only their setup; nothing reaches a TV yet.
--   * Committing a setup (the menu's checkmark — see commit_setup) copies it
--     onto the screen's live state, or onto every member's for a group, and
--     records on each screen which setup is now live.
--   * The other setups are left exactly as they were, so any of them can be
--     committed again later to take the screen back.
--
-- The live state is the same playlist_items and screens columns as before,
-- so the player doesn't change at all.

-- --- Groups ------------------------------------------------------------------

create table screen_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New Group',
  -- The arrangement grid on the group's tile (see slot below). Sized from
  -- the wrench menu; always big enough to hold every member.
  grid_rows int not null default 1 check (grid_rows between 1 and 12),
  grid_cols int not null default 1 check (grid_cols between 1 and 12),
  -- What the group card's Fit/Fill pill last set on every member — a card
  -- control like a screen's own, so it applies at once rather than on commit.
  fit_mode fit_mode not null default 'contain',
  -- Shares one ordering with screens.position: groups and screens are
  -- dragged around the same dashboard grid (see reorder_dashboard).
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Any screen can belong to any number of groups.
create table screen_group_members (
  group_id uuid not null references screen_groups(id) on delete cascade,
  screen_id bigint not null references screens(id) on delete cascade,
  -- Which cell of the group's grid the screen sits in, row by row from the
  -- top left (row * grid_cols + col).
  slot int not null check (slot >= 0),
  created_at timestamptz not null default now(),
  primary key (group_id, screen_id),
  -- Deferred, so two members can swap cells inside one statement batch.
  constraint screen_group_members_slot_unique unique (group_id, slot) deferrable initially deferred
);

create index idx_screen_group_members_screen on screen_group_members(screen_id);

-- --- Setups --------------------------------------------------------------------

create table setups (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one owner: a screen's own setup, or a group's.
  screen_id bigint unique references screens(id) on delete cascade,
  group_id uuid unique references screen_groups(id) on delete cascade,
  background screen_background not null default 'black',
  transition screen_transition not null default 'cut',
  transition_speed screen_transition_speed not null default 'normal',
  slide_direction screen_slide_direction not null default 'right',
  committed_at timestamptz,
  constraint setups_one_owner check (num_nonnulls(screen_id, group_id) = 1)
);

create table setup_items (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid not null references setups(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  position int not null,
  duration_seconds int not null default 10,
  created_at timestamptz not null default now()
);

create index idx_setup_items_setup_position on setup_items(setup_id, position);

-- Which setup was last committed onto this screen — its own, or one of its
-- groups'. A member reads as out of sync with a group whenever this isn't
-- that group's setup. Null for a screen whose setup was deleted with its
-- group (it keeps playing what it had).
alter table screens add column live_setup_id uuid references setups(id) on delete set null;

-- Every screen has its setup from the start, seeded from what it's
-- currently showing, so opening its menu shows exactly what's on air.
insert into setups (screen_id, background, transition, transition_speed, slide_direction, committed_at)
select id, background, transition, transition_speed, slide_direction, now() from screens;

insert into setup_items (setup_id, media_item_id, position, duration_seconds, created_at)
select s.id, p.media_item_id, p.position, p.duration_seconds, p.created_at
from playlist_items p
join setups s on s.screen_id = p.screen_id;

update screens set live_setup_id = s.id from setups s where s.screen_id = screens.id;

-- New screens and groups get theirs automatically. A new screen's setup is
-- what it's already showing (nothing), so it starts out live, too.
create or replace function create_screen_setup()
returns trigger language plpgsql as $$
declare new_setup uuid;
begin
  insert into setups (screen_id, background, transition, transition_speed, slide_direction, committed_at)
  values (new.id, new.background, new.transition, new.transition_speed, new.slide_direction, now())
  returning id into new_setup;
  update screens set live_setup_id = new_setup where id = new.id;
  return null;
end;
$$;

create trigger trg_screens_create_setup
after insert on screens
for each row execute function create_screen_setup();

create or replace function create_group_setup()
returns trigger language plpgsql as $$
begin
  insert into setups (group_id) values (new.id);
  return null;
end;
$$;

create trigger trg_screen_groups_create_setup
after insert on screen_groups
for each row execute function create_group_setup();

-- --- Committing ----------------------------------------------------------------

-- Puts a setup on air: on its screen, or on every screen in its group. Each
-- target's Now Playing is replaced with the setup's items and its playback
-- settings with the setup's, in one transaction, so a player never catches
-- it half-applied. Other setups are untouched.
create or replace function commit_setup(p_setup_id uuid)
returns void language plpgsql as $$
declare
  s setups;
  target bigint;
begin
  select * into s from setups where id = p_setup_id for update;
  if not found then
    raise exception 'Setup % not found', p_setup_id;
  end if;

  for target in
    select s.screen_id where s.screen_id is not null
    union
    select m.screen_id from screen_group_members m where m.group_id = s.group_id
  loop
    delete from playlist_items where screen_id = target;

    insert into playlist_items (screen_id, media_item_id, position, duration_seconds)
    select
      target,
      i.media_item_id,
      (row_number() over (order by i.position, i.created_at) - 1)::int,
      i.duration_seconds
    from setup_items i
    where i.setup_id = s.id;

    update screens set
      background = s.background,
      transition = s.transition,
      transition_speed = s.transition_speed,
      slide_direction = s.slide_direction,
      live_setup_id = s.id
    where id = target;
  end loop;

  update setups set committed_at = now() where id = s.id;
end;
$$;

-- Same as reorder_playlist_items, for a setup's items.
create or replace function reorder_setup_items(p_setup_id uuid, p_ids uuid[])
returns void language plpgsql as $$
declare i int;
begin
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update setup_items set position = i - 1
    where id = p_ids[i] and setup_id = p_setup_id;
  end loop;
end;
$$;

-- --- Arranging -----------------------------------------------------------------

-- Screens and groups share the dashboard grid's one ordering. Keys are
-- 's:<screen id>' or 'g:<group id>', in their new order.
create or replace function reorder_dashboard(p_keys text[])
returns void language plpgsql as $$
declare
  i int;
  k text;
begin
  for i in 1..coalesce(array_length(p_keys, 1), 0) loop
    k := p_keys[i];
    if left(k, 2) = 's:' then
      update screens set position = i - 1 where id = substring(k from 3)::bigint;
    elsif left(k, 2) = 'g:' then
      update screen_groups set position = i - 1 where id = substring(k from 3)::uuid;
    end if;
  end loop;
end;
$$;

-- Drops a member into a cell of its group's grid; whoever was there takes
-- the dragged screen's old cell.
create or replace function move_group_member(p_group_id uuid, p_screen_id bigint, p_slot int)
returns void language plpgsql as $$
declare old_slot int;
begin
  select slot into old_slot from screen_group_members
  where group_id = p_group_id and screen_id = p_screen_id
  for update;
  if not found or old_slot = p_slot then
    return;
  end if;
  update screen_group_members set slot = old_slot where group_id = p_group_id and slot = p_slot;
  update screen_group_members set slot = p_slot where group_id = p_group_id and screen_id = p_screen_id;
end;
$$;

-- --- Timed playback --------------------------------------------------------------

-- A timer belongs to its screen's own menu, so firing it now counts as
-- that menu committing: the timed playlist replaces the screen's own setup
-- as well as what's on air, and the screen's own setup becomes the live
-- one. Otherwise the same as 0022.
create or replace function run_due_scheduled_playbacks()
returns int language plpgsql as $$
declare
  due record;
  own_setup uuid;
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

    select id into own_setup from setups where screen_id = due.screen_id;
    if own_setup is not null then
      delete from setup_items where setup_id = own_setup;
      insert into setup_items (setup_id, media_item_id, position, duration_seconds)
      select own_setup, p.media_item_id, p.position, p.duration_seconds
      from playlist_items p
      where p.screen_id = due.screen_id;
      update setups set committed_at = now() where id = own_setup;
      update screens set live_setup_id = own_setup where id = due.screen_id;
    end if;

    update scheduled_playbacks set fired_at = now() where id = due.id;
    ran := ran + 1;
  end loop;
  return ran;
end;
$$;

-- --- Access and realtime -----------------------------------------------------------

-- Same rule as every other table: public reads (Realtime needs them to
-- deliver changes to the dashboard's anon-key client), writes only through
-- Server Actions with the service role.
alter table screen_groups enable row level security;
alter table screen_group_members enable row level security;
alter table setups enable row level security;
alter table setup_items enable row level security;
create policy "public read screen_groups" on screen_groups for select using (true);
create policy "public read screen_group_members" on screen_group_members for select using (true);
create policy "public read setups" on setups for select using (true);
create policy "public read setup_items" on setup_items for select using (true);

-- So another person's edits reach every open dashboard (useLiveRefresh).
-- Replica identity full for the same reason as 0002.
alter publication supabase_realtime add table screen_groups;
alter publication supabase_realtime add table screen_group_members;
alter publication supabase_realtime add table setups;
alter publication supabase_realtime add table setup_items;
alter table screen_groups replica identity full;
alter table screen_group_members replica identity full;
alter table setups replica identity full;
alter table setup_items replica identity full;
