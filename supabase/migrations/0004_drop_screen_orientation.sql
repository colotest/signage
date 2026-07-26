-- The orientation field only ever shaped the dashboard preview tile's
-- aspect ratio — it had no effect on the actual player, which already
-- fills the real device viewport via object-fit regardless of this value.
-- Removing it rather than leaving unused schema/UI around.
alter table screens drop column orientation;
drop type if exists screen_orientation;
