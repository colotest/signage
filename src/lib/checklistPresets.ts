import { CHECKLISTE, exclusiveWith, withConsequences } from "./checkliste";
import type { EventTypeKey } from "./eventTypes";

type Answer = true | string | null;

// The options a field's key is found by: its section's title and its own
// label, as written in the Checkliste — so a renamed one fails loudly here,
// rather than a preset quietly ticking nothing.
function field(section: string, label: string): string {
  const found = CHECKLISTE.flatMap((c) => c.sections)
    .find((s) => s.title === section)
    ?.fields.find((f) => f.label === label && f.kind === "check");
  if (!found) throw new Error(`Checkliste preset: no "${label}" under "${section}"`);
  return found.key;
}

const AREAS = "Welche Flächen sind interessant?";
const TECH = "Welche Technik wird benötigt?";
const DRINKS = "Welche Getränke sollen angeboten werden";

const BASICS = [
  field("Eingang", "Gleimstr."),
  field("Barrierefreiheit", "Barrierefrei"),
];
const STAGE = [
  field(TECH, "Sound / Beschallung"),
  field(TECH, "Bühnenlicht"),
  field(TECH, "Projektor / Leinwand"),
  field(TECH, "Mikrofone"),
];
const UPPER = [field(AREAS, "Galerie"), field(AREAS, "Zwischenebene")];
const BAR = [field(DRINKS, "Softdrinks"), field(DRINKS, "Bier / Wein"), field(DRINKS, "Longdrinks / Cocktails")];
const SERVICE = [
  field("Garderobenart", "Service"),
  field("WC Service / Reinigung während Event", "Ja"),
];

const MESSE = [
  field(AREAS, "Wagenhalle exklusiv"),
  ...["Banner Indoor", "Banner Outdoor Oben", "Banner Outdoor Unten", "Projektion Indoor"].map((l) => field("Branding", l)),
  field("Internet", "Gäste WLAN"),
  field("Internet", "Produktions WLAN"),
  ...BASICS,
];
const KONGRESS = [...MESSE, ...UPPER, ...STAGE];

// What each type of event comes with ticked on its Checkliste — its most
// common picks. Sonstiges has none, and switching to it leaves the list as
// it is.
export const CHECKLIST_PRESETS: Record<EventTypeKey, readonly string[]> = {
  messe: MESSE,
  kongress: KONGRESS,
  firmenfeier: [
    ...KONGRESS.filter((key) => !UPPER.includes(key)),
    field("Cateringanspruch", "Hochwertiges Catering"),
    field("Getränkeversorgung", "Getränkepauschale"),
    ...BAR,
    ...SERVICE,
  ],
  konzert: [
    ...UPPER,
    ...STAGE,
    field("Gastroflächen", "Galerie Bar"),
    field("Getränkeversorgung", "Teilweise Pauschale"),
    ...BAR,
    ...SERVICE,
    ...BASICS,
    field("Security / Ordner benötigt", "Ja"),
    field("WC Positionen", "WC Oben"),
  ],
  screening: [
    field(TECH, "Projektor / Leinwand"),
    field("Getränkeversorgung", "Teilweise Pauschale"),
    ...BAR,
    ...SERVICE,
    ...BASICS,
    field("Security / Ordner benötigt", "Ja"),
  ],
  sonstiges: [],
};

export type PresetChange = {
  // Everything the switch changes, consequences and all (see
  // withConsequences; a tick in a one-answer section takes the rest) —
  // as it's to be shown and saved.
  patch: Record<string, Answer>;
  // The options it ticks that weren't, and unticks that were.
  checked: string[];
  unchecked: string[];
  // Of those it unticks, the ones only pushed out by an option it ticks
  // (the other answer in a one-answer section, the Wagenhalle nicht
  // exklusiv by exklusiv) — by that option: unticked again in review, it
  // brings them back (see useChecklistReview).
  displaced: Record<string, string[]>;
};

// What switching an event from one type to another does to its Checkliste:
// the new type's preset ticked, and the old one's picks the new one doesn't
// share unticked — nothing else the event has is touched. Switching to
// Sonstiges changes nothing.
export function presetChange(from: string | null, to: EventTypeKey, answer: (key: string) => Answer): PresetChange {
  const next = CHECKLIST_PRESETS[to];
  const change: Record<string, Answer> = {};
  if (next.length) {
    for (const key of next) if (answer(key) !== true) change[key] = true;
    const before = from && from in CHECKLIST_PRESETS ? CHECKLIST_PRESETS[from as EventTypeKey] : [];
    for (const key of before) if (!next.includes(key) && answer(key) === true) change[key] = null;
  }
  const patch = expandChange(change, answer);
  const keys = Object.keys(patch).filter((key) => !key.startsWith("pin:"));
  const unchecked = keys.filter((key) => patch[key] === null && answer(key) === true);
  const displaced: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(change)) {
    if (value !== true) continue;
    const alone = expandChange({ [key]: true }, answer);
    const out = unchecked.filter((other) => alone[other] === null && change[other] !== null);
    if (out.length) displaced[key] = out;
  }
  return {
    patch,
    checked: keys.filter((key) => patch[key] === true && answer(key) !== true),
    unchecked,
    displaced,
  };
}

// A change with everything that follows from it: its consequences
// (withConsequences), and in a one-answer section, a tick taking the
// others away.
export function expandChange(change: Record<string, Answer>, answer: (key: string) => Answer): Record<string, Answer> {
  const patch = withConsequences(change, answer);
  const full = { ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === true) for (const other of exclusiveWith(key)) if (!(other in patch)) full[other] = null;
  }
  return full;
}
