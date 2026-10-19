"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent, type SyntheticEvent, type TouchEvent } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderDashboard } from "@/lib/actions/groups";
import { runDueScheduledPlaybacks } from "@/lib/actions/schedules";
import { useLiveRefresh } from "@/lib/realtime/useLiveRefresh";
import { useScreenStatuses, type ScreenStatusRow } from "@/lib/realtime/useScreenStatuses";
import { cn } from "@/lib/utils/cn";
import type {
  PlaylistItemWithMedia,
  ScheduledPlayback,
  Screen,
  ScreenGroup,
  ScreenGroupMember,
  SetupWithItems,
} from "@/types/domain";
import { ScreenTile } from "./ScreenTile";
import { GroupTile, type GroupMemberView } from "./GroupTile";
import { AddButton } from "./AddButton";
import { useViewer } from "@/lib/auth/ViewerContext";
import type { LibraryData } from "./PlaybackMenu";

type ScreenWithPlaylist = Screen & {
  playlist: PlaylistItemWithMedia[];
  schedules: ScheduledPlayback[];
  setup: SetupWithItems;
};
type GroupWithMembers = ScreenGroup & { members: ScreenGroupMember[]; setup: SetupWithItems };

// Screens and groups share the grid and its one order (reorder_dashboard
// in 0030); each tile's key says which it is.
type Tile =
  | { key: string; kind: "screen"; position: number; screen: ScreenWithPlaylist }
  | { key: string; kind: "group"; position: number; group: GroupWithMembers };

function tilesFrom(screens: ScreenWithPlaylist[], groups: GroupWithMembers[]): Tile[] {
  const tiles: Tile[] = [
    ...screens.map((screen) => ({ key: `s:${screen.id}`, kind: "screen" as const, position: screen.position, screen })),
    ...groups.map((group) => ({ key: `g:${group.id}`, kind: "group" as const, position: group.position, group })),
  ];
  // Stable, so equal positions keep screens (by id) ahead of groups.
  return tiles.sort((a, b) => a.position - b.position);
}

// A tile can be picked up from anywhere on it — except text fields and
// links, where a press-and-drag means selecting text or dragging the link,
// and controls with their own swipe gesture (data-no-tile-drag).
// Also ignores events that only reach the tile through React's tree: the
// tile's Playback popup is portaled elsewhere in the DOM, but its presses
// still bubble through the tile's listeners.
function startsTileDrag(event: SyntheticEvent) {
  const target = event.nativeEvent.target;
  if (!(target instanceof Element) || !(event.currentTarget as Element).contains(target)) return false;
  return !target.closest("input, textarea, select, a, [contenteditable='true'], [data-no-tile-drag]");
}

const baseMouseActivator = MouseSensor.activators[0].handler;
const baseTouchActivator = TouchSensor.activators[0].handler;

class TileMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (event: MouseEvent, options: Parameters<typeof baseMouseActivator>[1]) =>
        startsTileDrag(event) && baseMouseActivator(event, options),
    },
  ];
}

class TileTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (event: TouchEvent, options: Parameters<typeof baseTouchActivator>[1]) =>
        startsTileDrag(event) && baseTouchActivator(event, options),
    },
  ];
}

