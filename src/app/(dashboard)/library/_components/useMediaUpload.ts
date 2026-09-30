"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUploadUrl, finalizeMediaUpload } from "@/lib/actions/media";
import { createDeckUploadUrls, finalizeDeckUpload } from "@/lib/actions/decks";
import { inspectFile } from "@/lib/media/inspectFile";
import { renderPdfPages } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";
import type { MediaType } from "@/types/domain";

// The Server Actions the pipeline runs on. The dashboard's own (signed-in)
// ones by default; the public upload page swaps in ones bound to its
// link's token, which pick the folder themselves.
export type UploadActions = {
  createUploadUrl: (input: Parameters<typeof createUploadUrl>[0]) => Promise<{
    mediaItemId: string;
    storagePath: string;
    mediaType: MediaType;
    token: string;
  }>;
  finalizeMediaUpload: (input: Parameters<typeof finalizeMediaUpload>[0]) => Promise<unknown>;
  createDeckUploadUrls: typeof createDeckUploadUrls;
  finalizeDeckUpload: (input: Parameters<typeof finalizeDeckUpload>[0]) => Promise<unknown>;
};

const SESSION_ACTIONS: UploadActions = {
  createUploadUrl,
  finalizeMediaUpload,
  createDeckUploadUrls,
  finalizeDeckUpload,
};

// The one upload pipeline behind every "+ Upload" button and OS file drop —
// the Library page, the dashboard's Playback Menu file picker and the
// public upload page all use it, so they can't drift apart. `uploading` is
// the in-progress count.
export function useMediaUpload(targetFolderId: string | null, actions: UploadActions = SESSION_ACTIONS) {
  const router = useRouter();
  const [uploading, setUploading] = useState(0);
  // What a PDF is busy doing, since splitting one into pages takes long
  // enough that a bare spinner would look stuck.
  const [status, setStatus] = useState<string | null>(null);

  // Resolves to how many of the files made it.
  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return 0;
    const supabase = createBrowserClient();
    let succeeded = 0;

    setUploading((n) => n + fileArray.length);
    await Promise.all(
      fileArray.map(async (file) => {
        try {
          if (isPdf(file)) {
            await uploadDeck(file);
            succeeded++;
            return;
          }

          const { mediaItemId, storagePath, mediaType, token } = await actions.createUploadUrl({
            filename: file.name,
            contentType: file.type,
          });

          const [metadata, { error: uploadError }] = await Promise.all([
            inspectFile(file, mediaType),
            supabase.storage.from("media").uploadToSignedUrl(storagePath, token, file),
          ]);
          if (uploadError) throw uploadError;

          await actions.finalizeMediaUpload({
            mediaItemId,
            folderId: targetFolderId,
            name: file.name,
            storagePath,
            mediaType,
            mimeType: file.type,
            sizeBytes: file.size,
            width: metadata.width,
            height: metadata.height,
            durationSeconds: metadata.durationSeconds,
          });
          succeeded++;
        } catch (err) {
          console.error("Upload failed", file.name, err);
          alert(`Failed to upload "${file.name}": ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    setStatus(null);
    router.refresh();
    return succeeded;
  }

  // A PDF becomes a deck: the original file, plus an image per page
  // rendered right here in the browser. Every page has to be in storage
  // before the deck itself is written, so a failure part way through
  // leaves nothing half-made in the library.
  async function uploadDeck(file: File) {
    const supabase = createBrowserClient();
    const name = stripExtension(file.name);

    setStatus(`Reading ${name}…`);
    const pages = await renderPdfPages(file, (done, total) => setStatus(`Rendering page ${done} of ${total}…`));

    const { original, pages: slots } = await actions.createDeckUploadUrls({ pageCount: pages.length });

    setStatus(`Uploading ${name}…`);
    const { error: originalError } = await supabase.storage
      .from("media")
      .uploadToSignedUrl(original.storagePath, original.token, file);
    if (originalError) throw originalError;

    let uploaded = 0;
    await Promise.all(
      pages.map(async (page, i) => {
        const slot = slots[i];
        const { error } = await supabase.storage.from("media").uploadToSignedUrl(slot.storagePath, slot.token, page.blob);
        if (error) throw error;
        uploaded++;
        setStatus(`Uploading page ${uploaded} of ${pages.length}…`);
      }),
    );

    await actions.finalizeDeckUpload({
      name,
      folderId: targetFolderId,
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

  return { uploading, status, uploadFiles };
}

// Some browsers hand over an empty type for a file dragged out of certain
// apps, so the extension is worth a look too.
export function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function stripExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
