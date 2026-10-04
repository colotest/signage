-- Who added each file, shown in the Library's file browser.
--
-- uploaded_by is the signed-in user who uploaded it; uploaded_via_link
-- marks files that came in through a folder's upload link (0024), which
-- have no user. Neither set means nobody knows — files from before this.
-- A deck's pages carry the same as their deck.

alter table media_items
  add column uploaded_by uuid references users (id) on delete set null,
  add column uploaded_via_link boolean not null default false;

alter table decks
  add column uploaded_by uuid references users (id) on delete set null,
  add column uploaded_via_link boolean not null default false;

-- Best effort for what's already there: the change history (0023) logged
-- each upload by name, moments after the file's row was written. A file
-- renamed since, or uploaded before the history existed, stays unknown.
update media_items m
set uploaded_by = (
  select a.user_id from activity_log a
  where a.action = 'media.upload'
    and a.summary = 'Uploaded “' || m.name || '”'
    and a.created_at between m.created_at and m.created_at + interval '5 minutes'
  order by a.created_at
  limit 1
)
where m.deck_id is null and m.uploaded_by is null;

update decks d
set uploaded_by = (
  select a.user_id from activity_log a
  where a.action = 'deck.upload'
    and a.summary like 'Uploaded PDF “' || replace(replace(d.name, '%', '\%'), '_', '\_') || '” (%'
    and a.created_at between d.created_at and d.created_at + interval '5 minutes'
  order by a.created_at
  limit 1
)
where d.uploaded_by is null;

update media_items m
set uploaded_by = d.uploaded_by
from decks d
where m.deck_id = d.id and m.uploaded_by is null;
