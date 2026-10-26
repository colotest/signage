// The Checkliste on an event's setup pages: one long list of categories
// (##), each in sections (#) of options, every one of them optional.
//
// Written out below in the same shorthand it was handed over in, and read
// into a structure once:
//   ## Category
//   # Section title
//   (A note under the section's title — can run over several lines)
//   An option                → a checkbox
//   _Label:                  → a one-line text field
//   _Datum                   → a date
//   _Text                    → a free-text box
//   @eins                    → the section takes only one answer
//   @wenn <field key>        → the section shows only while that's ticked
//
// A section whose options include Ja and Nein takes only one answer too:
// ticking one unticks the rest.
//
// Each field's key (what an event stores, 0039) is made from its section's
// title and its own label, so renaming either starts that field afresh;
// reordering or adding fields doesn't touch what's been filled in.
const SOURCE = `
##Flächen / Räume
#Welche Flächen sind interessant?
Saal 1
Saal 2
Saal 3
Saal 4
Saal 5
Saal 6
Saal 7
Saal 9
Saal 10
Wagenhalle exklusiv
Wagenhalle nicht exklusiv
Galerie

#Mobiliarbedarf
Kein Mobiliar benötigt
Grundausstattung ausreichend
Erweitertes Mobiliar benötigt
Noch unklar

#Bestuhlungsart
Reihenbestuhlung
Bankett / Dinner
Stehempfang
Club / Party Setup
Noch unklar

#Besondere Anforderungen an Räume
Backstage für Speaker
VIP Bereich
Pressebereich
Workshopräume
Breakout Räume
Catering-/Lagerfläche

##Technik
#Welche Technik wird benötigt?
Sound / Beschallung
Bühnenlicht
Projektor / Leinwand
Mikrofone
DJ / Partytechnik
Livestream
Dolmetschertechnik
Noch unklar

#Internet
Gäste WLAN
Produktions WLAN
Screening WLAN
Livestream
_Sonstiges:

#Besondere Technikwünsche
LED Screen
Simultanübersetzung
Streaming Setup
Große Bühne
Recording
_Sonstiges:

##Catering und Getränke
#Catering geplant
Colosseum Catering
Externes Catering
Noch unklar
Kein Catering geplant

#Gastroflächen
@eins
Küche
Mainbar
Mainbar Seitlich

#Cateringform
Frühstück / Coffee Break
Lunch / Mittagessen
Dinner / Abendessen
Fingerfood / Empfang
Snacks / Popcorn
Noch unklar

#Getränkeversorgung
Getränkepauschale
Selbstzahler / Bar
Teilweise Pauschale
Noch unklar

#Welche Getränke sollen angeboten werden
Softdrinks
Kaffee / Tee
Bier / Wein
Longdrinks / Cocktails
Noch unklar

#Cateringanspruch
Einfach / Basic
Standard Eventcatering
Hochwertiges Catering
Premium / Gala Niveau
Noch unklar

#Besondere Wünsche beim Catering
vegane Optionen
Foodstände
Buffet oder gesetztes Dinner
Markengetränke
besondere Bar
Noch unklar

##Logistik und Service
#Eingang
@eins
Gleimstr.
Schönhauser
#Barrierefreiheit
Barrierefrei
#Garderobe benötigt
Ja
Nein
Noch unklar
#Garderobe
@eins
@wenn garderobe-benoetigt/ja
Gestellt
Selbstständig
#Parkplatzsperrung / Ladezone benötigt
@eins
Seite Biocompany
Seite Kino
Noch unklar
#Security / Ordner benötigt
Ja
Nein
Noch unklar
#WC Positionen
@eins
WC Unten
WC Wagenhalle
#WC Service / Reinigung während Event
Ja
Nein
Noch unklar

##Interne Notizen und Einschätzung
#Wahrscheinlichkeit der Buchung
Hoch
Mittel
Gering
Noch unklar

#Gewünschter Entscheidungszeitpunkt des Kunden
_Datum

#Wichtige Notizen aus der Besichtigung
(Hier schreibt ihr alles rein, was sonst nirgendwo passt. Zum Beispiel:
wichtige Ansprechpartner
besondere Wünsche
Probleme oder Risiken
Konkurrenzlocations
besondere Anforderungen)
_Text

#To Dos nach der Besichtigung
(Zum Beispiel:
Angebot erstellen
Grundriss schicken
Technikangebot einholen
Termin prüfen)
_Text
`;

export type ChecklistField = { key: string; kind: "check" | "text" | "date" | "textarea"; label: string };
export type ChecklistSection = {
  key: string;
  title: string;
  note: string | null;
  // Only one of its options can be ticked (a Ja / Nein question, or @eins).
  single: boolean;
  // Shown only while this field is ticked (@wenn).
  when: string | null;
  fields: ChecklistField[];
};
export type ChecklistCategory = { key: string; title: string; sections: ChecklistSection[] };
// What an event has filled in, by field key: true for a ticked box, the
// text (or "YYYY-MM-DD") otherwise. Blank fields aren't in it.
export type ChecklistAnswers = Record<string, true | string>;

