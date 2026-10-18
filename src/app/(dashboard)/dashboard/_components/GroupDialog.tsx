"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { usePopupLaunch } from "@/lib/animation/popupLaunch";
import { cn } from "@/lib/utils/cn";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, CloseIcon } from "@/components/icons/PlaybackIcons";

type ScreenOption = { id: number; name: string };

// The little two-step popup behind the Screens page's "+" → New Group and
// a group's "Edit Group": first tick the screens it should hold (✕ to cancel, → to go on),
// then name it (‹ back to the list, ✓ to finish). Editing starts from the
// group's current members and name.
export function GroupDialog({
  open,
  onOpenChange,
  screens,
  initialSelected = [],
  initialName = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screens: ScreenOption[];
  initialSelected?: number[];
  initialName?: string;
  // Resolves once saved; the popup closes then.
  onSubmit: (name: string, screenIds: number[]) => Promise<void>;
}) {
  // Grows out of the button that opened it (the "+", or a group's
  // "Edit Group") and shrinks back into it — see lib/animation/popupLaunch.
  // Opened any other way, menu-pop's own growth from the centre plays.
  const { attach, onAnimationEnd } = usePopupLaunch(open);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/30" />
        <Dialog.Content
          ref={attach}
          onAnimationEnd={onAnimationEnd}
          aria-describedby={undefined}
          // data-no-tile-drag: rendered from inside a group tile's React
          // tree, whose drag-to-reorder would otherwise see these presses.
          data-no-tile-drag
          className="menu-pop launch-popup fixed left-1/2 top-1/2 z-[70] flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-sheet)] outline-none"
        >
          {/* Radix unmounts this while closed, so every open starts afresh
              from the first step. */}
          <GroupForm
            screens={screens}
            initialSelected={initialSelected}
            initialName={initialName}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (name, ids) => {
              await onSubmit(name, ids);
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ROUND_BUTTON = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40";
const WHITE_BUTTON = `${ROUND_BUTTON} border border-border bg-white text-[#1d1d1f] shadow-[var(--shadow-control)] hover:bg-neutral-50`;
const BLUE_BUTTON = `${ROUND_BUTTON} bg-accent text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90`;

function GroupForm({
  screens,
  initialSelected,
  initialName,
  onCancel,
  onSubmit,
}: {
  screens: ScreenOption[];
  initialSelected: number[];
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string, screenIds: number[]) => Promise<void>;
}) {
  const [step, setStep] = useState<"select" | "name">("select");
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // In the dashboard's order, which is also the order new members take
      // the grid's cells in.
      await onSubmit(
        name.trim(),
        screens.filter((s) => selected.has(s.id)).map((s) => s.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the group");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 p-3">
        {step === "select" ? (
          <button type="button" onClick={onCancel} title="Cancel" aria-label="Cancel" className={WHITE_BUTTON}>
            <CloseIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep("select")}
            title="Back to screens"
            aria-label="Back to screens"
            className={WHITE_BUTTON}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}
        <Dialog.Title className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">
          {step === "select" ? "Screens" : "Name"}
        </Dialog.Title>
        {step === "select" ? (
          <button
            type="button"
            onClick={() => setStep("name")}
            disabled={selected.size === 0}
            title="Next"
            aria-label="Next"
            className={BLUE_BUTTON}
          >
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!name.trim() || saving}
            title="Done"
            aria-label="Done"
            className={BLUE_BUTTON}
          >
            <CheckIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {step === "select" ? (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {screens.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">No screens yet.</li>}
          {screens.map((screen) => {
            const checked = selected.has(screen.id);
            return (
              <li key={screen.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 text-[15px] hover:bg-black/[.03] dark:hover:bg-white/[.05]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(screen.id)}
                    className="h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{screen.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">/screen/{screen.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <form
          className="px-3 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
          <p className="mt-2 text-[12px] text-muted">
            {selected.size} screen{selected.size === 1 ? "" : "s"}
          </p>
          {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        </form>
      )}
    </>
  );
}
