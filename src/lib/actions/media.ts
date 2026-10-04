"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { folderName, quote, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { repointMediaItem } from "@/lib/uploads/replace";
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
  const user = await requireSession();
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
    uploaded_by: user.id,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "media.upload", summary: `Uploaded ${quote(name)}` });
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

// Repoints an existing media item at a newly-uploaded file — see
// repointMediaItem.
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
  const user = await requireSession();
  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from("media_items")
    .select("name, storage_path, media_type")
    .eq("id", mediaItemId)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (existing.media_type === "page") throw new Error("Built-in pages can't be replaced.");

  await repointMediaItem(admin, { id: mediaItemId, storage_path: existing.storage_path }, {
    storagePath,
    mediaType,
    mimeType,
    sizeBytes,
    width,
    height,
    durationSeconds,
  });
  recordActivity(user, { action: "media.replace", summary: `Replaced the file behind ${quote(existing.name)}` });

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function renameMediaItem(id: string, name: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: before } = await admin.from("media_items").select("name").eq("id", id).maybeSingle();
  const { error } = await admin.from("media_items").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "media.rename",
    target: `media:${id}`,
    summary: `Renamed ${quote(before?.name)} to ${quote(name)}`,
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function moveMediaItem(id: string, folderId: string | null) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: moved, error } = await admin
    .from("media_items")
    .update({ folder_id: folderId })
    .eq("id", id)
    .select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "media.move",
    target: `media:${id}`,
    summary: async (admin) => `Moved ${quote(moved?.[0]?.name)} to ${await folderName(admin, folderId)}`,
  });
  revalidatePath("/library");
}

export async function deleteMediaItem(id: string) {
  const user = await requireSession();
  const admin = createAdminClient();

  const { data: item, error: fetchError } = await admin
    .from("media_items")
    .select("name, storage_path, media_type")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (item.media_type === "page") throw new Error("Built-in pages can't be deleted.");

  const { error: storageError } = await admin.storage.from(BUCKET).remove([item.storage_path]);
  if (storageError) throw new Error(storageError.message);

  // playlist_items.media_item_id cascades, so this also removes it from any screen.
  const { error: deleteError } = await admin.from("media_items").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);
  recordActivity(user, { action: "media.delete", summary: `Deleted ${quote(item.name)}` });

  revalidatePath("/library");
  revalidatePath("/dashboard");
}
