"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateTimePicker } from "@/components/DateTimePicker";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { Popup, POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { createEvent } from "@/lib/actions/events";
import { useViewer } from "@/lib/auth/ViewerContext";
import type { EventPerson } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { formatEventMoment } from "./eventFormat";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

// The Events list's "+", and the little two-page popup it opens: first who
// and for whom, then when. Nothing on either is required — ✓ on a blank
// form adds a blank event, to fill in later.
export function NewEventButton({ people }: { people: EventPerson[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="New Event"
        aria-label="New Event"
        className="title-action-round shrink-0 bg-accent text-accent-contrast shadow-[var(--shadow-control)] transition-opacity hover:opacity-90"
      >
        <PlusIcon className="title-action-glyph" />
      </button>
      <NewEventDialog
        open={open}
        onOpenChange={setOpen}
        people={people}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

type Draft = {
  title: string;
  customer: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  leadId: string | null;
  // The day (and, if its time is set, time) of each end. While a time is
  // blank its hours are kept, unused, for when one's added.
  startsAt: Date | null;
  endsAt: Date | null;
  startsTimeSet: boolean;
  endsTimeSet: boolean;
};

function NewEventDialog({
  open,
  onOpenChange,
  people,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: EventPerson[];
  onCreated: () => void;
}) {
  const viewer = useViewer();
  const [step, setStep] = useState<"details" | "date">("details");
  const blank = (): Draft => ({
    title: "",
    customer: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    leadId: viewer.id,
    startsAt: null,
    endsAt: null,
    startsTimeSet: false,
    endsTimeSet: false,
  });
  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every open starts afresh, on the first page.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("details");
      setDraft(blank());
      setError(null);
      setSaving(false);
    }
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createEvent({
        ...draft,
        startsAt: draft.startsAt ? effectiveStart(draft.startsAt, draft.startsTimeSet).toISOString() : null,
        endsAt: draft.endsAt ? effectiveEnd(draft.endsAt, draft.endsTimeSet).toISOString() : null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the event");
      setSaving(false);
    }
  }

  return (
    <Popup
      open={open}
      onOpenChange={onOpenChange}
      title={step === "details" ? "New Event" : "Date"}
      leading={
        step === "details" ? (
          <button type="button" onClick={() => onOpenChange(false)} title="Cancel" aria-label="Cancel" className={POPUP_WHITE_BUTTON}>
            <CloseIcon className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" onClick={() => setStep("details")} title="Back" aria-label="Back" className={POPUP_WHITE_BUTTON}>
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )
      }
      trailing={
        step === "details" ? (
          <button type="button" onClick={() => setStep("date")} title="Next" aria-label="Next" className={POPUP_BLUE_BUTTON}>
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" onClick={finish} disabled={saving} title="Add Event" aria-label="Add Event" className={POPUP_BLUE_BUTTON}>
            <CheckIcon className="h-5 w-5" />
          </button>
        )
      }
    >
      {step === "details" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep("date");
          }}
        >
          <FieldGroup>
            <Field autoFocus placeholder="Title" value={draft.title} onChange={(title) => update({ title })} />
            <Field placeholder="Customer" value={draft.customer} onChange={(customer) => update({ customer })} />
          </FieldGroup>

          <FieldGroup label="Contact">
            <Field
              placeholder="Name"
              autoComplete="off"
              value={draft.contactName}
              onChange={(contactName) => update({ contactName })}
            />
            <Field
              type="tel"
              placeholder="Phone"
              autoComplete="off"
              value={draft.contactPhone}
              onChange={(contactPhone) => update({ contactPhone })}
            />
            <Field
              type="email"
              placeholder="Email"
              autoComplete="off"
              value={draft.contactEmail}
              onChange={(contactEmail) => update({ contactEmail })}
            />
          </FieldGroup>

          <LeadPicker people={people} value={draft.leadId} onChange={(leadId) => update({ leadId })} />
          {/* Return in a field goes on to the next page, like →. */}
          <button type="submit" hidden />
        </form>
      ) : (
        <>
          <DateRange value={draft} onChange={update} />
          {error && <p className="mt-3 px-1 text-[13px] text-danger">{error}</p>}
        </>
      )}
    </Popup>
  );
}

function FieldGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <p className="mb-1.5 px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{label}</p>}
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-sm)] border border-border">
        {children}
      </div>
    </div>
  );
}

function Field({
  value,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted focus:bg-accent/[.04]"
    />
  );
}

