-- Re-introduces a screen-level orientation flag (the old `orientation`
-- column was dropped in 0004 back when it only shaped the dashboard
-- preview tile). This time it's load-bearing for actual playback: the
-- player reads it to counter-rotate content on a screen that's physically
-- mounted rotated 90 degrees, so media doesn't need to be pre-rotated for
-- portrait deployments. A plain boolean rather than reintroducing the old
-- enum, since there are only two states to represent.
alter table screens add column landscape boolean not null default true;
