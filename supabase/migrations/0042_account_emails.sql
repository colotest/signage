-- Emails the app sends itself (src/lib/email): password reset links,
-- confirming a new login email, signup links and the Checkliste.

-- When the password last changed. A session cookie issued before then is
-- turned away (getCurrentUser), so a change or a reset signs out every
-- device that was signed in — except the one making it, which is handed a
-- fresh cookie.
alter table users add column password_changed_at timestamptz;

-- Who a signup link was emailed to. Their signup form starts with it filled in.
alter table signup_invites add column email text;

-- "Forgot password?" links. Like signup links, only the sha256 of the token
-- is stored, so the link only ever exists in the email it went out in.
create table password_resets (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  used_at timestamptz
);
create index password_resets_user_created_idx on password_resets (user_id, created_at desc);
alter table password_resets enable row level security;

-- A change of login email, waiting for the link sent to the new address.
create table email_changes (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  new_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz
);
create index email_changes_user_created_idx on email_changes (user_id, created_at desc);
alter table email_changes enable row level security;

-- Spends a reset link and sets the new password in one step, so a link
-- can't be used twice. Every other link still out for that account goes
-- with it. Returns the user's id, or null if the link was already used,
-- expired or never existed.
create or replace function redeem_password_reset(
  p_token_hash text,
  p_password_hash text
) returns uuid language plpgsql as $$
declare
  reset password_resets%rowtype;
begin
  select * into reset from password_resets
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    return null;
  end if;

  update users set password_hash = p_password_hash, password_changed_at = now() where id = reset.user_id;
  update password_resets set used_at = now() where user_id = reset.user_id and used_at is null;
  return reset.user_id;
end;
$$;

-- Spends an email-change link and moves the account to its new address,
-- dropping any other change still waiting. Returns the user's id, or null
-- if the link was already used, expired or never existed. Raises 23505 if
-- someone else has taken that address in the meantime.
create or replace function confirm_email_change(p_token_hash text) returns uuid language plpgsql as $$
declare
  change email_changes%rowtype;
begin
  select * into change from email_changes
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    return null;
  end if;

  update users set email = change.new_email where id = change.user_id;
  update email_changes set used_at = now() where user_id = change.user_id and used_at is null;
  return change.user_id;
end;
$$;

revoke execute on function redeem_password_reset(text, text) from public, anon, authenticated;
revoke execute on function confirm_email_change(text) from public, anon, authenticated;
