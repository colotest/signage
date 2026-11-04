"use client";

import { dateRangeAnswer, parkingDatesKey, parseDateRange, type DateRange } from "@/lib/checkliste";
import { cn } from "@/lib/utils/cn";
import type { ChecklistState } from "./checklistState";
import { DateRangePicker } from "./EventCalendar";

const NONE: DateRange = { startsAt: null, endsAt: null, startsTimeSet: false, endsTimeSet: false };

// The days a side's parking closure (its towing zone) is registered for:
// the event's own calendar, in yellow, saved in the Checkliste beside the
// side's tick — each side its own, so they can be on different days. On
// the side's Parkv. pin, and under its option in the list.
export function ParkingDates({ side, state, className }: { side: string; state: ChecklistState; className?: string }) {
  const key = parkingDatesKey(side);
  return (
    <div className={cn("tone-yellow", className)}>
      <DateRangePicker
        dates={parseDateRange(state.answer(key)) ?? NONE}
        onSave={(patch) => state.save({ [key]: dateRangeAnswer(patch) })}
      />
    </div>
  );
}
