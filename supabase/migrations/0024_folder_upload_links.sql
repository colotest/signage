-- Upload links: a folder can be given a link that lets someone without an
-- account drop files into it, and nothing else — the page behind it
-- (/upload/<token>) shows only that one folder's own files.
--
-- One link per folder. The token is stored as-is (unlike signup invites)
-- so it can be copied again later from the folder's menu; that's also why
-- this table gets no public read policy at all, unlike folders itself —
-- the anon key the browser holds must never be able to list the tokens.
-- Deleting the folder, or turning the link off, kills the link.
create table folder_upload_links (
  folder_id uuid primary key references folders (id) on delete cascade,
  token text not null unique,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table folder_upload_links enable row level security;
