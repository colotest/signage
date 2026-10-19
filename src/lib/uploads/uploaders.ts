import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

// The name a user goes by around the dashboard: their nickname, when
// they've been given one, or else the part of their email before the "@",
// capitalised — or all caps when it's just two letters, which are most
// likely initials.
export function displayNameOf(user: Pick<User, "email" | "nickname">) {
  const nickname = user.nickname?.trim();
  if (nickname) return nickname;
  const local = user.email.split("@")[0];
  if (local.length === 2) return local.toUpperCase();
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// User id → that name, for the file browser's Uploaded By.
export async function fetchUploaderNames(admin: Admin): Promise<Record<string, string>> {
  const { data, error } = await admin.from("users").select("id, email, nickname");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((user) => [user.id, displayNameOf(user)]));
}
