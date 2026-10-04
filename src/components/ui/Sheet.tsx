"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import { recentTrigger } from "@/lib/utils/lastTrigger";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MenuContainerContext } from "./Menu";

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
  // Menus opened from inside render into the popup itself (see Menu).
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);

  // On open: the content's ref attaches in the same commit it mounts, before
  // the first frame of its animation, so the origin is in place in time.
  //
  // Opened by pressing a button, the popup is launched from it: the button
  // keeps growing to its full pressed size instead of springing back
  // (data-launching), while the popup holds off, invisible, for
  // --popup-hold — time for its contents to be built and laid out before
  // anything has to move. Then it takes over from the enlarged button and
  // grows into place, and the button, hidden beneath by then, snaps back
  // without animating (landLaunch).
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContentNode(node);
    if (!node) return;
    const trigger = recentTrigger();
    triggerRef.current = trigger;
    const launch = canLaunch(trigger);
    if (launch) trigger.setAttribute("data-launching", "");
    measureOrigin(node, trigger, launch);
    if (launch && node.hasAttribute("data-origin")) {
      node.style.removeProperty("--popup-hold");
    } else {
      node.style.setProperty("--popup-hold", "0ms");
      landLaunch(trigger);
    }
  }, []);

  // On close: measured again, as the button may have moved since (the
  // list behind scrolled, the window resized). Before paint, so the exit
  // animation starts from the fresh values.
  useLayoutEffect(() => {
    if (open || !contentRef.current) return;
    landLaunch(triggerRef.current);
    measureOrigin(contentRef.current, triggerRef.current, false);
  }, [open]);

  // Never leave a button stuck enlarged, however the popup goes away.
  useEffect(() => () => landLaunch(triggerRef.current), []);

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
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && e.animationName === "sheet-grow") landLaunch(triggerRef.current);
          }}
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
          <MenuContainerContext.Provider value={contentNode}>
            <div className={cn("flex items-center justify-between gap-3 border-b border-border px-5 py-4", headerClassName)}>
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
          </MenuContainerContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Where the popup should grow from: the offset from its own resting centre
// to the trigger's, the scale that shrinks it to the trigger's size, the
// corner radius that, at that scale, matches the trigger's own, and the
// trigger's colour — the popup starts out in it and turns back into it as it
// closes, so it reads as the button itself opening up. A see-through
// trigger (a bare icon) has no colour to become, so the popup fades instead
// (no data-origin-solid). Measured
// against where the popup ends up rather than where it is — mid-animation,
// its on-screen box is still transformed: centred in the viewport on
// desktop; full width from the top of the page (which never scrolls) on a
// phone. No connected, visible trigger means no data-origin, so the plain
// slide plays instead.
// When launching, the button is still on its way to its full pressed size,
// so that size is what's measured: its layout size times --press-scale,
// around its current centre (scaling doesn't move it).
function measureOrigin(node: HTMLElement, trigger: HTMLElement | null, launching: boolean) {
  const rect = trigger?.isConnected ? trigger.getBoundingClientRect() : null;
  if (!trigger || !rect || !rect.width || !rect.height || !node.offsetWidth || !node.offsetHeight) {
    node.removeAttribute("data-origin");
    return;
  }
  const desktop = window.matchMedia("(min-width: 640px)").matches;
  const centerX = window.innerWidth / 2;
  const centerY = desktop ? window.innerHeight / 2 : node.offsetHeight / 2;
  const style = getComputedStyle(trigger);
  const layoutWidth = trigger.offsetWidth || rect.width;
  const layoutHeight = trigger.offsetHeight || rect.height;
  const swells = launching && !trigger.matches(".press-ghost-fit");
  const pressScale = parseFloat(style.getPropertyValue("--press-scale")) || 1.15;
  const width = swells ? layoutWidth * pressScale : rect.width;
  const height = swells ? layoutHeight * pressScale : rect.height;
  const solid = alphaOf(style.backgroundColor) >= 0.9;
  const clamp = (n: number) => Math.min(1, Math.max(0.05, n));
  // A solid trigger's colour covers the popup's content at the small end, so
  // it can squash to exactly the button's shape. Otherwise the content
  // shows throughout, so it keeps its proportions (uniform scale).
  const uniform = clamp(Math.max(width / node.offsetWidth, height / node.offsetHeight));
  const scaleX = solid ? clamp(width / node.offsetWidth) : uniform;
  const scaleY = solid ? clamp(height / node.offsetHeight) : uniform;
  const radius =
    Math.min(parseFloat(style.borderTopLeftRadius) || 0, layoutWidth / 2, layoutHeight / 2) * (width / layoutWidth);
  node.style.setProperty("--origin-dx", `${rect.left + rect.width / 2 - centerX}px`);
  node.style.setProperty("--origin-dy", `${rect.top + rect.height / 2 - centerY}px`);
  node.style.setProperty("--origin-scale-x", `${scaleX}`);
  node.style.setProperty("--origin-scale-y", `${scaleY}`);
  // Elliptical, so the corners still come out round once squashed.
  node.style.setProperty("--origin-radius", `${radius / scaleX}px / ${radius / scaleY}px`);
  node.style.setProperty("--origin-bg", style.backgroundColor);
  node.toggleAttribute("data-origin-solid", solid);
  node.setAttribute("data-origin", "");
}

// Launching needs a button with press feedback to hand over from, and
// motion: with reduced motion the popup just fades in, with no hold.
function canLaunch(trigger: HTMLElement | null): trigger is HTMLElement {
  return (
    trigger instanceof HTMLButtonElement &&
    !trigger.matches(".no-press") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Back to resting size at once, with no spring-back: by now the popup
// covers it (or is already shrinking back onto it, which is measured
// against its resting size). data-landing switches transitions off for the
// one style change, then gets out of the way.
function landLaunch(trigger: HTMLElement | null) {
  if (!trigger?.hasAttribute("data-launching")) return;
  trigger.setAttribute("data-landing", "");
  trigger.removeAttribute("data-launching");
  void getComputedStyle(trigger, "::after").opacity;
  void trigger.offsetWidth;
  requestAnimationFrame(() => trigger.removeAttribute("data-landing"));
}

// The alpha of a computed colour: rgb()/rgba(), or the "/ alpha" form that
// oklab() and friends compute to (Tailwind's opacity modifiers).
function alphaOf(color: string) {
  if (color === "transparent") return 0;
  const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/);
  return rgba ? parseFloat(rgba[1]) : 1;
}
