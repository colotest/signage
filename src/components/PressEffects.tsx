"use client";

import { useEffect } from "react";
import { rememberTrigger } from "@/lib/utils/lastTrigger";

// Buttons that press-and-drag with the pointer. Rows and menu items
// (press-ghost-fit) stay put, as they don't swell either; and anything
// inside something draggable — screen tiles, file rows, reorder handles
// (dnd-kit marks those with aria-roledescription) — would fight the drag.
const LIQUID_BUTTON = "button:not(.no-press):not(.press-ghost-fit):not(:disabled)";
const NOT_LIQUID = "[data-screen-tile], [aria-roledescription], [data-no-liquid]";

// One set of app-wide listeners for the press effects in globals.css; renders
// nothing.
// - Records where each button press lands, as --press-x/--press-y on the
//   button, so its glow spreads out from under the finger or cursor (and
//   follows it while dragging).
// - Remembers the pressed control, so a popup it opens can grow out of it
//   (see lastTrigger and Sheet).
// - Liquid drag, after iOS 26: dragging a held button pulls it after the
//   pointer — shifted a few px that way and stretched along the drag, with
//   rubber-band resistance — then it springs back on release. Written as
//   --liquid (a transform) plus data-liquid, which globals.css applies.
export function PressEffects() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drag: { el: HTMLElement; pointerId: number; x: number; y: number; reach: number } | null = null;

    function setPressPoint(el: HTMLElement, e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      el.style.setProperty("--press-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty("--press-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    }

    function endDrag() {
      if (!drag) return;
      drag.el.removeAttribute("data-liquid");
      drag.el.style.removeProperty("--liquid");
      drag = null;
    }

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      const trigger = target?.closest?.("button, a, [role='button']");
      if (trigger instanceof HTMLElement) rememberTrigger(trigger);

      const button = target?.closest?.("button:not(.no-press)");
      if (!(button instanceof HTMLElement)) return;
      setPressPoint(button, e);

      endDrag();
      if (e.button !== 0 || reducedMotion.matches) return;
      if (!button.matches(LIQUID_BUTTON) || button.closest(NOT_LIQUID)) return;
      const rect = button.getBoundingClientRect();
      // How far it can be pulled: a bit under a fifth of its smaller side,
      // between 4 and 10px — small icons barely budge, big ones give more.
      const reach = Math.min(10, Math.max(4, Math.min(rect.width, rect.height) * 0.18));
      drag = { el: button, pointerId: e.pointerId, x: e.clientX, y: e.clientY, reach };
    }

    function handlePointerMove(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 2) return;
      // tanh: follows the pointer at first, then resists harder the further
      // it goes, never passing `reach`.
      const pull = drag.reach * Math.tanh(distance / (drag.reach * 5));
      const stretch = 0.1 * Math.tanh(distance / 80);
      const angle = Math.atan2(dy, dx);
      const shiftX = (dx / distance) * pull;
      const shiftY = (dy / distance) * pull;
      // Stretched along the drag direction and slimmed across it, so a
      // diagonal drag skews it.
      drag.el.style.setProperty(
        "--liquid",
        `translate(${shiftX}px, ${shiftY}px) rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch / 2}) rotate(${-angle}rad)`,
      );
      drag.el.setAttribute("data-liquid", "");
      setPressPoint(drag.el, e);
    }

    function handlePointerEnd(e: PointerEvent) {
      if (drag && e.pointerId === drag.pointerId) endDrag();
    }

    document.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerup", handlePointerEnd, { passive: true });
    document.addEventListener("pointercancel", handlePointerEnd, { passive: true });
    return () => {
      endDrag();
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  return null;
}
