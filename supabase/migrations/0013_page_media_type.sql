-- Pages: built-in, code-rendered slides (a clock, to start with) that sit
-- in the library as ordinary media_items rows, so they can be added to
-- screens and playlists exactly like uploaded files. Their storage_path is
-- "page:<key>", naming the component the player renders
-- (src/components/screenPages) rather than a storage object.
--
-- On its own because a new enum value can't be used in the same
-- transaction that adds it — run this, then 0014.
alter type media_type add value if not exists 'page';
