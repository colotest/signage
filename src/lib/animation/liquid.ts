// Liquid drag, after iOS 26: something held and dragged is pulled after the
// pointer — shifted a few px that way and stretched along the drag, with
// rubber-band resistance — then springs back when let go. Used for buttons
// (PressEffects) and for menus being drag-selected through (Menu). Written
// as --liquid (a matrix) plus data-liquid, which globals.css applies.
//
// The shape is a plain matrix (a shift and a stretch along each axis) eased
// here, with a small spring per frame, rather than by a CSS transition:
// interpolating transforms makes the browser decompose them into rotations,
// and a drag angle flipping between +180° and -180° (dragging left) spun
// the stretch the long way round.

// How something gives under a drag: how many px it can be pulled at most,
// how much it can stretch at most (0.1 = 10%), and over how many px of drag
// the stretch builds up.
export type LiquidFeel = { reach: number; stretch: number; stretchOver: number };

// The five numbers of matrix(a, b, b, d, x, y); REST is no change at all.
type Shape = [number, number, number, number, number];
const REST: Shape = [1, 0, 1, 0, 0];
// Per-frame spring (60fps frames): how hard it pulls towards its target,
// and how much speed it keeps from frame to frame.
const SPRING_STIFFNESS = 0.14;
const SPRING_DAMPING = 0.68;

// Everything currently out of shape: its spring's current position and
// speed, and where it's being pulled to (rest once let go).
const liquids = new Map<HTMLElement, { at: Shape; speed: Shape; target: Shape }>();
let frame = 0;
let lastTick = 0;

// Pulls `el` after a drag of (dx, dy) px from where the press started.
export function pullLiquid(el: HTMLElement, dx: number, dy: number, feel: LiquidFeel) {
  const distance = Math.hypot(dx, dy);
  if (distance < 2) return;
  // tanh: follows the pointer at first, then resists harder the further it
  // goes, never passing `reach`.
  const pull = feel.reach * Math.tanh(distance / (feel.reach * 5));
  const stretch = feel.stretch * Math.tanh(distance / feel.stretchOver);
  // Unit vector along the drag.
  const ux = dx / distance;
  const uy = dy / distance;
  // Stretched by `stretch` along the drag and slimmed by half that across
  // it — but only ever along the element's own axes, never skewed: a
  // diagonal drag stretches it horizontally and vertically in proportion
  // (ux², uy²), rather than tilting it towards the corner.
  const along = 1 + stretch;
  const across = 1 - stretch / 2;
  const a = along * ux * ux + across * uy * uy;
  const d = along * uy * uy + across * ux * ux;
  pullTo(el, [a, 0, d, ux * pull, uy * pull]);
}

// Lets go: it springs back to rest, then data-liquid comes off.
export function releaseLiquid(el: HTMLElement) {
  if (liquids.has(el)) pullTo(el, REST);
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
// follows the pointer with a soft lag, and overshoots rest a touch on
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
    if ((liquid.target === REST && !moving) || !el.isConnected) {
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
