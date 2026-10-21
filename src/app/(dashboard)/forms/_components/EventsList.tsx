"use client";

import { useState } from "react";
import type { EventPerson, EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { SearchField } from "../../library/_components/SearchField";
import { eventTitle, formatEventDate, formatRuntime, useIsClient } from "./eventFormat";
import { NewEventButton } from "./NewEventDialog";

// Lower-case and without accents, so "prämiere" finds "Premiere" and
// "Prämiere" alike.
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function matches(event: EventSummary, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(
    [eventTitle(event), event.customer, event.leadName, event.contactName, event.contactEmail, event.contactPhone]
      .filter(Boolean)
      .join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

// The Forms page's first page: every event, as cards in the Playlists
// list's style. The arrowhead opens a card in place to show who's on it;
// anywhere else on the card goes on to the event's own page. The archive
// glyph beside the + switches the list over to archived events (and back);
// the search, as in the Media list, narrows whichever list is showing.
export function EventsList({
  events,
  people,
  archived,
  onToggleArchived,
  onOpen,
}: {
  events: EventSummary[];
  people: EventPerson[];
  archived: boolean;
  onToggleArchived: () => void;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inList = events.filter((e) => (e.archivedAt !== null) === archived);
  const shown = inList.filter((e) => matches(e, query));

  return (
    <div className="px-4 pb-10 pt-5 md:px-5 md:pt-6">
      {/* search-row: the search opens from just after the title into the
          row's spare width, the buttons staying against the right edge —
          and on a phone the archive button dissolves to make room, as
          Upload does in the Media list (see SearchField, globals.css). */}
      <div className="search-row relative mb-4 flex min-h-[var(--title-action)] items-center gap-3">
        <h1 className="shrink-0 text-[28px] font-semibold tracking-tight">{archived ? "Archive" : "Events"}</h1>
        <SearchField onQueryChange={setQuery} label="Search events" />
        <div className="relative ml-auto flex shrink-0 items-center gap-3">
          <span className="search-yields shrink-0">
            <button
              type="button"
              onClick={onToggleArchived}
              aria-pressed={archived}
              title={archived ? "Back to Events" : "Archived events"}
              aria-label={archived ? "Back to Events" : "Archived events"}
              className={cn(
                "title-action-round shrink-0 shadow-[var(--shadow-control)] transition-colors",
                archived
                  ? "bg-foreground text-background"
                  : "bg-black/[.05] text-muted hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]",
              )}
            >
              <ArchiveIcon className="title-action-glyph" />
            </button>
          </span>
          <NewEventButton people={people} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-16 text-center">
          {inList.length > 0 ? (
            <p className="text-[17px] font-medium">No events match “{query.trim()}”</p>
          ) : archived ? (
            <>
              <p className="text-[17px] font-medium">Nothing archived</p>
              <p className="text-sm text-muted">Events you archive from their ⋯ menu end up here.</p>
            </>
          ) : (
            <>
              <p className="text-[17px] font-medium">No events yet</p>
              <p className="text-sm text-muted">Press + to add one.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((event) => (
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

export function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2" />
      <path d="M5 9v9.3A1.7 1.7 0 0 0 6.7 20h10.6a1.7 1.7 0 0 0 1.7-1.7V9" />
      <path d="M10 13h4" strokeLinecap="round" />
    </svg>
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
  // Counted in local days when a time is blank, so only in the browser.
  const runtime = isClient ? formatRuntime(event) : null;
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

// Lead, then the customer with their contact, as plain values, a size up
// from the list's text — whatever isn't known yet is simply left out. Also
// the top of the event's own page, under its dates.
export function EventDetails({ event, dates }: { event: EventSummary; dates?: string | null }) {
  const contact = [
    event.contactName && <span key="name">{event.contactName}</span>,
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

  const blocks = [
    dates && (
      <p key="dates" className="font-medium tabular-nums">
        {dates}
      </p>
    ),
    event.leadName && <p key="lead">{event.leadName}</p>,
    (event.customer || contact.length > 0) && (
      <div key="customer" className="flex flex-col">
        {event.customer && <span>{event.customer}</span>}
        {contact}
      </div>
    ),
  ].filter(Boolean);

  if (blocks.length === 0) return <p className="text-[16px] text-muted">No details yet</p>;
  return <div className="flex flex-col gap-2 text-[16px] leading-snug">{blocks}</div>;
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
