"use client";

import { DndContext, closestCenter, type DragEndEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { MediaThumb } from "@/components/MediaThumb";
import { animateEntrance, animateRemoval } from "@/lib/animation/listMotion";
import { usePresenceList, type PresenceState } from "@/lib/animation/usePresenceList";
import { kindLabel } from "@/lib/utils/format";
import type { MediaItem } from "@/types/domain";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Entry = { id: string; duration_seconds: number; media_item: MediaItem };

// The reorderable list of entries shared by a library playlist and a
// screen's Now Playing. Entries animate in when added and out when removed
// (see usePresenceList) — whichever way that happens: ✕, unticking a file,
// "Empty", a drop from the Media list, or the server's refresh. A removed
// row stays in place while it blurs out, then the list closes up around it.
//
// Rows are matched on their media file too, so an optimistic row being
// swapped for its saved copy (new id, same file) doesn't animate at all.
export function SortableEntryList<T extends Entry>({
  entries,
  sensors,
  onMove,
  editable = true,
  onRemove,
  canRemove = () => true,
  onDurationChange,
  removeLabel,
  empty,
}: {
  entries: T[];
  sensors: SensorDescriptor<SensorOptions>[];
  // Real item ids, even for a row whose on-screen key is still the
  // optimistic one it started out with.
  onMove: (activeId: string, overId: string) => void;
  // Off: a read-only list — no drag handles, no ✕, and durations shown as
  // plain text.
  editable?: boolean;
  onRemove?: (id: string) => void;
  canRemove?: (entry: T) => boolean;
  onDurationChange?: (id: string, seconds: number) => void;
  removeLabel?: string;
  empty: ReactNode;
}) {
  const [presence, onExited] = usePresenceList(
    entries,
    (e) => e.id,
    (e) => e.media_item.id,
  );

  if (presence.length === 0) return <>{empty}</>;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeEntry = presence.find((p) => p.renderKey === active.id);
    const overEntry = presence.find((p) => p.renderKey === over.id);
    if (!activeEntry || !overEntry || activeEntry.state === "exiting" || overEntry.state === "exiting") return;
    onMove(activeEntry.key, overEntry.key);
  }

  return (
    <DndContext sensors={editable ? sensors : []} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={presence.map((p) => p.renderKey)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {presence.map(({ renderKey, item, state }) => (
            <PlaylistEntryRow
              key={renderKey}
              sortableId={renderKey}
              entry={item}
              editable={editable}
              presence={state}
              onExited={() => onExited(renderKey)}
              removeLabel={removeLabel}
              onRemove={onRemove && canRemove(item) ? () => onRemove(item.id) : undefined}
              onDurationChange={(seconds) => onDurationChange?.(item.id, seconds)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// Leaving onRemove out disables ✕ — for rows that can't be removed yet
// (still waiting on their optimistic insert).
function PlaylistEntryRow({
  sortableId,
  entry,
  editable,
  presence,
  onExited,
  onRemove,
  onDurationChange,
  removeLabel = "Remove from playlist",
}: {
  sortableId: string;
  entry: Entry;
  editable: boolean;
  presence: PresenceState;
  onExited: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  onDurationChange: (seconds: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const rowRef = useRef<HTMLLIElement | null>(null);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  // Only a row that arrived after the list was already showing animates
  // in — the presence it mounted with decides that, later changes don't.
  const mountedAsEntering = useRef(presence === "entering");
  useLayoutEffect(() => {
    if (!mountedAsEntering.current) return;
    const entrance = animateEntrance(rowRef.current);
    return entrance.cancel;
  }, []);

  useEffect(() => {
    if (presence !== "exiting") return;
    let cancelled = false;
    const removal = animateRemoval(rowRef.current);
    removal.finished.then(() => {
      if (!cancelled) onExitedRef.current();
    });
    // Brought back before it finished leaving (a failed delete restored).
    return () => {
      cancelled = true;
      removal.cancel();
    };
  }, [presence]);

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
      {editable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="press-ghost cursor-grab touch-none px-1 text-muted active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          ≡
        </button>
      )}

      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-black/[.05] dark:bg-white/[.08]">
        <MediaThumb item={entry.media_item} />
      </div>

      <span className="min-w-0 flex-1 truncate text-[14px]">{entry.media_item.name}</span>

      <span className="hidden w-24 shrink-0 truncate text-[12px] text-muted sm:block">{kindLabel(entry.media_item)}</span>

      <span className="hidden w-24 shrink-0 text-[12px] text-muted md:block">{formatDate(entry.media_item.created_at)}</span>

      {entry.media_item.media_type === "video" ? (
        <span className="w-20 shrink-0 text-right text-[12px] text-muted">Full length</span>
      ) : !editable ? (
        <span className="w-20 shrink-0 text-right text-[12px] text-muted">{entry.duration_seconds} sec</span>
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

      {editable && (
        <button
          type="button"
          onClick={onRemove}
          disabled={!onRemove}
          className="press-ghost shrink-0 px-1 text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-muted"
          aria-label={removeLabel}
        >
          ✕
        </button>
      )}
    </li>
  );
}
