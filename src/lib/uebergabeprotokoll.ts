import { ENTRANCES, GALERIE, MAINBAR, WC_HALLE_HOF, WC_HALLE_KINO, WC_OBEN, saal } from "@/lib/checkliste";

// The Übergabeprotokoll on an event's Ablauf pages: the venue walked
// through when it's handed over to the customer (Ausgabe) and again when
// it's handed back (Rückgabe) — two copies of one form, each its own
// answers and signatures (0046).
//
// Written out in the shorthand it was handed over in, read into a
// structure once:
//   ## Section            → a part of the venue, its heading
//   # Group               → a titled run of items within it
//   1.1 An item           → a line to pass (✓) or fail (✕)
// Where each part sits on the venue map (the standing pin it takes the
// place of) and when the event's Checkliste brings it in are in PLACES,
// by the section's or group's key.
//
// Each item's key (what's stored) is its group's key — or, before the
// first group, its section's — and its own label, so renaming either
// starts it afresh; renumbering or reordering doesn't touch it.
const SOURCE = `
##Altes Foyer
1.1 Scheiben
1.2 Wände
1.3 Glastüren
1.4 Boden
1.5 Kühlschränke
1.6 Bartresen
1.7 Popcornbartresen
1.8 Kino-Kassenhäuschen
1.9 Toiletten Herren (Spiegel, Wände)
1.10 Toiletten Frauen (Spiegel, Wände)

##Wagenhalle
#Kassenhäuschen (bitte abschließen)
2.1 Vorne vom Eingang aus (Scheiben, Wände)
2.2 Hinten vom Eingang aus (Scheiben, Wände)
2.3 Säulen in der Wagenhalle
2.4 Scheiben / Wände in der Wagenhalle
2.5 Denkmalgeschützte Wände (keine Bohrungen, keine Tags, kein Kleber)
#WC Halle/Kino
2.6 Herren (Spiegel, Wände)
2.7 Damen (Spiegel, Wände)
#WC Halle/Hof
2.8 Herren (Spiegel, Wände)
2.9 Damen (Spiegel, Wände)

##Eingangsbereich Gleimstraße
2.10 Main Counter
2.11 Tisch (für Getränke an der Gleimstraße 31)
2.12 Haupteingang Gleimstraße 31 (Scheiben, Wände)

##Main Bar Wagenhalle
2.13 Kühlschränke
2.14 Tresen

##Backoffice / Personalräume
3.1 Raum 1
3.2 Raum 2
3.3 Raum 3
3.4 Raum 4
3.5 Raum 5
3.6 Toiletten Herren (Spiegel, Wände)
3.7 Toiletten Damen (Spiegel, Wände)

${[4, 5, 6, 7].map((n) => kino(n)).join("\n")}
##Kino 8
8.1 Boden

${[9, 10].map((n) => kino(n)).join("\n")}
##Galerie
11.1 Scheiben / Wände in der Galerie
11.2 Mobiliar in der Galerie
#Terrasse für maximal 30 Personen
11.3 Wände
11.4 Boden
#Toiletten Galerie
11.5 Herren (Spiegel, Wände)
11.6 Damen (Spiegel, Wände)

${[1, 2, 3].map((n, i) => kino(n, 12 + i)).join("\n")}
##Spezial (z.B. Bühnenstellplatz)
15.1 Boden
15.2 Wand
15.3 Extra
`;

// A Kino's four items, numbered n.1–n.4 (Kinos 1–3 come after the
// Galerie, as 12–14).
function kino(n: number, number = n) {
  return `##Kino ${n}\n${["Boden", "Rückwand", "Kinosessel", "Leinwand"].map((label, i) => `${number}.${i + 1} ${label}`).join("\n")}\n`;
}

type Answer = (key: string) => true | string | null;
const on = (answer: Answer, ...keys: string[]) => keys.some((key) => answer(key) === true);

// Where each section or group stands on the map — the standing pin whose
// place it takes (see EventsView), none for one that isn't on it — and
// when it's part of the event's protocol, by its Checkliste. A group
// without an entry goes with its section.
const PLACES: Record<string, { pin: string | null; when: (answer: Answer) => boolean }> = {
  "altes-foyer": { pin: "eingang-schoenhauser", when: (a) => on(a, ENTRANCES[1], saal(1)) },
  // Unless nothing on the ground floor's hall side is booked.
  wagenhalle: { pin: "halle-geteilt", when: (a) => on(a, saal(1), saal(2), saal(3), saal(4), saal(5), MAINBAR) },
  "wc-halle-kino": { pin: "wc-halle-kino", when: (a) => on(a, WC_HALLE_KINO) },
  "wc-halle-hof": { pin: "wc-halle-hof", when: (a) => on(a, WC_HALLE_HOF) },
  "eingangsbereich-gleimstrasse": { pin: "eingang-gleimstr", when: (a) => on(a, ENTRANCES[0]) },
  "main-bar-wagenhalle": { pin: "main-bar", when: (a) => on(a, MAINBAR) },
  "backoffice-personalraeume": { pin: "kueche", when: () => true },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`kino-${i + 1}`, { pin: `kino-${i + 1}`, when: (a: Answer) => on(a, saal(i + 1)) }]),
  ),
  galerie: { pin: "galerie-flaeche", when: (a) => on(a, GALERIE) },
  "toiletten-galerie": { pin: "wc-oben", when: (a) => on(a, WC_OBEN) },
  "spezial-z-b-buehnenstellplatz": { pin: null, when: () => true },
};