export function ScreenGrid({
  screens,
  memberOnlyScreens,
  groups,
  statuses,
  library,
}: {
  screens: ScreenWithPlaylist[];
  // Screens the viewer can't see on their own, but which sit in a group
  // they can — shown only on that group's tile.
  memberOnlyScreens: ScreenWithPlaylist[];
  groups: GroupWithMembers[];
  statuses: ScreenStatusRow[] | null;
  library: LibraryData;
}) {
  const viewer = useViewer();
  // One subscription for the whole grid rather than one per tile.
  const statusOf = useScreenStatuses(statuses);
  // A player reports only the id of what it's showing — which may not be in
  // the screen's own playlist (a timed switch it made ahead of the
  // database), so it's looked up across the whole library.
  const mediaById = useMemo(() => new Map(library.media.map((m) => [m.id, m])), [library.media]);
  // Reordered locally the moment a tile is dropped, so it doesn't snap back
  // while the new order is saved.
  const [ordered, setOrdered] = useState(() => tilesFrom(screens, groups));
  const [prevData, setPrevData] = useState({ screens, groups });
  if (screens !== prevData.screens || groups !== prevData.groups) {
    setPrevData({ screens, groups });
    setOrdered(tilesFrom(screens, groups));
  }

  // What a group tile needs of each member screen: the screen, what's on
  // air there, and its live status.
  const memberViews = new Map<number, GroupMemberView>(
    [...screens, ...memberOnlyScreens].map((screen) => [
      screen.id,
      { screen, playlist: screen.playlist, status: statusOf(screen.id) },
    ]),
  );
  const screenOptions = screens.map((s) => ({ id: s.id, name: s.name }));

  // Desktop: a click-and-drag anywhere on the tile, with a few pixels of
  // travel first so plain clicks on its buttons still work. Touch: press and
  // hold — a quick swipe across a tile keeps scrolling the page.
  const sensors = useSensors(
    useSensor(TileMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TileTouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((t) => t.key === active.id);
    const newIndex = ordered.findIndex((t) => t.key === over.id);
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    reorderDashboard(next.map((t) => t.key));
  }

  // Someone else's edits — here or on the Library page — land on this
  // dashboard as they happen.
  useLiveRefresh("live-dashboard");

  // Only timers still waiting to fire — a fired one stays listed until its
  // window ends (0022), but has nothing left to trigger.
  useFireTimersOnTime(screens.flatMap((s) => s.schedules.filter((t) => !t.fired_at).map((t) => t.run_at)));

  return (
    // safari-toolbar-inset: this page scrolls via the shared dashboard
    // <main>, not an internal fixed-height scroll area like Media/
    // Playlists — without this, the bottom row's info card ends up behind
    // iOS Safari's floating toolbar with no way to scroll it clear.
    <div className="safari-toolbar-inset flex flex-col gap-5">
      {/* min-h: the "+" button's height, kept when it's hidden. */}
      <div className="flex min-h-[var(--title-action)] items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight">Screens</h1>
        {/* Adding screens and groups comes with the Screens page's settings
            (the actions check too). */}
        {viewer.access.screens.settings && (
          <AddButton screens={screenOptions} />
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-20 text-center">
          <p className="text-[17px] font-medium">No screens yet</p>
          <p className="text-sm text-muted">
            {viewer.access.screens.settings
              ? "Add a screen to get a player URL you can open on a TV."
              : "Screens you're given access to show up here."}
          </p>
        </div>
      ) : (
        <DndContext id="screen-grid" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((t) => t.key)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((tile) => (
                <SortableTile key={tile.key} id={tile.key} disabled={!viewer.access.screens.reorder}>
                  {tile.kind === "screen" ? (
                    <ScreenTile
                      screen={tile.screen}
                      playlist={tile.screen.playlist}
                      library={library}
                      schedules={tile.screen.schedules}
                      setup={tile.screen.setup}
                      status={statusOf(tile.screen.id)}
                      mediaById={mediaById}
                    />
                  ) : (
                    <GroupTile
                      group={tile.group}
                      members={memberViews}
                      screens={screenOptions}
                      library={library}
                      mediaById={mediaById}
                    />
                  )}
                </SortableTile>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// Timed playback is fired server-side by a pg_cron job every few seconds;
// while the dashboard's open, it also fires the soonest pending timer itself
// the moment it comes due, so the switch (and its countdown turning back
// into an alarm clock) lands on the dot rather than up to a tick late.
// Keyed on the timer list's contents, so if a run somehow leaves a due
// timer in place this doesn't loop — it waits for the list to change.
function useFireTimersOnTime(runAts: string[]) {
  const router = useRouter();
  const key = [...runAts].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const soonest = Math.min(...key.split(",").map((iso) => new Date(iso).getTime()));
    // setTimeout overflows past ~24.8 days; a longer wait just re-arms
    // whenever the page is next refreshed.
    const delay = Math.min(Math.max(0, soonest - Date.now()), 2 ** 31 - 1);
    const id = setTimeout(async () => {
      try {
        await runDueScheduledPlaybacks();
      } catch (err) {
        console.error("Failed to run due timers", err);
      }
      router.refresh();
    }, delay);
    return () => clearTimeout(id);
  }, [key, router]);
}

// select-none / no touch callout: holding a tile to pick it up on iOS would
// otherwise start a text selection or pop the image preview menu instead.
// The rename field opts back in — iOS Safari won't edit text inside a
// user-select: none subtree.
// disabled: the viewer's roles don't let them rearrange the grid, so tiles
// stay put (reorderDashboard refuses it too).
function SortableTile({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-screen-tile
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "select-none [-webkit-touch-callout:none] [&_input]:select-text",
        !disabled && "cursor-grab",
        isDragging && "relative z-10 cursor-grabbing",
      )}
    >
      <div className={cn("transition-transform duration-200 ease-[var(--ease-spring)]", isDragging && "scale-[1.03]")}>
        {children}
      </div>
    </div>
  );
}
