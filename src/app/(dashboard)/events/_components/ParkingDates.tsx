"use client";

import { createContext, useContext } from "react";
import { dateRangeAnswer, parkingDatesKey, parseDateRange, type DateRange } from "@/lib/checkliste";
import { cn } from "@/lib/utils/cn";
import type { ChecklistState } from "./checklistState";
import { DateRangePicker } from "./EventCalendar";

const NONE: DateRange = { startsAt: null, endsAt: null, startsTimeSet: false, endsTimeSet: false };

// The open event's own dates, for the parking calendars to show faintly
// under theirs (handed down by EventsView).
export const EventDatesContext = createContext<DateRange | null>(null);

// The days a side's parking closure (its towing zone) is registered for:
// the event's own calendar, in yellow, saved in the Checkliste beside the
// side's tick — each side its own, so they can be on different days — with
// the event's own days faintly in blue under it. On the side's Parkv. pin,
// and under its option in the list; either way on a surface (a card, a
// list's row) rather than the page, so the calendar's blurred edges wash
// out to that.
export function ParkingDates({ side, state, className }: { side: string; state: ChecklistState; className?: string }) {
  const key = parkingDatesKey(side);
  const eventDates = useContext(EventDatesContext);
  return (
    <div className={cn("tone-yellow [--edge-scrim:var(--surface)]", className)}>
      <DateRangePicker
        dates={parseDateRange(state.answer(key)) ?? NONE}
        onSave={(patch) => state.save({ [key]: dateRangeAnswer(patch) })}
        underlay={eventDates ? { dates: [eventDates], color: "var(--date-blue)", amount: 14 } : undefined}
      />
    </div>
  );
}
