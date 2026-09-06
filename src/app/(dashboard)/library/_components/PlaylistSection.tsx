"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
import { ThreeDotIcon, type SortDir } from "./FileTree";
import { PlaylistEntryRow } from "./PlaylistEntryRow";

export type PlaylistWithEntries = Playlist & { entries: PlaylistEntryWithMedia[] };

// Manual drag-reordering is gone (see PlaylistSortMenuButton) — playlists are
// always shown in a deterministic order instead, so a newly-created playlist
// automatically lands in the right spot under whichever criterion is active
// rather than needing to be dragged there.
type PlaylistSortKey = "name" | "date";

function playlistSortValue(playlist: PlaylistWithEntries, key: PlaylistSortKey): string | number {
  switch (key) {
    case "name":
      return playlist.name.toLowerCase();
    case "date":
      return new Date(playlist.created_at).getTime();
  }
}

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
  onReorderEntries,
}: {
  className?: string;
  playlists: PlaylistWithEntries[];
  activePlaylistId: string | null;
  selectedCount: number;
  onArmSelection: (playlistId: string) => void;
  onCancelSelection: () => void;
  onConfirmAdd: (playlistId: string) => void;
  onReorderEntries: (playlistId: string, nextEntries: PlaylistEntryWithMedia[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<PlaylistSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: PlaylistSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortPlaylists(items: PlaylistWithEntries[]) {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = playlistSortValue(a, sortKey);
      const bv = playlistSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }

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

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* relative z-10 keeps this above the list below, which overlaps up
          underneath it (see the scrolling div's own -mt-10) so scrolled-past
          cards fade away rather than popping in and out below this row. */}
      <div className="relative z-10 flex items-center justify-between">
        <h2 className="text-[28px] font-semibold tracking-tight">Playlists</h2>
        <div className="flex items-center gap-3">
          <Button onClick={handleCreate} disabled={pending}>
            + Create
          </Button>
          <PlaylistSortMenuButton sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />
        </div>
      </div>

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
          <p className="text-[15px] font-medium">No playlists yet</p>
          <p className="text-sm text-muted">Create one to start grouping frequently-used content.</p>
        </div>
      ) : (
        // Not edge-to-edge — sits inside the page's normal left/right inset
        // rather than bleeding to the screen edges, just a little wider via
        // the -10px side margin. Each row is its own rounded, bordered card
        // (see PlaylistRow) rather than this whole list being one bordered
        // box. -mt-10 pulls the list up 40px, overlapping the title row
        // above (which needs its own relative z-10 to stay on top) so
        // scrolled-past cards fade away underneath it instead of popping in
        // and out below it. pt-10/playlists-bottom-inset (padding on this
        // scrolling element itself, not on the <ul> it wraps — percentage
        // heights on a child of an auto-overflow box are exactly the kind of
        // thing Safari gets flexbox-inconsistent about) keep scroll-fade-y's
        // (now 40px) fade off the first/last card and, at the bottom only
        // since this is the last section on the page, reserve enough room
        // to clear Safari's floating toolbar — all while the container's
        // own height (flex-1, reaching the screen edge) stays untouched.
        <div className="scroll-fade-y playlists-bottom-inset -mt-10 mx-[-10px] min-h-0 flex-1 overflow-y-auto pt-10">
          <ul className="flex flex-col gap-3">
            {sortPlaylists(playlists).map((playlist) => (
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
    <li className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
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

// Unlike FileTree's mobile-only version of this button, this one shows on
// every viewport — playlists have no separate desktop sort bar to fall back
// on, so this is the only way to control their order. Stays open after
// picking an option, same as FileTree's menu.
function PlaylistSortMenuButton({
  sortKey,
  sortDir,
  onToggleSort,
}: {
  sortKey: PlaylistSortKey;
  sortDir: SortDir;
  onToggleSort: (key: PlaylistSortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Playlist sort options"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
          <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Sort by</div>
          <PlaylistSortMenuItem label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <PlaylistSortMenuItem label="Date Created" sortKey="date" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        </div>
      )}
    </div>
  );
}

function PlaylistSortMenuItem({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: PlaylistSortKey;
  active: PlaylistSortKey;
  dir: SortDir;
  onClick: (key: PlaylistSortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        isActive ? "font-medium text-foreground" : "text-muted",
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
