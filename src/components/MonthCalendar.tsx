"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

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

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// A local-date key ("2026-09-29"), for marking days without time or zone
// getting in the way.
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// iOS/macOS-style month grid — weekday columns, week rows, past days greyed
// out and unselectable, today in the accent colour, the selected day in a
// tinted circle. Shared by the date/time picker and the Playback Menu's
// Calendar. `markedDays` (dayKey()s) get a small dot under the date, which
// the Calendar uses for days with something scheduled. Every button opts
// out of the app-wide press glow (no-press) — across a whole grid of dates
// it was more distracting than helpful.
export function MonthCalendar({
  value,
  onSelect,
  markedDays,
}: {
  value: Date;
  onSelect: (day: Date) => void;
  markedDays?: Set<string>;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
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
            className="no-press rounded-full p-1.5 disabled:opacity-30"
          >
            <Chevron className="h-5 w-5 rotate-180" />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="no-press rounded-full p-1.5">
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
          const isMarked = markedDays?.has(dayKey(day)) ?? false;
          return (
            <button
              key={day.getDate()}
              type="button"
              disabled={isPast}
              onClick={() => onSelect(day)}
              className="no-press relative flex h-10 items-center justify-center disabled:cursor-default"
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
              {isMarked && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                    isSelected && isToday ? "bg-accent-contrast" : "bg-accent",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
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
