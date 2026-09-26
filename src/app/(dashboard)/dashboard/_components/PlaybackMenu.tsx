"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
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
import { cancelScheduledPlayback, schedulePlaylist } from "@/lib/actions/schedules";
import { setScreenSlideDirection, setScreenTransition, setScreenTransitionSpeed } from "@/lib/actions/screens";
import type {
  DeckWithPages,
  Folder,
  MediaItem,
  PlaylistItemWithMedia,
  ScheduledPlayback,
  Screen,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
} from "@/types/domain";
import { FileTree, type SortDir, type SortKey } from "../../library/_components/FileTree";
import { SortableEntryList } from "../../library/_components/PlaylistEntryRow";
import { PlaylistSection, type PlaylistWithEntries } from "../../library/_components/PlaylistSection";
import { MobileFileMenuButton } from "../../library/_components/LibraryView";
import { UploadDropzone } from "../../library/_components/UploadDropzone";
import { useMediaUpload } from "../../library/_components/useMediaUpload";
import { Countdown, ScheduleDialog } from "./ScheduleDialog";
import { TransitionMenu } from "./TransitionMenu";

export type LibraryData = {
  folders: Folder[];
  media: MediaItem[];
  decks: DeckWithPages[];
  playlists: PlaylistWithEntries[];
};

const FILE_PICKER_MS = 300;

function timersFrom(schedules: ScheduledPlayback[]) {
  return new Map(schedules.map((t) => [t.playlist_id, new Date(t.run_at)]));
}

