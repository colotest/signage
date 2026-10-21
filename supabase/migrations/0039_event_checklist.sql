-- An event's Checkliste, as filled in on its setup page: { "<key>": value },
-- each key one of the list's fields (src/lib/checkliste.ts) — true for a
-- ticked box, text for a text field, "YYYY-MM-DD" for a date. Fields left
-- blank aren't stored.

alter table events add column checklist jsonb not null default '{}'::jsonb;
