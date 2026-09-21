"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { MediaThumb } from "@/components/MediaThumb";
import { animateRemoval } from "@/lib/animation/removal";
import { kindLabel } from "@/lib/utils/format";
import type { MediaItem } from "@/types/domain";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Only the fields shared by a library playlist's entries and a screen's own
// playlist_items — the dashboard's Playback Menu renders the latter with this
// same row so both lists look and behave alike.
//
// The row animates itself out before onRemove runs, so callers can drop it
// from their state straight away. Leaving onRemove out disables ✕ — for rows
// that can't be removed yet (still waiting on their optimistic insert).
export function PlaylistEntryRow({
  entry,
  onRemove,
  onDurationChange,
  removeLabel = "Remove from playlist",
}: {
  entry: { id: string; duration_seconds: number; media_item: MediaItem };
  onRemove?: () => void;
  removeLabel?: string;
  onDurationChange: (seconds: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const rowRef = useRef<HTMLLIElement | null>(null);

  function handleRemove() {
    if (!onRemove) return;
    animateRemoval(rowRef.current).finished.then(onRemove);
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      style={style}
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="press-ghost cursor-grab touch-none px-1 text-muted active:cursor-grabbing"
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
        onClick={handleRemove}
        disabled={!onRemove}
        className="press-ghost shrink-0 px-1 text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-muted"
        aria-label={removeLabel}
      >
        ✕
      </button>
    </li>
  );
}
