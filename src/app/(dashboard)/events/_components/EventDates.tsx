// Helpers for an event's start and end while they're being edited (see
// EventCalendar).

// The next full hour — a sensible first guess at a time, should one be
// added.
export function nextFullHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

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
