-- An event's own pins on the venue map, on top of the map's standing ones:
-- [{ "id": "…", "title": "…", "u": 0.5, "v": 0.5 }, …], u and v being where
-- on the plan, as a fraction of its width and height (as the map's own
-- spots are placed — see FormsView).

alter table events add column map_pins jsonb not null default '[]'::jsonb;
