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
Saal 8
Saal 9
Saal 10
Wagenhalle exklusiv
Wagenhalle nicht exklusiv
Galerie
Zwischenebene
Haustechnik K1

#Besondere Anforderungen an Räume
Backstage für Speaker
VIP Bereich
Pressebereich
Workshopräume
Breakout Räume
Catering-/Lagerfläche

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

#Branding
Banner Indoor
Banner Outdoor Oben
Banner Outdoor Unten
Projektion Indoor

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
#Gastroflächen
Küche
Mainbar
Galerie Bar

#Catering geplant
Colosseum Catering
Externes Catering
Noch unklar
Kein Catering geplant

#Cateringform
Frühstück / Coffee Break
Lunch / Mittagessen
Dinner / Abendessen
Fingerfood / Empfang
Snacks / Popcorn
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

##Logistik und Service
#Eingang
Gleimstr.
Schönhauser
#Barrierefreiheit
Barrierefrei
#Garderobenart
@eins
Service
Selbst
TBD
#Akkreditierungsart
@eins
Service
Selbst
TBD
#Parkplatzsperrung / Ladezone benötigt
Seite Biocompany
Seite Kino
Noch unklar
#Security / Ordner benötigt
Ja
Nein
Noch unklar
#WC Positionen
WC Halle/Kino
WC Halle/Hof
WC Kino
WC Oben
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
export const BRANDING = "branding";
export const GASTRO_SECTION = "gastroflaechen";
export const CATERING_SECTION = "catering-geplant";
export const DRINKS_SECTION = "getraenkeversorgung";
export const ENTRANCES = ["eingang/gleimstr", "eingang/schoenhauser"];
export const saal = (n: number) => `${AREAS_SECTION}/saal-${n}`;
export const GALERIE = `${AREAS_SECTION}/galerie`;
export const ZWISCHENEBENE = `${AREAS_SECTION}/zwischenebene`;
export const MAINBAR = `${GASTRO_SECTION}/mainbar`;
export const GALERIE_BAR = `${GASTRO_SECTION}/galerie-bar`;
export const BARRIEREFREI = "barrierefreiheit/barrierefrei";
export const GARDEROBE_KIND = "garderobenart";
export const AKKREDITIERUNG_KIND = "akkreditierungsart";
export const PARKING = "parkplatzsperrung-ladezone-benoetigt";
export const SECURITY = "security-ordner-benoetigt";
export const WC_POSITIONS = "wc-positionen";
export const WC_SERVICE = "wc-service-reinigung-waehrend-event";
export const WC_HALLE_HOF = `${WC_POSITIONS}/wc-halle-hof`;
export const WC_HALLE_KINO = `${WC_POSITIONS}/wc-halle-kino`;
export const WC_OBEN = `${WC_POSITIONS}/wc-oben`;
// The upper floor's options: any one on takes the event up there (see
// venueAreas), and brings the Galerie along.
const UPPER_FLOOR = [saal(6), saal(7), saal(8), saal(9), saal(10), WC_OBEN, GALERIE_BAR];
export const UPSTAIRS = [...UPPER_FLOOR, GALERIE];
// What puts an event somewhere in the building — and so, with no entrance
// open yet, opens the Gleimstraße one.
const PLACES = [saal(1), saal(2), saal(3), saal(4), saal(5), MAINBAR, WC_HALLE_HOF, ...UPSTAIRS, ZWISCHENEBENE];
// The WC Halle/Hof (the Wagenhalle's) isn't step-free: with Barrierefrei
// ticked, it's flagged.
export const NOT_STEP_FREE = new Set([WC_HALLE_HOF]);

// The venue map's room pins (see PinMenus) — the Kinos, each ticking its
// Saal, and Haustechnik K1 — each keep a pick of their own of the room
// requirements, stored alongside the list's answers as "pin:<pin>:<field>";
// the list's own option is ticked while any room has it, and says which.
export const ROOM_REQUIREMENTS = "besondere-anforderungen-an-raeume";
const KINO_PINS = Array.from({ length: 10 }, (_, i) => `kino-${i + 1}`);
export const ROOM_PINS = [...KINO_PINS, "haustechnik-k1"];

