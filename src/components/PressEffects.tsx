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

// Liquid drag's shape, as the five numbers of matrix(a, b, b, d, x, y);
// REST is no change at all.
type Shape = [number, number, number, number, number];
const REST: Shape = [1, 0, 1, 0, 0];
// Per-frame spring for liquid drag (60fps frames): how hard it pulls
// towards its target, and how much speed it keeps from frame to frame.
const SPRING_STIFFNESS = 0.14;
const SPRING_DAMPING = 0.68;

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
//   --liquid (a matrix) plus data-liquid, which globals.css applies.
//
//   The shape is a plain matrix rather than rotate(angle) scale()
//   rotate(-angle): the drag angle flips between +180° and -180° when
//   dragging left, and a CSS transition between two such rotations spins
//   the long way round — the stretch whirled through a full turn with every
//   wobble. The matrix is the same for either angle. It's also eased here,
//   with a small spring per frame, not by a CSS transition: interpolating
//   matrices makes the browser decompose them into rotations again.
export function PressEffects() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let drag: { el: HTMLElement; pointerId: number; x: number; y: number; reach: number } | null = null;
    // Every button currently out of shape: its spring's current position
    // and speed, and where it's being pulled to (rest once let go).
    const liquids = new Map<HTMLElement, { at: Shape; speed: Shape; target: Shape }>();
    let frame = 0;
    let lastTick = 0;
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

    function pullTo(el: HTMLElement, target: Shape) {
      const liquid = liquids.get(el);
      if (liquid) liquid.target = target;
      else liquids.set(el, { at: [...REST], speed: [0, 0, 0, 0, 0], target });
      el.setAttribute("data-liquid", "");
      if (!frame) {
        lastTick = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    // A slightly underdamped spring on each of the matrix's five numbers:
    // follows the finger with a soft lag, and overshoots rest a touch on
    // release before settling — the "liquid" part.
    function tick(now: number) {
      // Whole 60fps steps, so it runs at the same speed at any frame rate;
      // capped, so a stalled frame doesn't fling it.
      const steps = Math.min(4, Math.max(1, Math.round((now - lastTick) / (1000 / 60))));
      lastTick = now;
      for (const [el, liquid] of liquids) {
        let moving = false;
        for (let i = 0; i < 5; i++) {
          for (let n = 0; n < steps; n++) {
            liquid.speed[i] = liquid.speed[i] * SPRING_DAMPING + (liquid.target[i] - liquid.at[i]) * SPRING_STIFFNESS;
            liquid.at[i] += liquid.speed[i];
          }
          if (Math.abs(liquid.speed[i]) > 0.0005 || Math.abs(liquid.target[i] - liquid.at[i]) > 0.0005) moving = true;
        }
        const atRest = liquid.target === REST && !moving;
        if (atRest) {
          liquids.delete(el);
          el.removeAttribute("data-liquid");
          el.style.removeProperty("--liquid");
        } else {
          const [a, b, d, x, y] = liquid.at;
          el.style.setProperty("--liquid", `matrix(${a}, ${b}, ${b}, ${d}, ${x}, ${y})`);
        }
      }
      frame = liquids.size ? requestAnimationFrame(tick) : 0;
    }

    function endDrag() {
      if (!drag) return;
      if (liquids.has(drag.el)) pullTo(drag.el, REST);
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
      // Unit vector along the drag.
      const ux = dx / distance;
      const uy = dy / distance;
      // Stretched by `stretch` along the drag and slimmed by half that across
      // it, so a diagonal drag skews it: (1 + s)·uuᵀ + (1 - s/2)·vvᵀ, with v
      // perpendicular to u — symmetric, so the same for u and -u.
      const along = 1 + stretch;
      const across = 1 - stretch / 2;
      const a = along * ux * ux + across * uy * uy;
      const d = along * uy * uy + across * ux * ux;
      const b = (along - across) * ux * uy;
      pullTo(drag.el, [a, b, d, ux * pull, uy * pull]);
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
      cancelAnimationFrame(frame);
      for (const el of liquids.keys()) {
        el.removeAttribute("data-liquid");
        el.style.removeProperty("--liquid");
      }
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  return null;
}
