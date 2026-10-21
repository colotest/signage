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
#Garderobe benötigt
Ja
Nein
Noch unklar
#Parkplatzsperrung / Ladezone benötigt
Ja
Nein
Noch unklar
#Security / Ordner benötigt
Ja
Nein
Noch unklar
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
export type ChecklistSection = { key: string; title: string; note: string | null; fields: ChecklistField[] };
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
      section = { key: slug(title), title, note: null, fields: [] };
      categories[categories.length - 1].sections.push(section);
    } else if (!section) {
      throw new Error(`Checkliste: "${line}" comes before any section`);
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
  return categories;
}

export const CHECKLISTE = parse(SOURCE);

const FIELDS = new Map(CHECKLISTE.flatMap((c) => c.sections.flatMap((s) => s.fields)).map((f) => [f.key, f]));

// One answer as it may be stored: null when it's blank (or isn't valid for
// that field), so it's left out.
export function cleanAnswer(key: string, value: unknown): true | string | null {
  const field = FIELDS.get(key);
  if (!field) return null;
  if (field.kind === "check") return value === true ? true : null;
  if (typeof value !== "string") return null;
  if (field.kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const text = value.slice(0, MAX_CHECKLIST_TEXT);
  return text.trim() ? text : null;
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
