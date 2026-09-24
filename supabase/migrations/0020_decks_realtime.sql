-- Decks belong in the live-refresh publication alongside the tables from
-- 0016: a deck's pages are media_items, so uploading or replacing one
-- already reaches other open dashboards through those, but renaming or
-- moving the deck itself touches only this table.
alter publication supabase_realtime add table decks;
