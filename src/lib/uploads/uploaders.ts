import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// User id → the short name the file browser labels uploads with: the part
// of their email before the "@". Users have no display names of their own.
export async function fetchUploaderNames(admin: Admin): Promise<Record<string, string>> {
  const { data, error } = await admin.from("users").select("id, email");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((user) => [user.id, user.email.split("@")[0]]));
}
