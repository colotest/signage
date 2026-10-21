-- An event's start and end can be just a day, with no time of day yet.
-- starts_at / ends_at still hold a moment either way (so the list sorts
-- and the end-after-start check holds): a start without a time is stored
-- as the beginning of its day, an end without one as the very end of its
-- day, both in the local time of whoever entered it. These say whether the
-- time part means anything. Events from before this all had times.

alter table events add column starts_time_set boolean not null default true;
alter table events add column ends_time_set boolean not null default true;
