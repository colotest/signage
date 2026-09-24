-- How one slide gives way to the next during playback. Screen-level, like
-- fit_mode, rotation and background.
--
-- "cut" is the old behaviour (no animation). "dip" fades the outgoing slide
-- to the screen's background and the incoming one up out of it, so only one
-- slide is ever visible. "crossfade" overlaps the two, and "slide" pushes
-- the next one in from the right — both are downgraded to a dip by the
-- player whenever a video is involved, which is a decoding limit of the
-- Fire TV-class sticks rather than something the setting should hide.
create type screen_transition as enum ('cut', 'dip', 'crossfade', 'slide');
alter table screens add column transition screen_transition not null default 'cut';
