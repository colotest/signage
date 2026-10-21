"use client";

import { useState } from "react";
import { DateTimePicker } from "@/components/DateTimePicker";
import { CloseIcon } from "@/components/icons/PlaybackIcons";
import { cn } from "@/lib/utils/cn";
import { formatEventMoment } from "./eventFormat";

// The next full hour — a sensible first guess at a time, should one be
// added.
export function nextFullHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const DEFAULT_LENGTH_HOURS = 4;

// Without a time of day, a start is the beginning of its day and an end
// the very end of its (as stored — see 0035).
export function effectiveStart(date: Date, timeSet: boolean) {
  return timeSet ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function effectiveEnd(date: Date, timeSet: boolean) {
  return timeSet ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

// The day (and, if its time is set, time) of each end. While a time is
// blank its hours are kept, unused, for when one's added.
export type DateValue = {
  startsAt: Date | null;
  endsAt: Date | null;
  startsTimeSet: boolean;
  endsTimeSet: boolean;
};

// Starts and Ends, each either unset ("Add") or a day — with a time of day
// only once one's added — that opens into the calendar below it, one at a
// time, like iOS Calendar's. Moving the start keeps the event's length, so
// the end moves along with it; an end can't come before the start. The
// start can be in the past, since events are sometimes entered (or
// corrected) after the fact; the end's calendar starts at the start's day.
export function DateRange({ value, onChange }: { value: DateValue; onChange: (next: DateValue) => void }) {
  const [editing, setEditing] = useState<"start" | "end" | null>(null);
  const { startsAt, endsAt, startsTimeSet, endsTimeSet } = value;

  // Pulls the end up to the start when it would come before it: to the
  // same moment when both have times, otherwise to the start's day.
  function settle(next: DateValue): DateValue {
    const { startsAt: s, endsAt: e } = next;
    if (!s || !e) return next;
    if (effectiveEnd(e, next.endsTimeSet) >= effectiveStart(s, next.startsTimeSet)) return next;
    if (next.startsTimeSet && next.endsTimeSet) return { ...next, endsAt: new Date(s) };
    const moved = new Date(e);
    moved.setFullYear(s.getFullYear(), s.getMonth(), s.getDate());
    return { ...next, endsAt: moved };
  }

  function setStart(next: Date | null) {
    // The end keeps its distance from the start.
    const end = next && startsAt && endsAt ? new Date(endsAt.getTime() + (next.getTime() - startsAt.getTime())) : endsAt;
    onChange(settle({ ...value, startsAt: next, endsAt: end, startsTimeSet: next ? startsTimeSet : false }));
  }

  function setEnd(next: Date | null) {
    onChange(settle({ ...value, endsAt: next, endsTimeSet: next ? endsTimeSet : false }));
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
      <DateRow
        label="Starts"
        value={startsAt}
        hasTime={startsTimeSet}
        open={editing === "start"}
        onToggle={() => {
          if (!startsAt) setStart(nextFullHour());
          setEditing((e) => (e === "start" ? null : "start"));
        }}
        onClear={() => {
          setStart(null);
          setEditing(null);
        }}
        onChange={setStart}
        onHasTimeChange={(startsTimeSet) => onChange(settle({ ...value, startsTimeSet }))}
        minDate={null}
      />
      <div className="border-t border-border" />
      <DateRow
        label="Ends"
        value={endsAt}
        hasTime={endsTimeSet}
        open={editing === "end"}
        onToggle={() => {
          if (!endsAt) {
            // The start's day, and a few hours after its time, should one
            // be added.
            const from = startsAt ?? nextFullHour();
            const end = new Date(from);
            end.setHours(Math.min(23, from.getHours() + DEFAULT_LENGTH_HOURS), from.getMinutes(), 0, 0);
            setEnd(end);
          }
          setEditing((e) => (e === "end" ? null : "end"));
        }}
        onClear={() => {
          setEnd(null);
          setEditing(null);
        }}
        onChange={setEnd}
        onHasTimeChange={(endsTimeSet) => onChange(settle({ ...value, endsTimeSet }))}
        minDate={startsAt}
      />
    </div>
  );
}

function DateRow({
  label,
  value,
  hasTime,
  open,
  onToggle,
  onClear,
  onChange,
  onHasTimeChange,
  minDate,
}: {
  label: string;
  value: Date | null;
  hasTime: boolean;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onChange: (next: Date) => void;
  onHasTimeChange: (hasTime: boolean) => void;
  minDate: Date | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-[15px]">{label}</span>
        {value && (
          <button
            type="button"
            onClick={onClear}
            title={`Remove ${label.toLowerCase()} date`}
            aria-label={`Remove ${label.toLowerCase()} date`}
            className="no-press flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "no-press rounded-[8px] bg-black/[.05] px-2.5 py-1.5 text-[15px] tabular-nums transition-colors dark:bg-white/[.08]",
            open || !value ? "text-accent" : "text-foreground",
          )}
        >
          {value ? formatEventMoment(value, hasTime) : "Add"}
        </button>
      </div>
      {open && value && (
        <div className="menu-pop origin-top border-t border-border px-2 pb-3 pt-3">
          <DateTimePicker
            value={value}
            onChange={onChange}
            minDate={minDate}
            hasTime={hasTime}
            onHasTimeChange={onHasTimeChange}
          />
        </div>
      )}
    </div>
  );
}
