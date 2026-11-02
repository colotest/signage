"use client";

import { useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";

const DRAG_START_PX = 4;

// A row of options in a recessed track, with a raised thumb on the chosen
// one — the dashboard's Fit/Fill pill, stretched to full width. Tap an
// option to pick it, or drag the thumb along: it follows the finger and
// settles on whichever option it's let go over. With nothing chosen yet
// (value null) there's no thumb until the first pick.
export function SegmentedSlider<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ startX: number; dragging: boolean; pointerId: number } | null>(null);
  // While dragging: the thumb's left edge, as a fraction of the track.
  const [dragPos, setDragPos] = useState<number | null>(null);

  const count = options.length;
  const selectedIndex = options.findIndex((o) => o.value === value);

  // The thumb centred under the pointer, kept inside the track.
  function positionAt(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width - 0.5 / count;
    return Math.min(Math.max(frac, 0), 1 - 1 / count);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    gestureRef.current = { startX: e.clientX, dragging: false, pointerId: e.pointerId };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_START_PX) return;
      g.dragging = true;
      // Captured only now, so a tap's click still reaches the option.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragPos(positionAt(e.clientX));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g?.dragging) return;
    const pos = positionAt(e.clientX);
    setDragPos(null);
    const index = Math.min(Math.max(Math.round(pos * count), 0), count - 1);
    onChange(options[index].value);
  }

  function onPointerCancel() {
    gestureRef.current = null;
    setDragPos(null);
  }

  const thumbFrac = dragPos ?? (selectedIndex >= 0 ? selectedIndex / count : null);
  // The option the thumb is over right now — lit while dragging, so it's
  // clear where it'll land.
  const litIndex = dragPos !== null ? Math.round(dragPos * count) : selectedIndex;

  return (
    // touch-pan-y: sideways drags belong to the thumb, vertical ones still
    // scroll the list.
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "relative flex touch-pan-y select-none rounded-full bg-black/[.05] p-0.5 shadow-[var(--shadow-well)] dark:bg-white/[.08]",
        className,
      )}
    >
      {thumbFrac !== null && (
        <span aria-hidden className="pointer-events-none absolute inset-0.5">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full bg-surface shadow-[var(--shadow-control)]",
              dragPos === null && "transition-transform duration-300 ease-[var(--ease-spring)]",
            )}
            style={{ width: `${100 / count}%`, transform: `translateX(${thumbFrac * count * 100}%)` }}
          />
        </span>
      )}
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "no-press relative h-9 flex-1 rounded-full text-[14px] font-medium transition-colors duration-200",
            i === litIndex ? "text-foreground" : "text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
