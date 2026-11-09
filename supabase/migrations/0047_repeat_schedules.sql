-- A playlist can now be timed onto the same screen more than once — a
-- loop that comes back between talks, say. Each timer is its own row,
-- edited and cancelled by its id; the no-overlap rule from 0022 still
-- keeps any two windows on a screen apart.
alter table scheduled_playbacks drop constraint if exists scheduled_playbacks_screen_id_playlist_id_key;
