// Tells a mouse wheel from a trackpad's two-finger swipe. Browsers send
// both as the same wheel events, but a mouse should zoom the map (as it
// always has) while a swipe should slide it, the way it scrolls a page.
//
// No single tell works everywhere, so this takes the surest one an event
// offers, and otherwise goes by rhythm: a trackpad sends a fast stream of
// small steps, a wheel a few big notches. A burst of events (no pause
// longer than BURST_GAP_MS) keeps one answer throughout, so a swipe's
// momentum tail doesn't flip to zooming halfway — except that a sure sign
// of a trackpad (a sideways component) always wins.

export type WheelKind = "mouse" | "trackpad";

const BURST_GAP_MS = 300;
// Safari on macOS reports mouse wheel notches in exact multiples of this.
const SAFARI_NOTCH = 4.000244140625;

type LegacyWheelEvent = WheelEvent & { wheelDeltaY?: number };

function sureKind(e: LegacyWheelEvent): WheelKind | null {
  // Lines or pages: a mouse wheel (Firefox reports them that way).
  if (e.deltaMode !== 0) return "mouse";
  // Two fingers rarely go exactly straight; a wheel only goes sideways
  // with shift held (or a tilt wheel, which isn't worth telling apart).
  if (e.deltaX !== 0 && !e.shiftKey) return "trackpad";
  if (e.deltaY === 0) return null;
  // Chrome and Edge on macOS: a trackpad's legacy wheelDelta is exactly
  // −3 × its deltaY; a wheel's isn't.
  if (e.wheelDeltaY && e.wheelDeltaY === -3 * e.deltaY) return "trackpad";
  if (e.deltaY % SAFARI_NOTCH === 0) return "mouse";
  // Fractions of a pixel only come from a trackpad.
  if (Math.abs(e.deltaY) < 4 || !Number.isInteger(e.deltaY)) return "trackpad";
  return null;
}

export function createWheelClassifier() {
  let kind: WheelKind | null = null;
  let lastTime = -Infinity;

  return (e: WheelEvent): WheelKind => {
    const gap = e.timeStamp - lastTime;
    lastTime = e.timeStamp;
    if (gap > BURST_GAP_MS) kind = null;

    const sure = sureKind(e as LegacyWheelEvent);
    if (sure === "trackpad" || (sure && kind === null)) kind = sure;
    if (kind) return kind;

    // Nothing sure: by rhythm. A first event can only go by size — a
    // wheel's notch is big (around 100px in Chrome); later ones by how
    // much ground they cover for how soon they came.
    kind =
      gap > BURST_GAP_MS
        ? Math.abs(e.deltaY) < 50
          ? "trackpad"
          : "mouse"
        : Math.abs(gap * e.deltaY) < 200
          ? "trackpad"
          : "mouse";
    return kind;
  };
}
