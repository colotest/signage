"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { deleteMediaItem } from "@/lib/actions/media";
import type { MediaItem } from "@/types/domain";
import { MediaThumb } from "@/components/MediaThumb";
import { ReplaceMediaButton } from "./ReplaceMediaButton";

export function MediaList({ items }: { items: MediaItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(item: MediaItem) {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens using it.`)) return;
    startTransition(async () => {
      await deleteMediaItem(item.id);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-20 text-center">
        <p className="text-[17px] font-medium">No files here</p>
        <p className="text-sm text-muted">Upload images, videos, or PDFs to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col overflow-hidden">
          <div className="aspect-video bg-black/[.04] dark:bg-white/[.06]">
            <MediaThumb item={item} />
          </div>
          <div className="flex flex-col gap-1 p-3">
            <p className="truncate text-[14px] font-medium">{item.name}</p>
            <p className="text-[12px] text-muted">
              {new Date(item.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <ReplaceMediaButton item={item} />
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDelete(item)}
                className="self-start text-[13px] text-danger hover:opacity-70"
              >
                Delete
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
