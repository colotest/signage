"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { EdgeBand } from "@/components/EdgeBand";
import { Wheel } from "@/components/DateTimePicker";
import { sameDay, weekStartsOn } from "@/components/MonthCalendar";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { Menu } from "@/components/ui/Menu";
import { updateEvent } from "@/lib/actions/events";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { effectiveEnd, effectiveStart, nextFullHour, type DateValue } from "./EventDates";
import { useIsClient } from "./eventFormat";

// One week row: the day circle and, under it, room for a time.
const ROW = 52;
const CIRCLE = 34;
// Closed, how much of the weeks either side shows, under the blurred edges.
// The top one is deeper, to hold the month's name.
const PEEK_TOP = 36;
const PEEK_BOTTOM = 22;
// How far what follows the slit reaches up over its bottom edge.
const SLIT_OVERLAP = 20;
// Open: the month's name and its controls, the weekdays' names, then a
// window of three weeks that scrolls on through the months.
const HEADER = 44;
const WEEKDAYS = 22;
const WINDOW_WEEKS = 3;
// How far the weeks run either side of the event (or of a month jumped to).
const RANGE_WEEKS = 40;
const OPEN_EASE = "450ms var(--ease-spring)";
const DAY_MS = 86_400_000;
const YEARS_BACK = 5;
const YEARS_AHEAD = 10;
// The time popover, open: a square of wheels.
const POPOVER = 188;

const pad = (n: number) => String(n).padStart(2, "0");

