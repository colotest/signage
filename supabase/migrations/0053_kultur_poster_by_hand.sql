-- Kultur Poster set by hand, further (see 0050): a picture of a poster's
-- own, uploaded in place of its event's on the site; and posters made by
-- hand altogether, from the folder's + button, which no event gives — so
-- their date and ticket link are kept here too. Those are keyed
-- "manual:<id>" (in event_id here, and in their poster's source_key); a
-- pull makes and remakes them from what's here, but never archives or
-- replaces them.
alter table kultur_poster_texts
  -- An event's poster may have only a picture set, its text left to the
  -- rules: no headline, then.
  alter column headline drop not null,
  -- A poster made by hand's date, as its lines, and its tickets.
  add column date_lines text[],
  add column ticket_url text,
  -- The uploaded picture: a JPEG in the media bucket, and its size.
  add column image_path text,
  add column image_width integer,
  add column image_height integer;
