-- What kind of event it is, and how many guests (PAX) it expects. The
-- kinds are the app's own list (src/lib/eventTypes.ts); both are null until
-- they're set.

alter table events add column event_type text
  check (event_type in ('messe', 'kongress', 'firmenfeier', 'konzert', 'screening', 'sonstiges'));
alter table events add column pax integer check (pax between 0 and 9999);
