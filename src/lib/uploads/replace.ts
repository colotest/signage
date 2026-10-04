import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Deck, MediaType } from "@/types/domain";
import { pageName, type DeckPageInput } from "./insertDeck";

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET = "media";

// The swap itself, once the new files are in storage — shared by the
// Library's Replace and an upload link's. Callers check who may replace
// what; these only do it.

// Repoints an existing media item at a newly-uploaded file — same id, so
// every playlist_items row referencing it (and any screen currently
// showing it) keeps working with no playlist rebuilding. The old object is
// only removed from storage after the row update succeeds, so a failed
// update never leaves the item pointing at something already deleted; a
// failure to clean up the now-orphaned old file afterward is logged but
// doesn't fail the whole operation, since the part the user actually
// cares about — the item now serving the new file — already succeeded.
export async function repointMediaItem(
  admin: Admin,
  existing: { id: string; storage_path: string },
  file: {
    storagePath: string;
    mediaType: MediaType;
    mimeType: string;
    sizeBytes: number | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
  },
) {
  const { error: updateError } = await admin
    .from("media_items")
    .update({
      storage_path: file.storagePath,
      media_type: file.mediaType,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration_seconds: file.durationSeconds,
    })
    .eq("id", existing.id);
  if (updateError) throw new Error(updateError.message);

  const { error: removeError } = await admin.storage.from(BUCKET).remove([existing.storage_path]);
  if (removeError) {
    console.error(`Failed to remove old storage object "${existing.storage_path}" after replace:`, removeError.message);
  }
}

// Swaps a newer PDF in under the same deck. Page 1 stays page 1 — the same
// media_items row, repointed at the new image — so every playlist showing
// it keeps showing it, in place, with its own duration. A shorter PDF
// drops the pages past its end, which cascades them off any playlist or
// screen; a longer one adds its extra pages to the deck, for you to place
// wherever you want them.
export async function replaceDeckFiles(
  admin: Admin,
  deck: Deck,
  { storagePath, sizeBytes, pages }: { storagePath: string; sizeBytes: number; pages: DeckPageInput[] },
) {
  const { data: existing, error: existingError } = await admin
    .from("media_items")
    .select("id, storage_path, deck_position")
    .eq("deck_id", deck.id)
    .order("deck_position", { ascending: true });
  if (existingError) throw new Error(existingError.message);

  const current = existing ?? [];
  const staleObjects: string[] = [deck.storage_path];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const kept = current[i];
    if (kept) {
      const { error } = await admin
        .from("media_items")
        .update({
          storage_path: page.storagePath,
          mime_type: "image/jpeg",
          size_bytes: page.sizeBytes,
          width: page.width,
          height: page.height,
          name: pageName(deck.name, i),
          deck_position: i,
        })
        .eq("id", kept.id);
      if (error) throw new Error(error.message);
      staleObjects.push(kept.storage_path);
      continue;
    }
    const { error } = await admin.from("media_items").insert({
      folder_id: null,
      deck_id: deck.id,
      deck_position: i,
      name: pageName(deck.name, i),
      storage_path: page.storagePath,
      media_type: "image" as const,
      mime_type: "image/jpeg",
      size_bytes: page.sizeBytes,
      width: page.width,
      height: page.height,
      uploaded_by: deck.uploaded_by,
      uploaded_via_link: deck.uploaded_via_link,
      upload_link_folder_id: deck.upload_link_folder_id,
    });
    if (error) throw new Error(error.message);
  }

  const dropped = current.slice(pages.length);
  if (dropped.length > 0) {
    const { error } = await admin
      .from("media_items")
      .delete()
      .in("id", dropped.map((page) => page.id));
    if (error) throw new Error(error.message);
    staleObjects.push(...dropped.map((page) => page.storage_path));
  }

  const { error: updateError } = await admin
    .from("decks")
    .update({ storage_path: storagePath, size_bytes: sizeBytes, page_count: pages.length })
    .eq("id", deck.id);
  if (updateError) throw new Error(updateError.message);

  // Only once the swap itself has gone through: a failure above leaves the
  // deck pointing at files that are all still there. Cleaning up afterwards
  // is best-effort, like repointMediaItem's own.
  const { error: removeError } = await admin.storage.from(BUCKET).remove(staleObjects);
  if (removeError) {
    console.error(`Failed to remove ${staleObjects.length} replaced objects for deck "${deck.name}":`, removeError.message);
  }
}
