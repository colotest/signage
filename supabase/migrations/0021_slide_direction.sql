-- Which edge a sliding transition comes in from (0017's "slide"). Named
-- for where the incoming slide starts: "right" is the original behaviour —
-- it enters from the right edge while the outgoing one leaves to the left.
create type screen_slide_direction as enum ('right', 'left', 'top', 'bottom');
alter table screens add column slide_direction screen_slide_direction not null default 'right';
