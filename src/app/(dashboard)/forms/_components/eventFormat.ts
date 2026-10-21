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

// "03/11/2026, 18:00 Tu" — day first, 24-hour time, the weekday last.
export function formatEventDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} ${WEEKDAYS[d.getDay()]}`;
}

// The end, when there is one, after a dash — just its time if it's on the
// same day as the start.
export function formatEventRange(startsAt: string, endsAt: string | null) {
  const start = formatEventDateTime(startsAt);
  if (!endsAt) return start;
  const end = new Date(endsAt);
  const endText = sameDay(new Date(startsAt), end) ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : formatEventDateTime(endsAt);
  return `${start} – ${endText}`;
}

// How long an event runs, to the nearest hour and never under one: "5h",
// or past a day "2d 3h" ("2d" when it's whole days). Null without both
// ends.
export function formatRuntime(startsAt: string | null, endsAt: string | null) {
  if (!startsAt || !endsAt) return null;
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
