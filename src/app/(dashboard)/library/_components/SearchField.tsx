"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

function MagnifierIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

// A magnifying glass that turns into the search bar itself when pressed,
// rather than a bar sitting there taking up the row. Open, it takes all the
// width its row will give it (the row's other controls make way — on a
// phone Upload steps out entirely), so what you're typing is readable even
// on the narrowest screen.
//
// Controlled: the row above needs to know whether it's open to lay itself
// out, and the list beside it needs the query.
export function SearchField({
  open,
  onOpenChange,
  value,
  onChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The width this field had before the last open/close — what it stretches
  // from. Measured after every flip, so it's always the state just left.
  const widthRef = useRef<number | null>(null);

  // The button doesn't hand over to a separate bar: the same pill stretches
  // out to the width the row gives it, and squeezes back into a button. It
  // can't be a CSS transition — open, the width is whatever flex decides,
  // which has no number to transition from — so both ends are measured and
  // the stretch animated between them.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const from = widthRef.current;
    const to = field.getBoundingClientRect().width;
    widthRef.current = to;
    if (from === null || Math.abs(to - from) < 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Open, the pill is a flex item that takes what's left of the row, and
    // a flex basis beats any width set on it — so the stretch out is held
    // back by max-width instead, which flex does respect. Closed it's a
    // plain 36px button again, and width works.
    field.animate(
      open
        ? [{ maxWidth: `${from}px` }, { maxWidth: `${to}px` }]
        : [{ width: `${from}px` }, { width: `${to}px` }],
      open
        ? { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
        : { duration: 280, easing: "cubic-bezier(0.4, 0, 1, 1)" },
    );
    if (open) {
      // The text follows the pill out rather than being there from the
      // first frame, when there's no room for it yet.
      inputRef.current?.animate(
        [
          { opacity: 0, transform: "translateX(-6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 220, delay: 110, easing: "ease-out", fill: "backwards" },
      );
    }
  }, [open]);

  function close() {
    onChange("");
    onOpenChange(false);
  }

  return (
    <div
      ref={fieldRef}
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
            ref={(node) => {
              inputRef.current = node;
              node?.focus();
            }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
          onClick={() => onOpenChange(true)}
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
