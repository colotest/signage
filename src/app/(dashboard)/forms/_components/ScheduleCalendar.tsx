"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { EdgeBand } from "@/components/EdgeBand";
import { sameDay, weekStartsOn } from "@/components/MonthCalendar";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { eventTitle, useIsClient } from "./eventFormat";

// One week row: the day's number, then room for two events' bars and a
// "+n" for any more.
const ROW = 78;
const DAY_NUMBER = 28;
const LANE = 18;
const LANES = 2;
const WINDOW_WEEKS = 3;
// How far the weeks run past today and past the first and last events.
const RANGE_WEEKS = 26;
const DAY_MS = 86_400_000;
// A touch has to go this far sideways (and more sideways than up or down)
// before it scrubs rather than scrolls.
const SCRUB_SLOP = 8;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

const monthName = (month: number) => new Date(2026, month, 1).toLocaleString("en-GB", { month: "long" });

// The days an event covers: from its start's day to its end's — ending at
// midnight is ending on the day before — or just the one day.
type Span = { event: EventSummary; start: Date; end: Date };

function spanOf(event: EventSummary): Span | null {
  if (!event.startsAt) return null;
  const start = startOfDay(new Date(event.startsAt));
  let end = start;
  if (event.endsAt) {
    const at = new Date(event.endsAt);
    end = startOfDay(at);
    if (event.endsTimeSet && at.getHours() === 0 && at.getMinutes() === 0 && addDays(end, -1) >= start) {
      end = addDays(end, -1);
    }
  }
  return { event, start, end };
}

// One week's slice of an event's bar, and the lane it runs in.
type Segment = { span: Span; col: number; length: number; lane: number; fromBefore: boolean; onAfter: boolean };

function weekSegments(week: Date, spans: Span[]) {
  const last = addDays(week, 6);
  const inWeek = spans
    .filter((s) => s.start <= last && s.end >= week)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  // Each into the first lane that's free from its first day on.
  const laneEnds: number[] = [];
  return inWeek.map((span): Segment => {
    const from = span.start < week ? week : span.start;
    const to = span.end > last ? last : span.end;
    const col = daysBetween(week, from);
    const length = daysBetween(from, to) + 1;
    let lane = laneEnds.findIndex((end) => end < col);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = col + length - 1;
    return { span, col, length, lane, fromBefore: span.start < week, onAfter: span.end > last };
  });
}

