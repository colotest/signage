"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { InlineRename } from "@/components/InlineRename";
import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import {
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  updatePlaylistEntryDuration,
} from "@/lib/actions/playlists";
import { removeWithAnimation } from "@/lib/animation/listMotion";
import type { Playlist, PlaylistEntryWithMedia } from "@/types/domain";
import { ThreeDotIcon, type SortDir } from "./FileTree";
import { SortableEntryList } from "./PlaylistEntryRow";

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

// The selection/drop props only matter on the Library page itself — the
// dashboard's Playback Menu shows this same list, but swaps each row's
// "+"/"✕"/"Delete" controls for its own via renderActions and has no
// "+ Create" entry, so it leaves all of those out.
export function PlaylistSection({
  className,
  playlists,
  activePlaylistId = null,
  selectedCount = 0,
  onArmSelection,
  onCancelSelection,
  onConfirmAdd,
  onReorderEntries,
  onRemoveEntry,
  dropTargetPlaylistId = null,
  showCreate = true,
  editable = true,
  renderActions,
  pinOrder,
  listClassName,
}: {
  className?: string;
  // Extra classes for the scrolling list itself (e.g. more bottom clearance).
  listClassName?: string;
  playlists: PlaylistWithEntries[];
  activePlaylistId?: string | null;
  selectedCount?: number;
  onArmSelection?: (playlistId: string) => void;
  onCancelSelection?: () => void;
  onConfirmAdd?: (playlistId: string) => void;
  onReorderEntries?: (playlistId: string, nextEntries: PlaylistEntryWithMedia[]) => void;
  onRemoveEntry?: (playlistId: string, entryId: string) => void;
  // A file being dragged in from the Media list (DndContext lives in
  // LibraryView, a shared ancestor of both lists) resolves to a playlist id
  // when it's hovering this one — drives PlaylistRow's own highlight.
  dropTargetPlaylistId?: string | null;
  showCreate?: boolean;
  // Playlists (names, entries, order, durations) can only be edited on the
  // Library page — the Playback Menu shows them to play from, not to edit.
  editable?: boolean;
  renderActions?: (playlist: PlaylistWithEntries) => ReactNode;
  // Pins a playlist to the top of the list, whatever the active sort, when
  // this returns a number for it; pinned ones are ordered by that number,
  // ascending. The Playback Menu uses it to lead with playlists that have a
  // timer running, soonest first.
  pinOrder?: (playlist: PlaylistWithEntries) => number | null;
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
    // The playlist currently armed for adding files jumps to the front,
    // regardless of the active sort — it's what you're actively working
    // with, so it shouldn't be buried wherever alphabetical/date order
    // happens to put it.
    if (activePlaylistId) {
      const index = copy.findIndex((p) => p.id === activePlaylistId);
      if (index > 0) copy.unshift(...copy.splice(index, 1));
    }
    if (pinOrder) {
      const pinned = copy
        .map((playlist) => ({ playlist, order: pinOrder(playlist) }))
        .filter((p): p is { playlist: PlaylistWithEntries; order: number } => p.order !== null)
        .sort((a, b) => a.order - b.order)
        .map((p) => p.playlist);
      if (pinned.length > 0) {
        const pinnedIds = new Set(pinned.map((p) => p.id));
        return [...pinned, ...copy.filter((p) => !pinnedIds.has(p.id))];
      }
    }
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

  // Armed for selection means the user is actively picking files for it —
  // expand it automatically so the playlist's existing content is visible
  // right alongside whatever's being added.
  useEffect(() => {
    if (activePlaylistId) setExpanded((current) => new Set(current).add(activePlaylistId));
  }, [activePlaylistId]);

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
        <PlaylistSortMenuButton sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />
      </div>

      {/* Not edge-to-edge — sits inside the page's normal left/right inset
          rather than bleeding to the screen edges, just a little wider via
          the -10px side margin. Each row is its own rounded, bordered card
          (see PlaylistRow) rather than this whole list being one bordered
          box. -mt-10/-mb-5 pull the list up 40px and down 20px past its
          own normal top/bottom edges, overlapping the title row above
          (which needs its own relative z-10 to stay on top) and the space
          below — asymmetric on purpose, matching what reads well against
          the smaller bottom fade. Neither edge reaches as deep as the
          media list's top does: the media list ends right above this one,
          where this list's own background wash would paint over its fading
          rows and cut them off dead (see FileTree's -mb-5), and below is
          the page's own bottom edge, where anything overflowing turns the
          whole page into a scrolling one instead of fitting the viewport
          exactly. This is what lets scrolled-past cards fade
          away underneath the title, top and bottom, instead of popping in
          and out at a hard edge. pt-[52px]/safari-toolbar-inset (padding on
          this scrolling element itself, not on the <ul> it wraps —
          percentage heights on a child of an auto-overflow box are exactly
          the kind of thing Safari gets flexbox-inconsistent about) keep
          scroll-fade-y's (now 40px) fade off the first/last card and, at
          the bottom only since this is the last section on the page,
          reserve enough room to clear Safari's floating toolbar — all
          while the container's own height (flex-1, reaching the screen
          edge) stays untouched. no-scrollbar: the native scrollbar looked
          odd crossing the blurred/faded edges.

          ProgressiveBlurEdge is a SIBLING of the scrolling div, not a child
          of it — a position:absolute descendant still scrolls along with
          the rest of a scroll container's content (only mask-image is
          exempt from that). scroll-fade-y sits on the scrolling div
          ITSELF; the blur — and the background wash it carries, see
          ProgressiveBlurEdge — stays outside that mask on purpose, since
          the wash is what makes a card's own colour fade out along with
          its text, and a mask over it would erase it exactly where it
          matters. The scrolling div is sized via inset-0 against this div,
          which is also what keeps the blur pinned in place while content
          scrolls underneath it. */}
      <div className="relative -mt-10 -mb-5 mx-[-10px] min-h-0 flex-1">
        {/* pt-[62px]: 40px of it pays back the reach this list takes past
            its own top edge (the -mt-10 above), which is what tucks
            scrolled cards under the title — without it the FIRST card
            starts up there too, half behind the title before you've
            scrolled at all. The remaining ~22px sits it just clear of the
            title's own baseline. */}
        <div
          className={cn(
            "scroll-fade-y [--fade-top:24px] no-scrollbar safari-toolbar-inset absolute inset-0 overflow-y-auto overscroll-contain pt-[62px]",
            listClassName,
          )}
        >
          <ul className="flex flex-col gap-3">
            {/* The "+ Create" trigger lives as the list's own first entry —
                not a header button — so it scrolls out of view with the
                rest of the list, and its spacing (same card padding as
                PlaylistRow) matches the playlist it's about to create. */}
            {showCreate && <CreatePlaylistRow onCreate={handleCreate} pending={pending} />}
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
                onArmSelection={() => onArmSelection?.(playlist.id)}
                onCancelSelection={() => onCancelSelection?.()}
                onConfirmAdd={() => onConfirmAdd?.(playlist.id)}
                onReorderEntries={(next) => onReorderEntries?.(playlist.id, next)}
                onRemoveEntry={(entryId) => onRemoveEntry?.(playlist.id, entryId)}
                isDropTarget={dropTargetPlaylistId === playlist.id}
                actions={renderActions?.(playlist)}
                editable={editable}
              />
            ))}
          </ul>
        </div>
        {/* Shallower: the media list ends right above, and this edge's
            depth is most of the empty band between the two. */}
        <ProgressiveBlurEdge side="top" extent={48} />
        <ProgressiveBlurEdge side="bottom" />
      </div>
    </div>
  );
}

