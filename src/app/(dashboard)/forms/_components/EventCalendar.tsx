"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { EdgeBand } from "@/components/EdgeBand";
import { sameDay, weekStartsOn } from "@/components/MonthCalendar";
import { updateEvent } from "@/lib/actions/events";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { DateRange, effectiveEnd, effectiveStart, nextFullHour, type DateValue } from "./EventDates";
import { useIsClient } from "./eventFormat";

// One week row: the day circle and, under it, room for a time.
const ROW = 52;
const CIRCLE = 34;
// How much of the weeks either side shows, under the blurred edges. The
// top one is deeper, to hold the month's name.
const PEEK_TOP = 36;
const PEEK_BOTTOM = 22;

const pad = (n: number) => String(n).padStart(2, "0");

// "18h", or "18:30" — minutes only when it isn't on the hour, and an "h"
// on a whole hour so the number reads as a time. An end at midnight is
// "24h", the end of its evening, not "0h" of the next day.
function formatTime(d: Date, isEnd = false) {
  if (d.getMinutes() !== 0) return `${d.getHours()}:${pad(d.getMinutes())}`;
  return isEnd && d.getHours() === 0 ? "24h" : `${d.getHours()}h`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function monthLabel(from: Date, to: Date) {
  const month = (d: Date) => d.toLocaleString("en-GB", { month: "long" });
  if (from.getFullYear() !== to.getFullYear()) {
    return `${month(from)} ${from.getFullYear()} – ${month(to)} ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) return `${month(from)} – ${month(to)} ${to.getFullYear()}`;
  return `${month(from)} ${from.getFullYear()}`;
}

// The event's own dates, as stored, turned into what the editor works on.
// A blank time still needs hours behind it, for when one's added: the next
// full hour for the start, a few hours on for the end.
function toDateValue(event: EventSummary): DateValue {
  const fallbackStart = nextFullHour();
  const startsAt = event.startsAt ? new Date(event.startsAt) : null;
  if (startsAt && !event.startsTimeSet) startsAt.setHours(fallbackStart.getHours(), 0, 0, 0);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  if (endsAt && !event.endsTimeSet) endsAt.setHours(Math.min(23, (startsAt ?? fallbackStart).getHours() + 4), 0, 0, 0);
  return { startsAt, endsAt, startsTimeSet: event.startsTimeSet, endsTimeSet: event.endsTimeSet };
}

// An event's page's dates: a slit onto an iOS-style month, showing just the
// week rows the event covers (a little of the weeks either side fading out
// under blurred edges, the month's name over the top one), its days picked
// out, with their times under the first and last. A one-day event is just
// its day, beside the month's name, with its times at the far right.
// Pressing it opens the Starts / Ends editor underneath; every change is
// saved as it's made, and the view above follows along.
export function EventDatesSection({ event }: { event: EventSummary }) {
  const router = useRouter();
  const isClient = useIsClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DateValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Saves go one after another, so quick changes land in order.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const value = editing && draft ? draft : toDateValue(event);

  function toggle() {
    if (editing) {
      setEditing(false);
      setDraft(null);
    } else {
      setDraft(toDateValue(event));
      setEditing(true);
    }
    setError(null);
  }

  function change(next: DateValue) {
    setDraft(next);
    setError(null);
    const patch = {
      startsAt: next.startsAt ? effectiveStart(next.startsAt, next.startsTimeSet).toISOString() : null,
      endsAt: next.endsAt ? effectiveEnd(next.endsAt, next.endsTimeSet).toISOString() : null,
      startsTimeSet: next.startsTimeSet,
      endsTimeSet: next.endsTimeSet,
    };
    const save = queueRef.current.then(() => updateEvent(event.id, patch));
    queueRef.current = save.catch(() => {});
    save.then(
      () => router.refresh(),
      (err) => setError(err instanceof Error ? err.message : "Couldn't save the dates"),
    );
  }

  return (
    <div>
      {/* Local dates, so only drawn in the browser (the server's in UTC);
          the space is held meanwhile. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={editing}
        aria-label={editing ? "Done editing dates" : "Edit dates"}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="cursor-pointer select-none rounded-[var(--radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {!isClient ? (
          <div style={{ height: CIRCLE }} />
        ) : value.startsAt ? (
          <CalendarSlit value={value} />
        ) : (
          <div className="flex items-center gap-2 px-1 py-1.5 text-[15px] text-accent">
            <CalendarIcon className="h-[18px] w-[18px]" />
            Add a date
          </div>
        )}
      </div>

      {editing && (
        <div className="menu-pop mt-3 origin-top">
          <DateRange value={value} onChange={change} />
          {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function CalendarSlit({ value }: { value: DateValue }) {
  const start = value.startsAt!;
  const startTime = value.startsTimeSet ? formatTime(start) : null;
  const endTime = value.endsAt && value.endsTimeSet ? formatTime(value.endsAt, true) : null;
  // Ending at midnight is ending on the day before, at 24h.
  let end = value.endsAt;
  if (end && value.endsTimeSet && end.getHours() === 0 && end.getMinutes() === 0) {
    const dayBefore = addDays(end, -1);
    if (dayBefore >= startOfDay(start)) end = dayBefore;
  }

  if (!end || sameDay(start, end)) {
    return (
      <div className="flex items-center gap-3 px-1">
        <span className="text-[17px] font-semibold">{monthLabel(start, start)}</span>
        <DayCircle day={start} kind="edge" />
        {(startTime || endTime) && (
          <span className="ml-auto text-[15px] tabular-nums text-muted">
            {[startTime, endTime].filter(Boolean).join(" – ")}
          </span>
        )}
      </div>
    );
  }

  return <WeekSlit start={start} end={end} startTime={startTime} endTime={endTime} />;
}

function WeekSlit({
  start,
  end,
  startTime,
  endTime,
}: {
  start: Date;
  end: Date;
  startTime: string | null;
  endTime: string | null;
}) {
  const firstDay = useMemo(() => weekStartsOn(), []);
  const first = startOfDay(start);
  const last = startOfDay(end);

  // The event's weeks, and one either side to fade out under the edges.
  const weeks = useMemo(() => {
    const weekOf = (d: Date) => addDays(d, -((d.getDay() - firstDay + 7) % 7));
    const rows: Date[][] = [];
    for (let w = addDays(weekOf(first), -7); w <= addDays(weekOf(last), 7); w = addDays(w, 7)) {
      rows.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    }
    return rows;
  }, [first.getTime(), last.getTime(), firstDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const height = (weeks.length - 2) * ROW + PEEK_TOP + PEEK_BOTTOM;

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <div className="absolute inset-x-0" style={{ top: PEEK_TOP - ROW }}>
        {weeks.map((week) => (
          <div key={week[0].getTime()} className="grid grid-cols-7" style={{ height: ROW }}>
            {week.map((day) => {
              const inRange = day >= first && day <= last;
              const isFirst = sameDay(day, first);
              const isLast = sameDay(day, last);
              return (
                <div key={day.getTime()} className="relative flex flex-col items-center">
                  {/* The band joining the event's days, behind their circles;
                      it starts and stops at the first and last circles' middles. */}
                  {inRange && (
                    <span
                      aria-hidden
                      className="absolute bg-accent/12"
                      style={{
                        top: 2,
                        height: CIRCLE,
                        left: isFirst ? "50%" : 0,
                        right: isLast ? "50%" : 0,
                      }}
                    />
                  )}
                  <span className="relative mt-[2px]">
                    <DayCircle day={day} kind={isFirst || isLast ? "edge" : inRange ? "inside" : "outside"} />
                  </span>
                  {((isFirst && startTime) || (isLast && endTime)) && (
                    <span className="relative mt-0.5 text-[10px] font-medium leading-none tabular-nums text-muted">
                      {isFirst ? startTime : endTime}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <EdgeBand side="top" depth={`${PEEK_TOP}px`} blur="6px" />
      <EdgeBand side="bottom" depth={`${PEEK_BOTTOM}px`} blur="6px" />
      {/* On the top edge's blur, like a heading over the month. */}
      <span className="absolute left-1 top-1 z-10 text-[17px] font-semibold">{monthLabel(first, last)}</span>
    </div>
  );
}

function DayCircle({ day, kind }: { day: Date; kind: "edge" | "inside" | "outside" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[16px] tabular-nums",
        kind === "edge" && "bg-accent font-semibold text-accent-contrast",
        kind === "inside" && "font-medium text-accent",
        kind === "outside" && "text-foreground",
      )}
      style={{ height: CIRCLE, width: CIRCLE }}
    >
      {day.getDate()}
    </span>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
