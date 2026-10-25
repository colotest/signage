"use client";

import { useSearchParams } from "next/navigation";
import type { EventPerson, EventSummary } from "@/lib/events";
import { EVENT_VIEWS, EventOverview, SubPage, type EventViewKey } from "./EventOverview";
import { EventsList } from "./EventsList";
import { PageStack, type StackPage } from "./PageStack";
import { eventTitle } from "./eventFormat";
import { Checklist } from "./Checklist";
import { ShareChecklist } from "./ShareChecklist";

type Route = { eventId: string | null; view: EventViewKey | null; archived: boolean };

// The list side of the Forms page: Events, then an event's own page, then
// one of its setup views — each sliding in over the last.
//
// Where it is lives in the URL (?event=…&view=…, and &archive=1 for the
// Archive), not in component state: a reload — Next.js does a full one when
// a save's answer comes from a newer deployment than the page — lands back
// on the same page instead of the Events list, and the browser's back and
// forward step through the pages too. Changed with history.pushState, which
// Next picks up in useSearchParams without asking the server for anything.
export function EventsPane({
  events,
  people,
  previewIds,
  onPreview,
}: {
  events: EventSummary[];
  people: EventPerson[];
  // The events the list's calendar is showing on the map (see ScheduleCalendar).
  previewIds: string[];
  onPreview: (ids: string[]) => void;
}) {
  const params = useSearchParams();
  const route: Route = {
    eventId: params.get("event"),
    view: EVENT_VIEWS.find((v) => v.key === params.get("view"))?.key ?? null,
    archived: params.get("archive") === "1",
  };
  const archived = route.archived;

  function setRoute(next: Partial<Route>) {
    const merged = { ...route, ...next };
    const url = new URL(window.location.href);
    for (const key of ["event", "view", "archive"]) url.searchParams.delete(key);
    if (merged.archived) url.searchParams.set("archive", "1");
    if (merged.eventId) url.searchParams.set("event", merged.eventId);
    if (merged.eventId && merged.view) url.searchParams.set("view", merged.view);
    window.history.pushState(null, "", url);
  }
  // An event that's gone (deleted elsewhere) takes its pages with it.
  const event = route.eventId ? events.find((e) => e.id === route.eventId) : undefined;

  const pages: StackPage[] = [
    {
      key: "events",
      node: (
        <EventsList
          events={events}
          archived={archived}
          onToggleArchived={() => setRoute({ archived: !archived })}
          onOpen={(eventId) => {
            // Opened, it's the event the map shows anyway.
            onPreview([]);
            setRoute({ eventId, view: null });
          }}
          previewIds={previewIds}
          onPreview={onPreview}
        />
      ),
    },
  ];
  if (event) {
    pages.push({
      key: `event:${event.id}`,
      node: (
        <EventOverview
          event={event}
          people={people}
          onBack={() => setRoute({ eventId: null, view: null })}
          onOpenView={(view) => setRoute({ eventId: event.id, view })}
          onGone={() => setRoute({ eventId: null, view: null })}
        />
      ),
    });
    const view = EVENT_VIEWS.find((v) => v.key === route.view);
    if (view) {
      pages.push({
        key: `event:${event.id}:${view.key}`,
        node: (
          <SubPage
            title={view.label}
            backLabel={`Back to ${eventTitle(event)}`}
            onBack={() => setRoute({ eventId: event.id, view: null })}
            trailing={view.key === "checkliste" ? <ShareChecklist event={event} people={people} /> : undefined}
          >
            {view.key === "checkliste" ? (
              <Checklist />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-16 text-center">
                <p className="text-[17px] font-medium">Nothing here yet</p>
                <p className="text-sm text-muted">
                  The {view.label} for {eventTitle(event)} will be set up here.
                </p>
              </div>
            )}
          </SubPage>
        ),
      });
    }
  }

  return <PageStack pages={pages} />;
}
