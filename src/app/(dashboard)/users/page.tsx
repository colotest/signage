import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersView, type UserWithActivity } from "./_components/UsersView";

const RECENT_COUNT = 5;

export default async function UsersPage() {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from("users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  // Each user's latest few changes, plus how many they've made in all —
  // one small query per user, which is fine at a venue's handful of
  // accounts. The rest loads on demand, from "Show all".
  const withActivity: UserWithActivity[] = await Promise.all(
    (users ?? []).map(async (user) => {
      const { data: recent, count, error: activityError } = await admin
        .from("activity_log")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(RECENT_COUNT);
      if (activityError) throw new Error(activityError.message);
      return { ...user, recent: recent ?? [], activityCount: count ?? 0 };
    }),
  );

  return <UsersView users={withActivity} />;
}
