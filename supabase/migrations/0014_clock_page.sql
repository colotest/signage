-- Seeds the Clock page into a "Pages" folder. Safe to re-run: does nothing
-- if the clock already exists (wherever it's since been moved to).
with pages_folder as (
  insert into folders (name)
  select 'Pages'
  where not exists (select 1 from media_items where storage_path = 'page:clock')
  returning id
)
insert into media_items (folder_id, name, storage_path, media_type, mime_type)
select id, 'Clock', 'page:clock', 'page', 'text/html'
from pages_folder;
