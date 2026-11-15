import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mediaPublicUrl } from "@/types/domain";

// Where the Datenraum's pictures are uploaded in the media library, from
// its root down.
const LOCATION_FOLDER = ["Dokumentation", "Aufnahmen", "Location"];

export type DatenraumImage = { url: string; width: number | null; height: number | null };

// A picture's name as the content names it: its file name without the
// extension, in lower case ("2" for "2.png").
export const imageKey = (name: string) => name.trim().replace(/\.[a-z0-9]+$/i, "").toLowerCase();

// The pictures in that folder, by name (see imageKey). Whatever isn't
// there yet — or the whole folder, or a database that can't be reached —
// comes out as nothing found, and the page shows placeholders for it.
export async function fetchDatenraumImages(): Promise<Record<string, DatenraumImage>> {
  try {
    const admin = createAdminClient();
    let parentId: string | null = null;
    for (const name of LOCATION_FOLDER) {
      const query = admin.from("folders").select("id").ilike("name", name);
      const { data, error } = await (parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null)).limit(1);
      if (error || !data?.[0]) return {};
      parentId = data[0].id;
    }
    const { data: items, error } = await admin
      .from("media_items")
      .select("name, storage_path, width, height")
      .eq("folder_id", parentId!)
      .eq("media_type", "image")
      .order("created_at");
    if (error || !items) return {};
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const images: Record<string, DatenraumImage> = {};
    for (const item of items) {
      images[imageKey(item.name)] = {
        url: mediaPublicUrl(supabaseUrl, item.storage_path),
        width: item.width,
        height: item.height,
      };
    }
    return images;
  } catch {
    return {};
  }
}
