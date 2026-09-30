"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Sheet } from "@/components/ui/Sheet";
import {
  SECTION_TITLE_HEIGHT,
  SectionTitle,
  TITLE_BAND_FADE,
  TITLE_CLEAR_ABOVE,
  TITLE_CLEAR_BELOW,
  TITLE_TUCK_BELOW,
} from "@/components/SectionTitle";
import { ListScroller } from "@/components/ListScroller";
import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { cn } from "@/lib/utils/cn";
import { AlarmClockIcon, CheckIcon, PlayIcon } from "@/components/icons/PlaybackIcons";
import { formatDuration } from "@/lib/utils/format";
import {
  addItemsToScreen,
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
  ScreenBackground,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
} from "@/types/domain";
import { FileTree, type SortDir, type SortKey } from "../../library/_components/FileTree";
import { SortableEntryList } from "../../library/_components/PlaylistEntryRow";
import {
  PlaylistSection,
  PlaylistSortMenuButton,
  type PlaylistSortKey,
  type PlaylistWithEntries,
} from "../../library/_components/PlaylistSection";
import { MobileFileMenuButton } from "../../library/_components/LibraryView";
import { UploadDropzone } from "../../library/_components/UploadDropzone";
import { useMediaUpload } from "../../library/_components/useMediaUpload";
import { Countdown, ScheduleDialog } from "./ScheduleDialog";
import { TransitionMenu } from "./TransitionMenu";
import { CalendarSection } from "./CalendarSection";

export type LibraryData = {
  folders: Folder[];
  media: MediaItem[];
  decks: DeckWithPages[];
  playlists: PlaylistWithEntries[];
};

const FILE_PICKER_MS = 300;

// How long a smooth scroll takes to land, and how long a new row takes to
// grow in (see SortableEntryList) — the waits around adding a playlist.
const SCROLL_SETTLE_MS = 350;
const ROW_ENTER_MS = 500;

// The file browser's bottom fade (see FileTree) — the "Done" pill sits
// right at its upper edge.
const PICKER_FADE = 48;

// How far the scroll view reaches up under the popup's title — the same
// depth the lists tuck under the section headings, so the band under the
// title works exactly like theirs.
const HEADER_TUCK = SECTION_TITLE_HEIGHT;
// How far the fade along the bottom of the Playlists list reaches up — the
// same as the one above a heading.
const PLAYLISTS_FOOTER = TITLE_BAND_FADE;

// How long the scroll view has to sit still (and no finger be down) before
// a half-scrolled file browser settles open or shut.
const PICKER_SETTLE_MS = 140;

// Over how much of the file browser's last stretch, as it's scrolled shut,
// "Done" fades out — it's sitting behind the title by then.
const DONE_FADE_DISTANCE = PICKER_FADE + HEADER_TUCK;

