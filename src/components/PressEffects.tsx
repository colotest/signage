"use client";

import { useEffect } from "react";
import { rememberTrigger } from "@/lib/utils/lastTrigger";

// Buttons that press-and-drag with the pointer. Rows and menu items
// (press-ghost-fit) stay put, as they don't swell either; and anything
// inside something draggable — screen tiles, file rows, reorder handles
// (dnd-kit marks those with aria-roledescription) — would fight the drag.
const LIQUID_BUTTON = "button:not(.no-press):not(.press-ghost-fit):not(:disabled)";
const NOT_LIQUID = "[data-screen-tile], [aria-roledescription], [data-no-liquid]";

// What gets press feedback (see the press rules in globals.css).
const PRESSABLE = "button:not(.no-press):not(:disabled), a.press-ghost, a.press-ghost-fit";
// A tap shows as pressed for at least this long, so a quick one still gets
// a visible swell; and for a moment past release whatever the tap does
// next (a popup taking over the button — see Sheet) can pick it up before
// it starts springing back.
const MIN_PRESS_MS = 160;
const RELEASE_GRACE_MS = 60;
// The spring-back's length (globals.css), for which the button keeps its
// compositing layer (data-press-ready).
const SETTLE_MS = 1000;

// Pressed buttons swell by 15%, but by no more than this many px of extra
// width: a full-width button would otherwise spill past its card.
const MAX_SWELL_PX = 24;

// One set of app-wide listeners for the press effects in globals.css; renders
// nothing.
// - Marks what's held as data-pressed, straight from the pointer (see
//   globals.css for why not :active).
// - Records where each button press lands, as --press-x/--press-y on the
//   button, so its glow spreads out from under the finger or cursor (and
//   follows it while dragging), and how much it swells (--press-scale).
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
    let press: { el: Element; pointerId: number; at: number; cancelled: boolean } | null = null;
    const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

    function startPress(el: Element, pointerId: number) {
      clearTimeout(timers.get(el));
      const current = { el, pointerId, at: performance.now(), cancelled: false };
      press = current;
      // Layer first, swell on the next frame: creating the layer in the
      // same frame the swell starts was a visible snap in Safari.
      el.setAttribute("data-press-ready", "");
      requestAnimationFrame(() => {
        if (!current.cancelled) el.setAttribute("data-pressed", "");
      });
    }

    // `cancelled`: the browser took the touch over (a scroll) — let go at
    // once rather than holding the press.
    function endPress(cancelled: boolean) {
      if (!press) return;
      const { el, at } = press;
      press.cancelled = cancelled;
      press = null;
      const release = () => {
        el.removeAttribute("data-pressed");
        timers.set(el, setTimeout(() => el.removeAttribute("data-press-ready"), SETTLE_MS));
      };
      if (cancelled) return release();
      const wait = Math.max(RELEASE_GRACE_MS, MIN_PRESS_MS - (performance.now() - at));
      timers.set(el, setTimeout(release, wait));
    }

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

      endPress(true);
      const pressable = target?.closest?.(PRESSABLE);
      if (pressable && e.button === 0) startPress(pressable, e.pointerId);

      const button = target?.closest?.("button:not(.no-press)");
      if (!(button instanceof HTMLElement)) return;
      setPressPoint(button, e);
      const width = button.offsetWidth;
      if (width) button.style.setProperty("--press-scale", `${1 + Math.min(0.15, MAX_SWELL_PX / width)}`);

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
      if (press && e.pointerId === press.pointerId) endPress(e.type === "pointercancel");
    }

    document.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerup", handlePointerEnd, { passive: true });
    document.addEventListener("pointercancel", handlePointerEnd, { passive: true });
    return () => {
      endDrag();
      endPress(true);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  return null;
}
