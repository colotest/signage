"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { folderName, quote, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { requireEditable } from "@/lib/auth/owned";
import { createAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/origin";
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
  await requirePage("media");
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
  const user = await requirePage("media");
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
  await requirePage("media");
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
  const user = await requireEditable("media", mediaItemId);
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
  const user = await requireEditable("media", id);
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
  const user = await requireEditable("media", id);
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
  const user = await requireEditable("media", id);
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

// The Website page's address (see 0055 and screenPages/Website.tsx), from
// its Edit Website. Empty clears it. An address without a scheme is taken
// to be https. Returns the address as saved, and — since many sites refuse
// to be shown inside another page — whether this one looks like it will,
// so the dialog can say so before a screen shows the browser's refusal.
export async function setWebsiteUrl(id: string, input: string): Promise<{ url: string | null; warning: string | null }> {
  const user = await requireEditable("media", id);
  const admin = createAdminClient();
  const { data: item, error: fetchError } = await admin
    .from("media_items")
    .select("name, storage_path, page_url")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  if (item.storage_path !== "page:website") throw new Error("Only the Website page has an address.");

  const url = normalizeWebsiteUrl(input);
  const { error } = await admin.from("media_items").update({ page_url: url }).eq("id", id);
  if (error) throw new Error(error.message);
  if (url !== item.page_url) {
    recordActivity(user, {
      action: "media.website",
      target: `media:${id}`,
      summary: url ? `Set ${quote(item.name)} to show ${url}` : `Cleared the address on ${quote(item.name)}`,
    });
  }
  revalidatePath("/library");
  revalidatePath("/dashboard");

  return { url, warning: url ? await framingWarning(url) : null };
}

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That isn't a web address.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only http and https addresses can be shown.");
  if (!parsed.hostname.includes(".")) throw new Error("That isn't a web address.");
  return parsed.toString();
}

// Reads the site's headers for the two ways it can say "not in a frame":
// X-Frame-Options, and a CSP's frame-ancestors. Only ever a hint — a site
// may answer a server differently from a TV's browser — so nothing stops
// the address being saved; nor does a site that can't be reached from here.
async function framingWarning(url: string): Promise<string | null> {
  if (url.startsWith("http:")) {
    return "This address isn't https: the screens load over https, and their browser will refuse to show it.";
  }
  // Nothing to ask of an address that names no public host.
  const { hostname } = new URL(url);
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return null;
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { accept: "text/html" } });
  } catch {
    return null;
  }
  response.body?.cancel().catch(() => {});

  const refused = "This site doesn't allow itself to be shown inside another page, so screens will likely show an error instead.";
  const xfo = response.headers.get("x-frame-options")?.toLowerCase() ?? "";
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return refused;
  const ancestors = (response.headers.get("content-security-policy") ?? "")
    .split(";")
    .map((directive) => directive.trim().toLowerCase())
    .find((directive) => directive.startsWith("frame-ancestors"));
  if (ancestors) {
    const ours = new URL(await appOrigin()).hostname;
    const sources = ancestors.split(/\s+/).slice(1);
    if (!sources.some((source) => frameSourceAllows(source, ours))) return refused;
  }
  return null;
}

// Whether one frame-ancestors source lets the player's host frame the page:
// any host, any https page, or ours by name (a "*." wildcard included).
function frameSourceAllows(source: string, host: string): boolean {
  if (source === "*" || source === "https:") return true;
  const named = source.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  if (named.startsWith("*.")) return host.endsWith(named.slice(1));
  return named === host;
}
