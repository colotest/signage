import { useCallback, useEffect, useLayoutEffect, useRef, type AnimationEvent } from "react";
import { recentTrigger } from "@/lib/utils/lastTrigger";

// Launching a centred popup from the button that opened it — shared by the
// Playback Menu's Sheet (on desktop) and the group picker. Put .launch-popup
// on the popup's element, `attach` as (or inside) its ref, and
// `onAnimationEnd` on it; globals.css has the animations.
//
// On open (the ref attaches in the same commit the popup mounts, before the
// first frame of its animation, so the origin is in place in time): the
// pressed button keeps growing to its full pressed size instead of springing
// back (data-launching), while the popup holds off, invisible, for
// --popup-hold — time for its contents to be built and laid out before
// anything has to move. Then it takes over from the enlarged button and
// grows into place, a ghost of the button (its colour and glyph) fading off
// it, and the button, hidden beneath by then, snaps back without animating
// (landLaunch). On close it shrinks back into the button, the ghost fading
// back in so it lands as the button itself.
//
// `canLaunchFrom()` can veto a launch (the Sheet does on a phone, where it's
// a page sheet that always slides up from the bottom edge instead).
export function usePopupLaunch(open: boolean, canLaunchFrom: () => boolean = () => true) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const canLaunchFromRef = useRef(canLaunchFrom);
  useEffect(() => {
    canLaunchFromRef.current = canLaunchFrom;
  });

  const attach = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (!node) return;
    const trigger = canLaunchFromRef.current() ? recentTrigger() : null;
    triggerRef.current = trigger;
    const launch = canLaunch(trigger);
    if (launch) trigger.setAttribute("data-launching", "");
    const origin = measureOrigin(node, trigger, launch);
    const held = launch && origin !== null;
    if (held) {
      node.style.removeProperty("--popup-hold");
    } else {
      node.style.setProperty("--popup-hold", "0ms");
      landLaunch(trigger);
    }
    if (origin && prefersMotion()) {
      node.setAttribute("data-animating", "");
      spawnGhost(origin, "open", held ? null : "0ms");
    }
  }, []);

  // On close: measured again, as the button may have moved since (the list
  // behind scrolled, the window resized). Before paint, so the exit
  // animation starts from the fresh values.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (open || !node) return;
    landLaunch(triggerRef.current);
    const origin = measureOrigin(node, triggerRef.current, false);
    if (origin && prefersMotion()) {
      node.setAttribute("data-animating", "");
      spawnGhost(origin, "close", null);
    }
  }, [open]);

  // Never leave a button stuck enlarged, or a ghost on screen, however the
  // popup goes away.
  useEffect(
    () => () => {
      landLaunch(triggerRef.current);
      clearGhosts();
    },
    [],
  );

  const onAnimationEnd = useCallback((e: AnimationEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.animationName !== "sheet-grow") return;
    landLaunch(triggerRef.current);
    e.currentTarget.removeAttribute("data-animating");
  }, []);

  return { attach, onAnimationEnd };
}

// What the popup grows from and shrinks back into: the trigger as it looks
// right now, in viewport coordinates.
type Origin = {
  trigger: HTMLElement;
  style: CSSStyleDeclaration;
  // Its centre, and its size on screen.
  x: number;
  y: number;
  width: number;
  height: number;
  // Its size before any press swell, and that swell.
  layoutWidth: number;
  layoutHeight: number;
  swell: number;
  // Where the popup's own centre ends up, its size and its corner radius
  // there.
  popupX: number;
  popupY: number;
  popupWidth: number;
  popupHeight: number;
  popupRadius: number;
  // Its stacking level, which the ghost sits just above.
  popupZ: number;
};

// Where the popup should grow from: the offset from its own resting centre
// to the trigger's, and the scale that shrinks it to the trigger's size.
// Measured against where the popup ends up rather than where it is —
// mid-animation, its on-screen box is still transformed: centred in the
// viewport, as every popup using this is. With no connected, visible
// trigger there's no data-origin, and the popup's own entrance plays
// instead.
//
// When launching, the button is still on its way to its full pressed size,
// so that size is what's measured: its layout size times --press-scale,
// around its current centre (scaling doesn't move it).
//
// A solid trigger can squash the popup to exactly its shape: the ghost (see
// spawnGhost) covers the popup's contents at that end. A see-through one (a
// bare icon) can't hide them, so the popup keeps its proportions (uniform
// scale) and fades instead (no data-origin-solid).
function measureOrigin(node: HTMLElement, trigger: HTMLElement | null, launching: boolean): Origin | null {
  const rect = trigger?.isConnected ? trigger.getBoundingClientRect() : null;
  if (!trigger || !rect || !rect.width || !rect.height || !node.offsetWidth || !node.offsetHeight) {
    node.removeAttribute("data-origin");
    return null;
  }
  const popupX = window.innerWidth / 2;
  const popupY = window.innerHeight / 2;
  const style = getComputedStyle(trigger);
  const layoutWidth = trigger.offsetWidth || rect.width;
  const layoutHeight = trigger.offsetHeight || rect.height;
  const swells = launching && !trigger.matches(".press-ghost-fit");
  const swell = swells ? parseFloat(style.getPropertyValue("--press-scale")) || 1.15 : rect.width / layoutWidth;
  const width = swells ? layoutWidth * swell : rect.width;
  const height = swells ? layoutHeight * swell : rect.height;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const solid = alphaOf(style.backgroundColor) >= 0.9;
  const clamp = (n: number) => Math.min(1, Math.max(0.05, n));
  const uniform = clamp(Math.max(width / node.offsetWidth, height / node.offsetHeight));
  node.style.setProperty("--origin-dx", `${x - popupX}px`);
  node.style.setProperty("--origin-dy", `${y - popupY}px`);
  node.style.setProperty("--origin-scale-x", `${solid ? clamp(width / node.offsetWidth) : uniform}`);
  node.style.setProperty("--origin-scale-y", `${solid ? clamp(height / node.offsetHeight) : uniform}`);
  node.toggleAttribute("data-origin-solid", solid);
  node.setAttribute("data-origin", "");
  return {
    trigger,
    style,
    x,
    y,
    width,
    height,
    layoutWidth,
    layoutHeight,
    swell,
    popupX,
    popupY,
    popupWidth: node.offsetWidth,
    popupHeight: node.offsetHeight,
    popupRadius: parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0,
    popupZ: parseInt(getComputedStyle(node).zIndex, 10) || 50,
  };
}

