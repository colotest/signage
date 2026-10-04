"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import { recentTrigger } from "@/lib/utils/lastTrigger";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

// Renders as a centered popup on desktop (>=640px) and a fullscreen sheet on
// mobile, purely via CSS breakpoints. Either way it grows out of the button
// that opened it and shrinks back into it on close (data-origin, see
// measureOrigin) — or, with no such button to hand, slides up from the
// bottom edge of the screen and back down (sheet-content in globals.css).
// Radix keeps it mounted until the exit animation ends.
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // On open: the content's ref attaches in the same commit it mounts, before
  // the first frame of its animation, so the origin is in place in time.
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (!node) return;
    triggerRef.current = recentTrigger();
    measureOrigin(node, triggerRef.current);
  }, []);

  // On close: measured again, as the button may have moved since (the
  // list behind scrolled, the window resized). Before paint, so the exit
  // animation starts from the fresh values.
  useLayoutEffect(() => {
    if (!open && contentRef.current) measureOrigin(contentRef.current, triggerRef.current);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* h-[109lvh]: on a phone, down behind iOS Safari's floating toolbar
            like the app shell itself (see app-shell-height in globals.css) —
            inset-0 alone stops short above it.
            absolute, not fixed, on a phone: iOS Safari fills the strip behind
            its toolbar with the colour of a fixed element touching the
            screen's bottom edge, blotting out whatever's behind. The page
            itself never scrolls (html/body are overflow-hidden), so
            absolute to it sits exactly where fixed would.
            Blurred only as the desktop's centred popup: on a phone the sheet
            covers the whole screen, and a full-screen backdrop blur under it
            would still be recomputed for every frame of whatever's playing
            in the screen previews behind. */}
        <Dialog.Overlay className="sheet-overlay absolute inset-x-0 top-0 z-40 h-[109lvh] bg-black/40 sm:fixed sm:backdrop-blur-sm" />
        <Dialog.Content
          ref={attachContent}
          // Focus the sheet itself on open, without scrolling anything into
          // view: by default Radix focuses the first button inside, while
          // the sheet is still sliding in from below the screen — and iOS
          // Safari scrolls the page (never meant to scroll; see
          // app-shell-height) to reveal it, shifting the whole sheet with it.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
          className={cn(
            // --edge-scrim: lists inside a popup (the Playback Menu's media
            // and playlists lists) fade out against the popup's own surface
            // rather than the page colour behind it — see ProgressiveBlurEdge.
            // overflow-hidden: the lists inside end in full-width blur/scrim
            // strips, which otherwise paint straight over the popup's own
            // rounded corners and square them off. Clipping to this box's
            // shape keeps the corners round whatever sits at the edges.
            // h-[109lvh] and absolute: as the overlay — full screen on a phone
            // means right down behind Safari's toolbar, showing what's there,
            // with the content keeping its own clearance from it.
            "sheet-content absolute z-50 sm:fixed flex flex-col overflow-hidden bg-surface [--edge-scrim:var(--surface)] shadow-[var(--shadow-sheet)] outline-none",
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

// Where the popup should grow from: the offset from its own resting centre
// to the trigger's, the scale that shrinks it to the trigger's size, and the
// corner radius that, at that scale, matches the trigger's own. Measured
// against where the popup ends up rather than where it is — mid-animation,
// its on-screen box is still transformed: centred in the viewport on
// desktop; full width from the top of the page (which never scrolls) on a
// phone. No connected, visible trigger means no data-origin, so the plain
// slide plays instead.
function measureOrigin(node: HTMLElement, trigger: HTMLElement | null) {
  const rect = trigger?.isConnected ? trigger.getBoundingClientRect() : null;
  if (!rect || !rect.width || !rect.height || !node.offsetWidth || !node.offsetHeight) {
    node.removeAttribute("data-origin");
    return;
  }
  const desktop = window.matchMedia("(min-width: 640px)").matches;
  const centerX = window.innerWidth / 2;
  const centerY = desktop ? window.innerHeight / 2 : node.offsetHeight / 2;
  const scale = Math.min(1, Math.max(0.05, Math.max(rect.width / node.offsetWidth, rect.height / node.offsetHeight)));
  const radius = Math.min(parseFloat(getComputedStyle(trigger!).borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2);
  node.style.setProperty("--origin-dx", `${rect.left + rect.width / 2 - centerX}px`);
  node.style.setProperty("--origin-dy", `${rect.top + rect.height / 2 - centerY}px`);
  node.style.setProperty("--origin-scale", `${scale}`);
  node.style.setProperty("--origin-radius", `${radius / scale}px`);
  node.setAttribute("data-origin", "");
}
