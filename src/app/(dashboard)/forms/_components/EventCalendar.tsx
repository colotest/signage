"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
// Open: the month's name and its controls, then the weekdays' names.
const HEADER = 44;
const WEEKDAYS = 22;
const OPEN_EASE = "450ms var(--ease-spring)";
const DAY_MS = 86_400_000;
const YEARS_BACK = 5;
const YEARS_AHEAD = 10;

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

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

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
// the day before, at 24h.
function endDayOf(value: DateValue) {
  const { startsAt, endsAt } = value;
  if (!endsAt) return null;
  if (value.endsTimeSet && endsAt.getHours() === 0 && endsAt.getMinutes() === 0 && startsAt) {
    const before = addDays(endsAt, -1);
    if (before >= startOfDay(startsAt)) return before;
  }
  return startOfDay(endsAt);
}

// What's being picked again: the start, the end, or — for a one-day event,
// whose single day is both — whichever side of it the new day falls on.
type Mode = "start" | "end" | "either" | null;
type Pick = { which: "start" | "end"; day: Date; hours: number; minutes: number };

// An event's page's dates. Closed, a slit onto an iOS-style month: just
// the week rows the event covers, a little of the weeks either side fading
// out under blurred edges, the month's name over the top one, its days
// picked out with their times under the first and last. A one-day event is
// just its day, beside the month's name, with its times at the far right.
//
// Pressed, that same calendar opens out into its whole month to edit in.
// Tapping the start lets go of it, and every day it could move to (up to
// the end) gets a breathing ring; tapping one picks it, and a pair of time
// wheels pops up from it — ✓ to take the time, ✕ to leave the day without
// one. The end works the same way, from the start on. The month's name
// opens month and year wheels to jump about. Every pick is saved as it's
// made; Done closes it again.
export function EventDatesSection({ event }: { event: EventSummary }) {
  const router = useRouter();
  const isClient = useIsClient();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [pick, setPick] = useState<Pick | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickAnchor = useRef<HTMLElement | null>(null);
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

  const start = value.startsAt;
  const startDay = start ? startOfDay(start) : null;
  const endDay = endDayOf(value);
  const oneDay = !!startDay && (!endDay || sameDay(startDay, endDay));

  function open() {
    setViewMonth(startOfMonth(start ?? new Date()));
    setMode(start ? null : "start");
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setMode(null);
    setPick(null);
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
    run.then(
      () => router.refresh(),
      (err) => setError(err instanceof Error ? err.message : "Couldn't save the dates"),
    );
  }

  function available(day: Date) {
    if (mode === "start") return !endDay || day <= endDay;
    if (mode === "end") return !!startDay && day >= startDay;
    return mode === "either";
  }

  function tapDay(day: Date, el: HTMLElement) {
    if (!mode) {
      // Tapping the event's own days lets go of them to be picked again.
      if (startDay && sameDay(day, startDay) && oneDay) setMode("either");
      else if (startDay && sameDay(day, startDay)) setMode("start");
      else if (endDay && sameDay(day, endDay)) setMode("end");
      return;
    }
    if (!available(day)) return;
    const which =
      mode === "start" || mode === "end" ? mode : startDay && day > startDay ? "end" : "start";
    const current = which === "start" ? value.startsAt : value.endsAt;
    const timeSet = which === "start" ? value.startsTimeSet : value.endsTimeSet;
    const fallbackHours =
      which === "start" ? nextFullHour().getHours() : Math.min(23, (start?.getHours() ?? 18) + 4);
    pickAnchor.current = el;
    setPick({
      which,
      day,
      hours: current && timeSet ? current.getHours() : fallbackHours,
      minutes: current && timeSet ? current.getMinutes() : 0,
    });
  }

  function commitPick(withTime: boolean, hours: number, minutes: number) {
    if (!pick) return;
    const at = new Date(pick.day.getFullYear(), pick.day.getMonth(), pick.day.getDate(), hours, minutes);
    let next: DateValue = { ...value };
    if (pick.which === "start") {
      next = { ...next, startsAt: at, startsTimeSet: withTime };
      // A one-day event given an earlier start keeps its old day as the end.
      if (!next.endsAt && value.startsAt && pick.day < startOfDay(value.startsAt)) {
        next = { ...next, endsAt: value.startsAt, endsTimeSet: value.startsTimeSet };
      }
    } else {
      next = { ...next, endsAt: at, endsTimeSet: withTime };
    }
    // Never ending before it starts: an end pulled up to the start.
    if (next.startsAt && next.endsAt) {
      const s = effectiveStart(next.startsAt, next.startsTimeSet);
      if (effectiveEnd(next.endsAt, next.endsTimeSet) < s) next = { ...next, endsAt: new Date(s), endsTimeSet: next.startsTimeSet };
    }
    save(next);
    setPick(null);
    // A start with no end yet goes straight on to picking the end.
    setMode(pick.which === "start" && !next.endsAt ? "end" : null);
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
        onShiftMonth={(delta) => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))}
        onOpenMonthPicker={() => setMonthPickerOpen(true)}
        monthAnchor={monthAnchor}
      />
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}

      <WheelPopover
        open={pick !== null}
        anchorRef={pickAnchor}
        onClose={() => setPick(null)}
        onCancel={() => pick && commitPick(false, pick.hours, pick.minutes)}
        cancelLabel="No time"
        onCommit={(h, m) => commitPick(true, h, m)}
        commitLabel="Set time"
        wheels={
          pick
            ? [
                { label: "Hour", count: 24, value: pick.hours },
                { label: "Minute", count: 60, value: pick.minutes },
              ]
            : []
        }
        separator=":"
      />

      <WheelPopover
        open={monthPickerOpen}
        anchorRef={monthAnchor}
        align="start"
        onClose={() => setMonthPickerOpen(false)}
        onCancel={() => setMonthPickerOpen(false)}
        cancelLabel="Cancel"
        onCommit={(month, yearIndex) => {
          setViewMonth(new Date(new Date().getFullYear() - YEARS_BACK + yearIndex, month, 1));
          setMonthPickerOpen(false);
        }}
        commitLabel="Go to month"
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
  onShiftMonth,
  onOpenMonthPicker,
  monthAnchor,
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
  onTapDay: (day: Date, el: HTMLElement) => void;
  onShiftMonth: (delta: number) => void;
  onOpenMonthPicker: () => void;
  monthAnchor: RefObject<HTMLButtonElement | null>;
}) {
  const firstDay = useMemo(() => weekStartsOn(), []);
  const weekOf = (d: Date) => addDays(d, -((d.getDay() - firstDay + 7) % 7));
  const lastDay = endDay ?? startDay;

  // One continuous run of weeks holding both the open month and the
  // event's weeks (and one either side), so opening and closing is the
  // same rows sliding into a different window rather than a new calendar.
  const monthFirstWeek = weekOf(viewMonth);
  const monthLastWeek = weekOf(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0));
  const eventFirstWeek = startDay ? weekOf(startDay) : null;
  const eventLastWeek = lastDay ? weekOf(lastDay) : null;
  const from = eventFirstWeek && addDays(eventFirstWeek, -7) < monthFirstWeek ? addDays(eventFirstWeek, -7) : monthFirstWeek;
  const to = eventLastWeek && addDays(eventLastWeek, 7) > monthLastWeek ? addDays(eventLastWeek, 7) : monthLastWeek;
  const weeks: Date[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) weeks.push(w);
  const rowOf = (week: Date) => Math.round((week.getTime() - from.getTime()) / (7 * DAY_MS));

  const slit = !editing && !!startDay && !oneDay;
  const monthRows = rowOf(monthLastWeek) - rowOf(monthFirstWeek) + 1;
  const openHeight = HEADER + WEEKDAYS + monthRows * ROW;
  let height: number;
  let offset: number;
  if (editing) {
    height = openHeight;
    offset = HEADER + WEEKDAYS - rowOf(monthFirstWeek) * ROW;
  } else if (slit) {
    height = (rowOf(eventLastWeek!) - rowOf(eventFirstWeek!) + 1) * ROW + PEEK_TOP + PEEK_BOTTOM;
    offset = PEEK_TOP - rowOf(eventFirstWeek!) * ROW;
  } else {
    // A one-day event, or none yet: a single line, the grid waiting
    // (hidden) where it'll open to.
    height = CIRCLE;
    offset = HEADER + WEEKDAYS - rowOf(monthFirstWeek) * ROW;
  }

  const startTime = value.startsAt && value.startsTimeSet ? formatTime(value.startsAt) : null;
  const endTime = value.endsAt && value.endsTimeSet ? formatTime(value.endsAt, true) : null;
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((firstDay + i) % 7))).toUpperCase());
  }, [firstDay]);

  return (
    <div
      role={editing ? undefined : "button"}
      tabIndex={editing ? undefined : 0}
      aria-label={editing ? undefined : "Edit dates"}
      onClick={editing ? undefined : onOpen}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative select-none overflow-hidden rounded-[var(--radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-accent",
        !editing && "cursor-pointer",
      )}
      style={{ height, transition: `height ${OPEN_EASE}` }}
    >
      {/* The weeks, slid to whichever window is showing. */}
      <div
        aria-hidden={!editing && !slit ? true : undefined}
        className={cn("absolute inset-x-0 top-0 transition-opacity duration-300", !editing && !slit && "opacity-0")}
        style={{ transform: `translateY(${offset}px)`, transition: `transform ${OPEN_EASE}, opacity 300ms` }}
      >
        {weeks.map((week) => (
          <div key={week.getTime()} className="grid grid-cols-7" style={{ height: ROW }}>
            {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((day) => {
              const inRange = !!shownStart && !!shownEnd && day >= shownStart && day <= shownEnd;
              const isFirst = !!shownStart && sameDay(day, shownStart);
              const isLast = !!shownEnd && sameDay(day, shownEnd);
              const canPick = editing && !!mode && available(day);
              const ownDay =
                (startDay && sameDay(day, startDay)) || (lastDay && sameDay(day, lastDay));
              return (
                <div key={day.getTime()} className="relative flex flex-col items-center">
                  {/* The band joining the event's days, behind their circles;
                      it starts and stops at the first and last circles' middles. */}
                  {inRange && !sameDay(shownStart!, shownEnd!) && (
                    <span
                      aria-hidden
                      className="absolute bg-accent/12"
                      style={{ top: 2, height: CIRCLE, left: isFirst ? "50%" : 0, right: isLast ? "50%" : 0 }}
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={editing ? 0 : -1}
                    disabled={!editing || (!!mode && !canPick) || (!mode && !ownDay)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTapDay(day, e.currentTarget);
                    }}
                    aria-label={day.toDateString()}
                    className="no-press relative mt-[2px] rounded-full disabled:cursor-default"
                  >
                    <DayCircle
                      day={day}
                      kind={isFirst || isLast ? "edge" : inRange ? "inside" : "outside"}
                      dim={editing && day.getMonth() !== viewMonth.getMonth()}
                    />
                    {canPick && <span aria-hidden className="day-available absolute inset-0 rounded-full" />}
                  </button>
                  {((isFirst && startTime) || (isLast && endTime)) && (
                    <span className="relative mt-0.5 text-[10px] font-medium leading-none tabular-nums text-muted">
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

      {/* Open: the weekdays' names, over the grid. */}
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
          open month, where it opens month and year wheels — and, open, the
          arrows and Done. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-1" style={{ height: editing ? HEADER : CIRCLE }}>
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
          <span className="flex items-center gap-2 text-[15px] text-accent">
            <CalendarIcon className="h-[18px] w-[18px]" />
            Add a date
          </span>
        )}

        {/* A one-day event, closed: its day beside the month, times at the
            right. */}
        {!editing && oneDay && startDay && (
          <>
            <DayCircle day={startDay} kind="edge" />
            {(startTime || endTime) && (
              <span className="ml-auto text-[15px] tabular-nums text-muted">
                {[startTime, endTime].filter(Boolean).join(" – ")}
              </span>
            )}
          </>
        )}

        {editing && (
          <div className="pop-in ml-auto flex origin-right items-center gap-1 text-accent">
            <button type="button" onClick={() => onShiftMonth(-1)} aria-label="Previous month" className="no-press rounded-full p-1.5">
              <Chevron className="h-5 w-5 rotate-180" />
            </button>
            <button type="button" onClick={() => onShiftMonth(1)} aria-label="Next month" className="no-press rounded-full p-1.5">
              <Chevron className="h-5 w-5" />
            </button>
            <button type="button" onClick={onClose} className="no-press ml-1 rounded-full px-2 py-1 text-[15px] font-semibold">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// A little popover of scroll wheels hanging off what opened it, ✕ at its
// top left and ✓ at its top right. A press outside just closes it.
function WheelPopover({
  open,
  anchorRef,
  align = "end",
  onClose,
  onCancel,
  cancelLabel,
  onCommit,
  commitLabel,
  wheels,
  separator,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "start" | "end";
  onClose: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onCommit: (a: number, b: number) => void;
  commitLabel: string;
  wheels: { label: string; count: number; value: number; format?: (i: number) => string; className?: string }[];
  separator?: ReactNode;
}) {
  return (
    <Menu open={open} onClose={onClose} anchorRef={anchorRef} align={align} dragSelect={false} className="p-2">
      {/* Remounted per open, so the wheels start from the values given. */}
      {open && <WheelPanel key={wheels.map((w) => w.value).join(",")} {...{ onCancel, cancelLabel, onCommit, commitLabel, wheels, separator }} />}
    </Menu>
  );
}

function WheelPanel({
  onCancel,
  cancelLabel,
  onCommit,
  commitLabel,
  wheels,
  separator,
}: {
  onCancel: () => void;
  cancelLabel: string;
  onCommit: (a: number, b: number) => void;
  commitLabel: string;
  wheels: { label: string; count: number; value: number; format?: (i: number) => string; className?: string }[];
  separator?: ReactNode;
}) {
  const [values, setValues] = useState(() => wheels.map((w) => w.value));
  const round = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        onClick={onCancel}
        title={cancelLabel}
        aria-label={cancelLabel}
        className={cn(round, "no-press bg-black/[.05] text-foreground dark:bg-white/[.08]")}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <div className="relative flex items-center gap-1">
        {/* The selection band the wheels' centre rows line up on. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-[8px] bg-black/[.05] dark:bg-white/[.08]" />
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
      <button
        type="button"
        onClick={() => onCommit(values[0], values[1])}
        title={commitLabel}
        aria-label={commitLabel}
        className={cn(round, "no-press bg-accent text-accent-contrast shadow-[var(--shadow-control)]")}
      >
        <CheckIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function DayCircle({ day, kind, dim = false }: { day: Date; kind: "edge" | "inside" | "outside"; dim?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[16px] tabular-nums transition-colors duration-300",
        kind === "edge" && "bg-accent font-semibold text-accent-contrast",
        kind === "inside" && "font-medium text-accent",
        kind === "outside" && (dim ? "text-muted/60" : "text-foreground"),
      )}
      style={{ height: CIRCLE, width: CIRCLE }}
    >
      {day.getDate()}
    </span>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
