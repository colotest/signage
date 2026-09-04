"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaThumb } from "@/components/MediaThumb";
import { kindLabel } from "@/lib/utils/format";
import type { PlaylistEntryWithMedia } from "@/types/domain";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PlaylistEntryRow({
  entry,
  onRemove,
  onDurationChange,
}: {
  entry: PlaylistEntryWithMedia;
  onRemove: () => void;
  onDurationChange: (seconds: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none px-1 text-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        ≡
      </button>

      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-black/[.05] dark:bg-white/[.08]">
        <MediaThumb item={entry.media_item} />
      </div>

      <span className="min-w-0 flex-1 truncate text-[14px]">{entry.media_item.name}</span>

      <span className="hidden w-24 shrink-0 truncate text-[12px] text-muted sm:block">{kindLabel(entry.media_item)}</span>

      <span className="hidden w-24 shrink-0 text-[12px] text-muted md:block">{formatDate(entry.media_item.created_at)}</span>

      {entry.media_item.media_type === "video" ? (
        <span className="w-20 shrink-0 text-right text-[12px] text-muted">Full length</span>
      ) : (
        <label className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
          <input
            type="number"
            min={1}
            defaultValue={entry.duration_seconds}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (value > 0) onDurationChange(value);
            }}
            className="w-14 rounded-[var(--radius-sm)] border border-border bg-transparent px-1.5 py-1 text-right text-foreground outline-none focus:ring-1 focus:ring-accent"
          />
          sec
        </label>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 px-1 text-muted hover:text-danger"
        aria-label="Remove from playlist"
      >
        ✕
      </button>
    </li>
  );
}
