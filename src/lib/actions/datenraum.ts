"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { GALLERY_TAGS, MAX_GALLERY_EVENT_NAME } from "@/lib/datenraumGallery";
import { createAdminClient } from "@/lib/supabase/admin";

// The Datenraum's picture collection (0048), edited from the page itself by
// whoever's roles reach the Media page: what's in it, and each picture's
// tags, event and day.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ADD = 200;

function done() {
  revalidatePath("/datenraum");
}

// Images from the library, at the end of the collection. Anything that
// isn't an image, or is in it already, is passed over.
export async function addDatenraumImages(mediaItemIds: string[]) {
  const user = await requirePage("media");
  const ids = [...new Set(mediaItemIds)].filter((id) => UUID.test(id)).slice(0, MAX_ADD);
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const [{ data: images, error }, { data: last }] = await Promise.all([
    admin.from("media_items").select("id, created_at").in("id", ids).eq("media_type", "image"),
    admin.from("datenraum_gallery").select("position").order("position", { ascending: false }).limit(1),
  ]);
  if (error) throw new Error(error.message);
  if (!images?.length) return;
  // In the order picked.
  const picked = ids.filter((id) => images.some((image) => image.id === id));
  const start = (last?.[0]?.position ?? 0) + 1;
  const { error: insertError } = await admin.from("datenraum_gallery").upsert(
    picked.map((id, i) => ({ media_item_id: id, position: start + i, added_by: user.id })),
    { onConflict: "media_item_id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error(insertError.message);
  recordActivity(user, {
    action: "datenraum.gallery.add",
    summary: `Added ${picked.length} picture${picked.length === 1 ? "" : "s"} to the Datenraum`,
  });
  done();
}

// Off the page; the file stays in the library.
export async function removeDatenraumImage(id: string) {
  const user = await requirePage("media");
  if (!UUID.test(id)) throw new Error("Not found");
  const { error } = await createAdminClient().from("datenraum_gallery").delete().eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "datenraum.gallery.remove", summary: "Removed a picture from the Datenraum" });
  done();
}

export async function setDatenraumImageTags(id: string, tags: string[]) {
  const user = await requirePage("media");
  if (!UUID.test(id)) throw new Error("Not found");
  const clean = [...new Set(tags)].filter((tag) => GALLERY_TAGS.has(tag));
  const { error } = await createAdminClient().from("datenraum_gallery").update({ tags: clean }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "datenraum.gallery.tags",
    target: `datenraum_gallery:${id}`,
    summary: "Tagged a picture in the Datenraum",
  });
  done();
}

// The event a picture was taken at and the day, either left empty to clear
// it.
export async function setDatenraumImageDetails(id: string, details: { eventName: string; takenOn: string }) {
  const user = await requirePage("media");
  if (!UUID.test(id)) throw new Error("Not found");
  const eventName = details.eventName.trim().slice(0, MAX_GALLERY_EVENT_NAME) || null;
  const takenOn = /^\d{4}-\d{2}-\d{2}$/.test(details.takenOn) ? details.takenOn : null;
  const { error } = await createAdminClient()
    .from("datenraum_gallery")
    .update({ event_name: eventName, taken_on: takenOn })
    .eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "datenraum.gallery.details",
    target: `datenraum_gallery:${id}`,
    summary: "Edited a picture's details in the Datenraum",
  });
  done();
}
