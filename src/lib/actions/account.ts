"use server";

import { quote, recordActivity } from "@/lib/activity";
import { isEmail, normalizeEmail, passwordProblem } from "@/lib/auth/credentials";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invites";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireSession, setSessionCookie } from "@/lib/auth/session";
import { notifyEmailChanged, notifyPasswordChanged } from "@/lib/email/notices";
import { sendEmail } from "@/lib/email/send";
import { confirmEmailChangeEmail } from "@/lib/email/templates";
import { appOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// The signed-in user's own account, from the account menu: changing the
// password, or the email they log in with. Both ask for the current
// password, so a device left signed in isn't enough to take the account.

async function checkPassword(admin: Admin, userId: string, password: string) {
  const { data, error } = await admin.from("users").select("password_hash").eq("id", userId).single();
  if (error) throw new Error(error.message);
  return verifyPassword(password, data.password_hash);
}

export type ChangePasswordState = { error?: string; done?: boolean } | undefined;

// Signs out every other device (see password_changed_at in 0042); this one
// gets a fresh cookie and stays signed in.
export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const admin = createAdminClient();
  if (!(await checkPassword(admin, user.id, current))) return { error: "Your current password isn't right." };

  const { error } = await admin
    .from("users")
    .update({ password_hash: await hashPassword(next), password_changed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  // Reset links asked for before now would undo it.
  await admin.from("password_resets").update({ used_at: new Date().toISOString() }).eq("user_id", user.id).is("used_at", null);

  await setSessionCookie(user.id);
  await notifyPasswordChanged(user.email);
  recordActivity(user, { action: "user.password", summary: "Changed their password" });
  return { done: true };
}

export type ChangeEmailState = { error?: string; sent?: string } | undefined;

const MAX_EMAIL_CHANGES_PER_HOUR = 5;

// Nothing changes yet: a link goes to the new address, and the account
// moves to it once that's opened (confirmEmailChangeAction).
export async function changeEmailAction(_prevState: ChangeEmailState, formData: FormData): Promise<ChangeEmailState> {
  const user = await requireSession();
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("current") ?? "");
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (email === user.email.toLowerCase()) return { error: "That's already your email." };

  const admin = createAdminClient();
  if (!(await checkPassword(admin, user.id, password))) return { error: "Your password isn't right." };

  const { data: taken, error: takenError } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (takenError) throw new Error(takenError.message);
  if (taken) return { error: "There's already an account with that email." };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("email_changes")
    .select("token_hash", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("created_at", since);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_EMAIL_CHANGES_PER_HOUR) return { error: "That's a lot of changes at once. Try again in an hour." };

  const token = newInviteToken();
  const { error } = await admin
    .from("email_changes")
    .insert({ token_hash: hashInviteToken(token), user_id: user.id, new_email: email });
  if (error) throw new Error(error.message);
  try {
    await sendEmail({ to: email, ...confirmEmailChangeEmail(`${await appOrigin()}/confirm-email/${token}`, email) });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send the email." };
  }
  return { sent: email };
}

export type ConfirmEmailState = { error?: string; done?: string } | undefined;

// The page the link in that email opens. Open to anyone holding the link:
// the account's password was checked when the change was asked for, and
// the link proves the new address is theirs.
export async function confirmEmailChangeAction(
  _prevState: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const tokenHash = hashInviteToken(String(formData.get("token") ?? ""));
  const admin = createAdminClient();
  const { data: change, error: fetchError } = await admin
    .from("email_changes")
    .select("user_id, new_email")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  // The address it's moving from, for the heads-up sent there.
  const { data: before } = change
    ? await admin.from("users").select("email").eq("id", change.user_id).maybeSingle()
    : { data: null };

  const { data: userId, error } = await admin.rpc("confirm_email_change", { p_token_hash: tokenHash });
  if (error) {
    if (error.code === "23505") return { error: "Someone else has taken that email since. Try a different one." };
    throw new Error(error.message);
  }
  if (!userId || !change) return { error: "This link has already been used or has expired." };

  const oldEmail = before?.email;
  if (oldEmail) notifyEmailChanged(oldEmail, change.new_email);
  recordActivity(
    { id: userId, email: change.new_email },
    { action: "user.email", summary: `Changed their email from ${quote(oldEmail)} to ${quote(change.new_email)}` },
  );
  return { done: change.new_email };
}
