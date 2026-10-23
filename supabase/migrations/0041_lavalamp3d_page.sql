-- Seeds the Lava Lamp 3D page, next to the Lava Lamp (0031) in the folder
-- the clock is in, or the root if the clock has been filed elsewhere.
-- Safe to re-run: does nothing if it already exists.
insert into media_items (folder_id, name, storage_path, media_type, mime_type)
select
  (select folder_id from media_items where storage_path = 'page:clock'),
  'Lava Lamp 3D',
  'page:lavalamp3d',
  'page',
  'text/html'
where not exists (select 1 from media_items where storage_path = 'page:lavalamp3d');
