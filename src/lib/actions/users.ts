"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { isEmail, normalizeEmail } from "@/lib/auth/credentials";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invites";
import { requireUsersPermission, type CurrentUser } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/send";
import { signupInviteEmail } from "@/lib/email/templates";
import { appOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayNameOf } from "@/lib/uploads/uploaders";
import type { ActivityEntry } from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

const MAX_NICKNAME = 60;

function cleanNickname(nickname: string) {
  return nickname.trim().slice(0, MAX_NICKNAME) || null;
}

// Roles someone may hand out — to an invite, or to another user — are only
// ever ones they hold themselves.
function assertOwnRoles(user: CurrentUser, roleIds: string[]) {
  if (roleIds.some((id) => !user.access.roleIds.includes(id))) throw new Error("You can only give out roles you have.");
}

// Another account to act on: never the super admin's, whose roles and
// account aren't anyone else's to change.
async function targetUser(admin: Admin, id: string) {
  const { data, error } = await admin.from("users").select("email, nickname, is_super_admin").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (data.is_super_admin) throw new Error("The super admin's account can't be changed here.");
  return data;
}

// A fresh single-use link. Made the moment "New Signup" is pressed, so it
// can be copied right away; the nickname and roles set in the popup that
// opens with it are added to it afterwards (updateSignupInvite). Its token
// is never stored — only a hash — so it comes back here to be handed on.
export async function createSignupLink(): Promise<{ url: string; token: string }> {
  const user = await requireUsersPermission("signups");
  const token = newInviteToken();
  const admin = createAdminClient();
  const { error } = await admin
    .from("signup_invites")
    .insert({ token_hash: hashInviteToken(token), created_by: user.id });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "user.invite", summary: "Created a signup link" });
  return { url: `${await appOrigin()}/signup/${token}`, token };
}

// The new user's nickname and first roles, set in the signup popup. Only
// on a link of one's own that hasn't been used yet.
export async function updateSignupInvite(token: string, nickname: string, roleIds: string[]) {
  const user = await requireUsersPermission("signups");
  assertOwnRoles(user, roleIds);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signup_invites")
    .update({ nickname: cleanNickname(nickname), role_ids: [...new Set(roleIds)] })
    .eq("token_hash", hashInviteToken(token))
    .eq("created_by", user.id)
    .is("used_at", null)
    .select("token_hash");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That signup link has already been used.");
}

// Sends a link of one's own, not yet used, to the person it's for, greeted
// by the nickname set on it. Their signup form starts with that address.
// Resolves to an error message to show, or null once it's sent.
export async function emailSignupLink(token: string, to: string): Promise<string | null> {
  const user = await requireUsersPermission("signups");
  const email = normalizeEmail(to);
  if (!isEmail(email)) return "Enter a valid email address.";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signup_invites")
    .update({ email })
    .eq("token_hash", hashInviteToken(token))
    .eq("created_by", user.id)
    .is("used_at", null)
    .select("nickname");
  if (error) throw new Error(error.message);
  if (!data?.length) return "That signup link has already been used.";

  try {
    await sendEmail({
      to: email,
      replyTo: user.email,
      ...signupInviteEmail(`${await appOrigin()}/signup/${token}`, displayNameOf(user), data[0].nickname),
    });
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't send the email.";
  }
  recordActivity(user, { action: "user.invite_email", summary: `Emailed a signup link to ${quote(email)}` });
  return null;
}

// Never one's own account, and never the super admin's.
export async function deleteUser(id: string) {
  const user = await requireUsersPermission("delete");
  if (id === user.id) throw new Error("You can't delete your own account.");
  const admin = createAdminClient();
  const target = await targetUser(admin, id);

  const { error } = await admin.from("users").delete().eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "user.delete", summary: `Deleted the account of ${quote(target.email)}` });
  revalidatePath("/users");
}

// An empty nickname clears it, back to the name made from their email.
export async function setNickname(id: string, nickname: string) {
  const user = await requireUsersPermission("nicknames");
  const admin = createAdminClient();
  const { data: before, error: fetchError } = await admin.from("users").select("email, nickname").eq("id", id).single();
  if (fetchError) throw new Error(fetchError.message);
  const next = cleanNickname(nickname);
  const { error } = await admin.from("users").update({ nickname: next }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "user.nickname",
    target: `user:${id}`,
    summary: next
      ? `Renamed ${quote(displayNameOf(before))} to ${quote(next)}`
      : `Cleared the nickname of ${quote(before.email)}`,
  });
  revalidatePath("/users");
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

// "Make <Role>" / "Revoke <Role>" in a user's menu.
export async function setUserRole(userId: string, roleId: string, assigned: boolean) {
  const user = await requireUsersPermission("assignRoles");
  assertOwnRoles(user, [roleId]);
  const admin = createAdminClient();
  const target = await targetUser(admin, userId);

  const { error } = assigned
    ? await admin.from("user_roles").upsert({ user_id: userId, role_id: roleId }, { onConflict: "user_id,role_id" })
    : await admin.from("user_roles").delete().eq("user_id", userId).eq("role_id", roleId);
  if (error) throw new Error(error.message);

  const { data: role } = await admin.from("roles").select("name").eq("id", roleId).maybeSingle();
  recordActivity(user, {
    action: assigned ? "user.role_add" : "user.role_remove",
    summary: assigned
      ? `Made ${quote(displayNameOf(target))} ${quote(role?.name)}`
      : `Revoked ${quote(role?.name)} from ${quote(displayNameOf(target))}`,
  });
  revalidatePath("/users");
}

const ACTIVITY_PAGE_SIZE = 40;

// One page of a user's history, newest first, for the full-screen view's
// continuous scroll. `before` is the last entry already shown.
export async function getUserActivity(
  userId: string,
  before: { createdAt: string; id: number } | null,
): Promise<{ entries: ActivityEntry[]; done: boolean }> {
  await requireUsersPermission("viewChanges");
  const admin = createAdminClient();
  let query = admin
    .from("activity_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE);
  if (before) {
    // Quoted: the timestamp's own dots and colons would otherwise trip
    // PostgREST's filter parsing.
    const at = `"${before.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { entries: data ?? [], done: (data?.length ?? 0) < ACTIVITY_PAGE_SIZE };
}
