"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef } from "react";
import { setFitMode } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { FitIcon, FillIcon } from "@/components/icons/FitIcons";
import type { FitMode } from "@/types/domain";

const OPTIONS: { value: FitMode; label: string; Icon: typeof FitIcon }[] = [
  { value: "contain", label: "Fit", Icon: FitIcon },
  { value: "cover", label: "Fill", Icon: FillIcon },
];

// fitMode is the tile's optimistic value (useOptimistic in ScreenTile), so a
// press shows on the pill — and the preview — straight away instead of after
// the save and refresh, which used to invite a second press. Saves run one
// after another, so quick back-and-forth switching always ends on whatever
// was picked last.
export function FitModeToggle({
  screenId,
  fitMode,
  onOptimisticChange,
}: {
  screenId: number;
  fitMode: FitMode;
  onOptimisticChange: (fitMode: FitMode) => void;
}) {
  const router = useRouter();
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  function choose(next: FitMode) {
    if (next === fitMode) return;
    startTransition(async () => {
      onOptimisticChange(next);
      const save = queueRef.current.then(() => setFitMode(screenId, next));
      queueRef.current = save.catch(() => {});
      await save;
      router.refresh();
    });
  }

  const selectedIndex = OPTIONS.findIndex((option) => option.value === fitMode);

  return (
    <div className="relative inline-flex self-start shrink-0 rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]">
      {/* One highlight that slides between the options, rather than each
          option switching its own background on and off. Each option is
          exactly its width (w-7), so one step is translate-x-full. */}
      <span
        aria-hidden
        className="absolute left-0.5 top-0.5 bottom-0.5 w-7 rounded-full bg-surface shadow-sm transition-transform duration-300 ease-[var(--ease-spring)]"
        style={{ transform: `translateX(${selectedIndex * 100}%)` }}
      />
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          title={option.label}
          aria-label={option.label}
          aria-pressed={fitMode === option.value}
          // no-press: the sliding highlight is the feedback here — no sink
          // or glint on top of it.
          className={cn(
            "no-press flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300",
            fitMode === option.value ? "text-foreground" : "text-muted",
          )}
        >
          <option.Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
