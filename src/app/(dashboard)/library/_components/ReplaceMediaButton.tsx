"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { createReplaceUploadUrl, finalizeMediaReplace } from "@/lib/actions/media";
import { inspectFile } from "@/lib/media/inspectFile";
import { createBrowserClient } from "@/lib/supabase/client";
import type { MediaItem } from "@/types/domain";

export function ReplaceMediaButton({ item, className }: { item: MediaItem; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const proceed = window.confirm(
      `Replace the file behind "${item.name}" with "${file.name}"? Every playlist using this item will start showing the new file — nothing needs to be re-added.`,
    );
    if (!proceed) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const { storagePath, mediaType, token } = await createReplaceUploadUrl({
        filename: file.name,
        contentType: file.type,
      });

      const supabase = createBrowserClient();
      const [metadata, { error: uploadError }] = await Promise.all([
        inspectFile(file, mediaType),
        supabase.storage.from("media").uploadToSignedUrl(storagePath, token, file),
      ]);
      if (uploadError) throw uploadError;

      await finalizeMediaReplace({
        mediaItemId: item.id,
        storagePath,
        mediaType,
        mimeType: file.type,
        sizeBytes: file.size,
        width: metadata.width,
        height: metadata.height,
        durationSeconds: metadata.durationSeconds,
      });
      router.refresh();
    } catch (err) {
      console.error("Replace failed", item.name, err);
      alert(`Failed to replace "${item.name}": ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={className ?? "self-start text-[13px] text-muted hover:opacity-70"}
      >
        {uploading ? <Spinner className="inline h-3.5 w-3.5" /> : "Replace"}
      </button>
    </>
  );
}
