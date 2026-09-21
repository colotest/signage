"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUploadUrl, finalizeMediaUpload } from "@/lib/actions/media";
import { inspectFile } from "@/lib/media/inspectFile";
import { createBrowserClient } from "@/lib/supabase/client";

// The one upload pipeline behind every "+ Upload" button and OS file drop —
// the Library page and the dashboard's Playback Menu file picker both use
// it, so the two can't drift apart. `uploading` is the in-progress count.
export function useMediaUpload(targetFolderId: string | null) {
  const router = useRouter();
  const [uploading, setUploading] = useState(0);

  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const supabase = createBrowserClient();

    setUploading((n) => n + fileArray.length);
    await Promise.all(
      fileArray.map(async (file) => {
        try {
          const { mediaItemId, storagePath, mediaType, token } = await createUploadUrl({
            filename: file.name,
            contentType: file.type,
          });

          const [metadata, { error: uploadError }] = await Promise.all([
            inspectFile(file, mediaType),
            supabase.storage.from("media").uploadToSignedUrl(storagePath, token, file),
          ]);
          if (uploadError) throw uploadError;

          await finalizeMediaUpload({
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
        } catch (err) {
          console.error("Upload failed", file.name, err);
          alert(`Failed to upload "${file.name}": ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    router.refresh();
  }

  return { uploading, uploadFiles };
}
