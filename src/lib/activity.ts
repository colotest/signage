import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

export type ActivityInput = {
  // What kind of change, e.g. "playlist.rename" — also what repeated edits
  // are folded together by (see log_activity in 0023_users.sql).
  action: string;
  // The thing changed, e.g. "playlist:<id>". Leave it out for changes that
  // should always get their own entry.
  target?: string;
  // Human-readable, shown as-is on the Users page. A function runs after
  // the response is sent, so any lookups it needs don't slow the action.
  summary: string | ((admin: Admin) => Promise<string>);
};

// Records a change against the user who made it. Runs after the action's
// response has gone out: the log is bookkeeping, and neither a slow write
// nor a failed one should hold up or break the edit itself.
export function recordActivity(user: Pick<User, "id" | "email">, input: ActivityInput) {
  after(async () => {
    try {
      const admin = createAdminClient();
      const summary = typeof input.summary === "string" ? input.summary : await input.summary(admin);
      const { error } = await admin.rpc("log_activity", {
        p_user_id: user.id,
        p_user_email: user.email,
        p_action: input.action,
        p_target: input.target ?? null,
        p_summary: summary,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error(`Failed to record activity "${input.action}" for ${user.email}:`, err);
    }
  });
}

export function quote(name: string | null | undefined) {
  return name ? `“${name}”` : "an item";
}

export async function screenName(admin: Admin, id: number) {
  const { data } = await admin.from("screens").select("name").eq("id", id).maybeSingle();
  return data?.name ? `“${data.name}”` : `Screen ${id}`;
}

export async function playlistName(admin: Admin, id: string) {
  const { data } = await admin.from("playlists").select("name").eq("id", id).maybeSingle();
  return quote(data?.name);
}

export async function folderName(admin: Admin, id: string | null) {
  if (!id) return "the top level";
  const { data } = await admin.from("folders").select("name").eq("id", id).maybeSingle();
  return quote(data?.name);
}

export async function mediaNames(admin: Admin, ids: string[]) {
  if (ids.length === 0) return "nothing";
  if (ids.length > 1) return `${ids.length} files`;
  const { data } = await admin.from("media_items").select("name").eq("id", ids[0]).maybeSingle();
  return quote(data?.name);
}

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
