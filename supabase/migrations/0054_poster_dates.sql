-- When a poster's event starts, so the library can list a folder's
-- posters as a programme: in date order, each month's title page (a
-- poster of its own, "month:2026-12") just before its events. None for a
-- poster made by hand, which has no date of its own to go by.
alter table posters add column starts_at timestamptz;
