"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertDeck, type DeckPageInput } from "@/lib/uploads/insertDeck";
import { folderForUploadLink } from "@/lib/uploads/links";
import { MAX_PDF_PAGES, MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";
import { repointMediaItem, replaceDeckFiles } from "@/lib/uploads/replace";
import type { MediaType } from "@/types/domain";

// Upload links (see 0024_folder_upload_links.sql): the dashboard side turns
// a folder's link on and off; the rest is what /upload/<token> calls, with
// no session at all — the token is the only credential, and the folder a
// file lands in always comes from it, never from the browser.

const BUCKET = "media";

type Admin = ReturnType<typeof createAdminClient>;

// ── Dashboard ────────────────────────────────────────────────────────────

// Returns the folder's link token, making one the first time. Asking again
// hands back the same link, so it can be copied as often as needed.
export async function createUploadLink(folderId: string): Promise<string> {
  const user = await requireSession();
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("folder_upload_links")
    .select("token")
    .eq("folder_id", folderId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.token;

  const token = randomBytes(18).toString("base64url");
  const { error } = await admin.from("folder_upload_links").insert({ folder_id: folderId, token, created_by: user.id });
  if (error) throw new Error(error.message);

  const { data: folder } = await admin.from("folders").select("name").eq("id", folderId).maybeSingle();
  recordActivity(user, { action: "folder.upload_link.create", summary: `Shared an upload link to ${quote(folder?.name)}` });
  revalidatePath("/library");
  return token;
}

export async function revokeUploadLink(folderId: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("folder_upload_links").delete().eq("folder_id", folderId);
  if (error) throw new Error(error.message);

  const { data: folder } = await admin.from("folders").select("name").eq("id", folderId).maybeSingle();
  recordActivity(user, { action: "folder.upload_link.revoke", summary: `Turned off the upload link to ${quote(folder?.name)}` });
  revalidatePath("/library");
}

// ── Public, token-bound ──────────────────────────────────────────────────

async function requireLinkFolder(admin: Admin, token: string) {
  const folder = await folderForUploadLink(admin, token);
  if (!folder) throw new Error("This upload link is no longer active.");
  return folder;
}

// Everything uploaded through a link goes under its folder's own prefix.
// That's what lets the finalize steps below trust a storage path the
// browser sends back: a signed URL minted here can only ever have written
// inside it, so a path outside it can't be one of this link's uploads.
function linkPrefix(folderId: string) {
  return `uploads/${folderId}/`;
}

async function signedUpload(admin: Admin, folderId: string, extension: string) {
  const storagePath = `${linkPrefix(folderId)}${randomUUID()}${extension}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { storagePath, token: data.token };
}

// Checks what actually landed in storage rather than what the browser
// says it sent — the size limit is only real if it's enforced here.
async function verifyUploaded(admin: Admin, folderId: string, storagePath: string, maxBytes: number) {
  if (!storagePath.startsWith(linkPrefix(folderId)) || storagePath.includes("..")) {
    throw new Error("That upload doesn't belong to this link.");
  }
  const { data, error } = await admin.storage.from(BUCKET).info(storagePath);
  if (error || !data) throw new Error("The file didn't finish uploading. Please try again.");
  if ((data.size ?? 0) > maxBytes) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Files can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  return data.size ?? null;
}

function mediaTypeFromMime(mimeType: string): Exclude<MediaType, "pdf" | "page"> {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  throw new Error("Only images, videos and PDFs can be uploaded.");
}

function extensionOf(filename: string) {
  const match = /\.[A-Za-z0-9]{1,8}$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

// Same shape as createUploadUrl in media.ts, so the shared upload pipeline
// (useMediaUpload) can run on either.
export async function createLinkUploadUrl(
  linkToken: string,
  { filename, contentType }: { filename: string; contentType: string },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  const mediaType = mediaTypeFromMime(contentType);
  const { storagePath, token } = await signedUpload(admin, folder.id, extensionOf(filename));
  return { mediaItemId: randomUUID(), storagePath, mediaType, token };
}

export async function finalizeLinkMediaUpload(
  linkToken: string,
  {
    mediaItemId,
    name,
    storagePath,
    mimeType,
    width,
    height,
    durationSeconds,
  }: {
    mediaItemId: string;
    name: string;
    storagePath: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
  },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  const sizeBytes = await verifyUploaded(admin, folder.id, storagePath, MAX_UPLOAD_BYTES);

  const { error } = await admin.from("media_items").insert({
    id: mediaItemId,
    folder_id: folder.id,
    name: name.slice(0, 255),
    storage_path: storagePath,
    media_type: mediaTypeFromMime(mimeType),
    mime_type: mimeType,
    size_bytes: sizeBytes,
    width,
    height,
    duration_seconds: durationSeconds,
    uploaded_via_link: true,
    upload_link_folder_id: folder.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function createLinkDeckUploadUrls(linkToken: string, { pageCount }: { pageCount: number }) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("A PDF needs at least one page.");
  if (pageCount > MAX_PDF_PAGES) throw new Error(`PDFs can have at most ${MAX_PDF_PAGES} pages.`);

  const original = await signedUpload(admin, folder.id, ".pdf");
  const pages = await Promise.all(Array.from({ length: pageCount }, () => signedUpload(admin, folder.id, ".jpg")));
  return { original, pages };
}

export async function finalizeLinkDeckUpload(
  linkToken: string,
  { name, storagePath, pages }: { name: string; storagePath: string; pages: DeckPageInput[] },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  if (pages.length < 1 || pages.length > MAX_PDF_PAGES) throw new Error("That PDF has an unexpected number of pages.");

  const sizeBytes = await verifyUploaded(admin, folder.id, storagePath, MAX_UPLOAD_BYTES);
  const pageSizes = await Promise.all(
    pages.map((page) => verifyUploaded(admin, folder.id, page.storagePath, MAX_UPLOAD_BYTES)),
  );

  await insertDeck(admin, {
    name: name.slice(0, 255),
    folderId: folder.id,
    storagePath,
    sizeBytes: sizeBytes ?? 0,
    pages: pages.map((page, i) => ({ ...page, sizeBytes: pageSizes[i] ?? page.sizeBytes })),
    uploadedBy: { linkFolderId: folder.id },
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

// Replacing goes through the same checks as uploading, plus one more: the
// item being replaced has to be one this page actually lists — a file or
// PDF sitting directly in the link's own folder.

export async function createLinkReplaceUploadUrl(
  linkToken: string,
  { filename, contentType }: { filename: string; contentType: string },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  const mediaType = mediaTypeFromMime(contentType);
  const { storagePath, token } = await signedUpload(admin, folder.id, extensionOf(filename));
  return { storagePath, mediaType, token };
}

export async function finalizeLinkMediaReplace(
  linkToken: string,
  {
    mediaItemId,
    storagePath,
    mimeType,
    width,
    height,
    durationSeconds,
  }: {
    mediaItemId: string;
    storagePath: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
  },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);

  const { data: existing, error } = await admin
    .from("media_items")
    .select("id, storage_path, folder_id, deck_id, media_type")
    .eq("id", mediaItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing || existing.folder_id !== folder.id || existing.deck_id || existing.media_type === "page") {
    throw new Error("That file isn't in this folder.");
  }

  const sizeBytes = await verifyUploaded(admin, folder.id, storagePath, MAX_UPLOAD_BYTES);
  await repointMediaItem(admin, existing, {
    storagePath,
    mediaType: mediaTypeFromMime(mimeType),
    mimeType,
    sizeBytes,
    width,
    height,
    durationSeconds,
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

export async function finalizeLinkDeckReplace(
  linkToken: string,
  { deckId, storagePath, pages }: { deckId: string; storagePath: string; pages: DeckPageInput[] },
) {
  const admin = createAdminClient();
  const folder = await requireLinkFolder(admin, linkToken);
  if (pages.length < 1 || pages.length > MAX_PDF_PAGES) throw new Error("That PDF has an unexpected number of pages.");

  const { data: deck, error } = await admin.from("decks").select("*").eq("id", deckId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!deck || deck.folder_id !== folder.id) throw new Error("That PDF isn't in this folder.");

  const sizeBytes = await verifyUploaded(admin, folder.id, storagePath, MAX_UPLOAD_BYTES);
  const pageSizes = await Promise.all(
    pages.map((page) => verifyUploaded(admin, folder.id, page.storagePath, MAX_UPLOAD_BYTES)),
  );
  await replaceDeckFiles(admin, deck, {
    storagePath,
    sizeBytes: sizeBytes ?? 0,
    pages: pages.map((page, i) => ({ ...page, sizeBytes: pageSizes[i] ?? page.sizeBytes })),
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
}
