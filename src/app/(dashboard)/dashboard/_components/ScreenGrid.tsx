"use client";

import { useState, type MouseEvent, type SyntheticEvent, type TouchEvent } from "react";
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
import { reorderScreens } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
import { ScreenTile } from "./ScreenTile";
import { AddScreenButton } from "./AddScreenButton";
import type { LibraryData } from "./PlaybackMenu";

type ScreenWithPlaylist = Screen & { playlist: PlaylistItemWithMedia[] };

// A tile can be picked up from anywhere on it — except text fields and
// links, where a press-and-drag means selecting text or dragging the link.
// Also ignores events that only reach the tile through React's tree: the
// tile's Playback popup is portaled elsewhere in the DOM, but its presses
// still bubble through the tile's listeners.
function startsTileDrag(event: SyntheticEvent) {
  const target = event.nativeEvent.target;
  if (!(target instanceof Element) || !(event.currentTarget as Element).contains(target)) return false;
  return !target.closest("input, textarea, select, a, [contenteditable='true']");
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

export function ScreenGrid({ screens, library }: { screens: ScreenWithPlaylist[]; library: LibraryData }) {
  // Reordered locally the moment a tile is dropped, so it doesn't snap back
  // while the new order is saved.
  const [ordered, setOrdered] = useState(screens);
  const [prevScreens, setPrevScreens] = useState(screens);
  if (screens !== prevScreens) {
    setPrevScreens(screens);
    setOrdered(screens);
  }

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
    const oldIndex = ordered.findIndex((s) => s.id === active.id);
    const newIndex = ordered.findIndex((s) => s.id === over.id);
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    reorderScreens(next.map((s) => s.id));
  }

  return (
    // safari-toolbar-inset: this page scrolls via the shared dashboard
    // <main>, not an internal fixed-height scroll area like Media/
    // Playlists — without this, the bottom row's info card ends up behind
    // iOS Safari's floating toolbar with no way to scroll it clear.
    <div className="safari-toolbar-inset flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">Screens</h1>
        <AddScreenButton />
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-20 text-center">
          <p className="text-[17px] font-medium">No screens yet</p>
          <p className="text-sm text-muted">Add a screen to get a player URL you can open on a TV.</p>
        </div>
      ) : (
        <DndContext id="screen-grid" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((screen) => (
                <SortableScreenTile key={screen.id} screen={screen} library={library} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// select-none / no touch callout: holding a tile to pick it up on iOS would
// otherwise start a text selection or pop the image preview menu instead.
// The rename field opts back in — iOS Safari won't edit text inside a
// user-select: none subtree.
function SortableScreenTile({ screen, library }: { screen: ScreenWithPlaylist; library: LibraryData }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: screen.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-screen-tile
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "cursor-grab select-none [-webkit-touch-callout:none] [&_input]:select-text",
        isDragging && "relative z-10 cursor-grabbing",
      )}
    >
      <div className={cn("transition-transform duration-200 ease-[var(--ease-spring)]", isDragging && "scale-[1.03]")}>
        <ScreenTile screen={screen} playlist={screen.playlist} library={library} />
      </div>
    </div>
  );
}
