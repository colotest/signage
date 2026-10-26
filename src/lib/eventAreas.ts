// An event's highlighted area on the venue map (0043): a polygon, its
// corners placed on the plan like pins are — as a fraction of its width (u)
// and height (v).
export type AreaPoint = { u: number; v: number };
export type MapArea = { id: string; points: AreaPoint[] };

export const MAX_AREAS = 50;
export const MAX_AREA_POINTS = 100;

// Whatever's stored (or sent), as areas: anything malformed is dropped
// rather than failing the whole list, and so is an area left with fewer
// than three corners.
export function parseAreas(value: unknown): MapArea[] {
  if (!Array.isArray(value)) return [];
  const areas: MapArea[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, points } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64 || !Array.isArray(points)) continue;
    const clean: AreaPoint[] = [];
    for (const point of points.slice(0, MAX_AREA_POINTS)) {
      if (!point || typeof point !== "object") continue;
      const { u, v } = point as Record<string, unknown>;
      if (typeof u !== "number" || typeof v !== "number" || !Number.isFinite(u) || !Number.isFinite(v)) continue;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      clean.push({ u, v });
    }
    if (clean.length < 3) continue;
    areas.push({ id, points: clean });
    if (areas.length === MAX_AREAS) break;
  }
  return areas;
}

// Whether a point on the plan is inside an area (even-odd, so a polygon
// that crosses itself has holes where it would look like it does).
export function areaContains(area: MapArea, at: AreaPoint): boolean {
  let inside = false;
  const pts = area.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.v > at.v !== b.v > at.v && at.u < ((b.u - a.u) * (at.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}