function CreatePlaylistRow({ onCreate, pending }: { onCreate: () => void; pending: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onCreate}
        disabled={pending}
        className="press-ghost-fit flex w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border p-3 text-[15px] font-medium text-accent hover:bg-black/[.02] disabled:opacity-40 dark:hover:bg-white/[.03]"
      >
        + Create
      </button>
    </li>
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
  onRemoveEntry,
  isDropTarget,
  actions,
  editable,
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
  onRemoveEntry: (entryId: string) => void;
  isDropTarget: boolean;
  // Replaces the Library's own "+"/"✕"/"Delete" controls when given.
  actions?: ReactNode;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Registers this card as a place a file dragged out of the Media list can
  // be dropped — the shared DndContext lives in LibraryView, which resolves
  // `playlist-${playlist.id}` back to this exact playlist and adds the file
  // to it at the first position.
  const { setNodeRef: setPlaylistDropRef } = useDroppable({ id: `playlist-${playlist.id}` });
  const rowRef = useRef<HTMLLIElement | null>(null);

  // The entries stay mounted while the card slides shut, and are dropped
  // once it's closed so collapsed playlists don't keep their thumbnails
  // loaded.
  const [contentMounted, setContentMounted] = useState(isExpanded);
  if (isExpanded && !contentMounted) setContentMounted(true);

  // Anywhere on the card opens/closes it — including the name, whose
  // double-click still renames. Controls handle their own clicks, and the
  // entries below are their own interactive list. The second click of a
  // double-click is skipped so renaming doesn't also flip it back.
  function handleCardClick(e: React.MouseEvent) {
    if (e.detail > 1) return;
    if ((e.target as Element).closest("button, input, a, [data-no-toggle]")) return;
    onToggleExpanded();
  }

  const totalSeconds = playlist.entries.reduce((sum, e) => sum + e.duration_seconds, 0);
  const fileCount = playlist.entries.length;

  function handleMoveEntry(activeId: string, overId: string) {
    const oldIndex = playlist.entries.findIndex((e) => e.id === activeId);
    const newIndex = playlist.entries.findIndex((e) => e.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderEntries(arrayMove(playlist.entries, oldIndex, newIndex));
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
      await removeWithAnimation(rowRef.current, () => deletePlaylist(playlist.id));
      router.refresh();
    });
  }

  return (
    <li
      ref={(node) => {
        setPlaylistDropRef(node);
        rowRef.current = node;
      }}
      onClick={handleCardClick}
      className={cn(
        "cursor-pointer rounded-[var(--radius-md)] border bg-surface p-3",
        isDropTarget ? "border-accent ring-2 ring-inset ring-accent" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <button type="button" onClick={onToggleExpanded} className="no-press text-muted">
          <Chevron open={isExpanded} />
        </button>

        <div className="min-w-0 flex-1">
          {editable ? (
            <InlineRename
              value={playlist.name}
              startInEditMode={startInRename}
              passClicks
              onSave={(next) => {
                renamePlaylist(playlist.id, next);
                onDoneRenaming();
                router.refresh();
              }}
              // block + w-fit: sized to the name's own text (so only that is the
              // rename hitbox, same as the file browser's rows) yet capped at
              // the column's width so a long name truncates — as a plain
              // inline span, "truncate" never took effect and a long name ran
              // straight into the file count beside it.
              className="block w-fit max-w-full text-[15px] font-semibold"
            />
          ) : (
            <span className="block truncate text-[15px] font-semibold">{playlist.name}</span>
          )}
        </div>

        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDate(playlist.created_at)}</span>
        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDuration(totalSeconds)}</span>
        <span className="shrink-0 text-[12px] text-muted">
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>

        {actions ?? (
          <>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={isActive ? onConfirmAdd : onArmSelection}
                disabled={isActive && selectedCount === 0}
                title={isActive ? "Add selected files" : "Add files"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-40"
              >
                {isActive && selectedCount > 0 ? `+${selectedCount}` : "+"}
              </button>
              {isActive && (
                <button
                  type="button"
                  onClick={onCancelSelection}
                  title="Cancel selection"
                  aria-label="Cancel selection"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-[15px] font-medium text-white hover:opacity-90"
                >
                  ✕
                </button>
              )}
            </div>

            {confirmingDelete ? (
              <div className="flex shrink-0 items-center gap-2 text-[13px]">
                <button type="button" disabled={pending} onClick={handleDelete} className="press-ghost font-medium text-danger hover:opacity-70">
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="press-ghost text-muted hover:opacity-70">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="press-ghost shrink-0 text-[13px] text-muted hover:text-danger"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {/* Slides open/shut by animating the grid row between 0fr and 1fr —
          CSS can't transition height to "auto", but it can this. */}
      <div
        data-no-toggle
        inert={!isExpanded}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !isExpanded) setContentMounted(false);
        }}
        className={cn(
          "grid cursor-auto transition-[grid-template-rows] duration-[400ms] ease-[var(--ease-spring)]",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {contentMounted && (
            <div className="mt-3 border-t border-border pt-3">
              <SortableEntryList
                entries={playlist.entries}
                sensors={sensors}
                onMove={handleMoveEntry}
                editable={editable}
                onRemove={onRemoveEntry}
                // Still resolving from an optimistic add — router.refresh()
                // will settle it with a real id shortly; nothing to remove
                // server-side yet.
                canRemove={(entry) => !entry.id.startsWith("optimistic-")}
                onDurationChange={handleDurationChange}
                empty={
                  <p className="text-[13px] text-muted">
                    {actions ? "No files yet." : "No files yet — press + and select some from above."}
                  </p>
                }
              />
            </div>
          )}
        </div>
      </div>
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
        "press-ghost-fit flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        isActive ? "font-medium text-foreground" : "text-muted",
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
