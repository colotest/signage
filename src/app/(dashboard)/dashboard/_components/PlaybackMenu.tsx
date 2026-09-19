"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Sheet } from "@/components/ui/Sheet";
import { AlarmClockIcon, CheckIcon, PlayIcon } from "@/components/icons/PlaybackIcons";
import { formatDuration } from "@/lib/utils/format";
import {
  addItemsToScreen,
  clearScreenPlaylist,
  reorderPlaylist,
  unassignMedia,
  updateItemDuration,
} from "@/lib/actions/playlist";
import { removePlaylistEntry, reorderPlaylistEntries } from "@/lib/actions/playlists";
import type { Folder, MediaItem, PlaylistEntryWithMedia, PlaylistItemWithMedia, Screen } from "@/types/domain";
import { FileTree, type SortDir, type SortKey } from "../../library/_components/FileTree";
import { PlaylistEntryRow } from "../../library/_components/PlaylistEntryRow";
import { PlaylistSection, type PlaylistWithEntries } from "../../library/_components/PlaylistSection";

export type LibraryData = {
  folders: Folder[];
  media: MediaItem[];
  playlists: PlaylistWithEntries[];
};

const FILE_PICKER_MS = 300;

// A screen's playback, in one popup: its "Now Playing" list on top — which
// IS the screen's playlist_items, so whatever sits in it is exactly what
// the TV plays — and the Library's playlists below, each of which can be
// dropped onto the front of Now Playing with its play button.
//
// Every write to Now Playing is applied locally first and then run through
// a strictly serial queue, so rapid picks (select, deselect, play a
// playlist, reorder…) reach the server in the order they were made and
// never race each other for positions. Optimistic rows carry a temporary
// id until their insert resolves; anything queued later looks the real id
// up at run time, by which point the insert ahead of it has finished.
export function PlaybackMenu({
  screen,
  playlist,
  library,
  open,
  onOpenChange,
}: {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
  library: LibraryData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(playlist);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const realIdsRef = useRef(new Map<string, string>());
  const optimisticCounterRef = useRef(0);

  // Only resynced from the server once nothing's in flight — a refresh
  // landing mid-queue would otherwise briefly wipe out rows that are
  // already on screen but not saved yet.
  useEffect(() => {
    if (pendingRef.current === 0) setItems(playlist);
  }, [playlist]);

  const mediaById = useMemo(() => new Map(library.media.map((m) => [m.id, m])), [library.media]);

  function enqueue(task: () => Promise<void>) {
    pendingRef.current += 1;
    queueRef.current = queueRef.current
      .then(task)
      .catch((err) => console.error("Failed to update Now Playing", err))
      .finally(() => {
        pendingRef.current -= 1;
        // Also what heals any failed step: the server's own state comes
        // back down as `playlist` and replaces the local one wholesale.
        if (pendingRef.current === 0) router.refresh();
      });
  }

  function resolveId(id: string) {
    return realIdsRef.current.get(id) ?? id;
  }

  function optimisticItem(mediaItem: MediaItem, durationSeconds: number): PlaylistItemWithMedia {
    optimisticCounterRef.current += 1;
    return {
      id: `optimistic-${optimisticCounterRef.current}`,
      screen_id: screen.id,
      media_item_id: mediaItem.id,
      position: -1,
      duration_seconds: durationSeconds,
      fit_mode: "contain",
      created_at: new Date().toISOString(),
      media_item: mediaItem,
    };
  }

  // Inserts on the server, then swaps each optimistic row for its real one
  // (if it's still there — it may have been removed again in the meantime,
  // in which case the removal queued behind this finds the real id via
  // realIdsRef instead).
  function insertItems(optimistic: PlaylistItemWithMedia[], at: "start" | "end") {
    enqueue(async () => {
      const rows = await addItemsToScreen(
        screen.id,
        optimistic.map((item) => ({ mediaId: item.media_item_id, durationSeconds: item.duration_seconds })),
        at,
      );
      const realById = new Map<string, PlaylistItemWithMedia>();
      optimistic.forEach((item, i) => {
        const row = rows[i];
        if (!row) return;
        realIdsRef.current.set(item.id, row.id);
        realById.set(item.id, row);
      });
      setItems((current) => current.map((item) => realById.get(item.id) ?? item));
    });
  }

  // --- File picking ("+ Media") ---------------------------------------------

  const [picking, setPicking] = useState(false);
  // Which Now Playing row each picked file became — deselecting a file takes
  // back exactly that row, not some other copy of the same file that was
  // already in the list before picking started.
  const [pickedRowIds, setPickedRowIds] = useState<Map<string, string>>(new Map());
  const pickedIds = useMemo(() => new Set(pickedRowIds.keys()), [pickedRowIds]);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);

  function startPicking() {
    setPickedRowIds(new Map());
    setPicking(true);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function pickMedia(mediaIds: string[]) {
    const newItems = mediaIds.flatMap((id) => {
      const mediaItem = mediaById.get(id);
      return mediaItem && !pickedRowIds.has(id) ? [optimisticItem(mediaItem, 10)] : [];
    });
    if (newItems.length === 0) return;
    setPickedRowIds((current) => {
      const next = new Map(current);
      for (const item of newItems) next.set(item.media_item_id, item.id);
      return next;
    });
    // Appended — so they land just above the "+ Media" placeholder, which
    // always stays last.
    setItems((current) => [...current, ...newItems]);
    insertItems(newItems, "end");
  }

  function unpickMedia(mediaIds: string[]) {
    const rowIds = mediaIds.flatMap((id) => {
      const rowId = pickedRowIds.get(id);
      return rowId ? [rowId] : [];
    });
    if (rowIds.length === 0) return;
    setPickedRowIds((current) => {
      const next = new Map(current);
      for (const id of mediaIds) next.delete(id);
      return next;
    });
    removeItems(rowIds);
  }

  function toggleMedia(id: string) {
    if (pickedRowIds.has(id)) unpickMedia([id]);
    else pickMedia([id]);
  }

  // --- Now Playing edits ----------------------------------------------------

  // Matched on both the given id and whatever it resolves to — a picked
  // file's row is tracked by its optimistic id, but may have been swapped
  // for the real row by now (and vice versa for a row removed via its ✕).
  function removeItems(ids: string[]) {
    const removed = new Set([...ids, ...ids.map(resolveId)]);
    setItems((current) => current.filter((item) => !removed.has(item.id)));
    setPickedRowIds((current) => {
      const next = new Map([...current].filter(([, rowId]) => !removed.has(resolveId(rowId))));
      return next.size === current.size ? current : next;
    });
    enqueue(async () => {
      await Promise.all(ids.map((id) => unassignMedia(resolveId(id))));
    });
  }

  function clearItems() {
    setItems([]);
    setPickedRowIds(new Map());
    enqueue(() => clearScreenPlaylist(screen.id));
  }

  function changeDuration(id: string, seconds: number) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, duration_seconds: seconds } : item)));
    enqueue(() => updateItemDuration(resolveId(id), seconds));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((current) => {
      const oldIndex = current.findIndex((i) => i.id === active.id);
      const newIndex = current.findIndex((i) => i.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
    // Read at run time rather than captured now, so it reflects every edit
    // made up to that point with real ids — rows still waiting on their own
    // insert further back in the queue are left out; that insert appends
    // them itself.
    enqueue(() =>
      reorderPlaylist(
        screen.id,
        itemsRef.current.map((item) => resolveId(item.id)).filter((id) => !id.startsWith("optimistic-")),
      ),
    );
  }

  function playPlaylist(source: PlaylistWithEntries) {
    // Same order and durations as the playlist itself — prepended, so it
    // plays next ahead of whatever was already queued up.
    const newItems = source.entries.map((entry) => optimisticItem(entry.media_item, entry.duration_seconds));
    if (newItems.length === 0) return;
    setItems((current) => [...newItems, ...current]);
    insertItems(newItems, "start");
  }

  // --- Library playlists (below) ------------------------------------------

  // Same optimistic mirror LibraryView keeps — entries can still be
  // reordered and removed here, exactly as on the Library page.
  const [localPlaylists, setLocalPlaylists] = useState(library.playlists);
  useEffect(() => {
    setLocalPlaylists(library.playlists);
  }, [library.playlists]);

  async function reorderEntries(playlistId: string, nextEntries: PlaylistEntryWithMedia[]) {
    setLocalPlaylists((current) => current.map((p) => (p.id === playlistId ? { ...p, entries: nextEntries } : p)));
    await reorderPlaylistEntries(
      playlistId,
      nextEntries.map((e) => e.id),
    );
    router.refresh();
  }

  async function removeEntry(playlistId: string, entryId: string) {
    setLocalPlaylists((current) =>
      current.map((p) => (p.id === playlistId ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) } : p)),
    );
    try {
      await removePlaylistEntry(entryId);
    } catch (err) {
      console.error("Failed to remove playlist entry", err);
    }
    // Brings it back if the removal failed.
    router.refresh();
  }

  function handleOpenChange(next: boolean) {
    if (!next) setPicking(false);
    onOpenChange(next);
  }

  const totalSeconds = items.reduce((sum, item) => sum + item.duration_seconds, 0);

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={screen.name}
      contentClassName="sm:max-w-3xl sm:h-[85vh]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
    >
      {/* FileTree's own draggables/droppables need a DndContext above them;
          with no sensors it never starts a drag — this tree is only ever a
          picker here. */}
      <DndContext sensors={[]}>
        {/* The file picker slides in from the top, taking half the popup's
            height and pushing Now Playing (and the playlists) down with it;
            closing it reverses that — sliding back up and fading out. Kept
            mounted throughout (inert while closed) so the close animation
            has something to animate. -mx-5/px-5 keep FileTree's own
            edge-to-edge bleed inside this clipping box. */}
        <div
          inert={!picking}
          className="-mx-5 flex min-h-0 shrink-0 flex-col overflow-hidden px-5 ease-out"
          style={{
            height: picking ? "50%" : 0,
            opacity: picking ? 1 : 0,
            transition: `height ${FILE_PICKER_MS}ms, opacity ${FILE_PICKER_MS}ms`,
          }}
        >
          <div
            className="flex min-h-0 flex-1 flex-col pb-5 ease-out"
            style={{
              transform: picking ? "none" : "translateY(-40px)",
              transition: `transform ${FILE_PICKER_MS}ms`,
            }}
          >
            <div className="relative z-10 flex items-center">
              <h2 className="text-[22px] font-semibold tracking-tight">Media</h2>
            </div>
            <FileTree
              className="min-h-0 flex-1"
              folders={library.folders}
              media={library.media}
              selectionMode
              selectedIds={pickedIds}
              onToggleMedia={toggleMedia}
              onToggleFolderIds={(ids, select) => (select ? pickMedia(ids) : unpickMedia(ids))}
              uploadTargetId={uploadTargetId}
              onActivateFolder={setUploadTargetId}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              creatingIn={creatingIn}
              onCreatingChange={setCreatingIn}
              dropTargetFolderId={undefined}
            />
          </div>
        </div>

        {/* Now Playing — styled like a Library playlist card, but always
            expanded and never going anywhere. Its own list scrolls once it
            outgrows its share of the popup. */}
        <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col rounded-[var(--radius-md)] border border-border bg-surface p-3">
          <div className="flex items-center gap-3">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">Now Playing</h3>
            <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDuration(totalSeconds)}</span>
            <span className="shrink-0 text-[12px] text-muted">
              {items.length} file{items.length === 1 ? "" : "s"}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {picking && (
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  title="Done picking"
                  aria-label="Done picking"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast hover:opacity-90"
                >
                  <CheckIcon className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={clearItems}
                disabled={items.length === 0}
                title="Clear Now Playing"
                aria-label="Clear Now Playing"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-[15px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="no-scrollbar mt-3 min-h-0 overflow-y-auto overscroll-contain border-t border-border pt-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <PlaylistEntryRow
                      key={item.id}
                      entry={item}
                      removeLabel="Remove from Now Playing"
                      onRemove={() => removeItems([item.id])}
                      onDurationChange={(seconds) => changeDuration(item.id, seconds)}
                    />
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={startPicking}
                      disabled={picking}
                      className="flex w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border p-3 text-[15px] font-medium text-accent hover:bg-black/[.02] disabled:opacity-40 dark:hover:bg-white/[.03]"
                    >
                      + Media
                    </button>
                  </li>
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        </section>

        <PlaylistSection
          className="mt-6 min-h-0 flex-1"
          playlists={localPlaylists}
          showCreate={false}
          onReorderEntries={reorderEntries}
          onRemoveEntry={removeEntry}
          renderActions={(p) => (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => playPlaylist(p)}
                disabled={p.entries.length === 0}
                title="Play — adds this playlist to the front of Now Playing"
                aria-label={`Play ${p.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-40"
              >
                <PlayIcon className="h-4 w-4 translate-x-px" />
              </button>
              <button
                type="button"
                title="Schedule"
                aria-label={`Schedule ${p.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-[#1d1d1f] shadow-sm hover:bg-neutral-50"
              >
                <AlarmClockIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}
        />
      </DndContext>
    </Sheet>
  );
}
