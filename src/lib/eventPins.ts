// An event's own pin on the venue map (0038): where on the plan, as a
// fraction of its width (u) and height (v), and what it's called.
export type MapPin = { id: string; title: string; u: number; v: number };

export const MAX_PINS = 100;
export const MAX_PIN_TITLE = 80;

// Whatever's stored (or sent), as pins: anything malformed is dropped
// rather than failing the whole list.
export function parsePins(value: unknown): MapPin[] {
  if (!Array.isArray(value)) return [];
  const pins: MapPin[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, title, u, v } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64) continue;
    if (typeof u !== "number" || typeof v !== "number" || !Number.isFinite(u) || !Number.isFinite(v)) continue;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    pins.push({ id, title: typeof title === "string" ? title.slice(0, MAX_PIN_TITLE) : "", u, v });
    if (pins.length === MAX_PINS) break;
  }
  return pins;
}
