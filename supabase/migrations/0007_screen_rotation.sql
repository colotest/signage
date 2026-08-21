-- Expands the screen orientation flag from a landscape/portrait boolean to
-- a full 0/90/180/270-degree counterclockwise rotation — a TV can be
-- physically mounted in any of the four quarter turns, not just upright or
-- turned exactly on its side.
alter table screens add column rotation smallint not null default 0
  check (rotation in (0, 90, 180, 270));

update screens set rotation = 90 where landscape = false;

alter table screens drop column landscape;
