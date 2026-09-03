"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteScreen } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import type { ScreenRotation } from "@/types/domain";
import { WrenchIcon } from "@/components/icons/WrenchIcon";

const ROTATION_OPTIONS: { value: ScreenRotation; label: string }[] = [
  { value: 0, label: "0°" },
  { value: 90, label: "90°" },
  { value: 180, label: "180°" },
  { value: 270, label: "270°" },
];

// The player URL, screen rotation, and the delete action used to sit in
// plain view on every tile; tucking them behind this button keeps the row
// down to just the title, since none of it is something you touch day-to-day.
export function ScreenSetupMenu({
  screenId,
  playerPath,
  rotation,
  onSelectRotation,
}: {
  screenId: number;
  playerPath: string;
  rotation: ScreenRotation;
  onSelectRotation: (rotation: ScreenRotation) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirmingDelete(false);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleDelete() {
    startTransition(async () => {
      await deleteScreen(screenId);
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Screen setup"
        aria-label="Screen setup"
        aria-expanded={open}
        className="rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <WrenchIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
          <a
            href={playerPath}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate rounded-[var(--radius-sm)] bg-black/[.03] dark:bg-white/[.05] px-2 py-1 font-mono text-[11px] text-muted hover:text-accent"
          >
            {playerPath}
          </a>

          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] text-muted">Rotation</p>
            <div className="flex w-full rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[12px]">
              {ROTATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelectRotation(option.value)}
                  className={cn(
                    "flex-1 rounded-full py-1 text-center transition-colors",
                    rotation === option.value
                      ? "bg-surface text-foreground font-medium shadow-sm"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-muted">Delete screen?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="font-medium text-danger hover:opacity-70"
                >
                  {pending ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={pending}
                  className="text-muted hover:opacity-70"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-[13px] font-medium text-danger hover:opacity-70"
              >
                Delete Screen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
