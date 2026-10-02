"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invites";
import { requireAdmin, roleRank } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityEntry } from "@/types/domain";

// A fresh single-use link for one new default user. Returned as a full URL
// for the admin to copy and hand over; the token in it is never stored.
export async function createSignupLink(): Promise<string> {
  const user = await requireAdmin();
  const token = newInviteToken();
  const admin = createAdminClient();
  const { error } = await admin
    .from("signup_invites")
    .insert({ token_hash: hashInviteToken(token), created_by: user.id });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "user.invite", summary: "Created a signup link" });

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}/signup/${token}`;
}

// Only someone ranked above an account can delete it — an admin can remove
// default users, the super admin can remove admins too — and never their
// own account from here.
export async function deleteUser(id: string) {
  const user = await requireAdmin();
  if (id === user.id) throw new Error("You can't delete your own account.");
  const admin = createAdminClient();
  const { data: target, error: fetchError } = await admin
    .from("users")
    .select("email, role")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (roleRank(target.role) >= roleRank(user.role)) throw new Error("Forbidden");

  const { error } = await admin.from("users").delete().eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "user.delete", summary: `Deleted the account of ${quote(target.email)}` });
  revalidatePath("/users");
}

// Admins (and the super admin) can raise a default user to admin. Nothing
// above that: there's only ever the one super admin, and taking admin
// rights away again isn't something this page does.
export async function makeAdmin(id: string) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const { data: promoted, error } = await admin
    .from("users")
    .update({ role: "admin" })
    .eq("id", id)
    .eq("role", "default")
    .select("email");
  if (error) throw new Error(error.message);
  const target = promoted?.[0];
  if (!target) throw new Error("Only a default user can be made an admin.");
  recordActivity(user, { action: "user.make_admin", summary: `Made ${quote(target.email)} an admin` });
  revalidatePath("/users");
}

const ACTIVITY_PAGE_SIZE = 40;

// One page of a user's history, newest first, for the full-screen view's
// continuous scroll. `before` is the last entry already shown.
export async function getUserActivity(
  userId: string,
  before: { createdAt: string; id: number } | null,
): Promise<{ entries: ActivityEntry[]; done: boolean }> {
  await requireAdmin();
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
