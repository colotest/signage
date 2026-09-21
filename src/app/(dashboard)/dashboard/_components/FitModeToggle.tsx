"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef, useState, type PointerEvent } from "react";
import { setFitMode } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { FitIcon, FillIcon } from "@/components/icons/FitIcons";
import type { FitMode } from "@/types/domain";

// Each option's width (w-7) — one step of the highlight.
const STEP_PX = 28;
// How far a swipe has to travel to count, and before it takes over from a
// tap on an option.
const SWIPE_THRESHOLD_PX = 8;
const DRAG_START_PX = 4;

const OPTIONS: { value: FitMode; label: string; Icon: typeof FitIcon }[] = [
  { value: "contain", label: "Fit", Icon: FitIcon },
  { value: "cover", label: "Fill", Icon: FillIcon },
];

// fitMode is the tile's optimistic value (useOptimistic in ScreenTile), so a
// press shows on the pill — and the preview — straight away instead of after
// the save and refresh, which used to invite a second press. Saves run one
// after another, so quick back-and-forth switching always ends on whatever
// was picked last.
export function FitModeToggle({
  screenId,
  fitMode,
  onOptimisticChange,
}: {
  screenId: number;
  fitMode: FitMode;
  onOptimisticChange: (fitMode: FitMode) => void;
}) {
  const router = useRouter();
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  function choose(next: FitMode) {
    if (next === fitMode) return;
    startTransition(async () => {
      onOptimisticChange(next);
      const save = queueRef.current.then(() => setFitMode(screenId, next));
      queueRef.current = save.catch(() => {});
      await save;
      router.refresh();
    });
  }

  const selectedIndex = OPTIONS.findIndex((option) => option.value === fitMode);

  // Swiping: the highlight follows the pointer (clamped to the pill), and
  // on release a swipe past the threshold picks the option on that side.
  // Until it's moved a few pixels a press is left alone, so plain taps on
  // an option still go through its own onClick.
  const gestureRef = useRef<{ startX: number; startIndex: number; dragging: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  function highlightPosition(dx: number, startIndex: number) {
    return Math.min(Math.max(startIndex * STEP_PX + dx, 0), (OPTIONS.length - 1) * STEP_PX);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    gestureRef.current = { startX: e.clientX, startIndex: selectedIndex, dragging: false };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const dx = e.clientX - gesture.startX;
    if (!gesture.dragging) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      gesture.dragging = true;
      // Captured only now, so a tap's click still lands on the option.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragOffset(highlightPosition(dx, gesture.startIndex));
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture?.dragging) return;
    setDragOffset(null);
    const dx = e.clientX - gesture.startX;
    const step = dx > SWIPE_THRESHOLD_PX ? 1 : dx < -SWIPE_THRESHOLD_PX ? -1 : 0;
    const nextIndex = Math.min(Math.max(gesture.startIndex + step, 0), OPTIONS.length - 1);
    choose(OPTIONS[nextIndex].value);
  }

  function handlePointerCancel() {
    gestureRef.current = null;
    setDragOffset(null);
  }

  return (
    // touch-pan-y: horizontal swipes belong to the pill, vertical ones still
    // scroll the page. data-no-tile-drag keeps a mouse swipe from picking up
    // the whole screen tile instead (see ScreenGrid).
    <div
      data-no-tile-drag
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="relative inline-flex self-start shrink-0 touch-pan-y rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]"
    >
      {/* One highlight that slides between the options, rather than each
          option switching its own background on and off. Each option is
          exactly STEP_PX wide. While swiping it tracks the pointer directly,
          with no transition, then eases into place on release. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 top-0.5 bottom-0.5 w-7 rounded-full bg-surface shadow-sm",
          dragOffset === null && "transition-transform duration-300 ease-[var(--ease-spring)]",
        )}
        style={{ transform: `translateX(${dragOffset ?? selectedIndex * STEP_PX}px)` }}
      />
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          title={option.label}
          aria-label={option.label}
          aria-pressed={fitMode === option.value}
          // no-press: the sliding highlight is the feedback here — no sink
          // or glint on top of it.
          className={cn(
            "no-press flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300",
            fitMode === option.value ? "text-foreground" : "text-muted",
          )}
        >
          <option.Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
