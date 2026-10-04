import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// User id → the short name the file browser labels uploads with: the part
// of their email before the "@", capitalised — or all caps when it's just
// two letters, which are most likely initials. Users have no display names
// of their own.
function shortName(email: string) {
  const local = email.split("@")[0];
  if (local.length === 2) return local.toUpperCase();
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export async function fetchUploaderNames(admin: Admin): Promise<Record<string, string>> {
  const { data, error } = await admin.from("users").select("id, email");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((user) => [user.id, shortName(user.email)]));
}
