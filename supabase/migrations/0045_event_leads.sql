-- An event's leads: everyone in charge of it, in the order they were added.
-- 0033 had just the one (lead_id), which each event starts out with here.
-- An id that's no longer a user's is passed over when read, as an array
-- can't hold a foreign key. lead_id stays, kept as the first lead, until
-- nothing reads it any more.

alter table events add column lead_ids uuid[] not null default '{}';
update events set lead_ids = array[lead_id] where lead_id is not null;
