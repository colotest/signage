"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { DateTimePicker } from "@/components/DateTimePicker";
import { AlarmClockIcon } from "@/components/icons/PlaybackIcons";
import { cn } from "@/lib/utils/cn";

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
  onSchedule,
  onCancelTimer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistName: string;
  runAt: Date | null;
  onSchedule: (runAt: Date) => void;
  onCancelTimer: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-no-toggle className="sheet-overlay fixed inset-0 z-[60] bg-black/30" />
        <Dialog.Content
          data-no-toggle
          aria-describedby={undefined}
          className="menu-pop fixed left-1/2 top-1/2 z-[70] w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-sheet)] outline-none"
        >
          {/* Radix unmounts this while closed, so the form's state starts
              fresh from runAt on every open. */}
          <ScheduleForm
            playlistName={playlistName}
            runAt={runAt}
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
  onSchedule,
  onCancelTimer,
}: {
  playlistName: string;
  runAt: Date | null;
  onSchedule: (runAt: Date) => void;
  onCancelTimer: () => void;
}) {
  const [value, setValue] = useState(() => runAt ?? nextFullHour());
  const now = useNow();
  const inFuture = value.getTime() > now;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <AlarmClockIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
        <Dialog.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          Play “{playlistName}” at…
        </Dialog.Title>
      </div>

      <DateTimePicker value={value} onChange={setValue} />

      <p className="mt-3 text-[12px] text-muted">
        {inFuture
          ? "Now Playing will be emptied and replaced with this playlist at that time."
          : "Pick a time in the future."}
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
          disabled={!inFuture}
          onClick={() => onSchedule(value)}
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
function useNow() {
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
