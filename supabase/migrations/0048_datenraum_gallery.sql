-- The Datenraum's picture collection (/datenraum, "Bildersammlung"): media
-- library images picked for it, each with its tags (what the page's
-- filters sort by — keys from src/lib/datenraumGallery.ts) and, where
-- known, the event it was taken at and the day. Removing a picture from
-- the collection leaves the file in the library; deleting the file drops
-- it from the collection.
create table datenraum_gallery (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null unique references media_items(id) on delete cascade,
  tags text[] not null default '{}',
  event_name text,
  taken_on date,
  position int not null default 0,
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_datenraum_gallery_position on datenraum_gallery(position, created_at);

-- Read by anyone (the page is public); written only through the Server
-- Actions, with the service role, like everything else.
alter table datenraum_gallery enable row level security;
create policy "public read datenraum_gallery" on datenraum_gallery for select using (true);
