import { FLOORS, type Floor } from "@/lib/venueFloors";
import type { MapFloor, PlanGeo } from "./VenueMap";

// Colosseum Berlin, the floors we serve, as vectors: the drawing slimmed
// down by scripts/flatten-floorplan.mjs (SCALE=100: all three were exported
// in one 101 × 53 frame, which they keep, so they line up). They move
// better on an iPad than the same drawn as pictures, one pixel per unit, by
// scripts/rasterize-floorplan.mjs — which still draws each floor's ghost,
// for while another's picked.
// True north points 11° clockwise of the plan's top edge, so facing north
// with the compass on, the plan sits turned 11° anticlockwise. (Lined up by
// eye on site, with the compass on.)
const NORTH_DEG = 11;
// Where the plans lie on the earth, from fitting OpenStreetMap's outline of
// the building onto the ground floor's walls: its south-east corner
// (52.5478° N, 13.41299° E) at the plan's lower right, the plan turned 9.4°
// from true north, and about 1.51 cm a unit — 66 to the metre, the
// building some 137 m end to end. All three floors are drawn to it.
const COLOSSEUM_GEO: PlanGeo = { lat: 52.5478, lon: 13.41299, x: 8461, y: 4662, turnDeg: 9.4, unitsPerMetre: 66.2 };
export const FLOOR_NAMES: Record<Floor, { label: string; name: string }> = {
  eg: { label: "E", name: "Erdgeschoss" },
  zwischen: { label: "Zw", name: "Zwischengeschoss" },
  og: { label: "OG", name: "Obergeschoss" },
};
export const COLOSSEUM: MapFloor[] = FLOORS.map((floor) => {
  const base = `/venues/colosseum-${floor}`;
  return {
    id: floor,
    ...FLOOR_NAMES[floor],
    plan: {
      src: `${base}.svg`,
      ghost: `${base}-ghost.webp`,
      width: 10100,
      height: 5300,
      vector: true,
      northDeg: NORTH_DEG,
      geo: COLOSSEUM_GEO,
    },
  };
});