export const MAX_CHECKLIST_TEXT = 4000;

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

function parse(source: string): ChecklistCategory[] {
  const categories: ChecklistCategory[] = [];
  let section: ChecklistSection | null = null;
  let note: string[] | null = null; // a "(…)" note still being read
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (note) {
      note.push(line.replace(/\)$/, ""));
      if (line.endsWith(")")) {
        section!.note = note.join("\n");
        note = null;
      }
      continue;
    }
    if (!line) continue;
    if (line.startsWith("##")) {
      const title = line.slice(2).trim();
      categories.push({ key: slug(title), title, sections: [] });
      section = null;
    } else if (line.startsWith("#")) {
      const title = line.slice(1).trim();
      section = { key: slug(title), title, note: null, single: false, when: null, fields: [] };
      categories[categories.length - 1].sections.push(section);
    } else if (!section) {
      throw new Error(`Checkliste: "${line}" comes before any section`);
    } else if (line === "@eins") {
      section.single = true;
    } else if (line.startsWith("@wenn ")) {
      section.when = line.slice(6).trim();
    } else if (line.startsWith("(")) {
      const text = line.slice(1);
      if (text.endsWith(")")) section.note = text.slice(0, -1);
      else note = [text];
    } else if (line.startsWith("_")) {
      const label = line.slice(1).replace(/:$/, "").trim();
      const kind = label === "Datum" ? "date" : label === "Text" ? "textarea" : "text";
      section.fields.push({ key: `${section.key}/${slug(label)}`, kind, label });
    } else {
      section.fields.push({ key: `${section.key}/${slug(line)}`, kind: "check", label: line });
    }
  }
  for (const s of categories.flatMap((c) => c.sections)) {
    const labels = s.fields.map((f) => f.label);
    if (labels.includes("Ja") && labels.includes("Nein")) s.single = true;
  }
  return categories;
}

export const CHECKLISTE = parse(SOURCE);

const FIELDS = new Map(CHECKLISTE.flatMap((c) => c.sections.flatMap((s) => s.fields)).map((f) => [f.key, f]));
const SECTION_OF = new Map(CHECKLISTE.flatMap((c) => c.sections.flatMap((s) => s.fields.map((f) => [f.key, s] as const))));
const SECTIONS = new Map(CHECKLISTE.flatMap((c) => c.sections).map((s) => [s.key, s]));

export function sectionByKey(key: string): ChecklistSection | undefined {
  return SECTIONS.get(key);
}

// The options a tick on this one unticks: the rest of its section, if it's
// a one-answer section.
export function exclusiveWith(key: string): string[] {
  const section = SECTION_OF.get(key);
  if (!section?.single) return [];
  return section.fields.filter((f) => f.key !== key && f.kind === "check").map((f) => f.key);
}

// Fields other parts of the page work with by name.
export const AREAS_SECTION = "welche-flaechen-sind-interessant";
export const WAGENHALLE_EXKLUSIV = `${AREAS_SECTION}/wagenhalle-exklusiv`;
export const WAGENHALLE_NICHT_EXKLUSIV = `${AREAS_SECTION}/wagenhalle-nicht-exklusiv`;
export const BARRIEREFREI = "barrierefreiheit/barrierefrei";
export const WC_POSITIONS = "wc-positionen";
export const WC_UNTEN = `${WC_POSITIONS}/wc-unten`;
export const WC_WAGENHALLE = `${WC_POSITIONS}/wc-wagenhalle`;
export const WC_SERVICE = "wc-service-reinigung-waehrend-event";
// The WC Wagenhalle isn't step-free: with Barrierefrei ticked, it's flagged.
export const NOT_STEP_FREE = new Set([WC_WAGENHALLE]);

// The venue map's room pins (see PinMenus) keep a pick of their own of the
// room requirements, stored alongside the list's answers as
// "pin:<pin>:<field>"; the list's own option is ticked while any room has
// it. The two Wagenhalle halls also keep their own tick ("pin:<pin>:selected"),
// which together decide between the list's exklusiv and nicht exklusiv.
export const ROOM_REQUIREMENTS = "besondere-anforderungen-an-raeume";
export const WAGENHALLE_PINS = ["wagenhalle-kino", "wagenhalle-event"];
export const ROOM_PINS = ["kino-2", "kino-3", "kino-4", "kino-5", ...WAGENHALLE_PINS];

export function pinKey(pinId: string, part: string) {
  return `pin:${pinId}:${part}`;
}

// The room pins' names, as on the map — for the list to say which rooms
// asked for one of its room requirements.
export const ROOM_PIN_NAMES: Record<string, string> = {
  "kino-2": "Kino 2",
  "kino-3": "Kino 3",
  "kino-4": "Kino 4",
  "kino-5": "Kino 5",
  "wagenhalle-kino": "Wagenhalle 'Kino'",
  "wagenhalle-event": "Wagenhalle 'Event'",
};