// "18:00", "18:30". An end at midnight is "24:00", the end of its evening,
// not "00:00" of the next day.
function formatTime(d: Date, isEnd = false) {
  if (isEnd && d.getHours() === 0 && d.getMinutes() === 0) return "24:00";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

const monthName = (month: number) => new Date(2026, month, 1).toLocaleString("en-GB", { month: "long" });

function rangeLabel(from: Date, to: Date) {
  if (from.getFullYear() !== to.getFullYear()) {
    return `${monthName(from.getMonth())} ${from.getFullYear()} – ${monthName(to.getMonth())} ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${monthName(from.getMonth())} – ${monthName(to.getMonth())} ${to.getFullYear()}`;
  }
  return `${monthName(from.getMonth())} ${from.getFullYear()}`;
}

// The event's own dates, as stored, turned into what's edited. A blank
// time still needs hours behind it, for when one's added: the next full
// hour for the start, a few hours on for the end.
function toDateValue(event: EventSummary): DateValue {
  const fallback = nextFullHour();
  const startsAt = event.startsAt ? new Date(event.startsAt) : null;
  if (startsAt && !event.startsTimeSet) startsAt.setHours(fallback.getHours(), 0, 0, 0);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  if (endsAt && !event.endsTimeSet) endsAt.setHours(Math.min(23, (startsAt ?? fallback).getHours() + 4), 0, 0, 0);
  return { startsAt, endsAt, startsTimeSet: event.startsTimeSet, endsTimeSet: event.endsTimeSet };
}

// The day an end falls on, for drawing: ending at midnight is ending on
// the day before, at 24:00.
function endDayOf(value: DateValue) {
  const { startsAt, endsAt } = value;
  if (!endsAt) return null;
  if (value.endsTimeSet && endsAt.getHours() === 0 && endsAt.getMinutes() === 0 && startsAt) {
    const before = addDays(endsAt, -1);
    if (before >= startOfDay(startsAt)) return before;
  }
  return startOfDay(endsAt);
}

// Never ending before it starts: an end that would is pulled up to the
// start.
function settle(next: DateValue): DateValue {
  if (!next.startsAt || !next.endsAt) return next;
  const s = effectiveStart(next.startsAt, next.startsTimeSet);
  if (effectiveEnd(next.endsAt, next.endsTimeSet) >= s) return next;
  return { ...next, endsAt: new Date(s), endsTimeSet: next.startsTimeSet };
}

// What's being picked again: the start, the end, or — for a one-day event,
// whose single day is both — whichever side of it the new day falls on.
type Mode = "start" | "end" | "either" | null;

// The time prompt hanging under a just-picked day: the middle of the day's
// circle and where under it the prompt starts (in the calendar's own
// coordinates), and how wide the calendar is, to keep it inside.
type TimePrompt = {
  which: "start" | "end";
  x: number;
  y: number;
  frameWidth: number;
  expanded: boolean;
};

// An event's page's dates. Closed, a slit onto an iOS-style month: just
// the week rows the event covers, a little of the weeks either side fading
// out under blurred edges, the month's name over the top one, its days
// picked out with their times under the first and last. A one-day event is
// just its day, beside the month's name, with its times at the far right.
//
// Pressing the picked-out days opens the calendar out into a window of
// three weeks, centred on them, that scrolls on through the months (the
// month's name following along, or jumping by its own month and year
// wheels). Tapping the start lets go of it, and every day it could move to
// (up to the end) gets a breathing ring; tapping one moves it there at
// once, and a little "Pick Start Time" hangs off it — pressed, it opens
// into hour and minute wheels, ✕ to leave the time as it was, ✓ to set it.
// The end works the same way, from the start on. Every change is saved as
// it's made; the ✓ closes the calendar again.
export function EventDatesSection({ event }: { event: EventSummary }) {
  const isClient = useIsClient();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [prompt, setPrompt] = useState<TimePrompt | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // A month picked on the month and year wheels, for the calendar to scroll
  // to (n tells one pick from the next).
  const [jump, setJump] = useState<{ month: Date; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const monthAnchor = useRef<HTMLButtonElement>(null);

  // What's been picked, shown straight away rather than after the save
  // comes back — dropped once the event's own dates change (and the
  // calendar's closed), as the saved ones are then the same.
  const [draft, setDraft] = useState<DateValue | null>(null);
  const datesKey = [event.startsAt, event.endsAt, event.startsTimeSet, event.endsTimeSet].join("|");
  const [syncedKey, setSyncedKey] = useState(datesKey);
  if (datesKey !== syncedKey) {
    setSyncedKey(datesKey);
    if (!editing) setDraft(null);
  }
  const value = draft ?? toDateValue(event);
  // Saves go one after another, so quick changes land in order.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const startDay = value.startsAt ? startOfDay(value.startsAt) : null;
  const endDay = endDayOf(value);
  const oneDay = !!startDay && (!endDay || sameDay(startDay, endDay));

  function open() {
    setViewMonth(startOfMonth(value.startsAt ?? new Date()));
    setMode(value.startsAt ? null : "start");
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setMode(null);
    setPrompt(null);
    setMonthPickerOpen(false);
  }

  function save(next: DateValue) {
    setDraft(next);
    setError(null);
    const patch = {
      startsAt: next.startsAt ? effectiveStart(next.startsAt, next.startsTimeSet).toISOString() : null,
      endsAt: next.endsAt ? effectiveEnd(next.endsAt, next.endsTimeSet).toISOString() : null,
      startsTimeSet: next.startsTimeSet,
      endsTimeSet: next.endsTimeSet,
    };
    const run = queueRef.current.then(() => updateEvent(event.id, patch));
    queueRef.current = run.catch(() => {});
    // The action's revalidatePath brings the fresh page back by itself.
    run.then(
      (message) => {
        if (message) setError(message);
      },
      () => setError("Couldn't save the dates"),
    );
  }

  function available(day: Date) {
    if (mode === "start") return !endDay || day <= endDay;
    if (mode === "end") return !!startDay && day >= startDay;
    return mode === "either";
  }

  function tapDay(day: Date, circle: DOMRect, frame: DOMRect) {
    if (!mode) {
      // Tapping the event's own days lets go of them to be picked again.
      if (startDay && sameDay(day, startDay) && oneDay) setMode("either");
      else if (startDay && sameDay(day, startDay)) setMode("start");
      else if (endDay && sameDay(day, endDay)) setMode("end");
      setPrompt(null);
      return;
    }
    if (!available(day)) return;
    const which = mode === "start" || mode === "end" ? mode : startDay && day > startDay ? "end" : "start";

    // Moved to the new day at once, keeping whatever time it had.
    const old = which === "start" ? value.startsAt : value.endsAt;
    const hours = old?.getHours() ?? (which === "start" ? nextFullHour().getHours() : Math.min(23, (value.startsAt?.getHours() ?? 18) + 4));
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, old?.getMinutes() ?? 0);
    let next: DateValue;
    if (which === "start") {
      next = { ...value, startsAt: at, startsTimeSet: old ? value.startsTimeSet : false };
      // A one-day event given an earlier start keeps its old day as the end.
      if (!value.endsAt && value.startsAt && day < startOfDay(value.startsAt)) {
        next = { ...next, endsAt: value.startsAt, endsTimeSet: value.startsTimeSet };
      }
    } else {
      next = { ...value, endsAt: at, endsTimeSet: old ? value.endsTimeSet : false };
    }
    next = settle(next);
    save(next);
    if (day.getMonth() !== viewMonth.getMonth() || day.getFullYear() !== viewMonth.getFullYear()) {
      setViewMonth(startOfMonth(day));
    }
    // A start with no end yet goes straight on to picking the end.
    setMode(which === "start" && !next.endsAt ? "end" : null);

    // The prompt hangs centred under the day's circle (clear of the time
    // written there), over whatever's below if it reaches that far.
    setPrompt({
      which,
      x: circle.left + circle.width / 2 - frame.left,
      y: circle.bottom - frame.top + 18,
      frameWidth: frame.width,
      expanded: false,
    });
  }

  function setTime(which: "start" | "end", hours: number | null, minutes = 0) {
    const day = which === "start" ? value.startsAt : value.endsAt;
    if (!day) return;
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours ?? day.getHours(), hours === null ? day.getMinutes() : minutes);
    const next =
      which === "start"
        ? { ...value, startsAt: at, startsTimeSet: hours !== null }
        : { ...value, endsAt: at, endsTimeSet: hours !== null };
    save(settle(next));
    setPrompt(null);
  }

  // What's drawn: a day let go of isn't shown as picked while its
  // replacement is being chosen.
  const shownStart = mode === "start" || mode === "either" ? null : startDay;
  const shownEnd = mode === "end" || mode === "either" ? null : (endDay ?? startDay);

  if (!isClient) {
    // Local dates, so only drawn in the browser (the server's in UTC); the
    // space is held meanwhile.
    return <div style={{ height: CIRCLE }} />;
  }

  const promptTime = prompt ? (prompt.which === "start" ? value.startsAt : value.endsAt) : null;
  const promptTimeSet = prompt ? (prompt.which === "start" ? value.startsTimeSet : value.endsTimeSet) : false;

  return (
    <div>
      <CalendarBody
        value={value}
        editing={editing}
        mode={mode}
        viewMonth={viewMonth}
        startDay={startDay}
        endDay={endDay}
        oneDay={oneDay}
        shownStart={shownStart}
        shownEnd={shownEnd}
        available={available}
        onOpen={open}
        onClose={close}
        onTapDay={tapDay}
        onViewMonth={setViewMonth}
        onScrolled={() => setPrompt(null)}
        onOpenMonthPicker={() => setMonthPickerOpen(true)}
        monthAnchor={monthAnchor}
        jump={jump}
      >
        {prompt && promptTime && (
          <TimePromptPopover
            key={`${prompt.which}:${promptTime.toDateString()}`}
            prompt={prompt}
            hours={promptTime.getHours()}
            minutes={promptTime.getMinutes()}
            timeSet={promptTimeSet}
            onExpand={() => setPrompt({ ...prompt, expanded: true })}
            onDismiss={() => setPrompt(null)}
            onClearTime={() => setTime(prompt.which, null)}
            onCommit={(h, m) => setTime(prompt.which, h, m)}
          />
        )}
      </CalendarBody>
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}

      <Menu
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        anchorRef={monthAnchor}
        align="start"
        dragSelect={false}
        className="p-0"
      >
        {monthPickerOpen && (
          <WheelSquare
            width={260}
            cancelLabel="Cancel"
            commitLabel="Go to month"
            onCancel={() => setMonthPickerOpen(false)}
            onCommit={([month, yearIndex]) => {
              const target = new Date(new Date().getFullYear() - YEARS_BACK + yearIndex, month, 1);
              setViewMonth(target);
              setJump((j) => ({ month: target, n: (j?.n ?? 0) + 1 }));
              setMonthPickerOpen(false);
            }}
            wheels={[
              { label: "Month", count: 12, value: viewMonth.getMonth(), format: monthName, className: "w-32" },
              {
                label: "Year",
                count: YEARS_BACK + YEARS_AHEAD + 1,
                value: Math.min(
                  YEARS_BACK + YEARS_AHEAD,
                  Math.max(0, viewMonth.getFullYear() - new Date().getFullYear() + YEARS_BACK),
                ),
                format: (i) => String(new Date().getFullYear() - YEARS_BACK + i),
                className: "w-20",
              },
            ]}
          />
        )}
      </Menu>
    </div>
  );
}

