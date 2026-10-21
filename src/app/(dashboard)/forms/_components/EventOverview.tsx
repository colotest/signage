"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons/PlaybackIcons";
import { Menu } from "@/components/ui/Menu";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { archiveEvent, deleteEvent, unarchiveEvent, updateEvent, type EventPatch } from "@/lib/actions/events";
import type { EventPerson, EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { MENU_ITEM_CLASS, ThreeDotIcon } from "../../library/_components/FileTree";
import { EventDatesSection } from "./EventCalendar";
import { ArchiveIcon } from "./EventsList";
import { eventTitle, formatEventDate, useIsClient } from "./eventFormat";

// The setup views an event has, each its own page.
export const EVENT_VIEWS = [{ key: "checkliste", label: "Checkliste" }] as const;
export type EventViewKey = (typeof EVENT_VIEWS)[number]["key"];

// A page pushed onto the list side: a round ‹ back to where it came from,
// beside its title, and anything else (a "⋯") at the far end.
export function SubPage({
  title,
  titleNode,
  backLabel,
  onBack,
  trailing,
  children,
}: {
  title: string;
  // In place of the plain title (an editable one, say).
  titleNode?: ReactNode;
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
        {titleNode ?? <h1 className="min-w-0 flex-1 truncate text-[28px] font-semibold tracking-tight">{title}</h1>}
        {trailing}
      </div>
      {children}
    </div>
  );
}

// An event's own page: its dates as a slit of calendar, its lead,
// customer and contact, then the setup views to go on to. Everything at the
// top is changed in place: tap a value to write over it (a new event comes
// with its fields' names to start from), the lead to pick another, the
// calendar to open its dates. A current event has a "⋯" with Archive; an
// archived one (opened from the Archive) says so at the top instead, with
// Unarchive and Delete. onGone: it's been archived, brought back or deleted,
// and isn't in the list it was opened from any more.
export function EventOverview({
  event,
  people,
  onBack,
  onOpenView,
  onGone,
}: {
  event: EventSummary;
  people: EventPerson[];
  onBack: () => void;
  onOpenView: (view: EventViewKey) => void;
  onGone: () => void;
}) {
  const router = useRouter();
  const isClient = useIsClient();
  const archived = event.archivedAt !== null;
  const [error, setError] = useState<string | null>(null);

  function save(patch: EventPatch) {
    setError(null);
    updateEvent(event.id, patch).then(
      (message) => {
        if (message) setError(message);
        else router.refresh();
      },
      () => setError("Couldn't save that"),
    );
  }

  return (
    <SubPage
      title={eventTitle(event)}
      titleNode={
        <EditableText
          value={event.title}
          placeholder="Untitled Event"
          label="Title"
          onSave={(title) => save({ title })}
          className="min-w-0 flex-1 text-[28px] font-semibold tracking-tight"
          as="h1"
        />
      }
      backLabel={archived ? "Back to Archive" : "Back to Events"}
      onBack={onBack}
      trailing={archived ? null : <EventMenuButton event={event} onArchived={onGone} />}
    >
      {archived && <ArchivedBar event={event} onGone={onGone} isClient={isClient} />}

      <EventDatesSection key={event.id} event={event} />

      {/* On the page itself, like a subtitle under the title, without labels
          — lined up with the "Setup" heading below. */}
      <section className="flex flex-col gap-3 px-1 text-[16px] leading-snug">
        <LeadPicker people={people} event={event} onPick={(leadId) => save({ leadId })} />
        <div className="flex flex-col">
          <EditableText value={event.customer} placeholder="Customer" label="Customer" onSave={(customer) => save({ customer })} />
          <EditableText
            value={event.contactName}
            placeholder="Contact Name"
            label="Contact name"
            onSave={(contactName) => save({ contactName })}
          />
          <EditableText
            value={event.contactPhone}
            placeholder="Phone"
            label="Phone"
            inputType="tel"
            onSave={(contactPhone) => save({ contactPhone })}
            link={event.contactPhone ? { href: `tel:${event.contactPhone.replace(/[^\d+]/g, "")}`, label: "Call", icon: <PhoneIcon /> } : undefined}
          />
          <EditableText
            value={event.contactEmail}
            placeholder="Email"
            label="Email"
            inputType="email"
            onSave={(contactEmail) => save({ contactEmail })}
            link={event.contactEmail ? { href: `mailto:${event.contactEmail}`, label: "Write an email", icon: <MailIcon /> } : undefined}
          />
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}
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

// A value that turns into a field when tapped, and saves when left (or on
// Return; Escape puts it back). Empty, it shows its placeholder, muted, so
// there's still something to tap. Cleared, the value goes (null). link: a
// little button after it that acts on the value — call, write — since
// tapping the value itself edits it.
function EditableText({
  value,
  placeholder,
  label,
  onSave,
  inputType = "text",
  link,
  className,
  as: Tag = "span",
}: {
  value: string | null;
  placeholder: string;
  label: string;
  onSave: (next: string) => void;
  inputType?: "text" | "tel" | "email";
  link?: { href: string; label: string; icon: ReactNode };
  className?: string;
  as?: "span" | "h1";
}) {
  const [editing, setEditing] = useState(false);
  // Shown at once on saving, rather than after the round trip brings it
  // back down — a new value from the server replaces it (during render).
  const [shown, setShown] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setShown(value);
  }

  function commit(next: string) {
    setEditing(false);
    const trimmed = next.trim();
    if (trimmed === (shown ?? "")) return;
    setShown(trimmed || null);
    onSave(trimmed);
  }

  if (editing) {
    return (
      <input
        ref={(node) => {
          node?.focus();
          node?.select();
        }}
        type={inputType}
        defaultValue={shown ?? ""}
        placeholder={placeholder}
        aria-label={label}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEditing(false);
        }}
        className={cn(
          "-mx-1 min-w-0 rounded-[6px] bg-black/[.04] px-1 outline-none ring-1 ring-accent dark:bg-white/[.06]",
          className,
        )}
      />
    );
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-2", Tag === "h1" && "flex-1")}>
      <Tag className={cn("min-w-0 truncate", className)}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={`Edit ${label.toLowerCase()}`}
          className={cn("no-press max-w-full truncate text-left", !shown && "text-muted")}
        >
          {shown || placeholder}
        </button>
      </Tag>
      {link && (
        <a
          href={link.href}
          title={link.label}
          aria-label={link.label}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10"
        >
          {link.icon}
        </a>
      )}
    </span>
  );
}

