"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteScreen } from "@/lib/actions/screens";
import { SettingsIcon } from "@/components/icons/SettingsIcon";

// The player URL and the delete action used to sit in plain view on every
// tile; tucking them behind this button keeps the row down to just the
// title, since neither is something you touch day-to-day.
export function ScreenSetupMenu({ screenId, playerPath }: { screenId: number; playerPath: string }) {
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
        <SettingsIcon className="h-4 w-4" />
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
