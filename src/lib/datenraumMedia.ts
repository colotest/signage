import "server-only";
import {
  ACCESS_EVENT_TITLE,
  GALLERY_TAGS,
  POWER_EVENT_TITLE,
  powerKind,
  type DatenraumPin,
  type GalleryImage,
} from "@/lib/datenraumGallery";
import { parsePins } from "@/lib/eventPins";
import { createAdminClient } from "@/lib/supabase/admin";
import { floorOf } from "@/lib/venueFloors";
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

// The picture collection, in its order. Before 0048 has been run (or with
// no database to reach) it's simply empty.
export async function fetchDatenraumGallery(): Promise<GalleryImage[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("datenraum_gallery")
      .select("id, media_item_id, tags, event_name, taken_on, media_item:media_items(name, storage_path, width, height)")
      .order("position")
      .order("created_at");
    if (error || !data) return [];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return data.flatMap((row) => {
      const item = row.media_item;
      if (!item) return [];
      return [
        {
          id: row.id,
          mediaItemId: row.media_item_id,
          name: item.name.replace(/\.[a-z0-9]+$/i, ""),
          url: mediaPublicUrl(supabaseUrl, item.storage_path),
          width: item.width,
          height: item.height,
          tags: row.tags.filter((tag) => GALLERY_TAGS.has(tag)),
          eventName: row.event_name,
          takenOn: row.taken_on,
        },
      ];
    });
  } catch {
    return [];
  }
}

// The notes on the venue map of the events the Datenraum takes pins from
// (see POWER_EVENT_TITLE and ACCESS_EVENT_TITLE): only their places and
// what they mark, nothing else of the events.
export async function fetchDatenraumPins(): Promise<{ power: DatenraumPin[]; access: DatenraumPin[] }> {
  const none = { power: [], access: [] };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("events")
      .select("title, map_pins")
      .in("title", [POWER_EVENT_TITLE, ACCESS_EVENT_TITLE]);
    if (error || !data) return none;
    const notesOf = (title: string) =>
      data
        .filter((event) => event.title === title)
        .flatMap((event) => parsePins(event.map_pins))
        .filter((pin) => pin.note !== undefined);
    return {
      power: notesOf(POWER_EVENT_TITLE).map((pin) => ({
        id: pin.id,
        u: pin.u,
        v: pin.v,
        floor: floorOf(pin),
        kind: powerKind(pin.note ?? ""),
        note: pin.note,
      })),
      access: notesOf(ACCESS_EVENT_TITLE).map((pin) => ({ id: pin.id, u: pin.u, v: pin.v, floor: floorOf(pin), kind: "access" })),
    };
  } catch {
    return none;
  }
}
