"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// A PDF in the library is a deck: the original file, plus one image per
// page rendered in the uploader's browser (see renderPdfPages). The pages
// are ordinary media_items, so nothing downstream — playlists, durations,
// the player — needs to know decks exist at all.

const BUCKET = "media";

export type SignedUpload = {
  storagePath: string;
  token: string;
};

async function signedUpload(extension: string): Promise<SignedUpload> {
  const admin = createAdminClient();
  const storagePath = `${randomUUID()}${extension}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { storagePath, token: data.token };
}

// One upload slot for the PDF itself and one per rendered page. Nothing is
// written to the database here: a deck row only appears once every one of
// its pages is actually in storage (see finalizeDeck).
export async function createDeckUploadUrls({ pageCount }: { pageCount: number }) {
  await requireSession();
  if (pageCount < 1) throw new Error("A PDF needs at least one page.");

  const original = await signedUpload(".pdf");
  const pages = await Promise.all(Array.from({ length: pageCount }, () => signedUpload(".jpg")));

  return { original, pages };
}

export type DeckPageInput = {
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export async function finalizeDeckUpload({
  name,
  folderId,
  storagePath,
  sizeBytes,
  pages,
}: {
  name: string;
  folderId: string | null;
  storagePath: string;
  sizeBytes: number;
  pages: DeckPageInput[];
}) {
  await requireSession();
  const admin = createAdminClient();

  const { data: deck, error: deckError } = await admin
    .from("decks")
    .insert({
      folder_id: folderId,
      name,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: sizeBytes,
      page_count: pages.length,
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
    })),
  );
  if (pagesError) {
    // Leaves nothing half-made in the library; the uploaded objects are
    // orphaned in storage, same as any other failed upload here.
    await admin.from("decks").delete().eq("id", deck.id);
    throw new Error(pagesError.message);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
  return deck;
}

// Swaps in a new PDF under the same deck. Page 1 stays page 1 — the same
// media_items row, repointed at the new image — so every playlist showing
// it keeps showing it, in place, with its own duration. A shorter PDF
// drops the pages past its end, which cascades them off any playlist or
// screen; a longer one adds its extra pages to the deck, for you to place
// wherever you want them.
export async function finalizeDeckReplace({
  deckId,
  storagePath,
  sizeBytes,
  pages,
}: {
  deckId: string;
  storagePath: string;
  sizeBytes: number;
  pages: DeckPageInput[];
}) {
  await requireSession();
  const admin = createAdminClient();

  const { data: deck, error: deckError } = await admin
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .single();
  if (deckError) throw new Error(deckError.message);

  const { data: existing, error: existingError } = await admin
    .from("media_items")
    .select("id, storage_path, deck_position")
    .eq("deck_id", deckId)
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
      deck_id: deckId,
      deck_position: i,
      name: pageName(deck.name, i),
      storage_path: page.storagePath,
      media_type: "image" as const,
      mime_type: "image/jpeg",
      size_bytes: page.sizeBytes,
      width: page.width,
      height: page.height,
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
    .eq("id", deckId);
  if (updateError) throw new Error(updateError.message);

  // Only once the swap itself has gone through: a failure above leaves the
  // deck pointing at files that are all still there. Cleaning up afterwards
  // is best-effort, like finalizeMediaReplace's own.
  const { error: removeError } = await admin.storage.from(BUCKET).remove(staleObjects);
  if (removeError) {
    console.error(`Failed to remove ${staleObjects.length} replaced objects for deck "${deck.name}":`, removeError.message);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function renameDeck(id: string, name: string) {
  await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();

  const { error } = await admin.from("decks").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);

  // The pages are named after the deck, so they follow it.
  const { data: pages, error: pagesError } = await admin
    .from("media_items")
    .select("id, deck_position")
    .eq("deck_id", id);
  if (pagesError) throw new Error(pagesError.message);
  await Promise.all(
    (pages ?? []).map((page) =>
      admin
        .from("media_items")
        .update({ name: pageName(trimmed, page.deck_position ?? 0) })
        .eq("id", page.id),
    ),
  );

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function moveDeck(id: string, folderId: string | null) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("decks").update({ folder_id: folderId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function deleteDeck(id: string) {
  await requireSession();
  const admin = createAdminClient();

  const [{ data: deck, error: deckError }, { data: pages, error: pagesError }] = await Promise.all([
    admin.from("decks").select("storage_path").eq("id", id).single(),
    admin.from("media_items").select("storage_path").eq("deck_id", id),
  ]);
  if (deckError) throw new Error(deckError.message);
  if (pagesError) throw new Error(pagesError.message);

  const objects = [deck.storage_path, ...(pages ?? []).map((page) => page.storage_path)];
  const { error: storageError } = await admin.storage.from(BUCKET).remove(objects);
  if (storageError) throw new Error(storageError.message);

  // media_items.deck_id cascades, which in turn cascades through
  // playlist_entries/playlist_items — so this also takes the deck off any
  // playlist or screen showing its pages.
  const { error: deleteError } = await admin.from("decks").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

function pageName(deckName: string, index: number) {
  return `${deckName} — Page ${index + 1}`;
}
