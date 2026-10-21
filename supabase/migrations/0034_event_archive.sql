-- Events can be archived: out of the Events list, into its Archive view,
-- from where they can be brought back or deleted for good. Null while an
-- event is current; when it was archived otherwise.

alter table events add column archived_at timestamptz;
