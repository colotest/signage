import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryView } from "./_components/LibraryView";

export default async function LibraryPage() {
  const admin = createAdminClient();

  const [{ data: folders, error: foldersError }, { data: media, error: mediaError }] = await Promise.all([
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
  ]);

  if (foldersError) throw new Error(foldersError.message);
  if (mediaError) throw new Error(mediaError.message);

  return <LibraryView folders={folders ?? []} media={media ?? []} />;
}
