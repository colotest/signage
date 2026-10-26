"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { EdgeBand } from "@/components/EdgeBand";
import { sameDay, weekStartsOn } from "@/components/MonthCalendar";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { eventTitle, formatEventRange, useIsClient } from "./eventFormat";

// A week row: the day's circle, sized and set as on the event pages'
// calendar (see EventCalendar), then — clear of the circle's edge — a lane
// for each event bar that runs through the week at once: as many as it
// needs, and none for a week without any.
const CIRCLE = 34;
const CIRCLE_TOP = 2;
const DAY_NUMBER = CIRCLE_TOP + CIRCLE + 3;
const LANE = 18;
const ROW_PAD = 6;
const WINDOW_WEEKS = 3;
// A week without events as tall as one on the event pages' calendar.
const EMPTY_ROW = 52;
const rowHeight = (lanes: number) => Math.max(EMPTY_ROW, DAY_NUMBER + lanes * LANE + ROW_PAD);
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
// scrolls on through the months (the month's name following along; "Now"
// beside it scrolls back to this week), with today circled in the accent
// colour. Each week is only as tall as the bars running through it need,
// and the window eases to fit the three in view.
//
// Scrubbing through it previews the day on the venue map: with a mouse,
// whichever day the pointer is over; on a touchscreen, dragging sideways
// along the weeks (up and down still scrolls them), the last day touched
// staying previewed until a tap on an empty stretch. Every event on that
// day shows at once — set up, they never claim the same thing — and a day
// without any, nothing. Hovering a bar lights up its card in the list;
// tapping it opens its event, as the card does.
//
// On an iPad or a desktop it stays at the top of the list while the events
// scroll under it; on a phone, where the list is short of room, it scrolls
// away with them.
export function ScheduleCalendar(props: {
  events: EventSummary[];
  previewIds: string[];
  onPreview: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onHighlight: (id: string | null) => void;
}) {
  const isClient = useIsClient();
  if (!isClient) {
    // Local dates, so only drawn in the browser (the server's in UTC); the
    // space is held meanwhile.
    return <div style={{ height: 34 + 20 + WINDOW_WEEKS * rowHeight(1) }} />;
  }
  return <ScheduleGrid {...props} />;
}

