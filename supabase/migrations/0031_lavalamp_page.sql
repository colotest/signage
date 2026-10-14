-- Seeds the Lava Lamp page, alongside the Clock (0014). It lands in the
-- same "Pages" folder the clock is in, wherever that's since been moved to,
-- and falls back to the root if the clock has been filed somewhere else.
-- Safe to re-run: does nothing if the lamp already exists.
insert into media_items (folder_id, name, storage_path, media_type, mime_type)
select
  (select folder_id from media_items where storage_path = 'page:clock'),
  'Lava Lamp',
  'page:lavalamp',
  'page',
  'text/html'
where not exists (select 1 from media_items where storage_path = 'page:lavalamp');
