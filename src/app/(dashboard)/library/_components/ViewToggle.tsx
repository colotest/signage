"use client";

import { GridIcon, ListIcon } from "@/components/icons/ViewIcons";
import { cn } from "@/lib/utils/cn";

export type ViewMode = "grid" | "list";

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-[var(--radius-sm)] bg-black/[.05] dark:bg-white/[.08] p-0.5">
      <button
        type="button"
        onClick={() => onChange("grid")}
        title="Grid view"
        aria-label="Grid view"
        aria-pressed={mode === "grid"}
        className={cn(
          "rounded-[calc(var(--radius-sm)-2px)] p-1.5 transition-colors",
          mode === "grid" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
        )}
      >
        <GridIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        title="List view"
        aria-label="List view"
        aria-pressed={mode === "list"}
        className={cn(
          "rounded-[calc(var(--radius-sm)-2px)] p-1.5 transition-colors",
          mode === "list" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
        )}
      >
        <ListIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
