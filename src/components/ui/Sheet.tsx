"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import { prefersMotion, usePopupLaunch } from "@/lib/animation/popupLaunch";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { MenuContainerContext } from "./Menu";

// Renders as a centered popup on desktop (>=640px) and as an iOS page sheet
// on a phone, purely via CSS breakpoints. On desktop it grows out of the
// button that opened it and shrinks back into it on close (data-origin, see
// lib/animation/popupLaunch), or slides up when there's no such button to hand. On a
// phone it always slides up from the bottom edge, stopping just short of the
// top, while the page behind dims to black (globals.css);
// it can be pulled back down by its header to dismiss it (useSheetDrag).
// The page's part in that is driven by attributes on <html> (presentSheet),
// not by CSS watching for the sheet, so nothing has to be re-matched across
// the page while it animates.
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
  // Menus opened from inside render into the popup itself (see Menu).
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragHandlers = useSheetDrag(contentRef, overlayRef, () => onOpenChange(false));
  // The status bar's tint strip lies over the top edge of the screen on a
  // phone (globals.css), above the card and the sliver of page beside it,
  // so it takes any press that lands there: a pull on it drags the sheet,
  // as one on the header does (wired up in presentSheet) — and a tap on it
  // doesn't count as one outside the sheet (onInteractOutside below).
  const dragRef = useRef(dragHandlers);
  useLayoutEffect(() => {
    dragRef.current = dragHandlers;
  });
  // Whether this sheet is the one presented on a phone (see presentSheet).
  const presentedRef = useRef(false);

  // On desktop the popup launches from the button that opened it (see
  // lib/animation/popupLaunch). Not on a phone, where the page sheet always
  // slides up from the bottom edge instead.
  const { attach: attachLaunch, onAnimationEnd: onLaunchAnimationEnd } = usePopupLaunch(open, isDesktop);

  const attachContent = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      setContentNode(node);
      attachLaunch(node);
      if (!node) return;
      // On a phone: the page dims and Safari's bars go dark from this very
      // frame, and the blurs inside stay off while the sheet slides up.
      if (!isDesktop()) {
        presentedRef.current = true;
        presentSheet((e) => {
          const drag = dragRef.current;
          if (e.type === "pointerdown") drag.onPointerDown(e);
          else if (e.type === "pointermove") drag.onPointerMove(e);
          else drag.onPointerUp(e);
        });
        if (prefersMotion()) node.setAttribute("data-animating", "");
      }
    },
    [attachLaunch],
  );

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (open || !node || !presentedRef.current) return;
    presentedRef.current = false;
    dismissSheet();
    if (prefersMotion()) node.setAttribute("data-animating", "");
  }, [open]);

  useEffect(
    () => () => {
      if (presentedRef.current) dismissSheet();
    },
    [],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* h-[var(--shell-h)]: on a phone, down behind iOS Safari's floating
            toolbar like the app shell itself (see globals.css) — inset-0
            alone stops short above it.
            absolute, not fixed, on a phone: iOS Safari fills the strip behind
            its toolbar with the colour of a fixed element touching the
            screen's bottom edge, blotting out whatever's behind. The page
            itself never scrolls (html/body are overflow-hidden), so
            absolute to it sits exactly where fixed would.
            Blurred only as the desktop's centred popup: on a phone the sheet
            covers the whole screen, and a full-screen backdrop blur under it
            would still be recomputed for every frame of whatever's playing
            in the screen previews behind.
            Solid black on a phone, faded in: it's not the dimming over the
            page there but the void behind it — the page itself shrinks back
            above this and keeps its own z-index and its own dimming (see
            app-shell in globals.css), so what shows through around it, and
            behind the status bar, is this. */}
        <Dialog.Overlay
          ref={overlayRef}
          className="sheet-overlay absolute inset-x-0 top-0 z-40 h-[var(--shell-h)] bg-black sm:fixed sm:bg-black/40 sm:backdrop-blur-sm"
        />
        <Dialog.Content
          ref={attachContent}
          onAnimationEnd={(e) => {
            onLaunchAnimationEnd(e);
            if (e.target === e.currentTarget && e.animationName === "sheet-slide-up") {
              e.currentTarget.removeAttribute("data-animating");
            }
          }}
          // Focus the sheet itself on open, without scrolling anything into
          // view: by default Radix focuses the first button inside, while
          // the sheet is still sliding in from below the screen — and iOS
          // Safari scrolls the page (never meant to scroll; see
          // app-shell-height) to reveal it, shifting the whole sheet with it.
          onInteractOutside={(e) => {
            if (e.target instanceof Element && e.target.closest(".sheet-status-tint")) e.preventDefault();
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
          className={cn(
            // --edge-scrim: lists inside a popup (the Playback Menu's media
            // and playlists lists) fade out against the popup's own surface
            // rather than the page colour behind it — see EdgeBand.
            // overflow-hidden: the lists inside end in full-width blur/scrim
            // strips, which otherwise paint straight over the popup's own
            // rounded corners and square them off. Clipping to this box's
            // shape keeps the corners round whatever sits at the edges.
            // absolute, and down to the shell's own height: as the overlay —
            // on a phone it runs right down behind Safari's toolbar, showing
            // what's there, with the content keeping its own clearance from
            // it. Up top it stops at --sheet-top (globals.css): clear of the
            // status bar, with a sliver of the page behind showing above it,
            // as a native card sheet does. It used to start at the viewport's
            // own top edge, which installed to the Home Screen is the screen's
            // — under the clock and the Dynamic Island.
            "sheet-content launch-popup absolute z-50 sm:fixed flex flex-col overflow-hidden bg-surface [--edge-scrim:var(--surface)] shadow-[var(--shadow-sheet)] outline-none",
            "inset-x-0 top-[var(--sheet-top)] h-[calc(var(--shell-h)_-_var(--sheet-top))] rounded-t-[var(--sheet-radius)]",
            "sm:inset-auto sm:h-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md sm:max-h-[85vh] sm:rounded-[var(--radius-lg)]",
            contentClassName,
          )}
        >
          <MenuContainerContext.Provider value={contentNode}>
            {/* touch-none on a phone: a pull on the header moves the sheet,
                not anything Safari would otherwise do with the gesture. */}
            <div
              {...dragHandlers}
              className={cn(
                "flex touch-none items-center justify-between gap-3 border-b border-border px-5 py-4 sm:touch-auto",
                headerClassName,
              )}
            >
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

// Pull-down-to-dismiss on a phone, as on an iOS sheet: dragged by its
// header, the sheet follows the finger down (and resists being pulled up),
// with the dimming over the page lifting, and the status bar's tint with it,
// as it goes — set straight on those two elements, the only ones that
// change, so a move restyles nothing else.
// Let go far enough or fast enough and it closes from where it is; otherwise
// it springs back. Moved via the separate `translate` property, which
// composes with the open/close animations' `transform` — so a close plays
// on from the dragged position rather than jumping back first.
// What the drag needs of a pointer event: React's, from the header, or the
// DOM's own, from the status bar's tint strip lying over the sheet's top
// edge (see the effect in Sheet).
type DragPointerEvent = Pick<PointerEvent, "pointerId" | "clientY" | "timeStamp" | "button" | "type" | "target" | "currentTarget">;

function useSheetDrag(
  contentRef: RefObject<HTMLDivElement | null>,
  overlayRef: RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  const drag = useRef<{ id: number; startY: number; lastY: number; lastT: number; v: number; offset: number } | null>(
    null,
  );

  function onPointerDown(e: DragPointerEvent) {
    const node = contentRef.current;
    if (!node || e.button !== 0 || isDesktop()) return;
    // Controls in the header (the Done tick, the "⋯" and its dropdown) keep
    // their own presses.
    if ((e.target as Element).closest("button, a, input, textarea, select, label, .menu-pop")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, offset: 0 };
    node.style.transition = "none";
    document.documentElement.setAttribute("data-sheet-dragging", "");
  }

  function onPointerMove(e: DragPointerEvent) {
    const d = drag.current;
    const node = contentRef.current;
    if (!d || !node || e.pointerId !== d.id) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.startY;
    // Upwards it gives only a little, and less the further it's pulled.
    d.offset = dy >= 0 ? dy : -8 * Math.log1p(-dy / 24);
    node.style.translate = `0 ${d.offset}px`;
    setDragProgress(overlayRef.current, Math.max(0, d.offset) / window.innerHeight);
  }

  function onPointerEnd(e: DragPointerEvent) {
    const d = drag.current;
    const node = contentRef.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    document.documentElement.removeAttribute("data-sheet-dragging");
    if (!node) return;
    const flung = d.v > 0.5 && d.offset > 10;
    if (e.type === "pointerup" && (flung || d.offset > window.innerHeight * 0.25)) {
      close();
      return;
    }
    node.style.transition = "translate 450ms var(--ease-spring)";
    node.style.translate = "";
    setDragProgress(overlayRef.current, 0);
  }

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}

// How far (0–1) the sheet has been pulled down: the void behind it lifts by
// that much, the status bar's tint (the header's colour, dimmed the same
// way) with it, and the page behind comes forward again by the same
// fraction (--sheet-back-p, see app-shell in globals.css) — so pulling the
// card down pushes the page back to full size under the finger, as it does
// natively. 0 hands all three back to the stylesheet.
// The tint is mixed here as plain rgb(), not color-mix(): easing back from a
// color-mix() would be interpolated in a different colour space (oklab)
// from the dimming's, and drift off its hue on the way.
function setDragProgress(overlay: HTMLElement | null, p: number) {
  p = Math.min(1, p);
  if (overlay) overlay.style.opacity = p ? `${1 - p}` : "";
  // The page behind is driven by a custom property, and changing one of
  // those on <html> costs a style recalc across the whole page — so it's
  // moved in 1% steps rather than on every pointer event. 1% is 0.0008 of
  // the page's scale, far too little to see, and it turns a recalc per
  // move into a handful over a drag.
  const step = Math.round(p * 100);
  if (step !== backStep) {
    backStep = step;
    const rootStyle = document.documentElement.style;
    if (step) rootStyle.setProperty("--sheet-back-p", `${step / 100}`);
    else rootStyle.removeProperty("--sheet-back-p");
  }
  if (statusTint) {
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface");
    const rgb = surfaceChannels(surface).map((c) => Math.round(c * p));
    statusTint.style.backgroundColor = p ? `rgb(${rgb.join(", ")})` : "";
  }
}

// The palette's --surface as its three channels: hex as written (#rrggbb,
// or #rgb once the build has shortened it), or rgb().
function surfaceChannels(color: string) {
  const rgb = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return rgb.slice(1, 4).map(Number);
  let digits = color.trim().replace("#", "");
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  const n = parseInt(digits, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// A sheet presented on a phone, as far as the rest of the page is
// concerned (globals.css):
// - data-sheet-open: the status bar's tint heads for black.
// - data-sheet-shown: from the moment it opens until its close has played
//   out (500ms) — the page's blurs off, as nobody can see them under the
//   dimming and they'd otherwise be re-rendered every frame it changes.
// - The status bar: iOS 26 Safari ignores theme-color, and tints its bars
//   after whatever fixed or sticky element it finds 4px in from the middle
//   of each screen edge (at least 10px deep and nearly full width) —
//   anything absolute, like this sheet and its dimming, doesn't count, nor
//   do pseudo-elements. Without one it falls back to <body>'s background,
//   which is also what it fills behind its toolbar with while things move.
//   So: a real fixed strip over the top edge, black but painting nothing
//   (.sheet-status-tint), and <body> left a colour that never shows as a
//   fill (globals.css).
const SHEET_CLOSE_MS = 500;
let dismissTimer: number | undefined;
// The last whole percent of drag the page behind was set to (see
// setDragProgress); -1 until a drag sets one.
let backStep = -1;
let statusTint: HTMLElement | null = null;
// Where presses on the strip go: the presented sheet's drag.
let onStripPointer: ((e: PointerEvent) => void) | null = null;

function presentSheet(onPointer: (e: PointerEvent) => void) {
  onStripPointer = onPointer;
  window.clearTimeout(dismissTimer);
  // The strip goes in first, and is styled, so that its colour turns from
  // the header's to black rather than being black at once.
  if (!statusTint) {
    statusTint = document.createElement("div");
    statusTint.className = "sheet-status-tint";
    statusTint.setAttribute("aria-hidden", "true");
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      statusTint.addEventListener(type, (e) => onStripPointer?.(e as PointerEvent));
    }
    document.body.append(statusTint);
    void getComputedStyle(statusTint).opacity;
  }
  const root = document.documentElement;
  root.setAttribute("data-sheet-open", "");
  root.setAttribute("data-sheet-shown", "");
}

function dismissSheet() {
  window.clearTimeout(dismissTimer);
  const root = document.documentElement;
  root.removeAttribute("data-sheet-open");
  root.removeAttribute("data-sheet-dragging");
  onStripPointer = null;
  // From wherever a drag left it, the tint eases back from there (the
  // dimming fades out from its own inline opacity, and the page behind
  // from wherever the drag had brought it forward to).
  root.style.removeProperty("--sheet-back-p");
  backStep = -1;
  statusTint?.style.removeProperty("background-color");
  dismissTimer = window.setTimeout(() => {
    root.removeAttribute("data-sheet-shown");
    statusTint?.remove();
    statusTint = null;
  }, SHEET_CLOSE_MS);
}

function isDesktop() {
  return window.matchMedia("(min-width: 640px)").matches;
}
