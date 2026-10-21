"use client";

import { useState } from "react";
import type { EventPerson, EventSummary } from "@/lib/events";
import { EVENT_VIEWS, EventOverview, SubPage, type EventViewKey } from "./EventOverview";
import { EventsList } from "./EventsList";
import { PageStack, type StackPage } from "./PageStack";
import { eventTitle } from "./eventFormat";

export type EventsRoute = { eventId: string | null; view: EventViewKey | null };

// The list side of the Forms page: Events, then an event's own page, then
// one of its setup views — each sliding in over the last. Which is open is
// the page's (route), as the map shows the open event's own pins.
export function EventsPane({
  events,
  people,
  route,
  onRoute: setRoute,
}: {
  events: EventSummary[];
  people: EventPerson[];
  route: EventsRoute;
  onRoute: (route: EventsRoute) => void;
}) {
  // Showing the Archive rather than current events.
  const [archived, setArchived] = useState(false);
  // An event that's gone (deleted elsewhere) takes its pages with it.
  const event = route.eventId ? events.find((e) => e.id === route.eventId) : undefined;

  const pages: StackPage[] = [
    {
      key: "events",
      node: (
        <EventsList
          events={events}
          archived={archived}
          onToggleArchived={() => setArchived((a) => !a)}
          onOpen={(eventId) => setRoute({ eventId, view: null })}
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
          >
            <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-16 text-center">
              <p className="text-[17px] font-medium">Nothing here yet</p>
              <p className="text-sm text-muted">The checklist for {eventTitle(event)} will be set up here.</p>
            </div>
          </SubPage>
        ),
      });
    }
  }

  return <PageStack pages={pages} />;
}
