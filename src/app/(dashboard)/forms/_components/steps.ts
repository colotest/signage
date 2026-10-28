// Counts steps from the motion sensor while someone walks with the device.
// Each step bounces it: the pull it feels (gravity and all) rises above
// gravity as the foot lands and falls back below as the body lifts. A step
// is a rise past PEAK and the fall back after it, at most one per
// MIN_STEP_MS.
//
// iOS asks for permission first, and only from inside a tap — so, like
// startCompass, this has to be called straight from the button's click
// handler, before any await. Desktops have the event but never fire it.

type MotionEventStatic = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const GRAVITY = 9.81;
const PEAK = 0.8; // m/s² above gravity, smoothed
const MIN_STEP_MS = 300;
const SMOOTHING = 0.25;

export async function startSteps(onStep: () => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return null;

  const Static = DeviceMotionEvent as MotionEventStatic;
  if (typeof Static.requestPermission === "function") {
    try {
      if ((await Static.requestPermission()) !== "granted") return null;
    } catch {
      return null;
    }
  }

  let smooth = 0;
  let rising = false;
  let last = -Infinity;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    smooth += (Math.hypot(a.x, a.y, a.z) - GRAVITY - smooth) * SMOOTHING;
    if (!rising && smooth > PEAK) rising = true;
    else if (rising && smooth < 0) {
      rising = false;
      if (e.timeStamp - last >= MIN_STEP_MS) {
        last = e.timeStamp;
        onStep();
      }
    }
  };

  window.addEventListener("devicemotion", onMotion);
  return () => window.removeEventListener("devicemotion", onMotion);
}
