import { useSyncExternalStore } from "react";
import type { EventSummary } from "@/lib/events";

export function eventTitle(event: Pick<EventSummary, "title">) {
  return event.title?.trim() || "Untitled Event";
}

const pad = (n: number) => String(n).padStart(2, "0");

// "03/11/2026".
export function formatEventDate(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "03/11/2026, 18:00 Tu" — day first, 24-hour time, the weekday last; or
// without a time of day "03/11/2026 Tu".
export function formatEventMoment(d: Date, hasTime = true) {
  const day = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return hasTime ? `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())} ${WEEKDAYS[d.getDay()]}` : `${day} ${WEEKDAYS[d.getDay()]}`;
}

export function formatEventDateTime(iso: string, hasTime = true) {
  return formatEventMoment(new Date(iso), hasTime);
}

type Span = Pick<EventSummary, "startsAt" | "endsAt" | "startsTimeSet" | "endsTimeSet">;

// The start, and the end after a dash when there is one: just its time if
// it's on the same day, and left out altogether when it's that same day
// with no time of its own.
export function formatEventRange({ startsAt, endsAt, startsTimeSet, endsTimeSet }: Span) {
  if (!startsAt) return null;
  const start = formatEventDateTime(startsAt, startsTimeSet);
  if (!endsAt) return start;
  const end = new Date(endsAt);
  if (sameDay(new Date(startsAt), end)) {
    return endsTimeSet ? `${start} – ${pad(end.getHours())}:${pad(end.getMinutes())}` : start;
  }
  return `${start} – ${formatEventMoment(end, endsTimeSet)}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// How long an event runs. With both times of day: to the nearest hour and
// never under one, "5h", or past a day "2d 3h" ("2d" when it's whole
// days). Without them, in whole days, counting both ends: "1d" for a
// single day. Null without both ends.
export function formatRuntime({ startsAt, endsAt, startsTimeSet, endsTimeSet }: Span) {
  if (!startsAt || !endsAt) return null;
  if (!startsTimeSet || !endsTimeSet) {
    const days = Math.round((startOfDay(new Date(endsAt)).getTime() - startOfDay(new Date(startsAt)).getTime()) / 86_400_000) + 1;
    return `${Math.max(1, days)}d`;
  }
  const hours = Math.max(1, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

const noSubscribe = () => () => {};

// Dates are shown in the viewer's own time zone, which the server (in UTC)
// doesn't know — so they're only written once in the browser.
export function useIsClient() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
