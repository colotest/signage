import { createAdminClient } from "@/lib/supabase/admin";
import { ScreenGrid } from "./_components/ScreenGrid";

export default async function DashboardPage() {
  const admin = createAdminClient();
  const { data: screens, error } = await admin
    .from("screens")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);

  return <ScreenGrid screens={screens ?? []} />;
}
