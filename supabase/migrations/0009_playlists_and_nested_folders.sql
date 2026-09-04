-- Nested folders: null parent_id = root level. Cascades so deleting a
-- folder removes its subtree of folders too; media_items.folder_id already
-- ON DELETE SET NULL, so files inside a deleted folder become unsorted
-- rather than being deleted (existing behavior, preserved for nested folders).
alter table folders add column parent_id uuid references folders(id) on delete cascade;
create index idx_folders_parent on folders(parent_id);

-- Reusable, named playlists — independent of any screen. Deliberately
-- separate tables from screens' playlist_items (which stay exactly as they
-- are) to avoid conflating "what a screen is currently showing" with "a
-- reusable saved list of content."
create table playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New Playlist',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table playlist_entries (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  position int not null,
  duration_seconds int not null default 10,
  created_at timestamptz not null default now()
);

create index idx_playlist_entries_playlist_position on playlist_entries(playlist_id, position);

alter table playlists enable row level security;
alter table playlist_entries enable row level security;
create policy "public read playlists" on playlists for select using (true);
create policy "public read playlist_entries" on playlist_entries for select using (true);

-- Same atomic-reorder / atomic-append pattern as reorder_playlist_items /
-- assign_media_to_screen in 0001_init.sql, just retargeted at playlists.
create or replace function reorder_playlists(p_ids uuid[])
returns void language plpgsql as $$
declare i int;
begin
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update playlists set position = i - 1 where id = p_ids[i];
  end loop;
end;
$$;

create or replace function reorder_playlist_entries(p_playlist_id uuid, p_ids uuid[])
returns void language plpgsql as $$
declare i int;
begin
  for i in 1..coalesce(array_length(p_ids, 1), 0) loop
    update playlist_entries set position = i - 1
    where id = p_ids[i] and playlist_id = p_playlist_id;
  end loop;
end;
$$;

-- Appends; no uniqueness constraint on (playlist_id, media_item_id) — the
-- same file can be added multiple times, same as screens' playlist_items.
create or replace function add_media_to_playlist(p_playlist_id uuid, p_media_ids uuid[])
returns void language plpgsql as $$
declare next_pos int; mid uuid;
begin
  select coalesce(max(position), -1) + 1 into next_pos from playlist_entries where playlist_id = p_playlist_id;
  foreach mid in array p_media_ids loop
    insert into playlist_entries (playlist_id, media_item_id, position) values (p_playlist_id, mid, next_pos);
    next_pos := next_pos + 1;
  end loop;
end;
$$;