export type HandoverItem = { key: string; number: string; label: string };
export type HandoverGroup = {
  key: string;
  // None for the items before a section's first group.
  title: string | null;
  pin: string | null;
  when: (answer: Answer) => boolean;
  items: HandoverItem[];
};
export type HandoverSection = { key: string; title: string; groups: HandoverGroup[] };

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parse(source: string): HandoverSection[] {
  const sections: HandoverSection[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      const title = line.slice(2).trim();
      const key = slug(title);
      const place = PLACES[key];
      if (!place) throw new Error(`Übergabeprotokoll: no place for "${title}"`);
      sections.push({ key, title, groups: [{ key, title: null, ...place, items: [] }] });
    } else if (line.startsWith("#")) {
      const section = sections[sections.length - 1];
      const title = line.slice(1).trim();
      const key = slug(title);
      const base = section.groups[0];
      // The base group, still empty, gives way to the first titled one.
      if (base.items.length === 0 && base.title === null) section.groups.pop();
      section.groups.push({ key, title, ...(PLACES[key] ?? { pin: base.pin, when: base.when }), items: [] });
    } else {
      const match = /^(\d+\.\d+)\s+(.+)$/.exec(line);
      if (!match) throw new Error(`Übergabeprotokoll: "${line}" isn't an item`);
      const group = sections[sections.length - 1].groups.at(-1)!;
      group.items.push({ key: `${group.key}/${slug(match[2])}`, number: match[1], label: match[2] });
    }
  }
  return sections;
}

export const UEBERGABEPROTOKOLL = parse(SOURCE);

const ITEM_KEYS = new Set(UEBERGABEPROTOKOLL.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.key))));

// The protocol as the event's Checkliste has it: its sections with only
// the groups it brings in, and only the sections left with any.
export function visibleProtocol(answer: Answer): HandoverSection[] {
  return UEBERGABEPROTOKOLL.flatMap((section) => {
    const groups = section.groups.filter((g) => g.when(answer));
    return groups.length ? [{ ...section, groups }] : [];
  });
}

// The map's pins for it: one per standing pin a visible part stands in
// for, with the items of every group there (a section and the groups that
// go with it), titled as its section is — or its group, for a group with
// a pin of its own (a WC).
// anchor: the key of the section or group the list scrolls to for it.
export type HandoverPin = { pin: string; title: string; anchor: string; items: HandoverItem[] };

export function protocolPins(sections: HandoverSection[]): HandoverPin[] {
  const pins = new Map<string, HandoverPin>();
  for (const section of sections) {
    for (const group of section.groups) {
      if (!group.pin) continue;
      const own = group.key !== section.key && PLACES[group.key] !== undefined;
      const found = pins.get(group.pin);
      if (found) found.items.push(...group.items);
      else
        pins.set(group.pin, {
          pin: group.pin,
          title: own && group.title ? group.title : section.title,
          anchor: own ? group.key : section.key,
          items: [...group.items],
        });
    }
  }
  return [...pins.values()];
}

// ── What's stored ────────────────────────────────────────────────────────

export const HANDOVER_FORMS = [
  { key: "ausgabe", label: "Ausgabe" },
  { key: "rueckgabe", label: "Rückgabe" },
] as const;
export type HandoverFormKey = (typeof HANDOVER_FORMS)[number]["key"];

export function isHandoverForm(value: unknown): value is HandoverFormKey {
  return HANDOVER_FORMS.some((f) => f.key === value);
}

export function handoverFormLabel(form: HandoverFormKey) {
  return HANDOVER_FORMS.find((f) => f.key === form)!.label;
}

// An item: passed (ok) or not (issue), and — for one that's not — a note
// and photos (paths in the media bucket, see handoverPhotoPath). The note
// and photos are kept when it's passed after all, in case it's failed
// again; only a failed one's are shown or exported.
export type HandoverItemAnswer = { state: "ok" | "issue" | null; note?: string; photos?: string[] };
export type HandoverSigner = "veranstalter" | "eigentuemer";
export type HandoverFormData = {
  items: Record<string, HandoverItemAnswer>;
  // The customer's contact as it's to be signed for, if not the event's.
  contactName: string | null;
  // PNGs, as data URLs.
  signatures: Partial<Record<HandoverSigner, string>>;
  // The day it was first signed (YYYY-MM-DD, the venue's own): its date
  // from then on, rather than today's.
  signedOn: string | null;
};
export type HandoverData = Partial<Record<HandoverFormKey, HandoverFormData>>;

