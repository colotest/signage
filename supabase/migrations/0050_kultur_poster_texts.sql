-- Kultur Poster text set by hand. A pull takes each event's title apart by
-- rule (src/lib/kulturPoster/titleParts.ts) into a name, the series above
-- it, a subtitle and a status label; where the rules get one wrong, the
-- poster's "Edit Poster Text" sets it here instead, for both of its sizes,
-- and every later pull keeps it until it's set back to automatic.
create table kultur_poster_texts (
  -- Wix's own id for the event (decks.source_key carries it too).
  event_id text primary key,
  kicker text,
  headline text not null,
  subtitle text,
  badge text,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Read and written only by the server, as service_role.
alter table kultur_poster_texts enable row level security;
