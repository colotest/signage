"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { createUploadUrl, finalizeMediaUpload } from "@/lib/actions/media";
import { inspectFile } from "@/lib/media/inspectFile";
import { createBrowserClient } from "@/lib/supabase/client";

export function UploadDropzone({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const supabase = createBrowserClient();

    setUploading((n) => n + files.length);
    await Promise.all(
      Array.from(files).map(async (file) => {
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
            folderId,
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

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading > 0}>
        {uploading > 0 ? <Spinner /> : null}
        {uploading > 0 ? `Uploading ${uploading}…` : "+ Upload"}
      </Button>
    </div>
  );
}
