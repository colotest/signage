import { useSyncExternalStore } from "react";
import type { EventSummary } from "@/lib/events";

export function eventTitle(event: Pick<EventSummary, "title">) {
  return event.title?.trim() || "Untitled Event";
}

export function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatEventDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
