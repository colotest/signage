"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Menu } from "@/components/ui/Menu";
import { createPresetEvent } from "@/lib/actions/events";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { SearchField } from "../../library/_components/SearchField";
import { ThreeDotIcon } from "../../library/_components/FileTree";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { eventTitle, formatEventDate, formatRuntime, useIsClient } from "./eventFormat";

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

type SortKey = "start" | "title" | "customer" | "pax";
type SortDir = "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "start", label: "Start Date" },
  { key: "title", label: "Title" },
  { key: "customer", label: "Customer" },
  { key: "pax", label: "PAX" },
];

// In the order picked — except that an event without the value sorted by
// (no date, no customer, no PAX) always goes last, whichever way.
function sortEvents(events: EventSummary[], key: SortKey, dir: SortDir) {
  const value = (e: EventSummary): string | number | null => {
    switch (key) {
      case "start":
        return e.startsAt ? new Date(e.startsAt).getTime() : null;
      case "title":
        return fold(eventTitle(e));
      case "customer":
        return e.customer?.trim() ? fold(e.customer) : null;
      case "pax":
        return e.pax;
    }
  };
  return [...events].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
    return dir === "asc" ? cmp : -cmp;
  });
}

// The Forms page's first page: every event, as cards in the Playlists
// list's style. The arrowhead opens a card in place to show who's on it;
// anywhere else on the card goes on to the event's own page. "+ Create" at
// the top, as in the Playlists list, adds an event filled in with its
// fields' names and opens it to be written over. The archive glyph
// switches the list over to archived events (and back), and the "⋯" beside
// it sorts them (by start date, unless picked otherwise); the search, as in
// the Media list, narrows whichever list is showing. Above the current
// events, a calendar of them all (see ScheduleCalendar).
export function EventsList({
  events,
  archived,
  onToggleArchived,
  onOpen,
  previewId,
  onPreview,
}: {
  events: EventSummary[];
  archived: boolean;
  onToggleArchived: () => void;
  onOpen: (id: string) => void;
  // The event the calendar is showing on the map, while scrubbing through it.
  previewId: string | null;
  onPreview: (id: string | null) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("start");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [creating, startCreating] = useTransition();

  function create() {
    startCreating(async () => {
      const id = await createPresetEvent();
      // Its page slides in as soon as the refreshed list has it.
      onOpen(id);
      router.refresh();
    });
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inList = events.filter((e) => (e.archivedAt !== null) === archived);
  const shown = sortEvents(
    inList.filter((e) => matches(e, query)),
    sortKey,
    sortDir,
  );

  return (
    <div className="px-4 pb-10 pt-5 md:px-5 md:pt-6">
      {/* search-row: the search opens from just after the title into the
          row's spare width, the buttons staying against the right edge —
          and on a phone the archive button dissolves to make room, as
          Upload does in the Media list (see SearchField, globals.css) —
          its offset there allows for the one round button after it, here
          the sort "⋯". */}
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
          <SortMenuButton
            sortKey={sortKey}
            sortDir={sortDir}
            onPick={(key) => {
              // The same one again turns it round; another starts its own
              // natural way (soonest, A–Z, smallest).
              if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              else {
                setSortKey(key);
                setSortDir("asc");
              }
            }}
          />
        </div>
      </div>

      {!archived && (
        <ScheduleCalendar
          events={inList}
          previewId={previewId}
          onPreview={onPreview}
          onOpen={onOpen}
        />
      )}

      <ul className="flex flex-col gap-3">
        {/* Only among current events — nothing's made straight into the
            Archive. */}
        {!archived && !query.trim() && (
          <li>
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="press-ghost-fit flex w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border p-3 text-[15px] font-medium text-accent hover:bg-black/[.02] disabled:opacity-40 dark:hover:bg-white/[.03]"
            >
              + Create
            </button>
          </li>
        )}
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

      {shown.length === 0 && (archived || query.trim()) && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-16 text-center">
          {inList.length > 0 ? (
            <p className="text-[17px] font-medium">No events match “{query.trim()}”</p>
          ) : (
            <>
              <p className="text-[17px] font-medium">Nothing archived</p>
              <p className="text-sm text-muted">Events you archive from their ⋯ menu end up here.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The "⋯" beside the Archive button: what the list is sorted by. Picking the
// one in use again turns it round. Stays open, as the Playlists' does, to
// try a few.
function SortMenuButton({
  sortKey,
  sortDir,
  onPick,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onPick: (key: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Sort events"
        aria-expanded={open}
        className="title-action-round shrink-0 bg-black/[.05] text-muted shadow-[var(--shadow-control)] transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="title-action-glyph" />
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} className="w-44 p-1">
        <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Sort by</div>
        {SORTS.map((sort) => {
          const active = sort.key === sortKey;
          return (
            <button
              key={sort.key}
              type="button"
              onClick={() => onPick(sort.key)}
              className={cn(
                "press-ghost-fit flex w-full items-center justify-between rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                active ? "font-medium text-foreground" : "text-muted",
              )}
            >
              {sort.label}
              {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
            </button>
          );
        })}
      </Menu>
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
