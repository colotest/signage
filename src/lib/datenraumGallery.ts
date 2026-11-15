import type { L } from "@/lib/datenraumContent";
import type { Floor } from "@/lib/venueFloors";
import { EVENT_TYPES } from "@/lib/eventTypes";

// The Datenraum's picture collection ("Bildersammlung", 0048) and the pins
// its maps take from the Events page's maps. Shared by the page, which
// shows them, and the Server Actions, which check what they're sent.

// --- the collection's tags ---------------------------------------------------------

// What the collection's filters sort by: a picture carries any of these
// tags, each a key ("catering:flying") under its group.
export type GalleryTagGroup = { id: string; label: L<string>; options: { key: string; label: L<string> }[] };

const same = (label: string): L<string> => ({ de: label, en: label });

const EVENT_TYPE_EN: Record<string, string> = {
  messe: "Trade fair",
  kongress: "Congress/conference",
  firmenfeier: "Company party",
  konzert: "Concert",
  screening: "Screening",
  sonstiges: "Other",
};

export const GALLERY_TAG_GROUPS: GalleryTagGroup[] = [
  {
    id: "catering",
    label: same("Catering"),
    options: [
      { key: "catering:flying", label: same("Flying") },
      { key: "catering:buffet", label: same("Buffet") },
      { key: "catering:gedeckt", label: { de: "Gedeckt", en: "Plated" } },
    ],
  },
  {
    id: "bar",
    label: same("Bar"),
    options: [
      { key: "bar:softs", label: { de: "Softs", en: "Soft drinks" } },
      { key: "bar:standard", label: same("Standard") },
      { key: "bar:cocktails", label: same("Cocktails") },
    ],
  },
  {
    id: "deko",
    label: { de: "Dekoeigenschaften", en: "Decor" },
    options: [
      { key: "deko:blumen", label: { de: "Blumen", en: "Flowers" } },
      { key: "deko:tischbeleuchtung", label: { de: "Tischbeleuchtung", en: "Table lighting" } },
      { key: "deko:liveband", label: { de: "LiveBand", en: "Live band" } },
    ],
  },
  {
    id: "moebel",
    label: { de: "Möbelstile", en: "Furniture styles" },
    options: [
      { key: "moebel:bankett", label: { de: "Bankett", en: "Banquet" } },
      { key: "moebel:lounge", label: same("Lounge") },
    ],
  },
  {
    id: "eventtyp",
    label: { de: "Eventtypen", en: "Event types" },
    options: EVENT_TYPES.map((type) => ({
      key: `eventtyp:${type.key}`,
      label: { de: type.label, en: EVENT_TYPE_EN[type.key] ?? type.label },
    })),
  },
];

export const GALLERY_TAGS = new Set(GALLERY_TAG_GROUPS.flatMap((group) => group.options.map((o) => o.key)));

// A picture in the collection, as the page gets it.
export type GalleryImage = {
  id: string;
  mediaItemId: string;
  name: string;
  url: string;
  width: number | null;
  height: number | null;
  tags: string[];
  eventName: string | null;
  // YYYY-MM-DD: the day it was taken, which needn't be the file's.
  takenOn: string | null;
};

export const MAX_GALLERY_EVENT_NAME = 120;

// --- pins from the Events page's maps ------------------------------------------

// The events whose notes on the venue map the Datenraum shows, by title:
// the power connections (on the Stromversorgung's map), and the step-free
// ways in (on the Areale's corner map).
export const POWER_EVENT_TITLE = "Stromanschlüsse";
export const ACCESS_EVENT_TITLE = "Barrierefreie Zugänge";

export type PowerKind = "cee32" | "cee16" | "cee63" | "cee32-1p" | "other";

export type DatenraumPin = { id: string; u: number; v: number; floor: Floor; kind: PowerKind | "access"; note?: string };

// What a power note marks, from what it says. Its numbers name the socket
// — with 16 and 32 the other way round, as they were first written in
// swapped: a note saying 16 is a 32 A one, and one saying 32 a 16 A one.
// "32 1p" (single-phase) is looked for first, since it says 32 too.
export function powerKind(note: string): PowerKind {
  if (/32\s*a?\s*1\s*p/i.test(note)) return "cee32-1p";
  if (note.includes("63")) return "cee63";
  if (note.includes("16")) return "cee32";
  if (note.includes("32")) return "cee16";
  return "other";
}

export const POWER_STYLE: Record<PowerKind, { title: L<string>; subtitle?: L<string>; color: string }> = {
  cee32: { title: same("32A CEE"), color: "#0a84ff" },
  cee16: { title: same("16A CEE"), color: "#ff3b30" },
  cee63: { title: same("63A CEE"), subtitle: { de: "Alternativ nutzbar", en: "Alternative use" }, color: "#30d158" },
  "cee32-1p": { title: { de: "32A CEE 1phasig", en: "32A CEE single-phase" }, color: "#2ed3c6" },
  other: { title: same(""), color: "#8e8e93" },
};

export const ACCESS_STYLE = { title: { de: "Barrierefrei", en: "Wheelchair accessible" } as L<string>, color: "#30d158" };