// A screen's playback, in one popup: its "Now Playing" list on top — which
// IS the screen's playlist_items, so whatever sits in it is exactly what
// the TV plays — and the Library's playlists below, each of which can be
// dropped onto the front of Now Playing with its play button, or timed to
// replace Now Playing outright at a set moment with its alarm clock.
//
// Every write to Now Playing is applied locally first and then run through
// a strictly serial queue, so rapid edits (adding files, playing a
// playlist, reordering…) reach the server in the order they were made and
// never race each other for positions. Optimistic rows carry a temporary
// id until their insert resolves; anything queued later looks the real id
// up at run time, by which point the insert ahead of it has finished.
export function PlaybackMenu({
  screen,
  playlist,
  library,
  schedules,
  open,
  onOpenChange,
}: {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
  library: LibraryData;
  schedules: ScheduledPlayback[];
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

  // --- File picking ---------------------------------------------------------

  // "+" slides the file browser in and turns into a checkmark, which slides
  // it back out. Ticking a file adds it to Now Playing right away (appended, in pick
  // order) and unticking takes that same row back out — there's no separate
  // confirm step, so closing the popup mid-pick keeps whatever was picked.
  const [picking, setPicking] = useState(false);
  // Which Now Playing row each ticked file became, so unticking removes
  // exactly that row rather than some other copy of the same file that was
  // already in the list before picking started. Holds the optimistic id —
  // resolveId() finds the real one once its insert has landed.
  const [pickedRows, setPickedRows] = useState<Map<string, string>>(new Map());
  const pickedSet = useMemo(() => new Set(pickedRows.keys()), [pickedRows]);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const { uploading, status: uploadStatus, uploadFiles } = useMediaUpload(uploadTargetId);

  function startPicking() {
    setPickedRows(new Map());
    setPicking(true);
  }

  function stopPicking() {
    setPicking(false);
    setPickedRows(new Map());
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
      return mediaItem && !pickedRows.has(id) ? [optimisticItem(mediaItem, 10)] : [];
    });
    if (newItems.length === 0) return;
    setPickedRows((current) => {
      const next = new Map(current);
      for (const item of newItems) next.set(item.media_item_id, item.id);
      return next;
    });
    setItems((current) => [...current, ...newItems]);
    insertItems(newItems, "end");
  }

  function unpickMedia(mediaIds: string[]) {
    const rowIds = mediaIds.flatMap((id) => {
      const rowId = pickedRows.get(id);
      return rowId ? [rowId] : [];
    });
    if (rowIds.length > 0) removeItems(rowIds);
  }

  function toggleMedia(id: string) {
    if (pickedRows.has(id)) unpickMedia([id]);
    else pickMedia([id]);
  }

  function toggleFolderIds(ids: string[], select: boolean) {
    if (select) pickMedia(ids);
    else unpickMedia(ids);
  }

  // --- Now Playing edits ----------------------------------------------------

  // Matched on both each given id and what it resolves to: a ticked file's
  // row is tracked by its optimistic id but may already have been swapped
  // for the real row (and a row removed via its own ✕ may be a ticked one,
  // which then gets unticked too).
  function removeItems(ids: string[]) {
    const removed = new Set([...ids, ...ids.map(resolveId)]);
    setItems((current) => current.filter((item) => !removed.has(item.id)));
    setPickedRows((current) => {
      const next = new Map([...current].filter(([, rowId]) => !removed.has(resolveId(rowId))));
      return next.size === current.size ? current : next;
    });
    enqueue(async () => {
      await Promise.all(ids.map((id) => unassignMedia(resolveId(id))));
    });
  }

  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  function emptyItems() {
    setConfirmingEmpty(false);
    setItems([]);
    setPickedRows(new Map());
    enqueue(() => clearScreenPlaylist(screen.id));
  }

  function changeDuration(id: string, seconds: number) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, duration_seconds: seconds } : item)));
    enqueue(() => updateItemDuration(resolveId(id), seconds));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function moveItem(activeId: string, overId: string) {
    setItems((current) => {
      const oldIndex = current.findIndex((i) => i.id === activeId);
      const newIndex = current.findIndex((i) => i.id === overId);
      if (oldIndex === -1 || newIndex === -1) return current;
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

  // Playlists are read-only here (editable={false} below) — editing them is
  // the Library page's job.
  const [localPlaylists, setLocalPlaylists] = useState(library.playlists);
  useEffect(() => {
    setLocalPlaylists(library.playlists);
  }, [library.playlists]);

  // --- Timed playback (alarm clock) -----------------------------------------

  // Pending timers by playlist id — mirrored locally so setting/cancelling
  // one swaps the button immediately, then resynced from the server.
  const [timers, setTimers] = useState(() => timersFrom(schedules));
  const [prevSchedules, setPrevSchedules] = useState(schedules);
  if (schedules !== prevSchedules) {
    setPrevSchedules(schedules);
    setTimers(timersFrom(schedules));
  }
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const schedulingPlaylist = localPlaylists.find((p) => p.id === schedulingId);

  function openSchedule(playlistId: string) {
    setSchedulingId(playlistId);
    setScheduleOpen(true);
  }

  function setTimerLocal(playlistId: string, runAt: Date | null) {
    setTimers((current) => {
      const next = new Map(current);
      if (runAt) next.set(playlistId, runAt);
      else next.delete(playlistId);
      return next;
    });
  }

  async function handleSchedule(runAt: Date) {
    if (!schedulingId) return;
    const playlistId = schedulingId;
    setScheduleOpen(false);
    setTimerLocal(playlistId, runAt);
    try {
      await schedulePlaylist(screen.id, playlistId, runAt.toISOString());
    } catch (err) {
      console.error("Failed to schedule playlist", err);
      alert(`Couldn't set the timer: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    router.refresh();
  }

  async function handleCancelTimer() {
    if (!schedulingId) return;
    const playlistId = schedulingId;
    setScheduleOpen(false);
    setTimerLocal(playlistId, null);
    try {
      await cancelScheduledPlayback(screen.id, playlistId);
    } catch (err) {
      console.error("Failed to cancel timer", err);
    }
    router.refresh();
  }

  // --- Playback settings ("⋯" in the header) --------------------------------

  // Applied locally first so the pill moves on the press, then persisted.
  const [transition, setTransition] = useState<ScreenTransition>(screen.transition ?? "cut");
  const [prevTransition, setPrevTransition] = useState(screen.transition);
  if (screen.transition !== prevTransition) {
    setPrevTransition(screen.transition);
    setTransition(screen.transition ?? "cut");
  }

  const [speed, setSpeed] = useState<ScreenTransitionSpeed>(screen.transition_speed ?? "normal");
  const [prevSpeed, setPrevSpeed] = useState(screen.transition_speed);
  if (screen.transition_speed !== prevSpeed) {
    setPrevSpeed(screen.transition_speed);
    setSpeed(screen.transition_speed ?? "normal");
  }

  async function handleSelectSpeed(next: ScreenTransitionSpeed) {
    if (next === speed) return;
    setSpeed(next);
    try {
      await setScreenTransitionSpeed(screen.id, next);
    } catch (err) {
      console.error("Failed to set transition speed", err);
    }
    router.refresh();
  }

  const [slideDirection, setSlideDirection] = useState<ScreenSlideDirection>(screen.slide_direction ?? "right");
  const [prevDirection, setPrevDirection] = useState(screen.slide_direction);
  if (screen.slide_direction !== prevDirection) {
    setPrevDirection(screen.slide_direction);
    setSlideDirection(screen.slide_direction ?? "right");
  }

  async function handleSelectSlideDirection(next: ScreenSlideDirection) {
    if (next === slideDirection) return;
    setSlideDirection(next);
    try {
      await setScreenSlideDirection(screen.id, next);
    } catch (err) {
      console.error("Failed to set slide direction", err);
    }
    router.refresh();
  }

  async function handleSelectTransition(next: ScreenTransition) {
    if (next === transition) return;
    setTransition(next);
    try {
      await setScreenTransition(screen.id, next);
    } catch (err) {
      console.error("Failed to set transition", err);
    }
    router.refresh();
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      stopPicking();
      setConfirmingEmpty(false);
    }
    onOpenChange(next);
  }

  const totalSeconds = items.reduce((sum, item) => sum + item.duration_seconds, 0);

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={screen.name}
      // The screen's name as a page-sized heading, matching "Playlists"
      // below it, with the plain "Done" link replaced by the "⋯" playback
      // settings and a blue tick that closes the menu.
      titleClassName="text-[28px] font-semibold tracking-tight"
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <TransitionMenu
            transition={transition}
            onSelect={handleSelectTransition}
            speed={speed}
            onSelectSpeed={handleSelectSpeed}
            slideDirection={slideDirection}
            onSelectSlideDirection={handleSelectSlideDirection}
          />
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            title="Done"
            aria-label="Done"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast hover:opacity-90"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        </div>
      }
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
            {/* Same header as the Library's Media section, except the upload
                controls stay put while picking — uploading straight into
                the picker is the point of having them here. */}
            <div className="relative z-10 flex items-center justify-between gap-3">
              <h2 className="text-[22px] font-semibold tracking-tight">Media</h2>
              <div className="flex items-center gap-3">
                <UploadDropzone uploading={uploading} status={uploadStatus} onUploadFiles={uploadFiles} />
                <MobileFileMenuButton
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  onNewFolder={() => setCreatingIn(null)}
                />
              </div>
            </div>
            <FileTree
              decks={library.decks}
              className="min-h-0 flex-1"
              folders={library.folders}
              media={library.media}
              selectionMode
              selectedIds={pickedSet}
              onToggleMedia={toggleMedia}
              onToggleFolderIds={toggleFolderIds}
              uploadTargetId={uploadTargetId}
              onActivateFolder={setUploadTargetId}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              creatingIn={creatingIn}
              onCreatingChange={setCreatingIn}
              onUploadFiles={uploadFiles}
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
            {picking ? (
              <button
                type="button"
                onClick={stopPicking}
                title="Done picking"
                aria-label="Done picking"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast hover:opacity-90"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startPicking}
                title="Add files"
                aria-label="Add files"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-medium text-accent-contrast hover:opacity-90"
              >
                +
              </button>
            )}

            {/* Emptying lives on its own text button (with a confirm step,
                like the Library's "Delete") so it can't be mistaken for
                finishing a pick. */}
            {confirmingEmpty ? (
              <div className="flex shrink-0 items-center gap-2 text-[13px]">
                <button type="button" onClick={emptyItems} className="press-ghost font-medium text-danger hover:opacity-70">
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmingEmpty(false)} className="press-ghost text-muted hover:opacity-70">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingEmpty(true)}
                disabled={items.length === 0}
                className="press-ghost shrink-0 text-[13px] text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-muted"
              >
                Empty
              </button>
            )}
          </div>

          <div className="no-scrollbar mt-3 min-h-0 overflow-y-auto overscroll-contain border-t border-border pt-3">
            <SortableEntryList
              entries={items}
              sensors={sensors}
              onMove={moveItem}
              onRemove={(id) => removeItems([id])}
              onDurationChange={changeDuration}
              removeLabel="Remove from Now Playing"
              empty={<p className="text-[13px] text-muted">No files yet — press + and select some from above.</p>}
            />
          </div>
        </section>

        <PlaylistSection
          className="mt-6 min-h-0 flex-1"
          playlists={localPlaylists}
          showCreate={false}
          editable={false}
          // Playlists with a timer running lead the list, soonest first, so
          // an imminent change to the program is the first thing you see.
          pinOrder={(p) => timers.get(p.id)?.getTime() ?? null}
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
              {(() => {
                const runAt = timers.get(p.id);
                return (
                  <button
                    type="button"
                    onClick={() => openSchedule(p.id)}
                    title={runAt ? `Plays ${runAt.toLocaleString()}` : "Schedule"}
                    aria-label={runAt ? `${p.name} plays ${runAt.toLocaleString()} — change timer` : `Schedule ${p.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-[#1d1d1f] shadow-sm hover:bg-neutral-50"
                  >
                    {runAt ? <Countdown runAt={runAt} /> : <AlarmClockIcon className="h-[18px] w-[18px]" />}
                  </button>
                );
              })()}
            </div>
          )}
        />

        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          playlistName={schedulingPlaylist?.name ?? ""}
          runAt={schedulingId ? (timers.get(schedulingId) ?? null) : null}
          onSchedule={handleSchedule}
          onCancelTimer={handleCancelTimer}
        />
      </DndContext>
    </Sheet>
  );
}
