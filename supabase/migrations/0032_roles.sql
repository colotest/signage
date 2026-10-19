-- Access roles replace the fixed admin/default ladder (0023).
--
-- A role is a named, coloured set of permissions — which pages its members
-- can reach, and what they can do there (roles.access, below). Roles are
-- additive: a user with several gets the union of what they allow. Someone
-- with no role at all sees nothing but the header. The super admin is
-- outside all of this and can do everything (users.is_super_admin); the
-- app treats them as holding every role.
--
-- users.role (admin/default) is no longer read by anything. It stays in
-- the table for now so the app that's still deployed while this runs keeps
-- working; a later migration can drop it.

alter table users add column is_super_admin boolean not null default false;
alter table users add column nickname text;
update users set is_super_admin = (role = 'super_admin');

-- access, as the app reads it (src/lib/auth/access.ts):
--   { "pages":   { "screens": bool, "media": bool, "forms": bool, "users": bool },
--     "screens": { "hiddenScreens": [screen id, …], "hiddenGroups": [group id, …],
--                  "settings": bool, "reorder": bool },
--     "users":   { "delete": bool, "nicknames": bool, "assignRoles": bool,
--                  "manageRoles": bool, "signups": bool, "viewChanges": bool } }
-- Screens and groups are listed by what's hidden rather than what's shown,
-- so a new screen is visible to every role with the Screens page until
-- someone unticks it.
create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- A CSS colour, "hsl(h s% l%)" — the dot that flags this role's content.
  color text not null,
  access jsonb not null default '{}'::jsonb,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table roles enable row level security;

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_idx on user_roles (role_id);
alter table user_roles enable row level security;

-- A signup link can carry the new user's nickname and their first roles.
alter table signup_invites add column nickname text;
alter table signup_invites add column role_ids uuid[] not null default '{}';

-- Owners can keep their own files and folders from being edited (renamed,
-- moved, deleted, given upload links) by anyone outside the listed roles.
-- Empty means anyone who can reach the library may. A deck's pages follow
-- the deck's own list.
alter table media_items add column edit_role_ids uuid[] not null default '{}';
alter table decks add column edit_role_ids uuid[] not null default '{}';
alter table folders add column edit_role_ids uuid[] not null default '{}';

-- Same as 0023's, plus the invite's nickname and roles. Roles deleted since
-- the link was made are skipped.
create or replace function redeem_signup_invite(
  p_token_hash text,
  p_email text,
  p_password_hash text
) returns uuid language plpgsql as $$
declare
  invite signup_invites%rowtype;
  new_id uuid;
begin
  select * into invite from signup_invites
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    return null;
  end if;

  insert into users (email, password_hash, nickname)
  values (p_email, p_password_hash, nullif(btrim(invite.nickname), ''))
  returning id into new_id;

  insert into user_roles (user_id, role_id)
  select new_id, r.id from roles r where r.id = any (invite.role_ids);

  update signup_invites set used_at = now(), used_by = new_id where token_hash = p_token_hash;
  return new_id;
end;
$$;

-- Deleting a role also takes it off every file, folder and pending invite
-- that lists it (user_roles cascades by itself).
create or replace function delete_role(p_role_id uuid) returns void language plpgsql as $$
begin
  update media_items set edit_role_ids = array_remove(edit_role_ids, p_role_id) where p_role_id = any (edit_role_ids);
  update decks set edit_role_ids = array_remove(edit_role_ids, p_role_id) where p_role_id = any (edit_role_ids);
  update folders set edit_role_ids = array_remove(edit_role_ids, p_role_id) where p_role_id = any (edit_role_ids);
  update signup_invites set role_ids = array_remove(role_ids, p_role_id) where p_role_id = any (role_ids);
  delete from roles where id = p_role_id;
end;
$$;

revoke execute on function redeem_signup_invite(text, text, text) from public, anon, authenticated;
revoke execute on function delete_role(uuid) from public, anon, authenticated;
