"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

// Renders as a centered popup on desktop (>=640px) and a fullscreen sheet on
// mobile, purely via CSS breakpoints. Either way it slides up from the bottom
// edge of the screen to open and back down to close (sheet-content in
// globals.css) — Radix keeps it mounted until that exit animation ends.
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  contentClassName,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "sheet-content fixed z-50 flex flex-col bg-surface shadow-[var(--shadow-sheet)] outline-none",
            "inset-0 rounded-none",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md sm:max-h-[85vh] sm:rounded-[var(--radius-lg)]",
            contentClassName,
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="press-ghost text-accent text-[15px]">Done</Dialog.Close>
          </div>
          <div className={cn("flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
