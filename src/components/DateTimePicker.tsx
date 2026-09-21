"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// Apple's own date/time picker is what we want wherever it exists: every
// iOS/iPadOS browser (all WebKit underneath, so a datetime-local input
// opens the system picker) and Safari on macOS. Everywhere else a native
// datetime-local looks nothing like it, so EmulatedPicker below stands in —
// modelled on iOS's inline picker: a month grid, then a time pill that
// opens hour/minute wheels.
function hasApplePicker() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isMacSafari =
    /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
  return isIOS || isMacSafari;
}

export function DateTimePicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  // Only ever rendered inside a popup opened by a click, never during SSR,
  // so reading navigator up front can't cause a hydration mismatch.
  const [native] = useState(hasApplePicker);
  return native ? <NativePicker value={value} onChange={onChange} /> : <EmulatedPicker value={value} onChange={onChange} />;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function NativePicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  return (
    <input
      type="datetime-local"
      value={toLocalInputValue(value)}
      min={toLocalInputValue(new Date())}
      onChange={(e) => {
        // A datetime-local string with no zone parses as local time.
        const next = new Date(e.target.value);
        if (!Number.isNaN(next.getTime())) onChange(next);
      }}
      className="w-full rounded-[var(--radius-md)] bg-black/[.05] px-3 py-2.5 text-[17px] text-foreground outline-none dark:bg-white/[.08]"
    />
  );
}

// --- Emulated (non-Apple) ----------------------------------------------------

function weekStartsOn(): number {
  // 0 = Sunday … 6 = Saturday. Intl's weekInfo reports Sunday as 7.
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
    if (firstDay) return firstDay % 7;
  } catch {}
  return 1;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function EmulatedPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const [viewMonth, setViewMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const [timeOpen, setTimeOpen] = useState(false);
  const firstDay = useMemo(() => weekStartsOn(), []);
  const today = useMemo(() => new Date(), []);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((firstDay + i) % 7))).toUpperCase());
  }, [firstDay]);

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const leading = (viewMonth.getDay() - firstDay + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
  }, [viewMonth, firstDay]);

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(viewMonth);
  const canGoBack = viewMonth > new Date(today.getFullYear(), today.getMonth(), 1);

  function shiftMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

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
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[17px] font-semibold">{monthLabel}</span>
        <div className="flex items-center gap-1 text-accent">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={!canGoBack}
            aria-label="Previous month"
            className="press-ghost rounded-full p-1.5 disabled:opacity-30"
          >
            <Chevron className="h-5 w-5 rotate-180" />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="press-ghost rounded-full p-1.5">
            <Chevron className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {weekdays.map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-semibold text-muted">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const isPast = day < startOfToday;
          const isSelected = sameDay(day, value);
          const isToday = sameDay(day, today);
          return (
            <button
              key={day.getDate()}
              type="button"
              disabled={isPast}
              onClick={() => pickDay(day)}
              className="flex h-10 items-center justify-center disabled:cursor-default"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[17px] tabular-nums transition-colors",
                  isPast && "text-muted opacity-50",
                  !isPast && !isSelected && (isToday ? "text-accent" : "text-foreground"),
                  isSelected && (isToday ? "bg-accent font-semibold text-accent-contrast" : "bg-accent/15 font-semibold text-accent"),
                )}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border px-1 pt-3">
        <span className="text-[17px]">Time</span>
        <button
          type="button"
          onClick={() => setTimeOpen((o) => !o)}
          aria-expanded={timeOpen}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-[17px] tabular-nums transition-colors",
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
            "block w-full snap-center text-center text-[20px] tabular-nums transition-colors",
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

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
