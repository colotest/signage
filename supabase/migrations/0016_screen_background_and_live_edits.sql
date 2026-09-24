-- What shows through wherever the media doesn't: the letterbox bars around
-- a fitted image, the clock page's face, the QR placeholder. Screen-level,
-- like fit_mode and rotation.
create type screen_background as enum ('black', 'white');
alter table screens add column background screen_background not null default 'black';

-- Live collaborative editing: the dashboard and library pages already react
-- to their own changes, but another person's edits only showed up on a
-- reload. Realtime needs each table in the publication to send anything at
-- all, and replica identity full for DELETE/UPDATE events to carry the row
-- (same reason as 0002 — a filtered delete otherwise arrives empty).
-- screens, playlist_items and scheduled_playbacks are already published
-- (0001, 0012).
alter publication supabase_realtime add table folders;
alter publication supabase_realtime add table media_items;
alter publication supabase_realtime add table playlists;
alter publication supabase_realtime add table playlist_entries;

alter table folders replica identity full;
alter table media_items replica identity full;
alter table playlists replica identity full;
alter table playlist_entries replica identity full;
