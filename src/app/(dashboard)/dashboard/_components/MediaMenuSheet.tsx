"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/Button";
import { createBrowserClient } from "@/lib/supabase/client";
import { reorderPlaylist, unassignMedia, updateItemDuration } from "@/lib/actions/playlist";
import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
import { AssignedItemRow } from "./AssignedItemRow";
import { AssignmentMenuSheet } from "./AssignmentMenuSheet";

export function MediaMenuSheet({
  screen,
  open,
  onOpenChange,
}: {
  screen: Screen;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<PlaylistItemWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("playlist_items")
      .select("*, media_item:media_items(*)")
      .eq("screen_id", screen.id)
      .order("position", { ascending: true });
    if (!error) setItems((data ?? []) as unknown as PlaylistItemWithMedia[]);
    setLoading(false);
  }, [screen.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((current) => {
      const oldIndex = current.findIndex((i) => i.id === active.id);
      const newIndex = current.findIndex((i) => i.id === over.id);
      const next = arrayMove(current, oldIndex, newIndex);
      reorderPlaylist(
        screen.id,
        next.map((i) => i.id),
      );
      return next;
    });
  }

  async function handleUnassign(id: string) {
    setItems((current) => current.filter((i) => i.id !== id));
    await unassignMedia(id);
  }

  async function handleDurationChange(id: string, seconds: number) {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, duration_seconds: seconds } : i)));
    await updateItemDuration(id, seconds);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={screen.name}>
        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted">No content assigned yet.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <AssignedItemRow
                      key={item.id}
                      item={item}
                      onUnassign={() => handleUnassign(item.id)}
                      onDurationChange={(seconds) => handleDurationChange(item.id, seconds)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <Button variant="secondary" className="mt-2" onClick={() => setAssignOpen(true)}>
            + Add Content
          </Button>
        </div>
      </Sheet>

      <AssignmentMenuSheet
        screenId={screen.id}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onAssigned={load}
      />
    </>
  );
}
