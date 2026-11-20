"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { folderName, quote, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { posterFiles } from "@/lib/uploads/posters";

// A Poster in the library (see 0051_posters.sql): one event's poster as a
// single thing, holding its A1 PDF and its two images. It moves and is
// deleted as one; its files can't be on their own.

const BUCKET = "media";

async function signedUpload(extension: string) {
  const admin = createAdminClient();
  const storagePath = `${randomUUID()}${extension}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { storagePath, token: data.token };
}

// Upload slots for a poster's files: the A1 PDF and the image of its page
// (its thumbnail in the library), and the two PNGs.
export async function createPosterUploadUrls() {
  await requirePage("media");
  const [a1, a1Page, screen, newsletter] = await Promise.all([
    signedUpload(".pdf"),
    signedUpload(".jpg"),
    signedUpload(".png"),
    signedUpload(".png"),
  ]);
  return { a1, a1Page, screen, newsletter };
}

export async function movePoster(id: string, folderId: string | null) {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const { data: moved, error } = await admin.from("posters").update({ folder_id: folderId }).eq("id", id).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "poster.move",
    target: `poster:${id}`,
    summary: async (admin) => `Moved poster ${quote(moved?.[0]?.name)} to ${await folderName(admin, folderId)}`,
  });
  revalidatePath("/library");
}

// The poster and all three of its files, which also takes its images off
// any playlist or screen showing them.
export async function deletePoster(id: string) {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const { data: poster, error } = await admin.from("posters").select("name").eq("id", id).single();
  if (error) throw new Error(error.message);

  const objects = await posterFiles(admin, id);
  const { error: storageError } = await admin.storage.from(BUCKET).remove(objects);
  if (storageError) throw new Error(storageError.message);
  // Its deck and media items cascade, and their pages and playlist rows
  // with them.
  const { error: deleteError } = await admin.from("posters").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);
  recordActivity(user, { action: "poster.delete", summary: `Deleted poster ${quote(poster.name)}` });

  revalidatePath("/library");
  revalidatePath("/dashboard");
}