// The ghosts currently on screen (one pair at most: a popup opening or
// closing).
let ghosts: HTMLElement[] = [];

function clearGhosts() {
  for (const ghost of ghosts) ghost.remove();
  ghosts = [];
}

// A stand-in for the button, laid over the popup while it grows ("open") or
// shrinks ("close"): its shape and colour, and separately its glyph, a copy
// of the button's own contents in the button's own text colour. The shape
// moves and scales with the popup; the glyph only moves with its centre,
// staying button-sized. See .sheet-ghost in globals.css for the timing.
// Opening, the button is right there under the ghost when it starts;
// closing, the ghost lands exactly on it as the popup goes, so the real
// button takes over with nothing cutting in.
function spawnGhost(origin: Origin, mode: "open" | "close", hold: string | null) {
  clearGhosts();
  const { trigger, style, x, y, width, height } = origin;

  // Positioned absolutely in the page (see .sheet-ghost for why not fixed);
  // the scroll offsets are 0 in practice, as the page never scrolls.
  const shape = document.createElement("div");
  shape.className = "sheet-ghost";
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, origin.layoutWidth / 2, origin.layoutHeight / 2);
  Object.assign(shape.style, {
    left: `${x - width / 2 + window.scrollX}px`,
    top: `${y - height / 2 + window.scrollY}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${radius * origin.swell}px`,
    background: style.backgroundColor,
  });
  const sx = origin.popupWidth / width;
  const sy = origin.popupHeight / height;
  shape.style.setProperty("--ghost-sx", `${sx}`);
  shape.style.setProperty("--ghost-sy", `${sy}`);
  // The popup's corners, in the shape's own (unscaled) terms: elliptical, so
  // they come out round once it's stretched to the popup's proportions.
  shape.style.setProperty("--ghost-radius-end", `${origin.popupRadius / sx}px / ${origin.popupRadius / sy}px`);

  // The glyph's box is the button's on-screen size; inside it, a copy of the
  // button at its layout size, scaled by its press swell.
  const glyph = document.createElement("div");
  glyph.className = "sheet-ghost-glyph";
  Object.assign(glyph.style, {
    left: `${x - width / 2 + window.scrollX}px`,
    top: `${y - height / 2 + window.scrollY}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  const inner = document.createElement("div");
  inner.innerHTML = trigger.innerHTML;
  Object.assign(inner.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    width: `${origin.layoutWidth}px`,
    height: `${origin.layoutHeight}px`,
    scale: `${origin.swell}`,
    // The button's own spacing between its parts ("+", "New", "Group"),
    // which a bare flex box would otherwise run together.
    gap: style.gap,
    whiteSpace: style.whiteSpace,
    color: style.color,
    font: style.font,
    letterSpacing: style.letterSpacing,
  });
  glyph.append(inner);

  for (const ghost of [shape, glyph]) {
    ghost.dataset.mode = mode;
    ghost.style.setProperty("--ghost-dx", `${origin.popupX - x}px`);
    ghost.style.setProperty("--ghost-dy", `${origin.popupY - y}px`);
    if (hold !== null) ghost.style.setProperty("--popup-hold", hold);
    ghost.style.zIndex = `${origin.popupZ + 5}`;
    document.body.append(ghost);
  }
  ghosts = [shape, glyph];

  // Gone once its animations are done: the hold plus the 560ms growth, or
  // the 380ms shrink (globals.css), with a little to spare.
  const holdMs = hold === null ? 190 : parseFloat(hold);
  const lifetime = mode === "open" ? holdMs + 600 : 420;
  const mine = ghosts;
  setTimeout(() => {
    if (ghosts === mine) clearGhosts();
  }, lifetime);
}

// With reduced motion the popup fades instead, with no ghost.
export function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
