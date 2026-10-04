"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePresence } from "@/lib/hooks/usePresence";
import { cn } from "@/lib/utils/cn";

// What drag-select can land on.
const ITEM = "button:not(:disabled), a[href]";
// Space kept between the menu and its button, and between the menu and the
// edge of the screen (or of the popup it's in).
const GAP = 6;
const MARGIN = 8;
// Past this, a press counts as a drag rather than a wobbly tap.
const DRAG_SLOP = 6;

// Where menus opened inside a popup render: the popup's own content (see
// Sheet). Radix makes everything outside an open dialog unclickable, and
// treats a press out there as a press outside the dialog, closing it.
export const MenuContainerContext = createContext<HTMLElement | null>(null);

// A dropdown menu hanging off a button (anchorRef). Shared by every "⋯"
// and settings menu, so they all behave alike:
// - Rendered at the top of the page (or of the popup it belongs to), not
//   inside the list it was opened from — so it sits above the lists' blurred
//   edges, isn't clipped by their scrolling, and its frosted backdrop can see
//   what's behind it (a list's fade mask would otherwise confine the blur
//   to the list itself).
// - Positioned to fit: below its button, or above when there's no room
//   below, and shifted sideways to stay MARGIN clear of the screen's edges.
//   Grows out of its button and shrinks back into it on close.
// - Closes on a press outside it (or on its button, via the button's own
//   toggle) or Escape.
// - Drag-select (unless dragSelect={false}, for panels of controls rather
//   than lists of options): press an option, slide to another, and letting
//   go there picks that one instead — the highlight follows the finger.
export function Menu({
  open,
  onClose,
  anchorRef,
  align = "end",
  dragSelect = true,
  className,
  children,
  onClick,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  // Which edge lines up with the button's: "end" hangs left from its right
  // edge (for buttons at the end of a row), "start" right from its left.
  align?: "start" | "end";
  dragSelect?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const { mounted, closing, done } = usePresence(open);
  const popupContainer = useContext(MenuContainerContext);
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Placement — written straight to the element, before paint, and again
  // whenever anything scrolls, the window resizes or the menu's own content
  // changes size (e.g. a Delete turning into a confirmation).
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!mounted || !menu) return;
    let frame = 0;
    const place = () => {
      const anchor = anchorRef.current;
      if (anchor?.isConnected) placeMenu(menu, anchor, align);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(menu);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [mounted, anchorRef, align]);

  // Outside press / Escape. Capture phase, so it hears presses that a
  // component further down stops from bubbling.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, anchorRef]);

  // Belt and braces for the exit: if no animation ends (reduced motion
  // swaps it for a short fade; a hidden tab may not run it at all), unmount
  // anyway.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(done, 600);
    return () => clearTimeout(timer);
  }, [closing, done]);

  // Drag-select.
  useEffect(() => {
    const menu = menuRef.current;
    if (!mounted || !menu || !dragSelect) return;
    let drag: { pointerId: number; x: number; y: number; moved: boolean; over: Element | null } | null = null;
    let swallowClicksUntil = 0;

    function highlight(item: Element | null) {
      if (!drag || drag.over === item) return;
      drag.over?.removeAttribute("data-highlighted");
      item?.setAttribute("data-highlighted", "");
      drag.over = item;
    }

    function itemAt(x: number, y: number) {
      const item = document.elementFromPoint(x, y)?.closest(ITEM) ?? null;
      return item && menu!.contains(item) ? item : null;
    }

    function end() {
      if (!drag) return;
      highlight(null);
      menu!.removeAttribute("data-dragging");
      drag = null;
    }

    function handlePointerDown(e: PointerEvent) {
      end();
      if (e.button !== 0) return;
      const item = (e.target as Element).closest(ITEM);
      if (!item || !menu!.contains(item)) return;
      // A touch is captured by the element it started on, which would keep
      // every move and the release "on" that first option; released, the
      // pointer is hit-tested wherever it actually is.
      if (e.target instanceof Element && e.target.hasPointerCapture(e.pointerId)) {
        e.target.releasePointerCapture(e.pointerId);
      }
      drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, over: null };
    }

    function handlePointerMove(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_SLOP) return;
        drag.moved = true;
        menu!.setAttribute("data-dragging", "");
      }
      highlight(itemAt(e.clientX, e.clientY));
    }

    function handlePointerUp(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const { moved } = drag;
      const item = moved ? itemAt(e.clientX, e.clientY) : null;
      end();
      if (!moved) return; // A plain tap: its own click does the rest.
      // The browser's own click after a drag lands on whichever element the
      // press and release have in common (or, on touch, on none at all) —
      // never reliably the option under the finger. Swallow it and click
      // that option directly instead.
      swallowClicksUntil = performance.now() + 400;
      if (item instanceof HTMLElement) item.click();
    }

    function handleClick(e: MouseEvent) {
      if (e.isTrusted && performance.now() < swallowClicksUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    menu.addEventListener("pointerdown", handlePointerDown);
    menu.addEventListener("click", handleClick, true);
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", end);
    return () => {
      end();
      menu.removeEventListener("pointerdown", handlePointerDown);
      menu.removeEventListener("click", handleClick, true);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", end);
    };
  }, [mounted, dragSelect]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-state={closing ? "closed" : "open"}
      // Presses inside still bubble up React's tree to whatever rendered the
      // menu — a draggable row or tile, a row that expands on click — as if
      // the menu were still inside it. They're stopped here.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) done();
      }}
      className={cn(
        "menu-pop glass-material absolute left-0 top-0 z-[60] rounded-[var(--radius-md)] border border-border shadow-[var(--shadow-float)]",
        dragSelect && "touch-none select-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    popupContainer ?? document.body,
  );
}

// Where the menu goes, in its container's coordinates (absolute positioning:
// the page itself never scrolls, and a popup is its own positioned box), and
// the point it grows from — its button's centre.
function placeMenu(menu: HTMLElement, anchor: HTMLElement, align: "start" | "end") {
  const container = menu.offsetParent instanceof HTMLElement ? menu.offsetParent : document.documentElement;
  const inBody = container === document.documentElement || container === document.body;
  const box = inBody
    ? { left: -window.scrollX, top: -window.scrollY, right: window.innerWidth, bottom: window.innerHeight }
    : container.getBoundingClientRect();
  const originX = inBody ? box.left : box.left + container.clientLeft;
  const originY = inBody ? box.top : box.top + container.clientTop;

  // Room to work in: the screen, narrowed to the popup when inside one.
  const bounds = {
    left: Math.max(0, box.left) + MARGIN,
    top: Math.max(0, box.top) + MARGIN,
    right: Math.min(window.innerWidth, box.right) - MARGIN,
    bottom: Math.min(window.innerHeight, box.bottom) - MARGIN,
  };

  const a = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;

  const below = a.bottom + GAP;
  const above = a.top - GAP - height;
  const side = below + height <= bounds.bottom || bounds.bottom - a.bottom >= a.top - bounds.top ? "below" : "above";
  let top = side === "below" ? below : above;
  top = Math.max(bounds.top, Math.min(top, bounds.bottom - height));

  let left = align === "end" ? a.right - width : a.left;
  left = Math.max(bounds.left, Math.min(left, bounds.right - width));

  menu.style.left = `${left - originX}px`;
  menu.style.top = `${top - originY}px`;
  menu.style.transformOrigin = `${a.left + a.width / 2 - left}px ${a.top + a.height / 2 - top}px`;
  menu.dataset.side = side;
}
