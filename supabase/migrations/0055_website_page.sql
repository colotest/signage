-- Seeds the Website page, alongside the Clock (0014), the Lava Lamps (0031,
-- 0041) and Glitter (0040): a web page shown full screen in the player's
-- own browser. Which page is kept on the row itself, set from its "⋯" menu
-- in the library (Edit Website…); until one is set the page is black.
alter table media_items add column page_url text;

-- In the folder the clock is in, or the root if the clock has been filed
-- elsewhere. Safe to re-run: does nothing if it already exists.
insert into media_items (folder_id, name, storage_path, media_type, mime_type)
select
  (select folder_id from media_items where storage_path = 'page:clock'),
  'Website',
  'page:website',
  'page',
  'text/html'
where not exists (select 1 from media_items where storage_path = 'page:website');
