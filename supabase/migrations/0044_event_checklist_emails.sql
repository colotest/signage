-- Addresses an event's Checkliste can be emailed to besides Events
-- Management and the event's own contact — added for that event from the
-- Checkliste's share button ("+ New"): ["someone@example.com", …].

alter table events add column checklist_emails jsonb not null default '[]'::jsonb;
