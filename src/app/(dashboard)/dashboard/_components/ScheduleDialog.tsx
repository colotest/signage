"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { DateTimePicker } from "@/components/DateTimePicker";
import { AlarmClockIcon } from "@/components/icons/PlaybackIcons";
import { cn } from "@/lib/utils/cn";

// How long a new timer reserves its screen for, unless changed.
const DEFAULT_HOURS = 4;

// The next full hour — a sensible "later today" starting point that's
// always in the future.
function nextFullHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

// The small popup behind a playlist's alarm clock button. A nested Radix
// dialog rather than a popover anchored to the button: it layers cleanly
// over the Playback Menu (itself a dialog), where a popover would be
// clipped by the scrolling playlist list — and a click in a portaled
// popover counts as "outside" the menu, which would close it.
//
// data-no-toggle on the overlay and content: this renders inside a
// playlist card's React tree, and presses still bubble through React to
// the card's own click-to-expand handler, which skips anything marked so.
export function ScheduleDialog({
  open,
  onOpenChange,
  playlistName,
  runAt,
  hours,
  onSchedule,
  onCancelTimer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistName: string;
  runAt: Date | null;
  // The existing timer's window, when editing one.
  hours: number | null;
  // Resolves to an error message (an overlapping schedule, say) to show
  // while the popup stays open, or null once it's saved.
  onSchedule: (runAt: Date, hours: number) => Promise<string | null>;
  onCancelTimer: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-no-toggle className="sheet-overlay fixed inset-0 z-[60] bg-black/30" />
        <Dialog.Content
          data-no-toggle
          aria-describedby={undefined}
          className="menu-pop fixed left-1/2 top-1/2 z-[70] max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 overflow-y-auto overscroll-contain -translate-y-1/2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-sheet)] outline-none"
        >
          {/* Radix unmounts this while closed, so the form's state starts
              fresh from runAt on every open. */}
          <ScheduleForm
            playlistName={playlistName}
            runAt={runAt}
            hours={hours}
            onSchedule={onSchedule}
            onCancelTimer={onCancelTimer}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScheduleForm({
  playlistName,
  runAt,
  hours,
  onSchedule,
  onCancelTimer,
}: {
  playlistName: string;
  runAt: Date | null;
  hours: number | null;
  onSchedule: (runAt: Date, hours: number) => Promise<string | null>;
  onCancelTimer: () => void;
}) {
  const [value, setValue] = useState(() => runAt ?? nextFullHour());
  // Kept as the raw text, so clearing the field to type a new number
  // doesn't snap it straight back to something.
  const [hoursText, setHoursText] = useState(() => String(hours ?? DEFAULT_HOURS));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const now = useNow();
  const inFuture = value.getTime() > now;
  const parsedHours = Number(hoursText);
  const hoursValid = Number.isInteger(parsedHours) && parsedHours >= 1;

  async function save() {
    setSaving(true);
    setError(null);
    const message = await onSchedule(value, parsedHours);
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <AlarmClockIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
        <Dialog.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          Play “{playlistName}” at…
        </Dialog.Title>
      </div>

      <DateTimePicker
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(null);
        }}
      />

      {/* The window the screen is reserved for: nothing else can be
          scheduled on it until this ends, but the playlist keeps playing
          afterwards until something replaces it. */}
      <div className="mt-3 flex items-center justify-between border-t border-border px-1 pt-3">
        <span className="text-[17px]">For</span>
        <label className="flex items-center gap-2 text-[17px] text-muted">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={hoursText}
            onChange={(e) => {
              setHoursText(e.target.value);
              setError(null);
            }}
            aria-label="Hours"
            className="w-16 rounded-[8px] bg-black/[.05] px-2 py-1.5 text-right tabular-nums text-foreground outline-none focus:ring-1 focus:ring-accent dark:bg-white/[.08]"
          />
          hour{parsedHours === 1 ? "" : "s"}
        </label>
      </div>

      <p className={cn("mt-3 text-[12px]", error ? "text-danger" : "text-muted")}>
        {error ??
          (!inFuture
            ? "Pick a time in the future."
            : !hoursValid
              ? "Play it for at least 1 whole hour."
              : "Now Playing will be replaced with this playlist at that time, and the screen reserved for it until the window ends.")}
      </p>

      <div className="mt-4 flex items-center gap-3">
        {runAt && (
          <button
            type="button"
            onClick={onCancelTimer}
            className="press-ghost text-[15px] font-medium text-danger hover:opacity-70"
          >
            Cancel Timer
          </button>
        )}
        <div className="flex-1" />
        <Dialog.Close className="press-ghost text-[15px] text-muted hover:opacity-70">Close</Dialog.Close>
        <button
          type="button"
          disabled={!inFuture || !hoursValid || saving}
          onClick={save}
          className={cn(
            "rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast transition-opacity hover:opacity-90",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {runAt ? "Update" : "Schedule"}
        </button>
      </div>
    </>
  );
}

// Ticks once a second.
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// "Xd" while at least a day is left, then "Xh", "Xm", and finally "Xs" —
// always the largest whole unit remaining.
export function formatCountdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)}d`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}

// Stands in for the alarm clock icon while a timer is pending — same white
// circle, the time left in place of the glyph.
export function Countdown({ runAt }: { runAt: Date }) {
  const now = useNow();
  return (
    <span className="text-[12px] font-semibold tabular-nums tracking-tight">
      {formatCountdown(runAt.getTime() - now)}
    </span>
  );
}