// Pending timers by playlist — the ones that have fired stay listed until
// their window ends (0022), but have no countdown left to show.
function timersFrom(schedules: ScheduledPlayback[]) {
  return new Map(schedules.filter((t) => !t.fired_at).map((t) => [t.playlist_id, new Date(t.run_at)]));
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
  background,
  onSelectBackground,
  open,
  onOpenChange,
}: {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
  library: LibraryData;
  schedules: ScheduledPlayback[];
  // Owned by the tile, whose preview mirrors it.
  background: ScreenBackground;
  onSelectBackground: (background: ScreenBackground) => void;
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

  // The "+ Media" placeholder at the top of Now Playing slides the file
  // browser in and shrinks to a "Done" pill, which slides it back out.
  // Ticking a file adds it to Now Playing right away — prepended, right under
  // that placeholder — and unticking takes that same row back out; there's
  // no separate confirm step, so closing the popup mid-pick keeps whatever
  // was picked.
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
    setItems((current) => [...newItems, ...current]);
    insertItems(newItems, "start");
    requestScroll("start");
  }

  function unpickMedia(mediaIds: string[]) {
    const rowIds = mediaIds.flatMap((id) => {
      const rowId = pickedRows.get(id);
      return rowId ? [rowId] : [];
    });
    if (rowIds.length === 0) return;
    // Bring the row being taken back into view first, so its exit
    // animation is actually seen rather than playing out off-screen.
    scrollToRow([...rowIds, ...rowIds.map(resolveId)]);
    removeItems(rowIds);
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
    // Same order and durations as the playlist itself — appended after
    // whatever's already queued (files picked from the browser go in at the
    // top instead). So that you actually see what pressing play did, the
    // view first goes back up to Now Playing and Now Playing down to its
    // real end, and only then do the new rows go in — with the list held
    // at its bottom while they grow in.
    const newItems = source.entries.map((entry) => optimisticItem(entry.media_item, entry.duration_seconds));
    if (newItems.length === 0) return;
    scrollPageTo(0);
    const list = nowPlayingScrollRef.current;
    const atEnd = !list || list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
    if (list && !atEnd) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setTimeout(
      () => {
        setItems((current) => [...current, ...newItems]);
        insertItems(newItems, "end");
        followNowPlayingEnd(ROW_ENTER_MS);
      },
      atEnd ? 0 : SCROLL_SETTLE_MS,
    );
  }

  // Pins Now Playing to its bottom for a while — as rows grow in there,
  // the end keeps moving, and a single scroll would fall short of it.
  function followNowPlayingEnd(ms: number) {
    const until = performance.now() + ms;
    const tick = () => {
      const list = nowPlayingScrollRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // --- Layout: one scroll view --------------------------------------------------

  // Now Playing, Playlists and Calendar sit in one scroll view under the
  // screen's title. The "Playlists" and "Calendar" headings dock to its top
  // and bottom edges whenever their section is scrolled off, so all three
  // stay in reach; their arrows scroll a section in or out of view.
  //
  // Now Playing and Playlists size to their content, and only once together
  // they'd outgrow the space beside those two headings do they start
  // scrolling inside themselves — each then capped at half that space,
  // unless the other needs less and leaves it more.
  //
  // Opening the file browser pushes the whole view down. While it's open,
  // everything left below it goes to Now Playing so as much of it as
  // possible stays in view to edit: the headings stop docking and may
  // scroll away with the rest, and scrolling on past the end of Now Playing
  // closes the browser and carries on down to Playlists.
  //
  // None of the headings has a background of its own: they float over the
  // content, and blur-fade bands tied to them do the hiding (see
  // SectionTitle) — the lists themselves just cut a hard edge, tucked under
  // the neighbouring heading where its band is strongest. The popup's own
  // title gets the same band below it. "Calendar" is the exception: the
  // fade above it belongs to the Playlists list instead (a footer riding on
  // the list's bottom edge, see below).
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(0);
  // The view's bottom padding (the iOS toolbar clearance on a phone), which
  // the lists leave free at rest.
  const [padBottom, setPadBottom] = useState(0);
  const [nowPlayingNatural, setNowPlayingNatural] = useState(0);
  const [playlistsNatural, setPlaylistsNatural] = useState(0);

  // Everything below the tuck under the popup's title.
  const usable = Math.max(0, pageHeight - HEADER_TUCK);
  const room = Math.max(0, usable - SECTION_TITLE_HEIGHT * 2);
  const half = Math.floor(room / 2);
  // What the two lists share at rest: less the view's bottom padding (the
  // iOS toolbar clearance on a phone), so "Calendar" lands right below
  // Playlists rather than docking over the end of it. Playlists gives that
  // up out of its half, so Now Playing's end — and the "Playlists"
  // heading — stay put.
  const fit = Math.max(0, room - padBottom);
  // The file browser takes half, and while it's open all the rest goes to
  // Now Playing.
  const pickerHeight = Math.round(usable / 2);
  // Unmeasured (the first frame, before the view has a size): no cap yet,
  // rather than a cap of 0 that would flash everything shut.
  const pickingNowPlayingCap = usable - pickerHeight;
  const normalNowPlayingCap = Math.max(half, fit - playlistsNatural);
  const nowPlayingCap = pageHeight === 0 ? undefined : picking ? pickingNowPlayingCap : normalNowPlayingCap;
  // Both, for the scroll handler that blends between them as the file
  // browser is scrolled shut (see below).
  const capsRef = useRef({ picking: pickingNowPlayingCap, normal: normalNowPlayingCap });
  useEffect(() => {
    capsRef.current = { picking: pickingNowPlayingCap, normal: normalNowPlayingCap };
  });
  const playlistsCap = pageHeight === 0 ? undefined : Math.max(0, half - padBottom, fit - nowPlayingNatural);

  const playlistsAnchorRef = useRef<HTMLDivElement>(null);
  const calendarAnchorRef = useRef<HTMLDivElement>(null);
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  // Whether Calendar is scrolled up into view — what its arrow shows, and
  // which way pressing it scrolls.
  const [calendarInView, setCalendarInView] = useState(false);

  const pickerRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // Set for the one render that removes a file browser already scrolled out
  // of view, so it goes at once instead of animating shut off-screen.
  const [instantClose, setInstantClose] = useState(false);

  // The file browser has been scrolled fully out of view: take it out of
  // the layout and move the scroll position up by the same amount in the
  // same frame, so nothing on screen moves.
  //
  // The "+ Media" row comes back at that moment too (it's folded away while
  // picking), at the very top of Now Playing — which pushes Now Playing's
  // rows down either inside the list (when it's clipped and scrolling) or
  // in the view (when it isn't). Rather than guess which, a row's position
  // is taken before and after, and the drift scrolled back out of whichever
  // of the two can absorb it — the list first — so "+ Media" ends up just
  // above what's showing and the rows stay put.
  const mediaRowRef = useRef<HTMLButtonElement>(null);
  function closePickerInPlace(height: number) {
    const view = pageRef.current;
    if (!view) return;
    const list = nowPlayingScrollRef.current;
    const reference =
      list?.querySelector<HTMLElement>("[data-entry-id]") ?? playlistsAnchorRef.current ?? null;
    const before = reference?.getBoundingClientRect().top ?? 0;
    const at = view.scrollTop;
    flushSync(() => {
      setInstantClose(true);
      stopPicking();
    });
    view.scrollTop = Math.max(0, at - height);
    const drift = reference ? reference.getBoundingClientRect().top - before : 0;
    if (drift !== 0) {
      let left = drift;
      if (list && reference && list.contains(reference)) {
        const from = list.scrollTop;
        list.scrollTop = from + left;
        left -= list.scrollTop - from;
      }
      view.scrollTop += left;
    }
    requestAnimationFrame(() => setInstantClose(false));
  }

  // Read from the layout effect below, which only re-runs on open.
  const pickingRef = useRef(picking);
  const closePickerInPlaceRef = useRef(closePickerInPlace);
  useEffect(() => {
    pickingRef.current = picking;
    closePickerInPlaceRef.current = closePickerInPlace;
  });

  // The sheet's content only mounts while it's open, so the view's size and
  // what's on screen are (re)measured on every open.
  useEffect(() => {
    if (!open) return;
    let cleanup = () => {};
    const frame = requestAnimationFrame(() => {
      const view = pageRef.current;
      if (!view) return;
      const naturalOf = (anchor: HTMLElement | null) =>
        anchor ? view.scrollTop + anchor.getBoundingClientRect().top - view.getBoundingClientRect().top : Infinity;
      const update = () => {
        const h = view.clientHeight;
        const top = view.scrollTop;
        const maxScroll = view.scrollHeight - h;
        setPageHeight(h);
        // Sticky offsets, like everything else here, count from inside the
        // view's padding — the tuck under the title at the top.
        const padTop = parseFloat(getComputedStyle(view).paddingTop) || 0;

        // "Done" rides up with the file browser as it's scrolled shut, and
        // fades out as it goes in behind the popup's title — fully gone by
        // the time the browser is scrolled out and taken away, so nothing
        // pops out of sight behind the title at that moment. Set straight on
        // the element: it follows every scroll frame.
        const picker = pickerRef.current;
        // The browser's share of the layout: its box reaches HEADER_TUCK up
        // behind the popup's title, which isn't part of what scrolls away.
        const pickerSpan = picker ? Math.max(0, picker.offsetHeight - HEADER_TUCK) : 0;
        const done = doneRef.current;
        if (picker && done) {
          const remaining = pickerSpan - top;
          done.style.opacity = String(Math.min(1, Math.max(0, remaining / DONE_FADE_DISTANCE)));
        }

        // Likewise Now Playing's height: while the browser is scrolled shut
        // by hand, the list grows from its picking height to its usual one in
        // step with how far the browser's gone — so there's nothing left to
        // settle once it's taken away. Set straight on the element, over
        // what React last rendered.
        const list = nowPlayingScrollRef.current;
        if (pickingRef.current && picker && list) {
          const caps = capsRef.current;
          const progress = Math.min(1, Math.max(0, top / Math.max(1, pickerSpan)));
          const cap = caps.picking + (caps.normal - caps.picking) * progress;
          list.style.maxHeight = `${cap + HEADER_TUCK}px`;
        }

        const calendarAt = naturalOf(calendarAnchorRef.current);

        // Calendar counts as in view once it's scrolled as far up as it
        // goes — right under the docked "Playlists" heading, or wherever the
        // end of the view stops it short of that.
        const calendarTarget = Math.min(calendarAt - SECTION_TITLE_HEIGHT - padTop, maxScroll);
        setCalendarInView(top >= calendarTarget - 24);

        setPadBottom(parseFloat(getComputedStyle(view).paddingBottom) || 0);
      };
      update();

      // Scrolling down while the file browser is open scrolls it shut by
      // hand. Once the view comes to rest — the wheel or trackpad has
      // stopped, or the finger's up and any momentum has run out — a
      // browser less than halfway gone springs back open, one more than
      // halfway finishes closing, and one scrolled right out of view is
      // taken out of the layout without anything on screen moving.
      let touching = false;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      const settlePicker = () => {
        const picker = pickerRef.current;
        if (!pickingRef.current || touching || !picker) return;
        const height = Math.max(0, picker.offsetHeight - HEADER_TUCK);
        const at = view.scrollTop;
        if (at <= 1 || height === 0) return;
        if (at >= height - 1) {
          closePickerInPlaceRef.current(height);
          return;
        }
        view.scrollTo({ top: at < height / 2 ? 0 : height, behavior: "smooth" });
      };
      const scheduleSettle = () => {
        clearTimeout(settleTimer);
        if (pickingRef.current) settleTimer = setTimeout(settlePicker, PICKER_SETTLE_MS);
      };
      const onTouchStart = () => {
        touching = true;
        clearTimeout(settleTimer);
      };
      const onTouchEnd = () => {
        touching = false;
        scheduleSettle();
      };
      view.addEventListener("scroll", scheduleSettle, { passive: true });
      view.addEventListener("touchstart", onTouchStart, { passive: true });
      view.addEventListener("touchend", onTouchEnd, { passive: true });
      view.addEventListener("touchcancel", onTouchEnd, { passive: true });

      // The view's own size, and everything in it — a list growing,
      // shrinking or getting its cap moves the headings without any
      // scrolling, and docking has to follow.
      const observer = new ResizeObserver(update);
      observer.observe(view);
      for (const child of Array.from(view.children)) observer.observe(child);
      if (calendarBodyRef.current) observer.observe(calendarBodyRef.current);
      view.addEventListener("scroll", update, { passive: true });
      cleanup = () => {
        observer.disconnect();
        clearTimeout(settleTimer);
        view.removeEventListener("scroll", update);
        view.removeEventListener("scroll", scheduleSettle);
        view.removeEventListener("touchstart", onTouchStart);
        view.removeEventListener("touchend", onTouchEnd);
        view.removeEventListener("touchcancel", onTouchEnd);
      };
    });
    return () => {
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, [open]);

  function scrollPageTo(top: number) {
    pageRef.current?.scrollTo({ top, behavior: "smooth" });
  }

  // Where a heading sits in the scroll view when it isn't docked — read off
  // a plain marker just before it, since a docked heading's own position is
  // wherever it's currently stuck.
  function naturalTop(anchor: HTMLElement | null) {
    const page = pageRef.current;
    if (!page || !anchor) return 0;
    return page.scrollTop + anchor.getBoundingClientRect().top - page.getBoundingClientRect().top;
  }

  function showPlaylists() {
    scrollPageTo(0);
  }

  function showCalendar() {
    // Up under the "Playlists" heading, which docks above it (both below the
    // tuck under the popup's title) — or as far as the view goes, which is
    // fine: at the very end it simply sits at the bottom.
    scrollPageTo(naturalTop(calendarAnchorRef.current) - SECTION_TITLE_HEIGHT - HEADER_TUCK);
  }

  function toggleCalendar() {
    if (calendarInView) showPlaylists();
    else showCalendar();
  }

  function openPicker() {
    scrollPageTo(0);
    startPicking();
    scrollNowPlaying("start");
  }

  // --- Scrolling Now Playing ---------------------------------------------------

  const nowPlayingScrollRef = useRef<HTMLDivElement>(null);
  // Set alongside a change to `items`, then carried out once that change
  // has rendered — scrolling before the new rows exist would stop short.
  const pendingScrollRef = useRef<"start" | "end" | null>(null);

  function scrollNowPlaying(to: "start" | "end") {
    const el = nowPlayingScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: to === "start" ? 0 : el.scrollHeight, behavior: "smooth" });
  }

  function requestScroll(to: "start" | "end") {
    pendingScrollRef.current = to;
  }

  useEffect(() => {
    const to = pendingScrollRef.current;
    if (!to) return;
    pendingScrollRef.current = null;
    scrollNowPlaying(to);
    // New rows grow in over a moment (see SortableEntryList), which moves
    // the end further down — follow it once they've settled.
    if (to === "end") {
      const settle = setTimeout(() => scrollNowPlaying("end"), 400);
      return () => clearTimeout(settle);
    }
  }, [items]);

  // Scrolls just far enough to show the first of these rows that's on
  // screen — nothing, if it's already fully visible.
  function scrollToRow(ids: string[]) {
    const container = nowPlayingScrollRef.current;
    if (!container) return;
    const row = ids
      .map((id) => container.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`))
      .find(Boolean);
    if (!row) return;
    const box = container.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top >= box.top && r.bottom <= box.bottom) return;
    const offset = r.top < box.top ? r.top - box.top - 8 : r.bottom - box.bottom + 8;
    container.scrollTo({ top: container.scrollTop + offset, behavior: "smooth" });
  }

  // --- Library playlists (below) ------------------------------------------

  // The "Playlists" heading, and so its sort button, is drawn here rather
  // than by PlaylistSection (see `embedded` there).
  const [playlistSortKey, setPlaylistSortKey] = useState<PlaylistSortKey>("date");
  const [playlistSortDir, setPlaylistSortDir] = useState<SortDir>("desc");

  function togglePlaylistSort(key: PlaylistSortKey) {
    if (key === playlistSortKey) setPlaylistSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setPlaylistSortKey(key);
      setPlaylistSortDir("asc");
    }
  }

  // Playlists are read-only here (editable={false} below) — editing them is
  // the Library page's job.
  const [localPlaylists, setLocalPlaylists] = useState(library.playlists);
  useEffect(() => {
    setLocalPlaylists(library.playlists);
  }, [library.playlists]);

  // --- Timed playback (alarm clock, Calendar) -------------------------------

  // Every timer on this screen — pending ones and ones already playing out
  // their window — mirrored locally so setting or cancelling one updates the
  // alarm buttons and the Calendar at once, then resynced from the server.
  const [localSchedules, setLocalSchedules] = useState(schedules);
  const [prevSchedules, setPrevSchedules] = useState(schedules);
  if (schedules !== prevSchedules) {
    setPrevSchedules(schedules);
    setLocalSchedules(schedules);
  }
  // The alarm buttons' countdowns: only timers still waiting to fire.
  const timers = useMemo(() => timersFrom(localSchedules), [localSchedules]);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const schedulingPlaylist = localPlaylists.find((p) => p.id === schedulingId);
  const schedulingEntry = localSchedules.find((t) => t.playlist_id === schedulingId);

  function openSchedule(playlistId: string) {
    setSchedulingId(playlistId);
    setScheduleOpen(true);
  }

  // Resolves to an error message — an overlap with another schedule, most
  // likely — for the popup to show while it stays open, or null on success.
  async function handleSchedule(runAt: Date, hours: number): Promise<string | null> {
    if (!schedulingId) return null;
    const playlistId = schedulingId;
    let result: { error: string } | { ok: true };
    try {
      result = await schedulePlaylist(screen.id, playlistId, runAt.toISOString(), hours);
    } catch (err) {
      console.error("Failed to schedule playlist", err);
      return `Couldn't set the timer: ${err instanceof Error ? err.message : "unknown error"}`;
    }
    if ("error" in result) return result.error;
    setLocalSchedules((current) => [
      ...current.filter((t) => t.playlist_id !== playlistId),
      {
        id: `optimistic-${playlistId}`,
        screen_id: screen.id,
        playlist_id: playlistId,
        run_at: runAt.toISOString(),
        ends_at: new Date(runAt.getTime() + hours * 3_600_000).toISOString(),
        fired_at: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setScheduleOpen(false);
    router.refresh();
    return null;
  }

  async function cancelScheduleFor(playlistId: string) {
    setLocalSchedules((current) => current.filter((t) => t.playlist_id !== playlistId));
    try {
      await cancelScheduledPlayback(screen.id, playlistId);
    } catch (err) {
      console.error("Failed to cancel timer", err);
    }
    router.refresh();
  }

  async function handleCancelTimer() {
    if (!schedulingId) return;
    setScheduleOpen(false);
    await cancelScheduleFor(schedulingId);
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
    if (!next) stopPicking();
    onOpenChange(next);
  }

  const totalSeconds = items.reduce((sum, item) => sum + item.duration_seconds, 0);

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      title={screen.name}
      // The screen's name as a page-sized heading, matching "Playlists"
      // below it, with the plain "Done" link replaced by a blue tick —
      // two thirds the size of the tile's own playback button, the one
      // that opened this menu from the same corner of the same card.
      titleClassName="text-[28px] font-semibold tracking-tight"
      // No rule under the header, and the button's own height carries the
      // row: together that brings Now Playing up close under the title.
      // pr-3 matches py-3, so the tick sits the same distance from the
      // popup's top edge as from its right one; the title keeps the
      // regular px-5 inset on the left.
      // relative z-20: the scroll view below reaches up behind the title
      // (see HEADER_TUCK), which has to stay on top of it.
      headerClassName="relative z-20 border-b-0 py-3 pr-3"
      // The screen's own name heads Now Playing too, with its file count,
      // running time and "⋯" (playback settings) right after it — in that
      // order. It never scrolls away: the sections below scroll under it.
      titleAddon={
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[12px] text-muted">
            {items.length} file{items.length === 1 ? "" : "s"}
          </span>
          <span className="text-[12px] text-muted">{formatDuration(totalSeconds)}</span>
          <TransitionMenu
            transition={transition}
            onSelect={handleSelectTransition}
            speed={speed}
            onSelectSpeed={handleSelectSpeed}
            slideDirection={slideDirection}
            onSelectSlideDirection={handleSelectSlideDirection}
            background={background}
            onSelectBackground={onSelectBackground}
          />
        </div>
      }
      actions={
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          title="Done"
          aria-label="Done"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-sm hover:opacity-90"
        >
          <CheckIcon className="h-6 w-6" />
        </button>
      }
      contentClassName="sm:max-w-3xl sm:h-[85vh]"
      // overflow-visible: the scroll view reaches up out of this box, behind
      // the title (the popup itself still clips to its rounded shape). pb-0:
      // it runs right to the popup's bottom edge and pads itself instead.
      bodyClassName="relative flex min-h-0 flex-col overflow-visible pb-0 pt-0"
    >
      {/* FileTree's own draggables/droppables need a DndContext above them;
          with no sensors it never starts a drag — this tree is only ever a
          picker here. */}
      <DndContext sensors={[]}>
        {/* The one scroll view. It reaches HEADER_TUCK up under the popup's
            title (padded back down by the same amount), so content scrolling
            up passes behind the title's lower part the way it passes behind
            the section headings — with the same band hiding it (below). The
            band under the title, and the one for content running on past
            the bottom, float over its edges (siblings, so they stay put
            while it scrolls). -mx-5/px-5: it spans the popup's full width so
            the lists' 10px side bleed (matching the Library's cards) isn't
            clipped by its own box. pb-[90px] on a phone: the sheet is
            full-screen there, and this is the same clearance the Library
            page keeps for iOS Safari's floating toolbar
            (safari-toolbar-inset). */}
        <div className="relative -mx-5 flex min-h-0 flex-1 flex-col" style={{ marginTop: -HEADER_TUCK }}>
          <div
            ref={pageRef}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-[90px] sm:pb-5"
            style={{ paddingTop: HEADER_TUCK }}
          >
            {/* The file browser — the scroll view's first section while
                picking, half its height, pushing everything else down as it
                opens. Being part of the scroll, scrolling down closes it by
                hand: let go before halfway and it springs back open, scroll
                back up and it comes back, go past halfway and it finishes
                closing (see settlePicker). Kept mounted throughout (inert
                while closed) so opening and closing can animate. -mx-5/px-5
                keep FileTree's own edge-to-edge bleed inside this clipping
                box. */}
            <div
              ref={pickerRef}
              inert={!picking}
              className="relative -mx-5 flex shrink-0 flex-col overflow-hidden px-5 ease-out"
              style={{
                // Its box reaches HEADER_TUCK up behind the popup's title
                // (padded back down by the same), so the file list's own
                // blur-fade carries on up there rather than being cut off
                // mid-gradient at the title's edge. overflow-hidden, not a
                // clip-path: a clip-path would cut that blur off from the
                // very rows it's meant to blur (it isolates what a
                // backdrop-filter inside it can see), leaving sharp text
                // sitting on its own blurred copy. Closed, it's just that
                // tuck, and takes no room.
                marginTop: -HEADER_TUCK,
                paddingTop: HEADER_TUCK,
                height: (picking ? pickerHeight : 0) + HEADER_TUCK,
                opacity: picking ? 1 : 0,
                transition: instantClose ? "none" : `height ${FILE_PICKER_MS}ms, opacity ${FILE_PICKER_MS}ms`,
              }}
            >
              <div
                className="flex min-h-0 flex-1 flex-col pb-5 ease-out"
                style={{
                  transform: picking ? "none" : "translateY(-40px)",
                  transition: instantClose ? "none" : `transform ${FILE_PICKER_MS}ms`,
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

              {/* "Done" — the "+ Media" row turned into a pill while picking,
                  inside the browser's faded bottom edge, right at its upper
                  boundary, so it takes nothing away from Now Playing below.
                  Part of the browser, so it scrolls away with it. */}
              <button
                ref={doneRef}
                type="button"
                onClick={stopPicking}
                tabIndex={picking ? 0 : -1}
                aria-hidden={!picking}
                title="Done picking"
                className="absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent px-5 py-2 text-[15px] font-medium text-accent-contrast shadow-[var(--shadow-card)]"
                style={{ top: `calc(100% - ${PICKER_FADE}px)` }}
              >
                Done
              </button>
            </div>

            {/* Now Playing — its heading is the popup's title. Its top edge
                tucks up behind that title, where the band there is strongest;
                its last row stays clear of the band above "Playlists". */}
            <div className="-mx-[10px]">
              <ListScroller
                maxHeight={nowPlayingCap}
                // Always tucked, picking or not: switching it at the moment the
                // file browser goes would shift the list's box. While picking,
                // rows scrolled up simply pass under the browser's faded edge.
                overlapTop={HEADER_TUCK}
                easeCap={!picking}
                // While picking it doesn't scroll itself: scrolling on it is
                // scrolling the file browser shut (see settlePicker).
                scrollable={!picking}
                outerRef={pageRef}
                scrollRef={nowPlayingScrollRef}
                onNaturalHeight={setNowPlayingNatural}
                // Starts right under the popup's title (its band ends where the
                // tuck does); ends TITLE_CLEAR_ABOVE short of "Playlists", clear
                // of its band. Its box ends at the heading's top edge, right
                // under the band's strongest line.
                contentClassName="px-[10px]"
                contentStyle={{ paddingBottom: TITLE_CLEAR_ABOVE }}
              >
                {/* The way into the file browser, as the list's first row —
                    dashed like the Library's "+ Create". While picking it folds
                    away (it's become the "Done" pill above), and each picked
                    file lands where it was. */}
                <div
                  // Taken away in place (scrolled shut), the row opens at once —
                  // it's above the part in view — but still fades in, since
                  // its lower edge shows faintly behind the title.
                  className={cn(
                    "grid duration-300 ease-out",
                    instantClose ? "transition-opacity" : "transition-[grid-template-rows,opacity]",
                  )}
                  style={{ gridTemplateRows: picking ? "0fr" : "1fr", opacity: picking ? 0 : 1 }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <button
                      ref={mediaRowRef}
                      type="button"
                      onClick={openPicker}
                      tabIndex={picking ? -1 : 0}
                      className="press-ghost-fit mb-2 flex w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border p-3 text-[15px] font-medium text-accent hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                    >
                      + Media
                    </button>
                  </div>
                </div>
                <SortableEntryList
                  entries={items}
                  sensors={sensors}
                  onMove={moveItem}
                  onRemove={(id) => removeItems([id])}
                  onDurationChange={changeDuration}
                  removeLabel="Remove from Now Playing"
                  empty={null}
                />
              </ListScroller>
            </div>

            {/* Playlists and Calendar. Their headings dock to the view's top
                and bottom edges when their section is scrolled off (sticky,
                each offset by the other's height so they stack), so both
                stay in reach — except while picking, when they scroll away
                with everything else. The markers are where each heading
                would sit undocked — what its arrow scrolls to. -mx-5/px-5:
                the headings, and so their bands, span the popup's width. */}
            <div>
              <div ref={playlistsAnchorRef} />
              <SectionTitle
                title="Playlists"
                className={cn("-mx-5 px-5", picking ? "relative" : "sticky")}
                style={picking ? undefined : { top: 0, bottom: SECTION_TITLE_HEIGHT }}
                trailing={
                  <PlaylistSortMenuButton sortKey={playlistSortKey} sortDir={playlistSortDir} onToggleSort={togglePlaylistSort} />
                }
              />
              {/* The list's footer rides along inside this box: sticky, so
                  it's at the list's bottom edge wherever that is on screen,
                  but never lower than right above a docked "Calendar". */}
              <div className="-mx-[10px]">
                {/* Tucks in under the whole "Playlists" heading, up to its
                    band's strongest line; its first row starts just clear of
                    that band, its last clear of the footer. */}
                <ListScroller
                  maxHeight={playlistsCap}
                  overlapTop={TITLE_TUCK_BELOW}
                  outerRef={pageRef}
                  onNaturalHeight={setPlaylistsNatural}
                  contentClassName="px-[10px]"
                  contentStyle={{ paddingTop: TITLE_CLEAR_BELOW, paddingBottom: PLAYLISTS_FOOTER }}
                >
                  <PlaylistSection
                    playlists={localPlaylists}
                    embedded={{ sortKey: playlistSortKey, sortDir: playlistSortDir }}
                    showCreate={false}
                    editable={false}
                    // Playlists with a timer running lead the list, soonest
                    // first, so an imminent change to the program is the
                    // first thing you see.
                    pinOrder={(p) => timers.get(p.id)?.getTime() ?? null}
                    renderActions={(p) => (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => playPlaylist(p)}
                          disabled={p.entries.length === 0}
                          title="Play — adds this playlist to the end of Now Playing"
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
                </ListScroller>
                {/* The footer: strongest along the list's bottom edge (hiding
                    its hard edge), fading out upwards. "Calendar" follows
                    right below it, docked or not. */}
                <div
                  aria-hidden
                  className={cn("pointer-events-none z-10 -mx-[10px]", picking ? "relative" : "sticky")}
                  style={{
                    height: PLAYLISTS_FOOTER,
                    marginTop: -PLAYLISTS_FOOTER,
                    bottom: picking ? undefined : SECTION_TITLE_HEIGHT,
                  }}
                >
                  <ProgressiveBlurEdge side="bottom" extent={PLAYLISTS_FOOTER} />
                </div>
              </div>

              <div ref={calendarAnchorRef} />
              <SectionTitle
                title="Calendar"
                inView={calendarInView}
                onToggle={toggleCalendar}
                bandAbove={false}
                className={cn("-mx-5 px-5", picking ? "relative" : "sticky")}
                style={picking ? undefined : { top: SECTION_TITLE_HEIGHT, bottom: 0 }}
              />
              <div ref={calendarBodyRef}>
                <CalendarSection
                  schedules={localSchedules}
                  playlists={localPlaylists}
                  onEdit={openSchedule}
                  onCancel={cancelScheduleFor}
                />
              </div>
            </div>
          </div>
          {/* Always there, like the headings' bands: under the popup's
              title, fading out over the tuck behind it (so Now Playing can
              start right below the tick). Content only ever reaches it by
              scrolling. */}
          <ProgressiveBlurEdge side="top" extent={HEADER_TUCK} />
        </div>

        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          playlistName={schedulingPlaylist?.name ?? ""}
          runAt={schedulingEntry ? new Date(schedulingEntry.run_at) : null}
          hours={
            schedulingEntry
              ? Math.round((new Date(schedulingEntry.ends_at).getTime() - new Date(schedulingEntry.run_at).getTime()) / 3_600_000)
              : null
          }
          onSchedule={handleSchedule}
          onCancelTimer={handleCancelTimer}
        />
      </DndContext>
    </Sheet>
  );
}
