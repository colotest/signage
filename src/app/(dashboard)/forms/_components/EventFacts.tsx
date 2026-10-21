"use client";

import { useRef, useState, type ReactNode } from "react";
import { Menu } from "@/components/ui/Menu";
import { EVENT_TYPES, type EventTypeKey } from "@/lib/eventTypes";
import { cn } from "@/lib/utils/cn";

// The event's type: a rounded square with the type's icon and name — or,
// before one's picked, just "Typ", breathing like the other fields still
// to fill in. Pressed, a grid of the six types pops up from it to pick from.
export function EventTypeTile({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (type: EventTypeKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  // Shown at once, rather than after the save comes back.
  const [picked, setPicked] = useState<string | null>(null);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setPicked(null);
  }
  const current = EVENT_TYPES.find((t) => t.key === (picked ?? value));

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={current ? `Type: ${current.label}` : "Pick a type"}
        // Just an outline, the icon in the text's own colour (white in dark
        // mode).
        className="no-press relative flex aspect-square w-[112px] items-center justify-center rounded-[var(--radius-md)] border-[3px] border-foreground/25 p-2 transition-colors hover:border-foreground/40"
      >
        {current ? (
          <>
            {/* The icon always dead centre, whatever the name under it —
                one line or two. */}
            <EventTypeIcon type={current.key} className="h-8 w-8 text-foreground" />
            {/* The contact's size, in PAX's colour. */}
            <span className="absolute inset-x-1 top-[calc(50%+17px)] whitespace-pre-line text-center text-[16px] font-semibold leading-[1.1] text-muted">
              {stacked(current.label)}
            </span>
          </>
        ) : (
          <span className="unset-breathe text-[17px] font-semibold">Typ</span>
        )}
      </button>

      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="center" dragSelect={false} className="p-2">
        <div role="radiogroup" aria-label="Type" className="grid w-[264px] grid-cols-3 gap-2">
          {EVENT_TYPES.map((type) => {
            const selected = type.key === current?.key;
            return (
              <button
                key={type.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  if (selected) return;
                  setPicked(type.key);
                  onPick(type.key);
                }}
                className={cn(
                  "no-press flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--radius-sm)] p-1.5 transition-colors",
                  selected
                    ? "bg-accent text-accent-contrast shadow-[var(--shadow-control)]"
                    : "bg-black/[.04] hover:bg-black/[.07] dark:bg-white/[.06] dark:hover:bg-white/[.1]",
                )}
              >
                <EventTypeIcon type={type.key} className={cn("h-7 w-7", !selected && "text-accent")} />
                <span className="whitespace-pre-line text-center text-[11px] font-semibold leading-tight">
                  {stacked(type.label)}
                </span>
              </button>
            );
          })}
        </div>
      </Menu>
    </>
  );
}

// What a value waiting to be edited takes: a double-click (or double-tap)
// to start editing — a single one is left to the text, so it can be
// selected and copied like any other — or, from the keyboard, Return.
// Plain text rather than a button, which wouldn't let its text be
// selected at all.
export function doubleClickToEdit(label: string, onEdit: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    title: `Double-click to edit ${label.toLowerCase()}`,
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault();
      onEdit();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onEdit();
      }
    },
  };
}

// A two-part name ("Kongress/Tagung") broken after its slash, so it stacks
// in its square rather than running over the edges.
function stacked(label: string) {
  return label.replace("/", "/\n");
}

const MAX_PAX = 9999;

// How many guests are expected: a large number over a small "PAX". Unset,
// it reads 000, breathing like the other fields still to fill in.
// Double-clicked, it's typed over — digits only, up to four of them.
export function PaxField({ value, onSave }: { value: number | null; onSave: (pax: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setShown(value);
  }

  function commit(text: string) {
    setEditing(false);
    const digits = text.replace(/\D/g, "").slice(0, 4);
    const next = digits ? Math.min(Number(digits), MAX_PAX) : null;
    if (next === shown) return;
    setShown(next);
    onSave(next);
  }

  const number = "text-[34px] font-semibold leading-none tracking-tight tabular-nums";

  return (
    <div className="flex flex-col items-center gap-1">
      {editing ? (
        <input
          ref={(node) => {
            if (!node || node.dataset.ready) return;
            node.dataset.ready = "1";
            node.focus();
            node.select();
          }}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          maxLength={4}
          defaultValue={shown === null ? "" : String(shown)}
          placeholder="000"
          aria-label="PAX"
          onInput={(e) => {
            const el = e.currentTarget;
            const digits = el.value.replace(/\D/g, "").slice(0, 4);
            if (digits !== el.value) el.value = digits;
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditing(false);
          }}
          className={cn(
            number,
            "w-[4.2ch] rounded-[6px] bg-black/[.04] text-center outline-none ring-1 ring-accent dark:bg-white/[.06]",
          )}
        />
      ) : (
        <span
          {...doubleClickToEdit("PAX", () => setEditing(true))}
          aria-label={shown === null ? "Enter PAX" : `PAX: ${shown}`}
          className={cn("cursor-text select-text outline-none focus-visible:ring-2 focus-visible:ring-accent", number, shown === null && "unset-breathe")}
        >
          {shown === null ? "000" : shown}
        </span>
      )}
      {/* The contact's size, like the type tile's name. */}
      <span className="text-[16px] font-semibold tracking-wide text-muted">PAX</span>
    </div>
  );
}

export function EventTypeIcon({ type, className }: { type: EventTypeKey; className?: string }) {
  const icons: Record<EventTypeKey, ReactNode> = {
    // A stand with a banner across its top.
    messe: (
      <>
        <path d="M4 9.5V20M20 9.5V20" />
        <rect x="3" y="4.5" width="18" height="5" rx="1" />
        <path d="M7.5 20v-6h9v6M3 20h18" />
      </>
    ),
    // A lectern with a microphone.
    kongress: (
      <>
        <path d="M6 10.5h12l-1.5 9.5h-9z" />
        <path d="M4.5 10.5h15M12 10.5V7" />
        <circle cx="12" cy="5.3" r="1.6" />
      </>
    ),
    // Two glasses, clinking.
    firmenfeier: (
      <>
        <path d="M5.5 4.5h5l-.6 5a1.9 1.9 0 0 1-3.8 0z" />
        <path d="M13.5 4.5h5l-.6 5a1.9 1.9 0 0 1-3.8 0z" />
        <path d="M8 11.6V19M16 11.6V19M5.5 19h5M13.5 19h5" />
        <path d="M11 3l1-1.5M12.5 3.2l1.4-.9" />
      </>
    ),
    // Two notes, beamed.
    konzert: (
      <>
        <path d="M9 17V5.5l10-2V15" />
        <circle cx="6.8" cy="17.2" r="2.3" />
        <circle cx="16.8" cy="15.2" r="2.3" />
        <path d="M9 9l10-2" />
      </>
    ),
    // A clapperboard.
    screening: (
      <>
        <rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5" />
        <path d="M3.5 9.5 19 5.4 18.2 3 3 7z" />
        <path d="m8 4.7 2.4 3.6M13 3.4l2.4 3.6" />
      </>
    ),
    // Something else: a sparkle.
    sonstiges: (
      <>
        <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" />
        <path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[type]}
    </svg>
  );
}
