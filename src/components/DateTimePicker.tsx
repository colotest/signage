"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { MonthCalendar } from "./MonthCalendar";

const pad = (n: number) => String(n).padStart(2, "0");

// Modelled on iOS's inline date picker: a month grid with past days greyed
// out, then a time pill that opens hour/minute wheels. Used on every
// platform, Apple's included — the native iOS picker ignores `min`, so it
// can't grey out past dates, and one picker everywhere behaves the same.
// Every button in here opts out of the app-wide press glow (no-press, see
// globals.css) — across a whole grid of dates and wheel rows it was more
// distracting than helpful.
export function DateTimePicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const [timeOpen, setTimeOpen] = useState(false);

  function pickDay(day: Date) {
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes()));
  }

  function setTime(hours: number, minutes: number) {
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  }

  return (
    <div className="select-none">
      <MonthCalendar value={value} onSelect={pickDay} />

      <div className="mt-3 flex items-center justify-between border-t border-border px-1 pt-3">
        <span className="text-[17px]">Time</span>
        <button
          type="button"
          onClick={() => setTimeOpen((o) => !o)}
          aria-expanded={timeOpen}
          className={cn(
            "no-press rounded-[8px] px-3 py-1.5 text-[17px] tabular-nums transition-colors",
            timeOpen ? "bg-black/[.05] text-accent dark:bg-white/[.08]" : "bg-black/[.05] text-foreground dark:bg-white/[.08]",
          )}
        >
          {pad(value.getHours())}:{pad(value.getMinutes())}
        </button>
      </div>

      {timeOpen && (
        <div className="menu-pop relative mt-3 flex justify-center gap-2 origin-top">
          {/* The selection band both wheels' centre rows line up on. */}
          <div className="pointer-events-none absolute inset-x-4 top-1/2 h-8 -translate-y-1/2 rounded-[8px] bg-black/[.05] dark:bg-white/[.08]" />
          <Wheel count={24} value={value.getHours()} onChange={(h) => setTime(h, value.getMinutes())} label="Hour" />
          <span className="relative self-center text-[20px]">:</span>
          <Wheel count={60} value={value.getMinutes()} onChange={(m) => setTime(value.getHours(), m)} label="Minute" />
        </div>
      )}
    </div>
  );
}

const ITEM_HEIGHT = 32;
const VISIBLE_ROWS = 5;
const WHEEL_PADDING = ((VISIBLE_ROWS - 1) / 2) * ITEM_HEIGHT;

// An iOS-style scroll wheel of 0…count-1: scroll-snap lands a row on the
// centre band, and whatever's settled there once scrolling stops is the
// value. Clicking a row scrolls it there too.
function Wheel({
  count,
  value,
  onChange,
  label,
}: {
  count: number;
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [centered, setCentered] = useState(value);

  // Starts on the current value without animating there.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ITEM_HEIGHT;
    // Only on mount — afterwards the wheel itself is the source of changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(settleRef.current), []);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const index = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));
    setCentered(index);
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      if (index !== value) onChange(index);
    }, 120);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={handleScroll}
      className="no-scrollbar relative w-16 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{
        height: ITEM_HEIGHT * VISIBLE_ROWS,
        paddingBlock: WHEEL_PADDING,
        maskImage: "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="option"
          aria-selected={i === value}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM_HEIGHT, behavior: "smooth" })}
          className={cn(
            "no-press block w-full snap-center text-center text-[20px] tabular-nums transition-colors",
            i === centered ? "text-foreground" : "text-muted",
          )}
          style={{ height: ITEM_HEIGHT, lineHeight: `${ITEM_HEIGHT}px` }}
        >
          {pad(i)}
        </button>
      ))}
    </div>
  );
}
