"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import type { EventSummary } from "@/lib/events";
import { EventDetails } from "./EventsList";
import { eventTitle, formatEventDateTime, formatRuntime, useIsClient } from "./eventFormat";

// The setup views an event has, each its own page.
export const EVENT_VIEWS = [{ key: "begehung", label: "Begehung" }] as const;
export type EventViewKey = (typeof EVENT_VIEWS)[number]["key"];

// A page pushed onto the list side: a round ‹ back to where it came from,
// beside its title.
export function SubPage({
  title,
  backLabel,
  onBack,
  children,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="px-4 pb-10 pt-5 md:px-5 md:pt-6">
      <div className="mb-4 flex min-h-[var(--title-action)] items-center gap-3">
        <button type="button" onClick={onBack} title={backLabel} aria-label={backLabel} className={POPUP_WHITE_BUTTON}>
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 truncate text-[28px] font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

// An event's own page: its details in brief, then the setup views to go on
// to.
export function EventOverview({
  event,
  onBack,
  onOpenView,
}: {
  event: EventSummary;
  onBack: () => void;
  onOpenView: (view: EventViewKey) => void;
}) {
  const isClient = useIsClient();
  const runtime = formatRuntime(event.startsAt, event.endsAt);

  return (
    <SubPage title={eventTitle(event)} backLabel="Back to Events" onBack={onBack}>
      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
        <p className="mb-3 text-[13px]">
          {event.startsAt && isClient ? (
            <>
              {formatEventDateTime(event.startsAt)}
              {event.endsAt && <span className="text-muted"> – {formatEventDateTime(event.endsAt)}</span>}
              {runtime && <span className="text-muted"> · {runtime}</span>}
            </>
          ) : event.startsAt ? (
            // Holds the line until the browser can write the local time.
            "\u00a0"
          ) : (
            <span className="text-muted">No date yet</span>
          )}
        </p>
        <EventDetails event={event} />
      </section>

      <h2 className="mb-2 mt-6 px-1 text-[12px] font-medium uppercase tracking-wide text-muted">Setup</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        {EVENT_VIEWS.map((view) => (
          <li key={view.key}>
            <button
              type="button"
              onClick={() => onOpenView(view.key)}
              className="press-ghost-fit flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] font-medium hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <span className="flex-1">{view.label}</span>
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </SubPage>
  );
}