// The rooms (pins) that picked a room requirement for themselves.
export function roomsWith(fieldKey: string, answer: (key: string) => true | string | null): string[] {
  return ROOM_PINS.filter((id) => answer(pinKey(id, fieldKey)) === true).map((id) => ROOM_PIN_NAMES[id]);
}

// Kino 2 and 3 sit in the Wagenhalle's cinema half: ticking either ticks
// Wagenhalle 'Kino' too.
const OPENS_WAGENHALLE_KINO = [`${AREAS_SECTION}/saal-2`, `${AREAS_SECTION}/saal-3`];

// A change as it's to be saved, with what follows from it: a Wagenhalle
// hall's tick sets exklusiv (both halls) or nicht exklusiv (one) in the
// list; ticking Kino 2 or 3 ticks Wagenhalle 'Kino'.
export function withConsequences(
  patch: Record<string, true | string | null>,
  answer: (key: string) => true | string | null,
): Record<string, true | string | null> {
  const full = { ...patch };
  const kinoHall = pinKey("wagenhalle-kino", "selected");
  if (OPENS_WAGENHALLE_KINO.some((key) => full[key] === true) && answer(kinoHall) !== true && !(kinoHall in full)) {
    full[kinoHall] = true;
  }
  const hallKeys = WAGENHALLE_PINS.map((id) => pinKey(id, "selected"));
  if (hallKeys.some((key) => key in full)) {
    const count = hallKeys.filter((key) => (key in full ? full[key] === true : answer(key) === true)).length;
    full[WAGENHALLE_EXKLUSIV] = count === 2 || null;
    full[WAGENHALLE_NICHT_EXKLUSIV] = count === 1 || null;
  }
  return full;
}

function isPinKey(key: string) {
  const [prefix, pinId, part, ...rest] = key.split(":");
  if (prefix !== "pin" || rest.length > 0 || !ROOM_PINS.includes(pinId)) return false;
  if (part === "selected") return WAGENHALLE_PINS.includes(pinId);
  return FIELDS.get(part) !== undefined && SECTION_OF.get(part)?.key === ROOM_REQUIREMENTS;
}

// One answer as it may be stored: null when it's blank (or isn't valid for
// that field), so it's left out.
export function cleanAnswer(key: string, value: unknown): true | string | null {
  if (key.startsWith("pin:")) return isPinKey(key) && value === true ? true : null;
  const field = FIELDS.get(key);
  if (!field) return null;
  if (field.kind === "check") return value === true ? true : null;
  if (typeof value !== "string") return null;
  if (field.kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const text = value.slice(0, MAX_CHECKLIST_TEXT);
  return text.trim() ? text : null;
}

export type FilledLine = { kind: "check" | "text" | "date" | "textarea"; text: string };
export type FilledCategory = { title: string; sections: { title: string; lines: FilledLine[] }[] };

// The Checkliste as filled in: each category with what's been ticked or
// written under its sections, leaving out whatever's still blank.
export function filledChecklist(answer: (key: string) => true | string | null): FilledCategory[] {
  const categories: FilledCategory[] = [];
  for (const category of CHECKLISTE) {
    const sections: FilledCategory["sections"] = [];
    for (const section of category.sections) {
      const lines: FilledLine[] = [];
      for (const field of section.fields) {
        const value = answer(field.key);
        if (value === null || value === "") continue;
        if (field.kind === "check") lines.push({ kind: "check", text: field.label });
        else if (field.kind === "date") {
          // Formatted from its parts, not a Date: a server runs in UTC.
          const [y, m, d] = String(value).split("-");
          lines.push({ kind: "date", text: `${d}.${m}.${y}` });
        } else if (field.kind === "textarea") lines.push({ kind: "textarea", text: String(value) });
        else lines.push({ kind: "text", text: `${field.label}: ${value}` });
      }
      if (lines.length) sections.push({ title: section.title, lines });
    }
    if (sections.length) categories.push({ title: category.title, sections });
  }
  return categories;
}

export const EMPTY_CHECKLIST = "Noch nichts ausgefüllt.";

// The same as plain text (an email's body).
export function checklistText(answer: (key: string) => true | string | null): string {
  const blocks = filledChecklist(answer).map(
    (category) =>
      `${category.title.toUpperCase()}\n\n${category.sections
        .map((section) => {
          const lines = section.lines.flatMap((line) =>
            line.kind === "check"
              ? [`  • ${line.text}`]
              : line.text.split("\n").map((l) => `  ${l}`),
          );
          return `${section.title}\n${lines.join("\n")}`;
        })
        .join("\n\n")}`,
  );
  return blocks.length ? blocks.join("\n\n\n") : EMPTY_CHECKLIST;
}

// Whatever's stored, as answers: unknown keys and malformed values dropped.
export function parseChecklist(value: unknown): ChecklistAnswers {
  const answers: ChecklistAnswers = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return answers;
  for (const [key, raw] of Object.entries(value)) {
    const clean = cleanAnswer(key, raw);
    if (clean !== null) answers[key] = clean;
  }
  return answers;
}
