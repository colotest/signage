"use client";

import { startTransition, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

function MagnifierIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

const OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";

// A magnifying glass that turns into the search bar itself when pressed,
// rather than a bar sitting there taking up the row. It sits at the left of
// its row, right after the title, and opens rightwards into the row's spare
// width; the row's other controls stay where they are, against the right
// edge. On a phone there's no spare width to speak of, so Upload dissolves
// where it stands (blurred and faded, as iOS does it) and the bar grows on
// over its place — see .search-row in globals.css.
//
// Open/closed and what's typed are this field's own state, not its row's:
// the row it sits in is the whole Library (or the whole Playback Menu), and
// re-rendering that, file tree and all, before anything could move was what
// kept the button from opening the moment it was pressed. Its row learns it's
// open from data-search-open on this field instead, through CSS, and the
// query goes up as a transition — the list filters as soon as it can, but
// never ahead of the keystroke showing up in the field.
export function SearchField({
  onQueryChange,
  className,
}: {
  onQueryChange: (query: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Still shrinking back into a button: on a phone, Upload stays out of the
  // row's flow until it has (globals.css), or the bar would shove it along.
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const fieldRef = useRef<HTMLDivElement | null>(null);
  // The width this field had before the last open/close — what it stretches
  // from. Measured after every flip, so it's always the state just left.
  const widthRef = useRef<number | null>(null);

  // The button doesn't hand over to a separate bar: the same pill stretches
  // out to the width the row gives it, and squeezes back into a button. It
  // can't be a CSS transition — open, the width is whatever flex decides,
  // which has no number to transition from — so both ends are measured and
  // the stretch animated between them. The input is there, focused, from the
  // first frame; the pill's own clipping is what reveals it.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const from = widthRef.current;
    const to = field.getBoundingClientRect().width;
    widthRef.current = to;
    if (from === null || Math.abs(to - from) < 1 || !prefersMotion()) return;

    // Open, the pill is a flex item that takes what's left of the row, and
    // a flex basis beats any width set on it — so the stretch out is held
    // back by max-width instead, which flex does respect (the row's other
    // controls keep their place meanwhile: the slack goes to their auto
    // margin). Closed it's a plain 36px button again, and width works.
    const stretch = field.animate(
      open
        ? [{ maxWidth: `${from}px` }, { maxWidth: `${to}px` }]
        : [{ width: `${from}px` }, { width: `${to}px` }],
      // 280ms closing: Upload's return on a phone is timed to end with it
      // (.search-yields in globals.css).
      open ? { duration: 420, easing: OPEN_EASE } : { duration: 280, easing: CLOSE_EASE },
    );
    // Pressed again mid-way, the new stretch takes over from a clean slate.
    if (open) return () => stretch.cancel();
    stretch.finished.then(
      () => setClosing(false),
      () => {},
    );
    return () => stretch.cancel();
  }, [open]);

  function show() {
    setClosing(false);
    setOpen(true);
  }

  function close() {
    setQuery("");
    startTransition(() => onQueryChange(""));
    setClosing(prefersMotion());
    setOpen(false);
  }

  return (
    <div
      ref={fieldRef}
      data-search-open={open ? "" : undefined}
      data-search-closing={closing ? "" : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center overflow-hidden rounded-full bg-black/[.05] text-muted dark:bg-white/[.08]",
        open
          ? "min-w-0 flex-1 gap-2 px-3 backdrop-blur-xl"
          : "w-9 justify-center transition-colors hover:bg-black/[.08] hover:text-foreground dark:hover:bg-white/[.12]",
        className,
      )}
    >
      {open ? (
        <>
          <MagnifierIcon className="h-4 w-4 shrink-0" />
          <input
            ref={(node) => node?.focus({ preventScroll: true })}
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              startTransition(() => onQueryChange(next));
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            placeholder="Search files"
            aria-label="Search files"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={close}
            title="Close search"
            aria-label="Close search"
            className="press-ghost-fit pop-in origin-right -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-muted hover:text-foreground"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={show}
          title="Search files"
          aria-label="Search files"
          className="press-ghost-fit flex h-full w-full items-center justify-center rounded-full"
        >
          <MagnifierIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
