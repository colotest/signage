-- An event's highlighted areas on the venue map, beside its pins (0038):
-- [{ "id": "…", "points": [{ "u": 0.5, "v": 0.5 }, …] }, …], each a polygon
-- whose corners are placed like the pins are — as a fraction of the plan's
-- width and height.

alter table events add column map_areas jsonb not null default '[]'::jsonb;
