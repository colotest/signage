"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons/PlaybackIcons";
import { Menu } from "@/components/ui/Menu";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { archiveEvent, deleteEvent, unarchiveEvent } from "@/lib/actions/events";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { MENU_ITEM_CLASS, ThreeDotIcon } from "../../library/_components/FileTree";
import { ArchiveIcon, EventDetails } from "./EventsList";
import { eventTitle, formatEventDate, formatEventRange, formatRuntime, useIsClient } from "./eventFormat";

// The setup views an event has, each its own page.
export const EVENT_VIEWS = [{ key: "checkliste", label: "Checkliste" }] as const;
export type EventViewKey = (typeof EVENT_VIEWS)[number]["key"];

// A page pushed onto the list side: a round ‹ back to where it came from,
// beside its title, and anything else (a "⋯") at the far end.
export function SubPage({
  title,
  backLabel,
  onBack,
  trailing,
  children,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 pb-10 pt-5 md:px-5 md:pt-6">
      <div className="mb-4 flex min-h-[var(--title-action)] items-center gap-3">
        <button type="button" onClick={onBack} title={backLabel} aria-label={backLabel} className={POPUP_WHITE_BUTTON}>
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[28px] font-semibold tracking-tight">{title}</h1>
        {trailing}
      </div>
      {children}
    </div>
  );
}

// An event's own page: its details in brief, then the setup views to go on
// to. A current event has a "⋯" with Archive; an archived one (opened from
// the Archive) says so at the top instead, with Unarchive and Delete.
// onGone: it's been archived, brought back or deleted, and isn't in the
// list it was opened from any more.
export function EventOverview({
  event,
  onBack,
  onOpenView,
  onGone,
}: {
  event: EventSummary;
  onBack: () => void;
  onOpenView: (view: EventViewKey) => void;
  onGone: () => void;
}) {
  const isClient = useIsClient();
  const runtime = formatRuntime(event.startsAt, event.endsAt);
  const archived = event.archivedAt !== null;
  // Dates are local times, so only written once in the browser.
  const dates =
    event.startsAt && isClient
      ? `${formatEventRange(event.startsAt, event.endsAt)}${runtime ? ` · ${runtime}` : ""}`
      : null;

  return (
    <SubPage
      title={eventTitle(event)}
      backLabel={archived ? "Back to Archive" : "Back to Events"}
      onBack={onBack}
      trailing={archived ? null : <EventMenuButton event={event} onArchived={onGone} />}
    >
      {archived && <ArchivedBar event={event} onGone={onGone} isClient={isClient} />}

      <section className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
        <EventDetails event={event} dates={dates} />
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

// The "⋯" opposite the ‹: a little menu, for now just Archive — which asks
// once more, in the menu itself, before it goes ahead.
function EventMenuButton({ event, onArchived }: { event: EventSummary; onArchived: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setConfirming(false);
    setError(null);
  }

  function archive() {
    startTransition(async () => {
      try {
        await archiveEvent(event.id);
        close();
        onArchived();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't archive the event");
      }
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Event options"
        aria-expanded={open}
        className="title-action-round shrink-0 bg-black/[.05] text-muted shadow-[var(--shadow-control)] transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="title-action-glyph" />
      </button>

      <Menu open={open} onClose={close} anchorRef={anchorRef} className="w-56 p-1">
        {confirming ? (
          <div className="pop-in origin-top px-2.5 pb-1.5 pt-1.5">
            <p className="text-[13px] font-medium">Archive “{eventTitle(event)}”?</p>
            <p className="mt-0.5 text-[12px] text-muted">It moves to the Archive, where it can be brought back.</p>
            {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
            <div className="mt-2.5 flex items-center justify-end gap-3 text-[13px]">
              <button type="button" onClick={() => setConfirming(false)} className="press-ghost text-muted hover:opacity-70">
                Cancel
              </button>
              <button
                type="button"
                onClick={archive}
                disabled={pending}
                className="press-ghost font-medium text-accent hover:opacity-70 disabled:opacity-40"
              >
                Archive
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={cn(MENU_ITEM_CLASS, "flex items-center gap-2")}>
            <ArchiveIcon className="h-4 w-4 text-muted" />
            Archive
          </button>
        )}
      </Menu>
    </div>
  );
}

// Across the top of an archived event's page: when it was archived, and
// Unarchive or Delete (which asks first — there's no getting it back).
function ArchivedBar({ event, onGone, isClient }: { event: EventSummary; onGone: () => void; isClient: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onGone();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't work");
      }
    });
  }

  return (
    <div className="mb-3 rounded-[var(--radius-md)] bg-black/[.04] px-3.5 py-3 dark:bg-white/[.06]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ArchiveIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-[13px] text-muted">
          Archived{event.archivedAt && isClient ? ` on ${formatEventDate(event.archivedAt)}` : ""}
        </span>
        {confirmingDelete ? (
          <div className="pop-in flex shrink-0 origin-right items-center gap-3 text-[13px]">
            <span className="text-muted">Delete for good?</span>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="press-ghost text-muted hover:opacity-70">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteEvent(event.id))}
              className="press-ghost font-medium text-danger hover:opacity-70 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unarchiveEvent(event.id))}
              className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90 disabled:opacity-40"
            >
              Unarchive
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full bg-danger px-3.5 py-1.5 text-[13px] font-medium text-white shadow-[var(--shadow-control)] hover:opacity-90 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
