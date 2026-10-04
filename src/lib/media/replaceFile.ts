import { createDeckUploadUrls, finalizeDeckReplace } from "@/lib/actions/decks";
import { createReplaceUploadUrl, finalizeMediaReplace } from "@/lib/actions/media";
import { inspectFile } from "@/lib/media/inspectFile";
import { prepareImage } from "@/lib/media/prepareImage";
import { renderPdfPages } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";
import type { MediaType } from "@/types/domain";

// Swapping a new file in under an existing library item, from the
// browser's side — the Library's Replace buttons and the public upload
// page's both run these, on the signed-in actions or on ones bound to an
// upload link (like useMediaUpload's UploadActions).
export type ReplaceActions = {
  createReplaceUploadUrl: (input: { filename: string; contentType: string }) => Promise<{
    storagePath: string;
    mediaType: MediaType;
    token: string;
  }>;
  finalizeMediaReplace: (input: Parameters<typeof finalizeMediaReplace>[0]) => Promise<unknown>;
  createDeckUploadUrls: typeof createDeckUploadUrls;
  finalizeDeckReplace: (input: Parameters<typeof finalizeDeckReplace>[0]) => Promise<unknown>;
};

export const SESSION_REPLACE_ACTIONS: ReplaceActions = {
  createReplaceUploadUrl,
  finalizeMediaReplace,
  createDeckUploadUrls,
  finalizeDeckReplace,
};

export async function replaceMediaFile(file: File, mediaItemId: string, actions: ReplaceActions = SESSION_REPLACE_ACTIONS) {
  const { storagePath, mediaType, token } = await actions.createReplaceUploadUrl({
    filename: file.name,
    contentType: file.type,
  });

  const supabase = createBrowserClient();
  // What actually goes up — see prepareImage.
  const upload = mediaType === "image" ? await prepareImage(file) : file;
  const [metadata, { error: uploadError }] = await Promise.all([
    inspectFile(upload, mediaType),
    supabase.storage.from("media").uploadToSignedUrl(storagePath, token, upload),
  ]);
  if (uploadError) throw uploadError;

  await actions.finalizeMediaReplace({
    mediaItemId,
    storagePath,
    mediaType,
    mimeType: file.type,
    sizeBytes: upload.size,
    width: metadata.width,
    height: metadata.height,
    durationSeconds: metadata.durationSeconds,
  });
}

export type DeckReplaceProgress = { phase: "reading" } | { phase: "rendering"; done: number; total: number } | { phase: "uploading" };

// A newer PDF under the same deck: its pages are rendered here, uploaded
// alongside the PDF itself, and only then swapped in (see replaceDeckFiles).
export async function replaceDeckFile(
  file: File,
  deckId: string,
  onProgress: (progress: DeckReplaceProgress) => void,
  actions: ReplaceActions = SESSION_REPLACE_ACTIONS,
) {
  onProgress({ phase: "reading" });
  const pages = await renderPdfPages(file, (done, total) => onProgress({ phase: "rendering", done, total }));
  const { original, pages: slots } = await actions.createDeckUploadUrls({ pageCount: pages.length });

  const supabase = createBrowserClient();
  onProgress({ phase: "uploading" });
  const { error: originalError } = await supabase.storage
    .from("media")
    .uploadToSignedUrl(original.storagePath, original.token, file);
  if (originalError) throw originalError;

  await Promise.all(
    pages.map(async (page, i) => {
      const { error } = await supabase.storage.from("media").uploadToSignedUrl(slots[i].storagePath, slots[i].token, page.blob);
      if (error) throw error;
    }),
  );

  await actions.finalizeDeckReplace({
    deckId,
    storagePath: original.storagePath,
    sizeBytes: file.size,
    pages: pages.map((page, i) => ({
      storagePath: slots[i].storagePath,
      width: page.width,
      height: page.height,
      sizeBytes: page.blob.size,
    })),
  });
}