// The Events list's calendar: every event with a date, as bars across its
// days, in the event pages' calendar style — a window of three weeks that
// scrolls on through the months (the month's name following along), with
// today in the accent colour.
//
// Scrubbing through it previews an event on the venue map: with a mouse,
// whichever day the pointer is over; on a touchscreen, dragging sideways
// along the weeks (up and down still scrolls them), the last day touched
// staying previewed until a tap on an empty stretch. A day with an event
// shows that event — the one already showing, if it's among them — and a
// day without, nothing. Tapping a bar opens its event, as its list entry
// does.
//
// On an iPad or a desktop it stays at the top of the list while the events
// scroll under it; on a phone, where the list is short of room, it scrolls
// away with them.
export function ScheduleCalendar({
  events,
  previewId,
  onPreview,
  onOpen,
}: {
  events: EventSummary[];
  previewId: string | null;
  onPreview: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const isClient = useIsClient();
  if (!isClient) {
    // Local dates, so only drawn in the browser (the server's in UTC); the
    // space is held meanwhile.
    return <div style={{ height: 34 + 20 + WINDOW_WEEKS * ROW + 12 }} />;
  }
  return <ScheduleGrid events={events} previewId={previewId} onPreview={onPreview} onOpen={onOpen} />;
}

function ScheduleGrid({
  events,
  previewId,
  onPreview,
  onOpen,
}: {
  events: EventSummary[];
  previewId: string | null;
  onPreview: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const firstDay = useMemo(() => weekStartsOn(), []);
  const weekOf = (d: Date) => addDays(d, -((d.getDay() - firstDay + 7) % 7));
  const today = useMemo(() => startOfDay(new Date()), []);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const spans = useMemo(() => events.map(spanOf).filter((s): s is Span => s !== null), [events]);

  // The weeks: from half a year before today (or the first event) to half a
  // year after today (or the last).
  const thisWeek = weekOf(today);
  const firstEvent = spans.reduce<Date | null>((min, s) => (!min || s.start < min ? s.start : min), null);
  const lastEvent = spans.reduce<Date | null>((max, s) => (!max || s.end > max ? s.end : max), null);
  const fromBase = addDays(thisWeek, -7 * RANGE_WEEKS);
  const toBase = addDays(thisWeek, 7 * RANGE_WEEKS);
  const from = firstEvent && weekOf(firstEvent) < fromBase ? addDays(weekOf(firstEvent), -7 * 4) : fromBase;
  const to = lastEvent && weekOf(lastEvent) > toBase ? addDays(weekOf(lastEvent), 7 * 4) : toBase;
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const weeks = useMemo(() => {
    const list: Date[] = [];
    for (let w = new Date(fromTime); w.getTime() <= toTime; w = addDays(w, 7)) list.push(w);
    return list;
  }, [fromTime, toTime]);
  const rowOf = (week: Date) => Math.round(daysBetween(from, week) / 7);

  // Opens with this week in the middle of the window.
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = (rowOf(thisWeek) - (WINDOW_WEEKS - 1) / 2) * ROW;
    // Only on first showing — after that, it's wherever it's been scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The month's name follows the middle week.
  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const row = Math.min(weeks.length - 1, Math.max(0, Math.round(el.scrollTop / ROW + (WINDOW_WEEKS - 1) / 2)));
    const middle = addDays(weeks[row], 3);
    if (middle.getMonth() !== month.getMonth() || middle.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(middle.getFullYear(), middle.getMonth(), 1));
    }
  }

  // --- scrubbing ------------------------------------------------------------

  const [scrubDay, setScrubDay] = useState<Date | null>(null);
  const touchRef = useRef<{ id: number; x: number; y: number; scrubbing: boolean } | null>(null);
  // A drag that scrubbed ends in a click on whatever's under it — which
  // shouldn't open that event.
  const justScrubbed = useRef(false);

  function dayAt(clientX: number, clientY: number) {
    const el = scrollerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const row = Math.floor((clientY - rect.top + el.scrollTop) / ROW);
    const col = Math.floor(((clientX - rect.left) / rect.width) * 7);
    if (row < 0 || row >= weeks.length || col < 0 || col > 6) return null;
    return addDays(weeks[row], col);
  }

  function preview(day: Date | null) {
    setScrubDay(day);
    if (!day) {
      onPreview(null);
      return;
    }
    const on = spans.filter((s) => s.start <= day && s.end >= day).sort((a, b) => a.start.getTime() - b.start.getTime());
    onPreview(on.find((s) => s.event.id === previewId)?.event.id ?? on[0]?.event.id ?? null);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") {
      const day = dayAt(e.clientX, e.clientY);
      if (!day || !scrubDay || !sameDay(day, scrubDay)) preview(day);
      return;
    }
    const touch = touchRef.current;
    if (!touch || touch.id !== e.pointerId) return;
    if (!touch.scrubbing) {
      const dx = Math.abs(e.clientX - touch.x);
      const dy = Math.abs(e.clientY - touch.y);
      if (dy > SCRUB_SLOP && dy >= dx) {
        // Going up or down: that's a scroll, left to the window.
        touchRef.current = null;
        return;
      }
      if (dx < SCRUB_SLOP) return;
      touch.scrubbing = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const day = dayAt(e.clientX, e.clientY);
    if (day && (!scrubDay || !sameDay(day, scrubDay))) preview(day);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    touchRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scrubbing: false };
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const touch = touchRef.current;
    touchRef.current = null;
    if (touch?.scrubbing && touch.id === e.pointerId) {
      justScrubbed.current = true;
      setTimeout(() => (justScrubbed.current = false), 0);
    }
  }

  // --- drawing ----------------------------------------------------------------

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((firstDay + i) % 7))).toUpperCase());
  }, [firstDay]);

  return (
    // md:sticky — see above. Its background (edge to edge, over the list's
    // own padding) hides the cards passing under it, and a blurred fade
    // below eases them in and out.
    <div className="relative z-10 -mx-4 mb-4 bg-background px-4 md:sticky md:top-0 md:-mx-5 md:px-5 md:pt-1">
      <div className="flex items-center px-1" style={{ height: 34 }}>
        <span className="text-[17px] font-semibold">
          {monthName(month.getMonth())} {month.getFullYear()}
        </span>
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted" style={{ height: 20 }}>
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") preview(null);
        }}
        className="no-scrollbar relative snap-y snap-mandatory overflow-y-auto overscroll-contain"
        style={{
          height: WINDOW_WEEKS * ROW,
          // Up and down scrolls; sideways is ours, to scrub.
          touchAction: "pan-y",
          maskImage: "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)",
        }}
      >
        {weeks.map((week) => {
          const segments = weekSegments(week, spans);
          const hidden = Array.from({ length: 7 }, (_, col) =>
            segments.filter((s) => s.lane >= LANES && s.col <= col && s.col + s.length > col).length,
          );
          return (
            <div
              key={week.getTime()}
              className="relative grid snap-start grid-cols-7"
              style={{ height: ROW }}
              // A tap on an empty stretch (not a bar) lets go of a preview.
              onClick={() => {
                if (!justScrubbed.current) preview(null);
              }}
            >
              {Array.from({ length: 7 }, (_, col) => {
                const day = addDays(week, col);
                const isToday = sameDay(day, today);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const scrubbed = !!scrubDay && sameDay(day, scrubDay);
                return (
                  <div key={col} className={cn("relative flex flex-col items-center rounded-[10px]", scrubbed && "bg-foreground/[.07]")}>
                    <span
                      className={cn(
                        "mt-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[14px] tabular-nums",
                        isToday
                          ? "bg-accent font-semibold text-accent-contrast"
                          : day.getMonth() !== month.getMonth()
                            ? "text-muted/60"
                            : "text-foreground",
                        weekend && !isToday && "font-semibold",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {hidden[col] > 0 && (
                      <span
                        className="absolute text-[10px] font-semibold leading-none text-muted"
                        style={{ top: DAY_NUMBER + LANES * LANE + 2 }}
                      >
                        +{hidden[col]}
                      </span>
                    )}
                  </div>
                );
              })}

              {segments
                .filter((s) => s.lane < LANES)
                .map((s) => {
                  const shown = s.span.event.id === previewId;
                  return (
                    <button
                      key={s.span.event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justScrubbed.current) return;
                        onOpen(s.span.event.id);
                      }}
                      title={eventTitle(s.span.event)}
                      className={cn(
                        "no-press absolute truncate px-1.5 text-left text-[11px] font-semibold leading-[16px] transition-colors",
                        s.fromBefore ? "rounded-l-none" : "rounded-l-full",
                        s.onAfter ? "rounded-r-none" : "rounded-r-full",
                        shown ? "bg-accent text-accent-contrast" : "bg-accent/24 text-accent hover:bg-accent/35",
                      )}
                      style={{
                        top: DAY_NUMBER + s.lane * LANE,
                        height: 16,
                        left: `calc(${(s.col / 7) * 100}% + ${s.fromBefore ? 0 : 2}px)`,
                        width: `calc(${(s.length / 7) * 100}% - ${(s.fromBefore ? 0 : 2) + (s.onAfter ? 0 : 2)}px)`,
                      }}
                    >
                      {eventTitle(s.span.event)}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* The fade the list's cards pass under, on an iPad or desktop. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full hidden h-6 md:block">
        <EdgeBand side="top" depth="24px" blur="6px" />
      </div>
    </div>
  );
}
