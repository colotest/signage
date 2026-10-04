-- Folders show who created them, the way files show who uploaded them
-- (0027). And a file that came in through a folder's upload link remembers
-- that folder, so it reads as "<folder> 🔗" — even after it's been moved
-- somewhere else. If that folder is deleted, it falls back to "Upload link".

alter table folders
  add column created_by uuid references users (id) on delete set null;

alter table media_items
  add column upload_link_folder_id uuid references folders (id) on delete set null;

alter table decks
  add column upload_link_folder_id uuid references folders (id) on delete set null;

-- Best effort, as in 0027: match each folder to its "Created folder …"
-- entry in the change history. Renamed folders only match if their history
-- entry names them as they're called now.
update folders f
set created_by = (
  select a.user_id from activity_log a
  where a.action = 'folder.create'
    and a.summary = 'Created folder “' || f.name || '”'
    and a.created_at between f.created_at and f.created_at + interval '5 minutes'
  order by a.created_at
  limit 1
)
where f.created_by is null;

-- Link uploads so far can only have landed in the folder they're in now,
-- unless moved since; that's the best guess there is.
update media_items set upload_link_folder_id = folder_id
where uploaded_via_link and deck_id is null and upload_link_folder_id is null;

update decks set upload_link_folder_id = folder_id
where uploaded_via_link and upload_link_folder_id is null;

update media_items m set upload_link_folder_id = d.upload_link_folder_id
from decks d
where m.deck_id = d.id and m.uploaded_via_link and m.upload_link_folder_id is null;
