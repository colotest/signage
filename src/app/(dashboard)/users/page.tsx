import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersView, type UserWithActivity } from "./_components/UsersView";

const RECENT_COUNT = 5;

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export default async function UsersPage() {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from("users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  // Each user's latest few changes — one small query per user, which is
  // fine at a venue's handful of accounts; the rest loads on demand, from
  // "Show all". Plus when everyone's changes from the last day and a half
  // happened: "today" depends on the viewer's own timezone, so the page
  // counts today's changes from these itself.
  const [withRecent, { data: latest, error: latestError }] = await Promise.all([
    Promise.all(
      (users ?? []).map(async (user) => {
        const { data: recent, error: activityError } = await admin
          .from("activity_log")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(RECENT_COUNT);
        if (activityError) throw new Error(activityError.message);
        return { ...user, recent: recent ?? [] };
      }),
    ),
    admin.from("activity_log").select("user_id, created_at").gte("created_at", hoursAgo(36)),
  ]);
  if (latestError) throw new Error(latestError.message);

  const latestByUser = new Map<string, string[]>();
  for (const row of latest ?? []) {
    if (!row.user_id) continue;
    const list = latestByUser.get(row.user_id);
    if (list) list.push(row.created_at);
    else latestByUser.set(row.user_id, [row.created_at]);
  }
  const withActivity: UserWithActivity[] = withRecent.map((user) => ({
    ...user,
    latestChangeTimes: latestByUser.get(user.id) ?? [],
  }));

  return <UsersView users={withActivity} />;
}