export function pinKey(pinId: string, part: string) {
  return `pin:${pinId}:${part}`;
}

// The room pins' names, as on the map — for the list to say which rooms
// asked for one of its room requirements.
export const ROOM_PIN_NAMES: Record<string, string> = {
  ...Object.fromEntries(KINO_PINS.map((id, i) => [id, `Kino ${i + 1}`])),
  "haustechnik-k1": "Haustechnik K1",
};

// The rooms (pins) that picked a room requirement for themselves.
export function roomsWith(fieldKey: string, answer: (key: string) => true | string | null): string[] {
  return ROOM_PINS.filter((id) => answer(pinKey(id, fieldKey)) === true).map((id) => ROOM_PIN_NAMES[id]);
}

// When the Wagenhalle could be shared with another event — the west alone
// on the ground floor (Kino 4, Kino 5, Main Bar or WC Halle/Hof, with none
// of Kino 1–3 and not by the Schönhauser entrance: "HU"), or Kino 2 or 3 by
// the Schönhauser entrance without the west ("HO") — and so whether it's
// split is a question (the Halle Geteilt pin's; see venueAreas). null
// otherwise.
export function hallSplitCase(answer: (key: string) => true | string | null): "HU" | "HO" | null {
  const on = (key: string) => answer(key) === true;
  const any = (keys: string[]) => keys.some(on);
  const west = any([saal(4), saal(5), MAINBAR, WC_HALLE_HOF]);
  const upstairs = any(UPSTAIRS);
  const schoenh = on(ENTRANCES[1]);
  if (upstairs && !any([saal(2), saal(3), saal(4), saal(5), MAINBAR])) return null;
  if (west) return !schoenh && !any([saal(1), saal(2), saal(3)]) ? "HU" : null;
  return (on(saal(2)) || on(saal(3))) && schoenh ? "HO" : null;
}

// Whether the hall's split, where that's a question: unless it's taken
// whole ("Wagenhalle exklusiv").
export function hallSplit(answer: (key: string) => true | string | null): boolean {
  return answer(WAGENHALLE_EXKLUSIV) !== true;
}

// A change as it's to be saved, with what follows from it: anything
// upstairs brings the Galerie along; the venue always has an entrance
// open — taking the only one away opens the other, and the first place
// picked with none open yet opens the Gleimstraße one; and the Wagenhalle
// is exklusiv or nicht exklusiv, never both — and once its split is a
// question (hallSplitCase), one or the other, nicht exklusiv to begin with.
export function withConsequences(
  patch: Record<string, true | string | null>,
  answer: (key: string) => true | string | null,
): Record<string, true | string | null> {
  const full = { ...patch };
  if (UPPER_FLOOR.some((key) => full[key] === true) && answer(GALERIE) !== true && !(GALERIE in full)) {
    full[GALERIE] = true;
  }
  const after = (key: string) => (key in full ? full[key] : answer(key));
  for (const [i, entrance] of ENTRANCES.entries()) {
    const other = ENTRANCES[1 - i];
    if (full[entrance] === null && answer(entrance) === true && after(other) !== true) full[other] = true;
  }
  if (PLACES.some((key) => full[key] === true) && !ENTRANCES.some((key) => after(key) === true)) {
    full[ENTRANCES[0]] = true;
  }
  const [whole, shared] = [WAGENHALLE_EXKLUSIV, WAGENHALLE_NICHT_EXKLUSIV];
  if (full[whole] === true) full[shared] = null;
  else if (full[shared] === true) full[whole] = null;
  if (hallSplitCase(after)) {
    if (full[shared] === null && !(whole in patch)) full[whole] = true;
    else if (full[whole] === null && !(shared in patch)) full[shared] = true;
    else if (after(whole) !== true && after(shared) !== true) full[shared] = true;
  }
  return full;
}

function isPinKey(key: string) {
  const [prefix, pinId, part, ...rest] = key.split(":");
  if (prefix !== "pin" || rest.length > 0 || !ROOM_PINS.includes(pinId)) return false;
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