function CalendarBody({
  value,
  editing,
  mode,
  viewMonth,
  startDay,
  endDay,
  oneDay,
  shownStart,
  shownEnd,
  available,
  onOpen,
  onClose,
  onTapDay,
  onViewMonth,
  onScrolled,
  onOpenMonthPicker,
  monthAnchor,
  jump,
  children,
}: {
  value: DateValue;
  editing: boolean;
  mode: Mode;
  viewMonth: Date;
  startDay: Date | null;
  endDay: Date | null;
  oneDay: boolean;
  shownStart: Date | null;
  shownEnd: Date | null;
  available: (day: Date) => boolean;
  onOpen: () => void;
  onClose: () => void;
  onTapDay: (day: Date, circle: DOMRect, frame: DOMRect) => void;
  onViewMonth: (month: Date) => void;
  onScrolled: () => void;
  onOpenMonthPicker: () => void;
  monthAnchor: RefObject<HTMLButtonElement | null>;
  // A month to bring into view, when the month and year wheels pick one.
  jump: { month: Date; n: number } | null;
  children?: React.ReactNode;
}) {
  const firstDay = useMemo(() => weekStartsOn(), []);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const weekOf = (d: Date) => addDays(d, -((d.getDay() - firstDay + 7) % 7));
  const lastDay = endDay ?? startDay;

  // One continuous run of weeks around the event (or today), recentred
  // when the month and year wheels jump past either end of it.
  const [rangeCentre, setRangeCentre] = useState(() => weekOf(startDay ?? new Date()));
  const from = addDays(rangeCentre, -7 * RANGE_WEEKS);
  const to = addDays(rangeCentre, 7 * RANGE_WEEKS);
  const weeks = useMemo(() => {
    const list: Date[] = [];
    for (let i = -RANGE_WEEKS; i <= RANGE_WEEKS; i++) list.push(addDays(rangeCentre, 7 * i));
    return list;
  }, [rangeCentre]);

  // A month picked on the wheels past either end of the run of weeks
  // recentres it there first (noticed during render, as React recommends,
  // so the weeks are in place by the time it's scrolled to below).
  // Closed, the run is kept around the event's own weeks.
  if (!editing && startDay && (weekOf(startDay) < addDays(from, 7) || weekOf(lastDay!) > addDays(to, -7))) {
    setRangeCentre(weekOf(startDay));
  }
  const [jumpSeen, setJumpSeen] = useState(0);
  if (jump && jump.n !== jumpSeen) {
    setJumpSeen(jump.n);
    const week = weekOf(jump.month);
    if (week < addDays(from, 7 * WINDOW_WEEKS) || week > addDays(to, -7 * WINDOW_WEEKS)) setRangeCentre(week);
  }
  const rowOf = (week: Date) => Math.round((week.getTime() - from.getTime()) / (7 * DAY_MS));

  const eventFirstRow = startDay ? rowOf(weekOf(startDay)) : null;
  const eventLastRow = lastDay ? rowOf(weekOf(lastDay)) : null;
  const slit = !editing && eventFirstRow !== null && !oneDay;

  // The frame's height, and where the scrolling weeks sit in it and how
  // far they're scrolled: closed, the event's own weeks with a little
  // either side; open, three weeks under the header with the event in the
  // middle; a one-day event or none yet, a single line, the weeks waiting
  // (hidden) where they'll open to.
  const openHeight = HEADER + WEEKDAYS + WINDOW_WEEKS * ROW;
  const height = editing ? openHeight : slit ? (eventLastRow! - eventFirstRow! + 1) * ROW + PEEK_TOP + PEEK_BOTTOM : CIRCLE;
  const scrollerTop = editing || !slit ? HEADER + WEEKDAYS : 0;
  const scrollerHeight = slit ? height : WINDOW_WEEKS * ROW;
  const centreRow =
    eventFirstRow !== null ? (eventFirstRow + eventLastRow!) / 2 : rowOf(weekOf(new Date()));
  const restingScroll = slit ? eventFirstRow! * ROW - PEEK_TOP : (centreRow - (WINDOW_WEEKS - 1) / 2) * ROW;

  // Closed, the weeks are held exactly in place; on opening they glide to
  // the open window's middle, centred on the event.
  const wasEditing = useRef(editing);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const opening = editing && !wasEditing.current;
    wasEditing.current = editing;
    if (editing && !opening) return;
    el.scrollTo({ top: restingScroll, behavior: opening ? "smooth" : "auto" });
  }, [editing, restingScroll]);

  // A month picked on the wheels: its first week brought to the top.
  useLayoutEffect(() => {
    if (!jump) return;
    scrollerRef.current?.scrollTo({ top: rowOf(weekOf(jump.month)) * ROW, behavior: "smooth" });
  }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolling on through the weeks: the month's name follows the middle
  // week, and a time prompt (pinned to where its day was) goes.
  // Only an actual move counts: a resize (Safari's toolbar coming and
  // going, say) re-snaps the window and fires scroll events without going
  // anywhere, and shouldn't fold a prompt away.
  const lastScrollTop = useRef(0);
  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || !editing) return;
    if (Math.abs(el.scrollTop - lastScrollTop.current) > 4) onScrolled();
    lastScrollTop.current = el.scrollTop;
    const row = Math.min(weeks.length - 1, Math.max(0, Math.round(el.scrollTop / ROW + (WINDOW_WEEKS - 1) / 2)));
    const middle = addDays(weeks[row], 3);
    if (middle.getMonth() !== viewMonth.getMonth() || middle.getFullYear() !== viewMonth.getFullYear()) {
      onViewMonth(startOfMonth(middle));
    }
  }

  const startTime = value.startsAt && value.startsTimeSet ? formatTime(value.startsAt) : null;
  const endTime = value.endsAt && value.endsTimeSet ? formatTime(value.endsAt, true) : null;
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((firstDay + i) % 7))).toUpperCase());
  }, [firstDay]);

  function pressDay(day: Date, button: HTMLElement) {
    if (!editing) {
      onOpen();
      return;
    }
    onTapDay(day, button.getBoundingClientRect(), frameRef.current!.getBoundingClientRect());
  }

  return (
    <div
      ref={frameRef}
      className={cn("relative select-none", editing ? "overflow-visible" : "overflow-hidden")}
      style={{
        height,
        // Closed to a slit, what follows rides up into its blurred bottom
        // edge instead of starting below it.
        marginBottom: slit ? -SLIT_OVERLAP : 0,
        transition: `height ${OPEN_EASE}, margin-bottom ${OPEN_EASE}`,
      }}
    >
      {/* The weeks: a slit held still while closed, a window that scrolls
          (snapping to whole weeks) while open. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        aria-hidden={!editing && !slit ? true : undefined}
        className={cn(
          "no-scrollbar absolute inset-x-0 top-0",
          editing ? "snap-y snap-mandatory overflow-y-auto overscroll-contain" : "overflow-hidden",
          !editing && !slit && "pointer-events-none opacity-0",
        )}
        style={{
          height: scrollerHeight,
          transform: `translateY(${scrollerTop}px)`,
          transition: `transform ${OPEN_EASE}, height ${OPEN_EASE}, opacity 300ms`,
          // The window's top and bottom weeks fade into the frame while open.
          maskImage: editing ? "linear-gradient(to bottom, transparent, black 14px, black calc(100% - 14px), transparent)" : undefined,
        }}
      >
        {weeks.map((week) => (
          <div key={week.getTime()} className="grid snap-start grid-cols-7" style={{ height: ROW }}>
            {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((day) => {
              const inRange = !!shownStart && !!shownEnd && day >= shownStart && day <= shownEnd;
              const isFirst = !!shownStart && sameDay(day, shownStart);
              const isLast = !!shownEnd && sameDay(day, shownEnd);
              const canPick = editing && !!mode && available(day);
              const ownDay = (startDay && sameDay(day, startDay)) || (lastDay && sameDay(day, lastDay));
              // Closed, the picked-out days are what opens it; open, the
              // event's own days (to let go of) or any day that can be picked.
              const pressable = editing ? (mode ? canPick : !!ownDay) : inRange;
              return (
                <div key={day.getTime()} className="relative flex flex-col items-center">
                  {/* The pill joining the event's days, behind their circles;
                      it starts and stops at the first and last circles' middles. */}
                  {inRange && !sameDay(shownStart!, shownEnd!) && (
                    <span
                      aria-hidden
                      className="absolute bg-accent/24"
                      style={{ top: 2, height: CIRCLE, left: isFirst ? "50%" : 0, right: isLast ? "50%" : 0 }}
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={pressable ? 0 : -1}
                    disabled={!pressable}
                    onClick={(e) => pressDay(day, e.currentTarget)}
                    aria-label={editing ? day.toDateString() : `${day.toDateString()} — edit dates`}
                    className="no-press relative mt-[2px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
                  >
                    <DayCircle
                      day={day}
                      kind={isFirst || isLast ? "edge" : inRange ? "inside" : "outside"}
                      dim={editing && (day.getMonth() !== viewMonth.getMonth() || day.getFullYear() !== viewMonth.getFullYear())}
                      // Open with nothing being picked yet, the start and end
                      // take turns fading, to show they're what to tap.
                      breathe={editing && !mode ? (isFirst ? "a" : isLast ? "b" : undefined) : undefined}
                    />
                    {canPick && <span aria-hidden className="day-available absolute inset-0 rounded-full" />}
                  </button>
                  {((isFirst && startTime) || (isLast && endTime)) && (
                    <span className="relative mt-0.5 text-[10px] font-semibold leading-none tabular-nums text-accent">
                      {isFirst && startTime ? startTime : endTime}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Closed, the weeks either side fade out under blurred edges; open,
          the edges go. */}
      <EdgeBand
        side="top"
        depth={`${PEEK_TOP}px`}
        blur="6px"
        className={cn("transition-opacity duration-300", !slit && "opacity-0")}
      />
      <EdgeBand
        side="bottom"
        depth={`${PEEK_BOTTOM}px`}
        blur="6px"
        className={cn("transition-opacity duration-300", !slit && "opacity-0")}
      />

      {/* Open: the weekdays' names. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 grid grid-cols-7 text-center text-[11px] font-semibold text-muted transition-opacity duration-300",
          !editing && "opacity-0",
        )}
        style={{ top: HEADER, height: WEEKDAYS }}
      >
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {/* The month's name — on the slit's blurred top edge, or heading the
          open calendar, where it opens month and year wheels — and, open,
          the ✓ that closes it. */}
      <div
        className={cn("absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-1", !editing && "pointer-events-none")}
        style={{ height: editing ? HEADER : CIRCLE }}
      >
        {editing ? (
          <button
            ref={monthAnchor}
            type="button"
            onClick={onOpenMonthPicker}
            className="no-press flex items-center gap-1 text-[17px] font-semibold"
          >
            {monthName(viewMonth.getMonth())} {viewMonth.getFullYear()}
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : startDay ? (
          <span className={cn("text-[17px] font-semibold", slit && "-mt-0.5 self-start pt-1")}>
            {slit ? rangeLabel(startDay, lastDay!) : rangeLabel(startDay, startDay)}
          </span>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="no-press pointer-events-auto flex items-center gap-2 text-[15px] text-accent"
          >
            <CalendarIcon className="h-[18px] w-[18px]" />
            Add a date
          </button>
        )}

        {/* A one-day event, closed: its day (which opens the calendar)
            beside the month, its times at the right. */}
        {!editing && oneDay && startDay && (
          <>
            <button
              type="button"
              onClick={onOpen}
              aria-label={`${startDay.toDateString()} — edit dates`}
              className="no-press pointer-events-auto rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <DayCircle day={startDay} kind="edge" />
            </button>
            {(startTime || endTime) && (
              <span className="ml-auto text-[15px] font-medium tabular-nums text-accent">
                {[startTime, endTime].filter(Boolean).join(" – ")}
              </span>
            )}
          </>
        )}

        {editing && (
          <button
            type="button"
            onClick={onClose}
            title="Done"
            aria-label="Done"
            className="no-press pop-in ml-auto flex h-9 w-9 origin-right items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90"
          >
            <CheckIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {children}
    </div>
  );
}

// The prompt hanging off a just-picked day. Folded, a little label — "Pick
// Start Time" — that opens, pressed, into a square of hour and minute
// wheels with ✕ and ✓ tucked into its top corners. Either way the corner
// nearest the day is a sharp point at its circle, so it's clear which day
// it's the time of. A press anywhere else folds it away.
function TimePromptPopover({
  prompt,
  hours,
  minutes,
  timeSet,
  onExpand,
  onDismiss,
  onClearTime,
  onCommit,
}: {
  prompt: TimePrompt;
  hours: number;
  minutes: number;
  timeSet: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onClearTime: () => void;
  onCommit: (hours: number, minutes: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  useEffect(() => {
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismissRef.current();
    }
    document.addEventListener("pointerdown", handle, true);
    return () => document.removeEventListener("pointerdown", handle, true);
  }, []);

  const { x, y, frameWidth } = prompt;
  const label = prompt.which === "start" ? "Start" : "End";

  // Centred on the day, but kept inside the calendar: measured, then
  // shifted in from an edge it would cross — the tip stays on the day.
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (panelRef.current) setWidth(panelRef.current.offsetWidth);
  }, [prompt.expanded]);
  const left = width === null ? 0 : Math.min(Math.max(x - width / 2, 0), frameWidth - width);

  return (
    <div
      ref={ref}
      className="menu-pop absolute z-30"
      style={{
        left,
        top: y,
        // Grows out of the tip. Not shown for the one frame before it's
        // been measured and placed.
        transformOrigin: `${x - left}px 0`,
        visibility: width === null ? "hidden" : undefined,
      }}
    >
      {/* The tip, pointing at the day. */}
      <span
        aria-hidden
        className="absolute -top-1.5 z-10 h-3 w-3 rotate-45 border-l border-t border-border glass-material"
        style={{ left: x - left - 6 }}
      />
      <div
        ref={panelRef}
        className="relative overflow-hidden rounded-[18px] border border-border glass-material shadow-[var(--shadow-float)]"
      >
      {prompt.expanded ? (
        <WheelSquare
          width={POPOVER}
          cancelLabel="Cancel"
          commitLabel={`Set ${label.toLowerCase()} time`}
          onCancel={onDismiss}
          onCommit={([h, m]) => onCommit(h, m)}
          separator=":"
          wheels={[
            { label: "Hour", count: 24, value: hours },
            { label: "Minute", count: 60, value: minutes },
          ]}
        />
      ) : (
        <div className="flex items-center">
          <button
            type="button"
            onClick={onExpand}
            className="no-press whitespace-nowrap px-3.5 py-2 text-[13px] font-semibold text-accent"
          >
            Pick {label} Time
          </button>
          {/* A time already set can be taken off again. */}
          {timeSet && (
            <button
              type="button"
              onClick={onClearTime}
              title={`Remove ${label.toLowerCase()} time`}
              aria-label={`Remove ${label.toLowerCase()} time`}
              className="no-press -ml-1.5 mr-1.5 flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// A square of scroll wheels, a band across their middle row, with ✕ and ✓
// tucked into its top corners, a little over the wheels.
function WheelSquare({
  width,
  cancelLabel,
  commitLabel,
  onCancel,
  onCommit,
  wheels,
  separator,
}: {
  width: number;
  cancelLabel: string;
  commitLabel: string;
  onCancel: () => void;
  onCommit: (values: number[]) => void;
  wheels: { label: string; count: number; value: number; format?: (i: number) => string; className?: string }[];
  separator?: string;
}) {
  const [values, setValues] = useState(() => wheels.map((w) => w.value));
  const round = "absolute top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full";

  return (
    <div className="relative flex items-center justify-center" style={{ width, height: POPOVER }}>
      <button
        type="button"
        onClick={onCancel}
        title={cancelLabel}
        aria-label={cancelLabel}
        className={cn(round, "no-press left-2 bg-black/[.06] text-foreground backdrop-blur-md dark:bg-white/[.1]")}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onCommit(values)}
        title={commitLabel}
        aria-label={commitLabel}
        className={cn(round, "no-press right-2 bg-accent text-accent-contrast shadow-[var(--shadow-control)]")}
      >
        <CheckIcon className="h-4 w-4" />
      </button>
      <div className="relative mt-4 flex items-center gap-1">
        {/* The band the wheels' middle rows line up on. */}
        <div className="pointer-events-none absolute -inset-x-2 top-1/2 h-8 -translate-y-1/2 rounded-[8px] bg-black/[.05] dark:bg-white/[.08]" />
        {wheels.map((wheel, i) => (
          <div key={wheel.label} className="flex items-center gap-1">
            {i > 0 && separator && <span className="relative text-[20px]">{separator}</span>}
            <Wheel
              live
              count={wheel.count}
              value={values[i]}
              onChange={(v) => setValues((current) => current.map((old, j) => (j === i ? v : old)))}
              label={wheel.label}
              format={wheel.format}
              className={wheel.className}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCircle({
  day,
  kind,
  dim = false,
  breathe,
}: {
  day: Date;
  kind: "edge" | "inside" | "outside";
  dim?: boolean;
  breathe?: "a" | "b";
}) {
  const weekend = isWeekend(day);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[16px] tabular-nums transition-colors duration-300",
        breathe === "a" && "edge-breathe",
        breathe === "b" && "edge-breathe edge-breathe-late",
        kind === "edge" && cn("bg-accent text-accent-contrast", weekend ? "font-bold" : "font-semibold"),
        kind === "inside" && cn("text-accent", weekend ? "font-bold" : "font-medium"),
        kind === "outside" && cn(dim ? "text-muted/60" : "text-foreground", weekend && "font-semibold"),
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
