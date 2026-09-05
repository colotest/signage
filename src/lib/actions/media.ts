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
  width,
  height,
  durationSeconds,
}: {
  mediaItemId: string;
  folderId: string | null;
  name: string;
  storagePath: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
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
    width,
    height,
    duration_seconds: durationSeconds,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

// Mints a signed upload URL for a *replacement* file — always a fresh
// storage path, never the item's current one. That means nothing relies on
// cache invalidation to pick up the swap: any browser/player that already
// has the old URL loaded is completely unaffected until finalizeMediaReplace
// repoints the item, and even then it'll simply request a URL it's never
// seen before.
export async function createReplaceUploadUrl({
  filename,
  contentType,
}: {
  filename: string;
  contentType: string;
}) {
  await requireSession();
  const mediaType = mediaTypeFromMime(contentType);

  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const storagePath = `${randomUUID()}${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);

  return {
    storagePath,
    mediaType,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

// Repoints an existing media item at a newly-uploaded file — same id, so
// every playlist_items row referencing it (and any screen currently
// showing it) keeps working with no playlist rebuilding. The old object is
// only removed from storage after the row update succeeds, so a failed
// update never leaves the item pointing at something already deleted; a
// failure to clean up the now-orphaned old file afterward is logged but
// doesn't fail the whole operation, since the part the user actually
// cares about — the item now serving the new file — already succeeded.
export async function finalizeMediaReplace({
  mediaItemId,
  storagePath,
  mediaType,
  mimeType,
  sizeBytes,
  width,
  height,
  durationSeconds,
}: {
  mediaItemId: string;
  storagePath: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}) {
  await requireSession();
  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from("media_items")
    .select("storage_path")
    .eq("id", mediaItemId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error: updateError } = await admin
    .from("media_items")
    .update({
      storage_path: storagePath,
      media_type: mediaType,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      width,
      height,
      duration_seconds: durationSeconds,
    })
    .eq("id", mediaItemId);
  if (updateError) throw new Error(updateError.message);

  const { error: removeError } = await admin.storage.from(BUCKET).remove([existing.storage_path]);
  if (removeError) {
    console.error(`Failed to remove old storage object "${existing.storage_path}" after replace:`, removeError.message);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function renameMediaItem(id: string, name: string) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("media_items").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function moveMediaItem(id: string, folderId: string | null) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("media_items").update({ folder_id: folderId }).eq("id", id);
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
