-- Intrinsic file properties (dimensions, video duration) captured client-side
-- at upload time, straight from the decoded file — there's no server-side
-- ffprobe pipeline, so this is the only point this information is ever
-- available. All nullable: PDFs have none of it, and older rows uploaded
-- before this migration simply won't have it either.
alter table media_items add column width int;
alter table media_items add column height int;
alter table media_items add column duration_seconds numeric;