// Lead: whoever's adding the event to start with; opens into everyone in
// the Events Management role to pick from instead.
function LeadPicker({
  people,
  value,
  onChange,
}: {
  people: EventPerson[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = people.find((p) => p.id === value);

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="no-press flex w-full items-center gap-3 px-3 py-2.5 text-left text-[15px]"
      >
        <span className="flex-1">Lead</span>
        <span className="min-w-0 truncate text-muted">{current?.name ?? "None"}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul role="radiogroup" aria-label="Lead" className="menu-pop origin-top border-t border-border py-1">
          {people.map((person) => {
            const selected = person.id === value;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onChange(person.id);
                    setOpen(false);
                  }}
                  className="press-ghost-fit flex w-full items-center gap-3 px-3 py-2 text-left text-[15px] hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                >
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  {selected && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// The next full hour — a sensible first guess at a time, should one be
// added.
function nextFullHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const DEFAULT_LENGTH_HOURS = 4;

// Without a time of day, a start is the beginning of its day and an end
// the very end of its (as stored — see 0035).
function effectiveStart(date: Date, timeSet: boolean) {
  return timeSet ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function effectiveEnd(date: Date, timeSet: boolean) {
  return timeSet ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

type DateValue = Pick<Draft, "startsAt" | "endsAt" | "startsTimeSet" | "endsTimeSet">;

// Starts and Ends, each either unset ("Add") or a day — with a time of day
// only once one's added — that opens into the calendar below it, one at a
// time, like iOS Calendar's. Moving the start keeps the event's length, so
// the end moves along with it; an end can't come before the start. The
// start can be in the past, since events are sometimes entered (or
// corrected) after the fact; the end's calendar starts at the start's day.
function DateRange({ value, onChange }: { value: DateValue; onChange: (next: DateValue) => void }) {
  const [editing, setEditing] = useState<"start" | "end" | null>(null);
  const { startsAt, endsAt, startsTimeSet, endsTimeSet } = value;

  // Pulls the end up to the start when it would come before it: to the
  // same moment when both have times, otherwise to the start's day.
  function settle(next: DateValue): DateValue {
    const { startsAt: s, endsAt: e } = next;
    if (!s || !e) return next;
    if (effectiveEnd(e, next.endsTimeSet) >= effectiveStart(s, next.startsTimeSet)) return next;
    if (next.startsTimeSet && next.endsTimeSet) return { ...next, endsAt: new Date(s) };
    const moved = new Date(e);
    moved.setFullYear(s.getFullYear(), s.getMonth(), s.getDate());
    return { ...next, endsAt: moved };
  }

  function setStart(next: Date | null) {
    // The end keeps its distance from the start.
    const end = next && startsAt && endsAt ? new Date(endsAt.getTime() + (next.getTime() - startsAt.getTime())) : endsAt;
    onChange(settle({ ...value, startsAt: next, endsAt: end, startsTimeSet: next ? startsTimeSet : false }));
  }

  function setEnd(next: Date | null) {
    onChange(settle({ ...value, endsAt: next, endsTimeSet: next ? endsTimeSet : false }));
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
      <DateRow
        label="Starts"
        value={startsAt}
        hasTime={startsTimeSet}
        open={editing === "start"}
        onToggle={() => {
          if (!startsAt) setStart(nextFullHour());
          setEditing((e) => (e === "start" ? null : "start"));
        }}
        onClear={() => {
          setStart(null);
          setEditing(null);
        }}
        onChange={setStart}
        onHasTimeChange={(startsTimeSet) => onChange(settle({ ...value, startsTimeSet }))}
        minDate={null}
      />
      <div className="border-t border-border" />
      <DateRow
        label="Ends"
        value={endsAt}
        hasTime={endsTimeSet}
        open={editing === "end"}
        onToggle={() => {
          if (!endsAt) {
            // The start's day, and a few hours after its time, should one
            // be added.
            const from = startsAt ?? nextFullHour();
            const end = new Date(from);
            end.setHours(Math.min(23, from.getHours() + DEFAULT_LENGTH_HOURS), from.getMinutes(), 0, 0);
            setEnd(end);
          }
          setEditing((e) => (e === "end" ? null : "end"));
        }}
        onClear={() => {
          setEnd(null);
          setEditing(null);
        }}
        onChange={setEnd}
        onHasTimeChange={(endsTimeSet) => onChange(settle({ ...value, endsTimeSet }))}
        minDate={startsAt}
      />
    </div>
  );
}

function DateRow({
  label,
  value,
  hasTime,
  open,
  onToggle,
  onClear,
  onChange,
  onHasTimeChange,
  minDate,
}: {
  label: string;
  value: Date | null;
  hasTime: boolean;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onChange: (next: Date) => void;
  onHasTimeChange: (hasTime: boolean) => void;
  minDate: Date | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-[15px]">{label}</span>
        {value && (
          <button
            type="button"
            onClick={onClear}
            title={`Remove ${label.toLowerCase()} date`}
            aria-label={`Remove ${label.toLowerCase()} date`}
            className="no-press flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "no-press rounded-[8px] bg-black/[.05] px-2.5 py-1.5 text-[15px] tabular-nums transition-colors dark:bg-white/[.08]",
            open || !value ? "text-accent" : "text-foreground",
          )}
        >
          {value ? formatEventMoment(value, hasTime) : "Add"}
        </button>
      </div>
      {open && value && (
        <div className="menu-pop origin-top border-t border-border px-2 pb-3 pt-3">
          <DateTimePicker
            value={value}
            onChange={onChange}
            minDate={minDate}
            hasTime={hasTime}
            onHasTimeChange={onHasTimeChange}
          />
        </div>
      )}
    </div>
  );
}
