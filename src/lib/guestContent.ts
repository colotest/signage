import type { AreaPoint } from "@/lib/eventAreas";
import { VENUE_AREAS } from "@/lib/venueAreas";
import type { Floor } from "@/lib/venueFloors";

// What the Guest page (/guest) says, section by section, and where on the
// venue map each part of it lies. Reading a section lights up all of its
// places on the map; an entry's title, hovered (or tapped), lights up its
// own and turns the section's picture carousel to its picture. A tap on a
// place on the map scrolls the page to its entry.
//
// Places are drawn like an event's areas: corners as a fraction of the
// plan's width (u) and height (v), on one floor.
export type GuestPlace = { floor: Floor; points: AreaPoint[] };

export type GuestEntry = {
  id: string;
  title: string;
  // After the title, quieter: what the place is.
  subtitle?: string;
  body?: string;
  // A heading the entry falls under, shown above the first entry of each
  // run that shares it (Lage's "Eingänge", "Anlieferung").
  group?: string;
  places: GuestPlace[];
  // Its picture in the section's carousel. Without one, a placeholder.
  picture?: { src: string; alt: string };
};

// Markers that buttons below a section switch on, on whichever floor the
// map shows.
export type GuestOverlay = {
  id: string;
  label: string;
  icon: "wheelchair" | "power";
  spots: { floor: Floor; u: number; v: number }[];
};

export type GuestSection = {
  id: string;
  title: string;
  intro?: string;
  entries: GuestEntry[];
  overlays?: GuestOverlay[];
};

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

// The plan's width over its height (10100 × 5300): a circle on it is this
// much taller in v than it is wide in u.
const PLAN_ASPECT = 10100 / 5300;

// A round place about a point, r wide (as a fraction of the plan's width).
function around(floor: Floor, u: number, v: number, r = 0.03): GuestPlace {
  const points = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return { u: u + Math.cos(a) * r, v: v + Math.sin(a) * r * PLAN_ASPECT };
  });
  return { floor, points };
}

const area = (key: keyof typeof VENUE_AREAS): GuestPlace => ({
  floor: VENUE_AREAS[key].floor,
  points: VENUE_AREAS[key].points,
});

// Where things are, from the Events map's standing pins and the venue's
// areas. PLACEHOLDER marks a spot guessed rather than taken from either —
// to be moved to where it really is.
export const GUEST_SECTIONS: GuestSection[] = [
  {
    id: "lage",
    title: "Lage",
    intro: `Perfekt angebunden an den kulturreichen Kiez im Herzen von Berlin. ${LOREM}`,
    entries: [
      {
        id: "eingang-schoenhauser",
        group: "Eingänge",
        title: "Schönhauser Allee 123",
        subtitle: "Historischer Kinoeingang",
        body: LOREM,
        places: [around("eg", 0.9006, 0.7699, 0.035)],
      },
      {
        id: "eingang-gleimstrasse",
        group: "Eingänge",
        title: "Gleimstraße 31",
        subtitle: "Modernisierter Atriumseingang",
        body: LOREM,
        places: [around("eg", 0.5293, 0.9119, 0.035)],
      },
      {
        id: "anlieferung",
        group: "Anlieferung",
        title: "Gleimstraße 35",
        subtitle: "Umfassender Warenwirtschafts-/Zulieferungshof",
        body: LOREM,
        // PLACEHOLDER
        places: [around("eg", 0.2, 0.86, 0.06)],
      },
    ],
  },
  {
    id: "raeume",
    title: "Räume",
    entries: [
      { id: "wagenhalle", title: "Wagenhalle", body: LOREM, places: [area("H")] },
      // PLACEHOLDER: the way in from the Schönhauser Allee.
      { id: "historisches-foyer", title: "Historisches Foyer", body: LOREM, places: [area("S")] },
      { id: "galerie", title: "Galerie", body: LOREM, places: [area("OG")] },
      {
        id: "kinosaele",
        title: "Kinosäle diverser Größen",
        body: LOREM,
        places: [
          around("eg", 0.7541, 0.7169, 0.05), // Kino 1
          around("eg", 0.3669, 0.3553), // Kino 2
          around("eg", 0.2775, 0.3166), // Kino 3
          around("eg", 0.206, 0.2833), // Kino 4
          around("eg", 0.1153, 0.242), // Kino 5
          around("og", 0.3907, 0.6424), // Kino 6
          around("og", 0.2792, 0.6429), // Kino 7
          around("og", 0.153, 0.6414), // Kino 8
          around("og", 0.0809, 0.4805), // Kino 9
          around("og", 0.2042, 0.4013), // Kino 10
        ],
      },
    ],
    overlays: [
      {
        id: "barrierefreiheit",
        label: "Barrierefreiheit",
        icon: "wheelchair",
        spots: [{ floor: "eg", u: 0.4652, v: 0.8454 }],
      },
      {
        id: "stromversorgung",
        label: "Stromversorgung",
        icon: "power",
        // PLACEHOLDER: Haustechnik K1 and Technik.
        spots: [
          { floor: "eg", u: 0.5759, v: 0.8443 },
          { floor: "eg", u: 0.4318, v: 0.5243 },
        ],
      },
    ],
  },
  {
    id: "gastronomie",
    title: "Gastronomie",
    entries: [
      {
        id: "bars",
        title: "Bars",
        body: LOREM,
        places: [around("eg", 0.1674, 0.4862, 0.04), around("og", 0.4054, 0.5179, 0.035)],
      },
      { id: "catering", title: "Catering", body: LOREM, places: [around("eg", 0.0961, 0.4337, 0.035)] },
    ],
  },
  {
    id: "technik",
    title: "Technik",
    entries: [
      // PLACEHOLDER: the DJ position by the stairs.
      { id: "buehnen", title: "Bühnen", body: LOREM, places: [around("eg", 0.4134, 0.5125, 0.04)] },
      { id: "projektion", title: "Projektion", body: LOREM, places: [around("eg", 0.4925, 0.6599)] },
      // PLACEHOLDER: Technik.
      { id: "sound", title: "Sound", body: LOREM, places: [around("eg", 0.4318, 0.5243)] },
    ],
  },
];