// The lead's name; tapping it opens everyone who can lead (the Events
// Management role, and whoever's looking) to pick from.
function LeadPicker({
  people,
  event,
  onPick,
}: {
  people: EventPerson[];
  event: EventSummary;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  // As with the text fields, shown before the save comes back.
  const [picked, setPicked] = useState<{ id: string | null; name: string | null } | null>(null);
  const [synced, setSynced] = useState(event.leadId);
  if (event.leadId !== synced) {
    setSynced(event.leadId);
    setPicked(null);
  }
  const leadId = picked ? picked.id : event.leadId;
  const leadName = picked ? picked.name : event.leadName;

  function pick(person: EventPerson | null) {
    setOpen(false);
    if ((person?.id ?? null) === leadId) return;
    setPicked({ id: person?.id ?? null, name: person?.name ?? null });
    onPick(person?.id ?? null);
  }

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Change lead"
        className={cn("no-press max-w-full truncate text-left", !leadName && "text-muted")}
      >
        {leadName || "Lead"}
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="start" className="w-56 p-1">
        <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Lead</div>
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => pick(person)}
            className={cn(MENU_ITEM_CLASS, "flex items-center justify-between gap-2")}
          >
            <span className="truncate">{person.name}</span>
            {person.id === leadId && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
          </button>
        ))}
        {leadId && (
          <button type="button" onClick={() => pick(null)} className={cn(MENU_ITEM_CLASS, "text-muted")}>
            No lead
          </button>
        )}
      </Menu>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M6.6 3.5h2.5l1.4 4-1.9 1.3a11 11 0 0 0 6.6 6.6l1.3-1.9 4 1.4v2.5a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" strokeLinejoin="round" />
    </svg>
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
