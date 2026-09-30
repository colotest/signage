import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// The folder behind an upload link, or null once the link's been turned
// off (or its folder deleted).
export async function folderForUploadLink(admin: Admin, token: string) {
  const { data, error } = await admin
    .from("folder_upload_links")
    .select("folder:folders(id, name)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.folder ?? null;
}
