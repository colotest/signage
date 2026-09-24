-- How long a transition takes, alongside which one it is (0017). Kept as
-- three named speeds rather than free milliseconds — the player maps them
-- to 200/400/800ms (see Player.tsx), and anything much slower starts to
-- read as a fault rather than a transition.
create type screen_transition_speed as enum ('fast', 'normal', 'slow');
alter table screens add column transition_speed screen_transition_speed not null default 'normal';
