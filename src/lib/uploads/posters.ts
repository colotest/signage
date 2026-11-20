import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { insertDeck, type DeckPageInput } from "./insertDeck";
import { posterPartName } from "@/lib/posters";
import { repointMediaItem, replaceDeckFiles } from "./replace";

type Admin = ReturnType<typeof createAdminClient>;

export type PosterImageInput = { storagePath: string; width: number; height: number; sizeBytes: number };

export type PosterFilesInput = {
  a1: { storagePath: string; sizeBytes: number; page: DeckPageInput };
  screen: PosterImageInput;
  newsletter: PosterImageInput;
};

// Every object in storage behind a poster: its PDF, the PDF's page image
// and its two PNGs.
export async function posterFiles(admin: Admin, posterId: string) {
  const [{ data: decks, error: decksError }, { data: images, error: imagesError }] = await Promise.all([
    admin.from("decks").select("id, storage_path").eq("poster_id", posterId),
    admin.from("media_items").select("storage_path").eq("poster_id", posterId),
  ]);
  if (decksError) throw new Error(decksError.message);
  if (imagesError) throw new Error(imagesError.message);
  const deckIds = (decks ?? []).map((deck) => deck.id);
  const { data: pages, error: pagesError } = deckIds.length
    ? await admin.from("media_items").select("storage_path").in("deck_id", deckIds)
    : { data: [], error: null };
  if (pagesError) throw new Error(pagesError.message);
  return [...(decks ?? []), ...(images ?? []), ...(pages ?? [])].map((row) => row.storage_path);
}

// A poster's files, once they're in storage: written fresh under it, or
// swapped in under the ones it has — same ids, so a screen showing its
// image shows the new one. Each is named for the poster as it's called now.
export async function writePosterFiles(
  admin: Admin,
  poster: { id: string; name: string },
  files: PosterFilesInput,
  // Who's making them, for files made fresh.
  userId: string,
) {
  const [{ data: deck, error: deckError }, { data: images, error: imagesError }] = await Promise.all([
    admin.from("decks").select("*").eq("poster_id", poster.id).maybeSingle(),
    admin.from("media_items").select("id, storage_path, poster_part").eq("poster_id", poster.id),
  ]);
  if (deckError) throw new Error(deckError.message);
  if (imagesError) throw new Error(imagesError.message);

  const a1Name = posterPartName(poster.name, "a1");
  if (deck) {
    await replaceDeckFiles(admin, { ...deck, name: a1Name }, { storagePath: files.a1.storagePath, sizeBytes: files.a1.sizeBytes, pages: [files.a1.page] });
    const { error } = await admin.from("decks").update({ name: a1Name }).eq("id", deck.id);
    if (error) throw new Error(error.message);
  } else {
    // In the poster, not a folder: the poster is what sits in one.
    const made = await insertDeck(admin, {
      name: a1Name,
      folderId: null,
      storagePath: files.a1.storagePath,
      sizeBytes: files.a1.sizeBytes,
      pages: [files.a1.page],
      uploadedBy: userId,
    });
    const { error } = await admin.from("decks").update({ poster_id: poster.id }).eq("id", made.id);
    if (error) throw new Error(error.message);
  }

  for (const part of ["screen", "newsletter"] as const) {
    const file = files[part];
    const existing = (images ?? []).find((image) => image.poster_part === part);
    const name = posterPartName(poster.name, part);
    if (existing) {
      await repointMediaItem(admin, existing, {
        storagePath: file.storagePath,
        mediaType: "image",
        mimeType: "image/png",
        sizeBytes: file.sizeBytes,
        width: file.width,
        height: file.height,
        durationSeconds: null,
      });
      const { error } = await admin.from("media_items").update({ name }).eq("id", existing.id);
      if (error) throw new Error(error.message);
      continue;
    }
    const { error } = await admin.from("media_items").insert({
      folder_id: null,
      poster_id: poster.id,
      poster_part: part,
      name,
      storage_path: file.storagePath,
      media_type: "image",
      mime_type: "image/png",
      size_bytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
  }
}
