"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setFitMode } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { FitIcon, FillIcon } from "@/components/icons/FitIcons";
import type { FitMode } from "@/types/domain";

const OPTIONS: { value: FitMode; label: string; Icon: typeof FitIcon }[] = [
  { value: "contain", label: "Fit", Icon: FitIcon },
  { value: "cover", label: "Fill", Icon: FillIcon },
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
    <div className="inline-flex self-start shrink-0 rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          title={option.label}
          aria-label={option.label}
          className={cn(
            "rounded-full p-1.5 transition-colors",
            fitMode === option.value ? "bg-surface shadow-sm text-foreground" : "text-muted",
          )}
        >
          <option.Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
