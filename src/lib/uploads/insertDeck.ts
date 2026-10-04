import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type DeckPageInput = {
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
};

// Writes a deck and its pages once every file is already in storage — the
// one step shared by the Library's own uploads and upload links.
export async function insertDeck(
  admin: Admin,
  {
    name,
    folderId,
    storagePath,
    sizeBytes,
    pages,
    uploadedBy,
  }: {
    name: string;
    folderId: string | null;
    storagePath: string;
    sizeBytes: number;
    pages: DeckPageInput[];
    // Who added it: a signed-in user's id, or the folder whose upload link
    // it came in through.
    uploadedBy: string | { linkFolderId: string };
  },
) {
  const uploader =
    typeof uploadedBy === "string"
      ? { uploaded_by: uploadedBy, uploaded_via_link: false, upload_link_folder_id: null }
      : { uploaded_by: null, uploaded_via_link: true, upload_link_folder_id: uploadedBy.linkFolderId };

  const { data: deck, error: deckError } = await admin
    .from("decks")
    .insert({
      folder_id: folderId,
      name,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: sizeBytes,
      page_count: pages.length,
      ...uploader,
    })
    .select()
    .single();
  if (deckError) throw new Error(deckError.message);

  const { error: pagesError } = await admin.from("media_items").insert(
    pages.map((page, i) => ({
      // Pages live in the deck, not in a folder: the deck is what sits in
      // one, and moving it moves them with it.
      folder_id: null,
      deck_id: deck.id,
      deck_position: i,
      name: pageName(name, i),
      storage_path: page.storagePath,
      media_type: "image" as const,
      mime_type: "image/jpeg",
      size_bytes: page.sizeBytes,
      width: page.width,
      height: page.height,
      ...uploader,
    })),
  );
  if (pagesError) {
    // Leaves nothing half-made in the library; the uploaded objects are
    // orphaned in storage, same as any other failed upload here.
    await admin.from("decks").delete().eq("id", deck.id);
    throw new Error(pagesError.message);
  }

  return deck;
}

export function pageName(deckName: string, index: number) {
  return `${deckName} — Page ${index + 1}`;
}
