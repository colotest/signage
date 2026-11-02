// Reads which way the device is facing, in degrees clockwise from north,
// for the top edge of the screen as it's held right now (so turning a
// phone or iPad to landscape is accounted for).
//
// iOS asks for permission first, and only from inside a tap — so start()
// has to be called straight from the button's click handler, before any
// await. There it reports webkitCompassHeading; elsewhere (Android) the
// heading comes from deviceorientationabsolute's alpha. Desktops have
// neither and never report anything, which start()'s caller finds out by
// waiting a moment for a first reading.

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationEventStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// How far the screen is turned from the device's own upright, counter-
// clockwise: turned 90° that way, the screen's top edge is the device's left
// side, so it faces 90° less than the device's top does.
function screenAngle() {
  if (typeof screen !== "undefined" && screen.orientation) return screen.orientation.angle;
  return 0;
}

const normalize = (degrees: number) => ((degrees % 360) + 360) % 360;

export async function startCompass(onHeading: (degrees: number) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;

  const Static = DeviceOrientationEvent as OrientationEventStatic;
  if (typeof Static.requestPermission === "function") {
    try {
      if ((await Static.requestPermission()) !== "granted") return null;
    } catch {
      return null;
    }
  }

  const onIos = (e: Event) => {
    const heading = (e as OrientationEventWithCompass).webkitCompassHeading;
    if (typeof heading === "number" && !Number.isNaN(heading)) onHeading(normalize(heading - screenAngle()));
  };
  const onAbsolute = (e: Event) => {
    const { alpha, absolute } = e as DeviceOrientationEvent;
    if (alpha === null || absolute === false) return;
    onHeading(normalize(360 - alpha - screenAngle()));
  };

  const absoluteSupported = "ondeviceorientationabsolute" in window;
  if (absoluteSupported) window.addEventListener("deviceorientationabsolute", onAbsolute);
  else window.addEventListener("deviceorientation", onIos);

  return () => {
    window.removeEventListener("deviceorientationabsolute", onAbsolute);
    window.removeEventListener("deviceorientation", onIos);
  };
}
