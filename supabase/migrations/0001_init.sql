-- Digital signage MVP schema
-- Auth model: writes only ever happen through the service_role key from
-- Server Actions (which check the app's own session cookie first), so RLS
-- here only needs to allow public SELECT and deny all writes to anon/authenticated.

create extension if not exists pgcrypto;

create type screen_orientation as enum ('landscape', 'portrait');
create type media_type as enum ('image', 'video', 'pdf');
create type fit_mode as enum ('contain', 'cover');

create table screens (
  id bigint generated always as identity primary key,
  name text not null default 'New Screen',
  orientation screen_orientation not null default 'landscape',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table media_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  storage_path text not null unique,
  media_type media_type not null,
  mime_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table playlist_items (
  id uuid primary key default gen_random_uuid(),
  screen_id bigint not null references screens(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  position int not null,
  duration_seconds int not null default 10,
  fit_mode fit_mode not null default 'contain',
  created_at timestamptz not null default now()
);

create index idx_playlist_items_screen_position on playlist_items(screen_id, position);
create index idx_media_items_folder on media_items(folder_id);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_screens_updated_at
before update on screens
for each row execute function set_updated_at();

-- Atomic reorder: caller passes the full new order of playlist_item ids for a screen.
create or replace function reorder_playlist_items(p_screen_id bigint, p_ids uuid[])
returns void language plpgsql as $$
declare
  i int;
begin
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update playlist_items set position = i - 1
    where id = p_ids[i] and screen_id = p_screen_id;
  end loop;
end;
$$;

-- Atomic multi-assign: appends selected media items to the end of a screen's playlist.
create or replace function assign_media_to_screen(p_screen_id bigint, p_media_ids uuid[])
returns void language plpgsql as $$
declare
  next_pos int;
  mid uuid;
begin
  select coalesce(max(position), -1) + 1 into next_pos
  from playlist_items where screen_id = p_screen_id;

  foreach mid in array p_media_ids loop
    insert into playlist_items (screen_id, media_item_id, position)
    values (p_screen_id, mid, next_pos);
    next_pos := next_pos + 1;
  end loop;
end;
$$;

alter table screens enable row level security;
alter table folders enable row level security;
alter table media_items enable row level security;
alter table playlist_items enable row level security;

-- Public read on everything: the unauthenticated player and Realtime both
-- need it. Writes have no policy at all, so they're denied for anon/authenticated
-- by default -- all mutations go through the service_role key server-side.
create policy "public read screens" on screens for select using (true);
create policy "public read folders" on folders for select using (true);
create policy "public read media_items" on media_items for select using (true);
create policy "public read playlist_items" on playlist_items for select using (true);

alter publication supabase_realtime add table screens;
alter publication supabase_realtime add table playlist_items;
