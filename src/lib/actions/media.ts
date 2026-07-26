"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaType } from "@/types/domain";

const BUCKET = "media";

function mediaTypeFromMime(mimeType: string): MediaType {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  throw new Error(`Unsupported file type: ${mimeType}`);
}

// Mints a short-lived signed upload URL so the file bytes go straight from
// the browser to Supabase Storage — Vercel's serverless functions never see
// them, sidestepping the platform's request body size limit.
export async function createUploadUrl({
  filename,
  contentType,
}: {
  filename: string;
  contentType: string;
}) {
  await requireSession();
  const mediaType = mediaTypeFromMime(contentType);

  const mediaItemId = randomUUID();
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const storagePath = `${mediaItemId}${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);

  return {
    mediaItemId,
    storagePath,
    mediaType,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function finalizeMediaUpload({
  mediaItemId,
  folderId,
  name,
  storagePath,
  mediaType,
  mimeType,
  sizeBytes,
}: {
  mediaItemId: string;
  folderId: string | null;
  name: string;
  storagePath: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
}) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("media_items").insert({
    id: mediaItemId,
    folder_id: folderId,
    name,
    storage_path: storagePath,
    media_type: mediaType,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function deleteMediaItem(id: string) {
  await requireSession();
  const admin = createAdminClient();

  const { data: item, error: fetchError } = await admin
    .from("media_items")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error: storageError } = await admin.storage.from(BUCKET).remove([item.storage_path]);
  if (storageError) throw new Error(storageError.message);

  // playlist_items.media_item_id cascades, so this also removes it from any screen.
  const { error: deleteError } = await admin.from("media_items").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/library");
  revalidatePath("/dashboard");
}
