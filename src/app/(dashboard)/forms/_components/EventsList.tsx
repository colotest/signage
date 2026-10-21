"use client";

import { useState, type ReactNode } from "react";
import type { EventPerson, EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { eventTitle, formatEventDate, formatRuntime, useIsClient } from "./eventFormat";
import { NewEventButton } from "./NewEventDialog";

// The Forms page's first page: every event, as cards in the Playlists
// list's style. The arrowhead opens a card in place to show who's on it;
// anywhere else on the card goes on to the event's own page.
export function EventsList({
  events,
  people,
  onOpen,
}: {
  events: EventSummary[];
  people: EventPerson[];
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="px-4 pb-10 pt-5 md:px-5 md:pt-6">
      <div className="mb-4 flex min-h-[var(--title-action)] items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight">Events</h1>
        <NewEventButton people={people} />
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-16 text-center">
          <p className="text-[17px] font-medium">No events yet</p>
          <p className="text-sm text-muted">Press + to add one.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              isExpanded={expanded.has(event.id)}
              onToggle={() => toggle(event.id)}
              onOpen={() => onOpen(event.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  isExpanded,
  onToggle,
  onOpen,
}: {
  event: EventSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const isClient = useIsClient();
  const runtime = formatRuntime(event.startsAt, event.endsAt);
  // The details stay mounted while the card slides shut.
  const [contentMounted, setContentMounted] = useState(isExpanded);
  if (isExpanded && !contentMounted) setContentMounted(true);

  return (
    <li
      onClick={(e) => {
        // Links in the details (phone, email) do their own thing.
        if ((e.target as Element).closest("a, [data-no-open]")) return;
        onOpen();
      }}
      className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface p-3 hover:bg-black/[.015] dark:hover:bg-white/[.02]"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-no-open
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Hide details" : "Show details"}
          // A bigger target than the arrowhead itself, without growing the row.
          className="no-press -m-2 p-2 text-muted"
        >
          <Chevron open={isExpanded} />
        </button>

        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{eventTitle(event)}</span>

        <span className="shrink-0 text-[12px] text-muted">
          {event.startsAt ? (isClient ? formatEventDate(event.startsAt) : "") : "No date"}
        </span>
        {runtime && <span className="shrink-0 text-[12px] tabular-nums text-muted">{runtime}</span>}
      </div>

      {/* Slides open and shut by animating the grid row between 0fr and 1fr,
          as the playlists do. */}
      <div
        inert={!isExpanded}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !isExpanded) setContentMounted(false);
        }}
        className={cn(
          "grid transition-[grid-template-rows] duration-[400ms] ease-[var(--ease-spring)]",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {contentMounted && (
            <div className="mt-3 border-t border-border pt-3">
              <EventDetails event={event} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// Lead, customer and contact, as label/value rows. Also the top of the
// event's own page.
export function EventDetails({ event }: { event: EventSummary }) {
  const contact = [
    event.contactName,
    event.contactPhone && (
      <a key="phone" href={`tel:${event.contactPhone.replace(/[^\d+]/g, "")}`} className="text-accent hover:underline">
        {event.contactPhone}
      </a>
    ),
    event.contactEmail && (
      <a key="email" href={`mailto:${event.contactEmail}`} className="break-all text-accent hover:underline">
        {event.contactEmail}
      </a>
    ),
  ].filter(Boolean);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      <Detail label="Lead">{event.leadName}</Detail>
      <Detail label="Customer">{event.customer}</Detail>
      <Detail label="Contact">
        {contact.length > 0 ? (
          <span className="flex flex-col">
            {contact.map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </span>
        ) : null}
      </Detail>
    </dl>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children || <span className="text-muted">—</span>}</dd>
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
