-- Where a poster's event sells its tickets (its QR code's link), for the
-- library to open beside the poster's name.
alter table posters add column link_url text;
