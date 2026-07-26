-- Realtime's Postgres Changes needs the full row image (not just the
-- primary key) to reliably evaluate UPDATE/DELETE events, particularly for
-- server-side filters like `screen_id=eq.<id>` on non-primary-key columns.
-- Without this, some UPDATE/DELETE events on playlist_items were silently
-- dropped instead of reaching subscribed players.
alter table playlist_items replica identity full;
alter table screens replica identity full;
