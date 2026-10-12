"use client";

import { useRef } from "react";
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  function close() {
    onChange("");
    onOpenChange(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="Search files"
        aria-label="Search files"
        className={cn(
          "press-ghost-fit flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]",
          className,
        )}
      >
        <MagnifierIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-black/[.05] px-3 dark:bg-white/[.08]",
        className,
      )}
    >
      <MagnifierIcon className="h-4 w-4 shrink-0 text-muted" />
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
        className="press-ghost-fit -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-muted hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
