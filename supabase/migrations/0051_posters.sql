-- Posters: one event's poster as a single thing in the library, in three
-- files — the A1 PDF for print, a 9:16 PNG for the portrait screens and a
-- 16:9 PNG for the newsletter. The poster is what sits in a folder, moves
-- and is deleted; its files live in it (folder_id null, like a PDF's
-- pages in their deck), each an ordinary deck or media item, so the
-- screen PNG goes in a playlist like any other image.
create table posters (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  -- What a feed made it from, and a hash of what went in (as on decks,
  -- 0049): Kultur Poster's are "wix-event:<event id>".
  source_key text unique,
  source_hash text,
  uploaded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_posters_folder on posters(folder_id);

-- A poster's files die with it, which cascades them off any playlist or
-- screen showing them.
alter table decks
  add column poster_id uuid references posters(id) on delete cascade;
alter table media_items
  add column poster_id uuid references posters(id) on delete cascade,
  add column poster_part text check (poster_part in ('screen', 'newsletter'));

-- One A1 PDF per poster, and one of each image.
create unique index decks_poster on decks(poster_id) where poster_id is not null;
create unique index media_items_poster_part on media_items(poster_id, poster_part) where poster_id is not null;

alter table posters enable row level security;

-- Same public-read rule as decks (0019); writes stay service_role-only.
create policy "public read posters" on posters for select using (true);

-- And live, as decks are (0020): moving a poster touches only this table.
alter publication supabase_realtime add table posters;
