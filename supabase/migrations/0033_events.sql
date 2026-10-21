-- Events: the Forms page's top-level list. Each event is the thing its
-- setup views (Begehung, and more to come) are taken for.
--
-- Everything but the id is optional — an event can be added blank and
-- filled in later. lead_id is the person in charge of it, normally someone
-- in the "Events Management" role (the app offers those, plus whoever's
-- adding it). Like users, no public read policy: only the Server Actions
-- (service_role) read or write it.

create table events (
  id uuid primary key default gen_random_uuid(),
  title text,
  customer text,
  contact_name text,
  contact_phone text,
  contact_email text,
  lead_id uuid references users (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint events_ends_after_start check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index events_starts_at_idx on events (starts_at);
alter table events enable row level security;
