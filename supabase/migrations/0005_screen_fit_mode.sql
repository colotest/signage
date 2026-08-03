-- Zoom mode (fit = letterboxed, fill = cropped to remove black bars) is a
-- screen-level setting for now, applying to the whole playlist rather than
-- per media item — reuses the fit_mode enum already defined for
-- playlist_items in 0001_init.sql.
alter table screens add column fit_mode fit_mode not null default 'contain';
