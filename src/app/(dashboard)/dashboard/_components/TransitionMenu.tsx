"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { ScreenTransition, ScreenTransitionSpeed } from "@/types/domain";
import { ThreeDotIcon } from "../../library/_components/FileTree";

// Wording sticks to what each one looks like rather than naming the
// mechanism — and says where a video is treated differently, since the
// player quietly falls back to a dip whenever showing two slides at once
// would mean decoding two videos (see Player).
const OPTIONS: { value: ScreenTransition; label: string; hint: string }[] = [
  { value: "cut", label: "Cut", hint: "No animation — the next slide simply appears." },
  { value: "dip", label: "Dip", hint: "Fades out to the screen's background, then in again." },
  { value: "crossfade", label: "Crossfade", hint: "The two slides overlap as one fades into the other." },
  { value: "slide", label: "Slide", hint: "The next slide pushes in from the right." },
];

const SPEEDS: { value: ScreenTransitionSpeed; label: string }[] = [
  { value: "fast", label: "Fast" },
  { value: "normal", label: "Normal" },
  { value: "slow", label: "Slow" },
];

// The Playback Menu's "⋯" — playback settings for the screen itself rather
// than its content. Same popup mechanics as the Library's sort menus: click
// outside or press Escape to close.
export function TransitionMenu({
  transition,
  onSelect,
  speed,
  onSelectSpeed,
}: {
  transition: ScreenTransition;
  onSelect: (transition: ScreenTransition) => void;
  speed: ScreenTransitionSpeed;
  onSelectSpeed: (speed: ScreenTransitionSpeed) => void;
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

  const active = OPTIONS.find((o) => o.value === transition) ?? OPTIONS[0];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Playback settings"
        aria-label="Playback settings"
        aria-expanded={open}
        className="press-ghost-fit flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="menu-pop absolute right-0 top-full z-20 mt-1 w-64 origin-top-right rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
          <p className="mb-1.5 text-[11px] text-muted">Transition</p>
          <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[12px]">
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                className={cn(
                  "press-ghost-fit flex-1 rounded-full py-1 text-center transition-colors",
                  transition === option.value
                    ? "bg-surface text-foreground font-medium shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">{active.hint}</p>

          {/* Nothing to time when there's no animation to run. */}
          {transition !== "cut" && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1.5 text-[11px] text-muted">Speed</p>
              <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[12px]">
                {SPEEDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSelectSpeed(option.value)}
                    className={cn(
                      "press-ghost-fit flex-1 rounded-full py-1 text-center transition-colors",
                      speed === option.value
                        ? "bg-surface text-foreground font-medium shadow-sm"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
