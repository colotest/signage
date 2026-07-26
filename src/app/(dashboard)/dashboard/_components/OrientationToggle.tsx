"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setOrientation } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import type { ScreenOrientation } from "@/types/domain";

export function OrientationToggle({
  screenId,
  orientation,
}: {
  screenId: number;
  orientation: ScreenOrientation;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: ScreenOrientation) {
    if (next === orientation || pending) return;
    startTransition(async () => {
      await setOrientation(screenId, next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]">
      {(["landscape", "portrait"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          className={cn(
            "rounded-full px-3 py-1 capitalize transition-colors",
            orientation === option
              ? "bg-surface shadow-sm text-foreground"
              : "text-muted",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
