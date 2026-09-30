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
  titleClassName,
  headerClassName,
  actions,
  titleLeading,
  titleAddon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  // The Playback Menu wears its screen's name as a page-sized heading (like
  // "Playlists" on the Library page) and replaces the plain "Done" link
  // with its own controls — hence these three.
  titleClassName?: string;
  headerClassName?: string;
  actions?: ReactNode;
  // Sit immediately before/after the title rather than across from it —
  // the Playback Menu puts its collapse chevron ahead of the screen's name
  // and its counters and "⋯" right after it.
  titleLeading?: ReactNode;
  titleAddon?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* h-[109lvh]: on a phone, down behind iOS Safari's floating toolbar
            like the app shell itself (see app-shell-height in globals.css) —
            inset-0 alone stops short above it. */}
        <Dialog.Overlay className="sheet-overlay fixed inset-x-0 top-0 z-40 h-[109lvh] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            // --edge-scrim: lists inside a popup (the Playback Menu's media
            // and playlists lists) fade out against the popup's own surface
            // rather than the page colour behind it — see ProgressiveBlurEdge.
            // overflow-hidden: the lists inside end in full-width blur/scrim
            // strips, which otherwise paint straight over the popup's own
            // rounded corners and square them off. Clipping to this box's
            // shape keeps the corners round whatever sits at the edges.
            // h-[109lvh]: as the overlay — full screen on a phone means right
            // down behind Safari's toolbar, with the content keeping its own
            // clearance from it.
            "sheet-content fixed z-50 flex flex-col overflow-hidden bg-surface [--edge-scrim:var(--surface)] shadow-[var(--shadow-sheet)] outline-none",
            "inset-x-0 top-0 h-[109lvh] rounded-none",
            "sm:inset-auto sm:h-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md sm:max-h-[85vh] sm:rounded-[var(--radius-lg)]",
            contentClassName,
          )}
        >
          <div className={cn("flex items-center justify-between gap-3 border-b border-border px-5 py-4", headerClassName)}>
            {/* relative: what a dropdown opened from the title's addons
                (the Playback Menu's "⋯") hangs off, left-aligned with the
                title so it can't run off a narrow screen. */}
            <div className="relative flex min-w-0 items-center gap-3">
              {titleLeading}
              <Dialog.Title className={cn("min-w-0 truncate text-[17px] font-semibold", titleClassName)}>
                {title}
              </Dialog.Title>
              {titleAddon}
            </div>
            {actions ?? <Dialog.Close className="press-ghost text-accent text-[15px]">Done</Dialog.Close>}
          </div>
          <div className={cn("flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