// Some of one form, as it's saved: an item null clears it; a signature
// null takes it away.
export type HandoverPatch = {
  items?: Record<string, HandoverItemAnswer | null>;
  contactName?: string | null;
  signatures?: Partial<Record<HandoverSigner, string | null>>;
  signedOn?: string | null;
};

export const MAX_HANDOVER_NOTE = 2000;
export const MAX_HANDOVER_PHOTOS = 8;
export const MAX_HANDOVER_NAME = 200;
// A signature's PNG: a few strokes come to tens of kilobytes.
export const MAX_SIGNATURE_LENGTH = 400_000;
const SIGNERS: HandoverSigner[] = ["veranstalter", "eigentuemer"];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PHOTO_PATH = new RegExp(`^handover/${UUID}/${UUID}\\.jpg$`);

export function handoverPhotoPath(eventId: string, photoId: string) {
  return `handover/${eventId}/${photoId}.jpg`;
}

export function emptyHandoverForm(): HandoverFormData {
  return { items: {}, contactName: null, signatures: {}, signedOn: null };
}

export function cleanItem(value: unknown, eventId?: string): HandoverItemAnswer | null {
  if (!value || typeof value !== "object") return null;
  const { state, note, photos } = value as Record<string, unknown>;
  const item: HandoverItemAnswer = { state: state === "ok" || state === "issue" ? state : null };
  if (typeof note === "string" && note.trim()) item.note = note.slice(0, MAX_HANDOVER_NOTE);
  if (Array.isArray(photos)) {
    const clean = photos.filter(
      (p): p is string =>
        typeof p === "string" && PHOTO_PATH.test(p) && (!eventId || p.startsWith(`handover/${eventId}/`)),
    );
    if (clean.length) item.photos = [...new Set(clean)].slice(0, MAX_HANDOVER_PHOTOS);
  }
  return item.state || item.note || item.photos ? item : null;
}

export function cleanSignature(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("data:image/png;base64,") &&
    value.length <= MAX_SIGNATURE_LENGTH &&
    /^[A-Za-z0-9+/=]+$/.test(value.slice(22))
    ? value
    : null;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, MAX_HANDOVER_NAME) || null;
}

export function cleanDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseForm(value: unknown, eventId?: string): HandoverFormData {
  const form = emptyHandoverForm();
  if (!value || typeof value !== "object" || Array.isArray(value)) return form;
  const { items, contactName, signatures, signedOn } = value as Record<string, unknown>;
  if (items && typeof items === "object") {
    for (const [key, raw] of Object.entries(items)) {
      const item = ITEM_KEYS.has(key) ? cleanItem(raw, eventId) : null;
      if (item) form.items[key] = item;
    }
  }
  form.contactName = cleanName(contactName);
  if (signatures && typeof signatures === "object") {
    for (const signer of SIGNERS) {
      const png = cleanSignature((signatures as Record<string, unknown>)[signer]);
      if (png) form.signatures[signer] = png;
    }
  }
  form.signedOn = cleanDay(signedOn);
  return form;
}

// Whatever's stored, as the two forms: anything malformed dropped.
export function parseHandover(value: unknown, eventId?: string): HandoverData {
  const data: HandoverData = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return data;
  for (const { key } of HANDOVER_FORMS) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw) data[key] = parseForm(raw, eventId);
  }
  return data;
}

// A patch applied to a form, as the server stores it and the page shows
// it ahead of the server alike.
export function applyHandoverPatch(form: HandoverFormData, patch: HandoverPatch, eventId?: string): HandoverFormData {
  const next: HandoverFormData = {
    items: { ...form.items },
    contactName: form.contactName,
    signatures: { ...form.signatures },
    signedOn: form.signedOn,
  };
  for (const [key, raw] of Object.entries(patch.items ?? {})) {
    if (!ITEM_KEYS.has(key)) continue;
    const item = raw === null ? null : cleanItem(raw, eventId);
    if (item) next.items[key] = item;
    else delete next.items[key];
  }
  if (patch.contactName !== undefined) next.contactName = cleanName(patch.contactName);
  for (const signer of SIGNERS) {
    const raw = patch.signatures?.[signer];
    if (raw === undefined) continue;
    const png = raw === null ? null : cleanSignature(raw);
    if (png) next.signatures[signer] = png;
    else delete next.signatures[signer];
  }
  if (patch.signedOn !== undefined) next.signedOn = cleanDay(patch.signedOn);
  return next;
}

// "05/11/2026", from a YYYY-MM-DD day — from its parts, not a Date, as a
// server runs in UTC.
export function formatHandoverDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// The file the protocol's emailed as, without its ".pdf".
export function handoverFileName(form: HandoverFormKey, eventTitle: string) {
  return `Übergabeprotokoll Colosseum ${handoverFormLabel(form)} ${eventTitle}`.replace(/[\\/:*?"<>|]+/g, "-").trim();
}
