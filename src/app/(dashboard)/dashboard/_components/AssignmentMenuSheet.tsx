"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { MediaThumb } from "@/components/MediaThumb";
import { cn } from "@/lib/utils/cn";
import { createBrowserClient } from "@/lib/supabase/client";
import { assignMedia } from "@/lib/actions/playlist";
import type { MediaItem } from "@/types/domain";

export function AssignmentMenuSheet({
  screenId,
  open,
  onOpenChange,
  onAssigned,
}: {
  screenId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    createBrowserClient()
      .from("media_items")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setMedia(data ?? []);
        setLoading(false);
      });
  }, [open]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) return;
    setAssigning(true);
    await assignMedia(screenId, Array.from(selected));
    setAssigning(false);
    onOpenChange(false);
    onAssigned();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add Content">
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : media.length === 0 ? (
          <p className="text-muted">Your media library is empty — upload files on the Media page first.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {media.map((item) => {
              const isSelected = selected.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-[var(--radius-md)] ring-2 transition-all",
                    isSelected ? "ring-accent" : "ring-transparent",
                  )}
                >
                  <MediaThumb item={item} />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-1 text-left text-[11px] text-white">
                    {item.name}
                  </span>
                  {isSelected && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-contrast">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Button disabled={selected.size === 0 || assigning} onClick={handleContinue}>
          {assigning
            ? "Adding…"
            : selected.size > 0
              ? `Add ${selected.size} Item${selected.size > 1 ? "s" : ""}`
              : "Select Content"}
        </Button>
      </div>
    </Sheet>
  );
}
