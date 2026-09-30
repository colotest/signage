-- Individual logins replace the single shared dashboard password.
--
-- users: one row per person. role is a strict ladder —
--   super_admin > admin > default
-- — and the app checks it on every Server Action, not just in the UI.
-- password_hash is scrypt (see src/lib/auth/password.ts), never plaintext.
--
-- None of these tables get a public read policy: unlike screens/media, the
-- player never needs them, and they hold password hashes and invite
-- tokens. RLS is on with no policies at all, so only the service_role key
-- (the Server Actions) can touch them.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  role text not null default 'default' check (role in ('super_admin', 'admin', 'default')),
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
alter table users enable row level security;

-- Single-use signup links. Only the sha256 of the token is stored, so the
-- link itself only ever exists in the URL an admin copied.
create table signup_invites (
  token_hash text primary key,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references users (id) on delete set null
);
alter table signup_invites enable row level security;

-- Who changed what. user_email is a snapshot so the history still reads
-- sensibly after its user is deleted (user_id then goes null).
-- target identifies the thing changed (e.g. "playlist:<id>"), so repeated
-- edits to one thing in quick succession can be folded into one entry —
-- see log_activity below.
create table activity_log (
  id bigint generated always as identity primary key,
  user_id uuid references users (id) on delete set null,
  user_email text not null,
  action text not null,
  target text,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_log_user_created_idx on activity_log (user_id, created_at desc, id desc);
alter table activity_log enable row level security;

-- Records one change. Nudging the same setting on the same thing several
-- times within a minute (a duration stepper, dragging an item around a
-- few times) updates the user's latest entry instead of adding one per
-- click, so the history stays readable.
create or replace function log_activity(
  p_user_id uuid,
  p_user_email text,
  p_action text,
  p_target text,
  p_summary text
) returns void language plpgsql as $$
declare
  latest activity_log%rowtype;
begin
  if p_target is not null then
    select * into latest from activity_log
    where user_id = p_user_id
    order by created_at desc, id desc
    limit 1;

    if found
      and latest.action = p_action
      and latest.target = p_target
      and latest.created_at > now() - interval '1 minute'
    then
      update activity_log set summary = p_summary, created_at = now() where id = latest.id;
      return;
    end if;
  end if;

  insert into activity_log (user_id, user_email, action, target, summary)
  values (p_user_id, p_user_email, p_action, p_target, p_summary);
end;
$$;

-- Takes an invite and creates its user in one step, so a link can't be
-- spent twice by two people submitting at once. Returns the new user's id,
-- or null if the link was already used, expired or never existed.
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

  insert into users (email, password_hash, role)
  values (p_email, p_password_hash, 'default')
  returning id into new_id;

  update signup_invites set used_at = now(), used_by = new_id where token_hash = p_token_hash;
  return new_id;
end;
$$;

-- Functions in public are executable by the anon key by default, which the
-- browser holds. These two are for the Server Actions alone.
revoke execute on function log_activity(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function redeem_signup_invite(text, text, text) from public, anon, authenticated;
