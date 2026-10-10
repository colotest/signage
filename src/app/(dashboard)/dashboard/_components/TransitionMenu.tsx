"use client";

import { useRef, useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { cn } from "@/lib/utils/cn";
import type { ScreenBackground, ScreenSlideDirection, ScreenTransition, ScreenTransitionSpeed } from "@/types/domain";
import { SlidersIcon } from "@/components/icons/SlidersIcon";

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

// Named for where the incoming slide comes from, which is how it reads on
// screen — "Right" pushes in from the right edge.
const DIRECTIONS: { value: ScreenSlideDirection; label: string }[] = [
  { value: "right", label: "From the right" },
  { value: "left", label: "From the left" },
  { value: "top", label: "From the top" },
  { value: "bottom", label: "From the bottom" },
];

// What shows around media that doesn't fill the screen — letterbox bars,
// the clock page's face, the QR placeholder.
const BACKGROUNDS: { value: ScreenBackground; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
];

// The Playback Menu's "⋯" — playback settings for the screen itself rather
// than its content. Same popup mechanics as the Library's sort menus: click
// outside or press Escape to close.
export function TransitionMenu({
  transition,
  onSelect,
  speed,
  onSelectSpeed,
  slideDirection,
  onSelectSlideDirection,
  background,
  onSelectBackground,
}: {
  transition: ScreenTransition;
  onSelect: (transition: ScreenTransition) => void;
  speed: ScreenTransitionSpeed;
  onSelectSpeed: (speed: ScreenTransitionSpeed) => void;
  slideDirection: ScreenSlideDirection;
  onSelectSlideDirection: (direction: ScreenSlideDirection) => void;
  background: ScreenBackground;
  onSelectBackground: (background: ScreenBackground) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);


  const active = OPTIONS.find((o) => o.value === transition) ?? OPTIONS[0];

  return (
    // Hangs right from the button's left edge, nudged back inside the popup
    // when that would run off a phone's screen (see Menu).
    <div className="shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Playback settings"
        aria-label="Playback settings"
        aria-expanded={open}
        className="press-ghost-fit flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted shadow-[var(--shadow-control)] transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <SlidersIcon className="h-[21px] w-[21px]" />
      </button>

      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="start"
        dragSelect={false}
        role="dialog"
        aria-label="Playback settings"
        className="w-64 p-3"
      >
        <p className="mb-1.5 text-[11px] text-muted">Background</p>
        <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 shadow-[var(--shadow-well)] text-[12px]">
          {BACKGROUNDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelectBackground(option.value)}
              className={cn(
                "press-ghost-fit flex-1 rounded-full py-1 text-center transition-colors",
                background === option.value
                  ? "bg-surface text-foreground font-medium shadow-[var(--shadow-control)]"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mb-1.5 mt-3 border-t border-border pt-3 text-[11px] text-muted">Transition</p>
        <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 shadow-[var(--shadow-well)] text-[12px]">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                "press-ghost-fit flex-1 rounded-full py-1 text-center transition-colors",
                transition === option.value
                  ? "bg-surface text-foreground font-medium shadow-[var(--shadow-control)]"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">{active.hint}</p>

        {/* Only a slide has an edge to come in from. */}
        {transition === "slide" && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] text-muted">Direction</p>
            <div className="relative">
              <select
                value={slideDirection}
                onChange={(e) => onSelectSlideDirection(e.target.value as ScreenSlideDirection)}
                aria-label="Slide direction"
                className="w-full appearance-none rounded-[var(--radius-sm)] border border-border bg-transparent py-1.5 pl-2.5 pr-7 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-accent"
              >
                {DIRECTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}

        {/* Nothing to time when there's no animation to run. */}
        {transition !== "cut" && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] text-muted">Speed</p>
            <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 shadow-[var(--shadow-well)] text-[12px]">
              {SPEEDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelectSpeed(option.value)}
                  className={cn(
                    "press-ghost-fit flex-1 rounded-full py-1 text-center transition-colors",
                    speed === option.value
                      ? "bg-surface text-foreground font-medium shadow-[var(--shadow-control)]"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Menu>
    </div>
  );
}
