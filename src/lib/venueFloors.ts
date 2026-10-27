// The venue's floors that we serve, bottom up: the ground floor ("E"), the
// mezzanine ("0.5") and the upper floor ("1"). Pins and areas each sit on
// one (see floorOf).
export const FLOORS = ["eg", "zwischen", "og"] as const;
export type Floor = (typeof FLOORS)[number];

export function isFloor(value: unknown): value is Floor {
  return typeof value === "string" && (FLOORS as readonly string[]).includes(value);
}

// The floor something's on: the ground floor unless it says otherwise —
// like everything placed before the map had floors.
export function floorOf(item: { floor?: Floor }): Floor {
  return item.floor ?? "eg";
}