function ScheduleGrid({
  events,
  previewIds,
  onPreview,
  onOpen,
  onHighlight,
}: {
  events: EventSummary[];
  previewIds: string[];
  onPreview: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onHighlight: (id: string | null) => void;
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

  // Each week with its bars, how tall it is, and where it starts.
  const rows = useMemo(() => {
    let top = 0;
    const list: { week: Date; segments: Segment[]; height: number; top: number }[] = [];
    for (let w = new Date(fromTime); w.getTime() <= toTime; w = addDays(w, 7)) {
      const segments = weekSegments(w, spans);
      const lanes = segments.reduce((n, seg) => Math.max(n, seg.lane + 1), 0);
      const height = rowHeight(lanes);
      list.push({ week: w, segments, height, top });
      top += height;
    }
    return list;
  }, [fromTime, toTime, spans]);
  const todayRow = Math.round(daysBetween(from, thisWeek) / 7);

  // The row at a height in the scrolled weeks.
  function rowAt(y: number) {
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rows[mid].top <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // The window: the three weeks from the one at its top, however tall they
  // are; scrolled to put a week in its middle.
  const windowFrom = (top: number) => {
    const first = Math.max(0, Math.min(top, rows.length - WINDOW_WEEKS));
    return rows.slice(first, first + WINDOW_WEEKS).reduce((h, r) => h + r.height, 0);
  };
  const [topRow, setTopRow] = useState(() => Math.max(0, todayRow - 1));
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // "Now": this week back in the middle.
  function backToToday() {
    const first = Math.max(0, todayRow - 1);
    scrollerRef.current?.scrollTo({ top: rows[first].top, behavior: "smooth" });
    setTopRow(first);
  }

  // Opens with this week in the middle of the window (topRow starts there).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = rows[Math.max(0, todayRow - 1)].top;
    // Only on first showing — after that, it's wherever it's been scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The month's name follows the middle week, and the window fits the
  // three weeks it's come to.
  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const top = rowAt(el.scrollTop + 2);
    if (top !== topRow) setTopRow(top);
    const middle = addDays(rows[Math.min(rows.length - 1, top + 1)].week, 3);
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
    const y = clientY - rect.top + el.scrollTop;
    const col = Math.floor(((clientX - rect.left) / rect.width) * 7);
    if (y < 0 || col < 0 || col > 6) return null;
    const row = rows[rowAt(y)];
    if (y >= row.top + row.height) return null;
    return addDays(row.week, col);
  }

  function preview(day: Date | null) {
    setScrubDay(day);
    const on = day
      ? spans.filter((s) => s.start <= day && s.end >= day).sort((a, b) => a.start.getTime() - b.start.getTime())
      : [];
    onPreview(on.map((s) => s.event.id));
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
      <div className="flex items-center gap-2 px-1" style={{ height: 34 }}>
        <span className="text-[17px] font-semibold">
          {monthName(month.getMonth())} {month.getFullYear()}
        </span>
        <button
          type="button"
          onClick={backToToday}
          title="Back to this week"
          className="no-press rounded-full bg-accent/15 px-2.5 py-0.5 text-[13px] font-semibold text-accent hover:bg-accent/25"
        >
          Now
        </button>
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
          height: windowFrom(topRow),
          transition: "height 300ms var(--ease-spring)",
          // Up and down scrolls; sideways is ours, to scrub.
          touchAction: "pan-y",
          maskImage: "linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)",
        }}
      >
        {rows.map(({ week, segments, height }) => (
          <div
            key={week.getTime()}
            className="relative grid snap-start grid-cols-7"
            style={{ height }}
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
                      "flex shrink-0 items-center justify-center rounded-full text-[16px] tabular-nums",
                      isToday
                        ? cn("bg-accent text-accent-contrast", weekend ? "font-bold" : "font-semibold")
                        : cn(day.getMonth() !== month.getMonth() ? "text-muted/60" : "text-foreground", weekend && "font-semibold"),
                    )}
                    style={{ marginTop: CIRCLE_TOP, height: CIRCLE, width: CIRCLE }}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}

            {segments.map((seg) => {
              const id = seg.span.event.id;
              const shown = previewIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justScrubbed.current) return;
                    onOpen(id);
                  }}
                  onMouseEnter={() => onHighlight(id)}
                  onMouseLeave={() => onHighlight(null)}
                  // Its name is on the bar already; the tooltip gives when —
                  // "03/11/2026, 18:00 Tu – 23:00".
                  title={formatEventRange(seg.span.event) ?? eventTitle(seg.span.event)}
                  className={cn(
                    "no-press absolute truncate px-1.5 text-left text-[11px] font-semibold leading-[16px] transition-colors",
                    seg.fromBefore ? "rounded-l-none" : "rounded-l-full",
                    seg.onAfter ? "rounded-r-none" : "rounded-r-full",
                    shown ? "bg-accent text-accent-contrast" : "bg-accent/24 text-accent hover:bg-accent/35",
                  )}
                  style={{
                    top: DAY_NUMBER + seg.lane * LANE,
                    height: 16,
                    left: `calc(${(seg.col / 7) * 100}% + ${seg.fromBefore ? 0 : 2}px)`,
                    width: `calc(${(seg.length / 7) * 100}% - ${(seg.fromBefore ? 0 : 2) + (seg.onAfter ? 0 : 2)}px)`,
                  }}
                >
                  {eventTitle(seg.span.event)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* The fade the list's cards pass under, on an iPad or desktop. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full hidden h-6 md:block">
        <EdgeBand side="top" depth="24px" blur="6px" />
      </div>
    </div>
  );
}
