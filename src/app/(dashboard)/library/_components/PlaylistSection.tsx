"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InlineRename } from "@/components/InlineRename";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import {
  createPlaylist,
  deletePlaylist,
  removePlaylistEntry,
  renamePlaylist,
  updatePlaylistEntryDuration,
} from "@/lib/actions/playlists";
import type { Playlist, PlaylistEntryWithMedia } from "@/types/domain";
import { PlaylistEntryRow } from "./PlaylistEntryRow";

export type PlaylistWithEntries = Playlist & { entries: PlaylistEntryWithMedia[] };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PlaylistSection({
  className,
  playlists,
  activePlaylistId,
  selectedCount,
  onArmSelection,
  onCancelSelection,
  onConfirmAdd,
  onReorderPlaylists,
  onReorderEntries,
}: {
  className?: string;
  playlists: PlaylistWithEntries[];
  activePlaylistId: string | null;
  selectedCount: number;
  onArmSelection: (playlistId: string) => void;
  onCancelSelection: () => void;
  onConfirmAdd: (playlistId: string) => void;
  onReorderPlaylists: (next: PlaylistWithEntries[]) => void;
  onReorderEntries: (playlistId: string, nextEntries: PlaylistEntryWithMedia[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const playlist = await createPlaylist();
      router.refresh();
      setCreatingId(playlist.id);
      setExpanded((current) => new Set(current).add(playlist.id));
    });
  }

  function handleDragEndPlaylists(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = playlists.findIndex((p) => p.id === active.id);
    const newIndex = playlists.findIndex((p) => p.id === over.id);
    onReorderPlaylists(arrayMove(playlists, oldIndex, newIndex));
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-semibold tracking-tight">Playlists</h2>
        <Button onClick={handleCreate} disabled={pending}>
          + Create
        </Button>
      </div>

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
          <p className="text-[15px] font-medium">No playlists yet</p>
          <p className="text-sm text-muted">Create one to start grouping frequently-used content.</p>
        </div>
      ) : (
        // -mx-5 bleeds this out of the page's own left/right inset to reach
        // the screen edges, matching the media list; scroll-fade-y stands
        // in for the frame a rounded/bordered box would otherwise give
        // scrolled-past cards to fade into.
        <div className="scroll-fade-y -mx-5 min-h-0 flex-1 overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPlaylists}>
            <SortableContext items={playlists.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-3 pb-1">
                {playlists.map((playlist) => (
                  <PlaylistRow
                    key={playlist.id}
                    playlist={playlist}
                    isExpanded={expanded.has(playlist.id)}
                    onToggleExpanded={() => toggleExpanded(playlist.id)}
                    startInRename={creatingId === playlist.id}
                    onDoneRenaming={() => setCreatingId(null)}
                    isActive={activePlaylistId === playlist.id}
                    selectedCount={selectedCount}
                    onArmSelection={() => onArmSelection(playlist.id)}
                    onCancelSelection={onCancelSelection}
                    onConfirmAdd={() => onConfirmAdd(playlist.id)}
                    onReorderEntries={(next) => onReorderEntries(playlist.id, next)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function PlaylistRow({
  playlist,
  isExpanded,
  onToggleExpanded,
  startInRename,
  onDoneRenaming,
  isActive,
  selectedCount,
  onArmSelection,
  onCancelSelection,
  onConfirmAdd,
  onReorderEntries,
}: {
  playlist: PlaylistWithEntries;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  startInRename: boolean;
  onDoneRenaming: () => void;
  isActive: boolean;
  selectedCount: number;
  onArmSelection: () => void;
  onCancelSelection: () => void;
  onConfirmAdd: () => void;
  onReorderEntries: (nextEntries: PlaylistEntryWithMedia[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: playlist.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const totalSeconds = playlist.entries.reduce((sum, e) => sum + e.duration_seconds, 0);
  const fileCount = playlist.entries.length;

  function handleDragEndEntries(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = playlist.entries.findIndex((e) => e.id === active.id);
    const newIndex = playlist.entries.findIndex((e) => e.id === over.id);
    onReorderEntries(arrayMove(playlist.entries, oldIndex, newIndex));
  }

  function handleRemoveEntry(entryId: string) {
    // Still resolving from an optimistic add — router.refresh() will settle
    // it with a real id shortly; nothing to remove server-side yet.
    if (entryId.startsWith("optimistic-")) return;
    startTransition(async () => {
      await removePlaylistEntry(entryId);
      router.refresh();
    });
  }

  function handleDurationChange(entryId: string, seconds: number) {
    if (entryId.startsWith("optimistic-")) return;
    startTransition(async () => {
      await updatePlaylistEntryDuration(entryId, seconds);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePlaylist(playlist.id);
      router.refresh();
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-2 border-accent bg-surface p-3"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none px-1 text-muted active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          ≡
        </button>

        <button type="button" onClick={onToggleExpanded} className="text-muted">
          <Chevron open={isExpanded} />
        </button>

        <div className="min-w-0 flex-1">
          <InlineRename
            value={playlist.name}
            startInEditMode={startInRename}
            onSave={(next) => {
              renamePlaylist(playlist.id, next);
              onDoneRenaming();
              router.refresh();
            }}
            className="text-[15px] font-semibold"
          />
        </div>

        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDate(playlist.created_at)}</span>
        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDuration(totalSeconds)}</span>
        <span className="shrink-0 text-[12px] text-muted">
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={isActive ? onConfirmAdd : onArmSelection}
            disabled={isActive && selectedCount === 0}
            title={isActive ? "Add selected files" : "Add files"}
            className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-40"
          >
            {isActive && selectedCount > 0 ? `+${selectedCount}` : "+"}
          </button>
          {isActive && (
            <button
              type="button"
              onClick={onCancelSelection}
              title="Cancel selection"
              aria-label="Cancel selection"
              className="rounded-full bg-danger px-2 py-1 text-[13px] font-medium text-white hover:opacity-90"
            >
              ✕
            </button>
          )}
        </div>

        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-2 text-[13px]">
            <button type="button" disabled={pending} onClick={handleDelete} className="font-medium text-danger hover:opacity-70">
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-muted hover:opacity-70">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 text-[13px] text-muted hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-border pt-3">
          {playlist.entries.length === 0 ? (
            <p className="text-[13px] text-muted">No files yet — press + and select some from above.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndEntries}>
              <SortableContext items={playlist.entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2">
                  {playlist.entries.map((entry) => (
                    <PlaylistEntryRow
                      key={entry.id}
                      entry={entry}
                      onRemove={() => handleRemoveEntry(entry.id)}
                      onDurationChange={(seconds) => handleDurationChange(entry.id, seconds)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
