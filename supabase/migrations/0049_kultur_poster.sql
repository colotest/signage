-- Kultur Poster: a folder the app fills itself. Its reload button pulls
-- the events on sale from colosseumberlin.com/event and makes each one an
-- A1 poster and a 1080×1920 still, as ordinary PDF decks (see
-- src/lib/actions/kulturPoster.ts).
--
-- A folder's feed is what fills it — found by this, not by its name, so
-- it can be renamed or moved like any other. And a deck made from a feed
-- carries the item it was made from (source_key: the Wix event and the
-- format) and a hash of what went into it, so pulling again only redoes
-- the posters whose event changed.

alter table folders
  add column feed text unique;

alter table decks
  add column source_key text unique,
  add column source_hash text;

insert into folders (name, parent_id, feed)
select 'Kultur Poster', null, 'kultur_poster'
where not exists (select 1 from folders where feed = 'kultur_poster');
