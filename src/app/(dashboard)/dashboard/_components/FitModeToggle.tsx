"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setFitMode } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import type { FitMode } from "@/types/domain";

const OPTIONS: { value: FitMode; label: string }[] = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
];

export function FitModeToggle({ screenId, fitMode }: { screenId: number; fitMode: FitMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: FitMode) {
    if (next === fitMode || pending) return;
    startTransition(async () => {
      await setFitMode(screenId, next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex shrink-0 rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            fitMode === option.value ? "bg-surface shadow-sm text-foreground" : "text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
