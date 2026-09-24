-- PDF decks: a PDF uploaded to the library is split, in the uploader's own
-- browser, into one image per page. The images are ordinary media_items —
-- so a page carries its own duration, order and deletion inside a playlist
-- exactly like any other file, and the player just shows an image, never
-- running pdf.js on a set-top box — while this table keeps the original
-- PDF itself, for re-downloading and for replacing the deck later.
create table decks (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  -- The original PDF in the same `media` bucket as everything else.
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  page_count int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_decks_folder on decks(folder_id);

-- A page belongs to its deck and dies with it: deleting a deck removes its
-- pages, which in turn cascades through playlist_entries/playlist_items,
-- taking them off any screen or playlist showing them. deck_position is the
-- page's place in the PDF, and stays fixed even when a page is deleted.
alter table media_items
  add column deck_id uuid references decks(id) on delete cascade,
  add column deck_position int;

create index idx_media_items_deck on media_items(deck_id, deck_position);

alter table decks enable row level security;

-- Same public-read rule as every other table (see 0001): the player reads
-- pages through media_items, and writes stay service_role-only.
create policy "public read decks" on decks for select using (true);
