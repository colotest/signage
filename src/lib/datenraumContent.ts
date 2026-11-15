import type { AreaPoint } from "@/lib/eventAreas";
import { VENUE_AREAS } from "@/lib/venueAreas";
import type { Floor } from "@/lib/venueFloors";

// What the Datenraum (/datenraum) says, in German and English, section by
// section — and for each title, what it brings up beside the text while
// it's being read (a segment: pictures, the floor plans, or a 360° tour),
// and whether the small map in the bottom left shows, lighting up where it
// is in the building.

export type Lang = "de" | "en";
export type L<T> = Record<Lang, T>;

export type Block =
  | { kind: "p"; text: string }
  // "Ideal für": the kinds of event, as tags.
  | { kind: "ideal"; items: string[] }
  | { kind: "heading"; text: string }
  | { kind: "bullets"; items: string[] }
  // Opened in a new tab.
  | { kind: "links"; links: { label: string; href: string }[] };

// Pictures are named by their file name without the extension ("2" for
// 2.png), as uploaded to the media library's Dokumentation/Aufnahmen/
// Location folder (see datenraumMedia) — shown as they arrive, a
// placeholder until then.
// A map's pins, from the Events page's maps (see datenraumGallery): the
// power connections, or the step-free ways in.
export type Segment =
  | { kind: "images"; images: string[] }
  | { kind: "map"; pins?: "power" | "access" }
  | { kind: "tour"; url: string };

export type DatenraumPlace = { floor: Floor; points: AreaPoint[] };

export type DatenraumEntry = {
  id: string;
  title: L<string>;
  // After the title, quieter: what the place is.
  subtitle?: L<string>;
  // A heading the entry falls under, shown above the first of each run of
  // entries that share it (Lage's "Eingänge", "Anlieferung").
  group?: L<string>;
  body: L<Block[]>;
  segment?: Segment;
  // Lit on the bottom-left map while the entry's read.
  places?: DatenraumPlace[];
  // Whether the bottom-left map shows while the entry's read: the
  // section's say unless the entry has its own.
  bottomMap?: boolean;
};

export type DatenraumSection = {
  id: string;
  title: L<string>;
  intro?: L<Block[]>;
  entries: DatenraumEntry[];
  // For the whole section, where its entries have none of their own.
  segment?: Segment;
  bottomMap?: boolean;
  // Pins on the corner map while the section's read: the step-free ways in.
  cornerPins?: "access";
};

// The hero picture, behind the title — not shown for now (the page opens
// straight on the content).
export const HERO_IMAGE = "1";

// --- building blocks ---------------------------------------------------------

const p = (text: string): Block => ({ kind: "p", text });
const ideal = (items: string): Block => ({ kind: "ideal", items: items.split(",").map((s) => s.trim()) });
const h = (text: string): Block => ({ kind: "heading", text });
const ul = (...items: string[]): Block => ({ kind: "bullets", items });
const images = (...names: (string | number)[]): Segment => ({ kind: "images", images: names.map(String) });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const tour = (url: string): Segment => ({ kind: "tour", url });

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

// The plan's width over its height (10100 × 5300): a circle on it is this
// much taller in v than it is wide in u.
const PLAN_ASPECT = 10100 / 5300;

// A round place about a point, r wide (as a fraction of the plan's width).
function around(floor: Floor, u: number, v: number, r = 0.03): DatenraumPlace {
  const points = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return { u: u + Math.cos(a) * r, v: v + Math.sin(a) * r * PLAN_ASPECT };
  });
  return { floor, points };
}

const area = (key: keyof typeof VENUE_AREAS): DatenraumPlace => ({
  floor: VENUE_AREAS[key].floor,
  points: VENUE_AREAS[key].points,
});

const KINO_1 = around("eg", 0.7541, 0.7169, 0.05);

// Beside the text the page turns one loaded tour from view to view by the
// part after the # (see TourLayer), and on the same panorama the tour then
// reads a yaw, pitch or fov of 0 as not given and keeps the one it's at —
// so a straight-ahead view is written 0.01, not 0. And a fov past the
// panorama's widest (Außen_01's is 133) is cut back only after the turn
// there, with a jump.
const TOUR_BASE = "https://tours.nexpics.com/berlin-cuisine/colosseum-filmtheater/";
const TOUR_SCHOENHAUSER = `${TOUR_BASE}#media-name=IMG_5650-C-EG-Außen_01&yaw=-19.76&pitch=0.10&fov=124.00`;

const IDEAL_HALL = {
  de: "PRODUCT LAUNCH, GALADINNER, MICE, MÄRKTE, VIDEO DREH, GET-TOGETHER, PARTY, HOCHZEITEN, AUSSTELLUNGEN, EMPFÄNGE, WEIHNACHTSFEIERN, CORPORATE EVENTS, B2B, MEETINGS, INCENTIVE, JUBILÄEN",
  en: "PRODUCT LAUNCHES, GALA DINNERS, MICE, MARKETS, VIDEO SHOOTS, GET-TOGETHERS, PARTIES, WEDDINGS, EXHIBITIONS, RECEPTIONS, CHRISTMAS PARTIES, CORPORATE EVENTS, B2B, MEETINGS, INCENTIVES, ANNIVERSARIES",
};

const FLAT_100_200 = {
  de: "Pauschal 100 € (1 Tag + Aufbautag), 200 € (ab 3 Tage)",
  en: "Flat rate €100 (1 day + set-up day), €200 (3 days or more)",
};

// --- the content ---------------------------------------------------------------

export const DATENRAUM_SECTIONS: DatenraumSection[] = [
  {
    id: "areale",
    title: { de: "Areale", en: "Spaces" },
    bottomMap: true,
    cornerPins: "access",
    entries: [
      {
        id: "wagenhalle",
        title: { de: "Wagenhalle", en: "Wagenhalle" },
        segment: images(...range(2, 11)),
        places: [area("H")],
        body: {
          de: [
            p("1.400 m² Nutzfläche bei 12 m Raumhöhe"),
            p("Flächen frei bestuhlbar, flexibel und kombinierbar, inkl. Gastronomieflächen sowie Sanitäranlagen"),
            ideal(IDEAL_HALL.de),
          ],
          en: [
            p("1,400 m² of usable space with a 12 m ceiling height"),
            p("Freely seatable, flexible and combinable spaces, including catering areas and restrooms"),
            ideal(IDEAL_HALL.en),
          ],
        },
      },
      {
        id: "galerie",
        title: { de: "Galerie", en: "Galerie" },
        segment: images(...range(12, 15)),
        places: [area("OG")],
        body: {
          de: [
            p("ca. 800 m² Nutzfläche in der 2. Etage, mit separatem Eingang (Gleimstr.)"),
            p(
              "Mit [Zwei große Aussenflächen?], Aufzug, Flächen frei bestuhlbar, flexibel und kombinierbar, inkl. Gastronomieflächen sowie Sanitäranlagen",
            ),
            ideal(IDEAL_HALL.de),
          ],
          en: [
            p("approx. 800 m² of usable space on the 2nd floor, with a separate entrance (Gleimstraße)"),
            p(
              "With [two large outdoor areas?], a lift, freely seatable, flexible and combinable spaces, including catering areas and restrooms",
            ),
            ideal(IDEAL_HALL.en),
          ],
        },
      },
      {
        id: "kinosaele",
        title: { de: "Kinosäle", en: "Cinemas" },
        segment: images(...range(17, 23)),
        places: [
          around("eg", 0.3669, 0.3553), // Kino 2
          around("eg", 0.2775, 0.3166), // Kino 3
          around("eg", 0.206, 0.2833), // Kino 4
          around("eg", 0.1153, 0.242), // Kino 5
          around("og", 0.3907, 0.6424), // Kino 6
          around("og", 0.2792, 0.6429), // Kino 7
          around("og", 0.0809, 0.4805), // Kino 9
          around("og", 0.2042, 0.4013), // Kino 10
        ],
        body: {
          de: [
            ul(
              "Saal 2: 203 m², 162 Sitze",
              "Saal 3: 168 m², 137 Sitze",
              "Saal 4 & 5: 178 m², 147 & 150 Sitze",
              "Saal 6 & 7: 400 m², 360 Sitze",
              "Saal 9: 168 m², 122 Sitze",
              "Saal 10: 490 m², 454 Sitze",
            ),
            ideal(
              "FILMVORFÜHRUNGEN, KONZERTE, FILMFESTIVALS, WORKSHOPS, LIVE-STREAMING-EVENTS, PARTY, THEATERAUFFÜHRUNGEN, VORTRÄGE, PRÄSENTATIONEN, GAMING-EVENTS, COMEDY-SHOWS, KUNSTAUSSTELLUNGEN, FITNESSVERANSTALTUNGEN, BUCHLESUNGEN, TANZVORFÜHRUNGEN",
            ),
          ],
          en: [
            ul(
              "Screen 2: 203 m², 162 seats",
              "Screen 3: 168 m², 137 seats",
              "Screens 4 & 5: 178 m², 147 & 150 seats",
              "Screens 6 & 7: 400 m², 360 seats",
              "Screen 9: 168 m², 122 seats",
              "Screen 10: 490 m², 454 seats",
            ),
            ideal(
              "FILM SCREENINGS, CONCERTS, FILM FESTIVALS, WORKSHOPS, LIVE-STREAMING EVENTS, PARTIES, THEATRE PERFORMANCES, TALKS, PRESENTATIONS, GAMING EVENTS, COMEDY SHOWS, ART EXHIBITIONS, FITNESS EVENTS, BOOK READINGS, DANCE PERFORMANCES",
            ),
          ],
        },
      },
      {
        id: "foyer-saal-1",
        title: { de: "Foyer + Saal 1", en: "Foyer + Screen 1" },
        segment: images(...range(24, 28)),
        // PLACEHOLDER: the way in from the Schönhauser Allee, and Kino 1.
        places: [area("S"), KINO_1],
        body: {
          de: [
            p("Saal 1 als historischer Kinosaal, mit Foyer abgetrennt vom restlichen Gebäude."),
            p("535 m² Kino mit 525 Sitzplätzen und Bühne,"),
            p(
              "ca. 500 m² Foyer + Nutzfläche mit eigenem Eingang, abgetrennt vom restlichen Gebäude, dabei Gastronomieflächen, Flächen flexibel und kombinierbar, und inkl. Sanitäranlagen.",
            ),
            ideal("PREMIEREN, SPECIAL SCREENING, GALA, FILMVORFÜHRUNGEN, KONZERTE, FILMFESTIVALS, LIVE-STREAMING-EVENTS, THEATERAUFFÜHRUNGEN, VORTRÄGE"),
          ],
          en: [
            p("Screen 1, the historic cinema, together with its foyer, separate from the rest of the building."),
            p("A 535 m² cinema with 525 seats and a stage,"),
            p(
              "approx. 500 m² of foyer and usable space with its own entrance, separate from the rest of the building, with catering areas, flexible and combinable spaces, and restrooms.",
            ),
            ideal("PREMIERES, SPECIAL SCREENINGS, GALAS, FILM SCREENINGS, CONCERTS, FILM FESTIVALS, LIVE-STREAMING EVENTS, THEATRE PERFORMANCES, TALKS"),
          ],
        },
      },
      {
        id: "grundrisse",
        title: { de: "Grundrisse", en: "Floor plans" },
        // The floor plans, with the step-free ways in.
        segment: { kind: "map", pins: "access" },
        bottomMap: false,
        body: {
          de: [
            p(
              "Maßstabsgetreue Darstellungen der jeweiligen Flächen und als Grundlage für technische Planung, Aufbaukonzepte, Produktionslayouts sowie behördliche Abstimmungen.",
            ),
            { kind: "links", links: floorPlanLinks("de") },
          ],
          en: [
            p(
              "To-scale drawings of each space, as a basis for technical planning, set-up concepts, production layouts and coordination with the authorities.",
            ),
            { kind: "links", links: floorPlanLinks("en") },
          ],
        },
      },
    ],
  },
  {
    id: "werbeflaechen",
    title: { de: "Werbeflächen", en: "Advertising" },
    entries: [
      {
        id: "folierung-gleimstrasse",
        title: { de: "Folierung Gleimstr.", en: "Window film, Gleimstraße" },
        segment: tour(`${TOUR_BASE}#media-name=IMG_5050-A-EG-Außen_01&yaw=0.01&pitch=20.00&fov=133.00`),
        body: {
          de: [
            p("Eingang Gleimstr. sowohl entlang der Glastüren Pauschal: 1.100 €,"),
            p("als auch der darüberliegenden Fensterfront (910 × 410 cm)"),
          ],
          en: [
            p("Gleimstraße entrance, along the glass doors (flat rate: €1,100),"),
            p("as well as the window front above them (910 × 410 cm)"),
          ],
        },
      },
      {
        id: "banner-gleimstrasse",
        title: { de: "Banner Gleimstr.", en: "Banners, Gleimstraße" },
        segment: tour(`${TOUR_BASE}#media-name=IMG_5050-A-EG-Außen_01&yaw=80.00&pitch=20.00&fov=100.00`),
        body: {
          de: [
            h("Oben"),
            p("446 × 163 cm (rundum 50 cm in Abständen geöst)"),
            p("Pauschal 100 € (1 Tag + Aufbautag), 200 € (ab 3 Tage)"),
            h("Unten"),
            p("446 × 163 cm (rundum 50 cm in Abständen geöst)"),
            p("Pauschal 100 € (1 Tag + Aufbautag), 200 € (ab 3 Tage)"),
          ],
          en: [
            h("Top"),
            p("446 × 163 cm (eyelets all round, 50 cm apart)"),
            p(FLAT_100_200.en),
            h("Bottom"),
            p("446 × 163 cm (eyelets all round, 50 cm apart)"),
            p(FLAT_100_200.en),
          ],
        },
      },
      {
        id: "folierung-schoenhauser",
        title: { de: "Folierung Schönhauser Allee", en: "Window film, Schönhauser Allee" },
        segment: tour(TOUR_SCHOENHAUSER),
        body: {
          de: [p("Fläche muss gesondert angefragt werden."), ul("Panel oben: 78 × 132,5 cm", "Panel unten: 78 × 37 cm")],
          en: [p("Available on separate request."), ul("Upper panel: 78 × 132.5 cm", "Lower panel: 78 × 37 cm")],
        },
      },
      {
        id: "banner-schoenhauser",
        title: { de: "Banner Schönhauser Allee", en: "Banner, Schönhauser Allee" },
        segment: images(31),
        body: {
          de: [
            p("460 × 260 cm (rundum 50 cm in Abständen geöst)"),
            ul(
              "Pauschal 250 € für 1 Tag (Anbringung erfolgt am Abend Vortag oder am Morgen Eventtag)",
              "bis 3 Tage pauschal 350 €",
              "bis 7 Tage/Woche pauschal 700 €",
            ),
          ],
          en: [
            p("460 × 260 cm (eyelets all round, 50 cm apart)"),
            ul(
              "Flat rate €250 for 1 day (hung the evening before or the morning of the event)",
              "up to 3 days: flat rate €350",
              "up to 7 days/one week: flat rate €700",
            ),
          ],
        },
      },
      {
        id: "posterkaesten",
        title: { de: "Posterkästen Fassade", en: "Poster cases, façade" },
        segment: tour(`${TOUR_BASE}#media-name=IMG_5050-A-EG-Außen_01&yaw=300.00&pitch=0.01&fov=84.00`),
        body: {
          de: [
            h("Eingang Gleimstr."),
            ul("Jedes Poster A1 (12 Stk.)", "Nutzung und Montage aller Poster: 70 €"),
            h("Ecke Schönhauser/Gleimstr."),
            ul("Fläche muss gesondert angefragt werden.", "Jedes Poster A1 (12 Stk.)"),
          ],
          en: [
            h("Gleimstraße entrance"),
            ul("Each poster A1 (12 pcs)", "Use and mounting of all posters: €70"),
            h("Corner of Schönhauser Allee and Gleimstraße"),
            ul("Available on separate request.", "Each poster A1 (12 pcs)"),
          ],
        },
      },
      {
        id: "banner-wagenhalle",
        title: { de: "Banner Wagenhalle/Bar", en: "Banner, Wagenhalle/bar" },
        segment: images(32),
        body: {
          de: [p("250 × 590 cm"), p("Ösung alle 25 cm (oben und unten geöst)"), p(FLAT_100_200.de)],
          en: [p("250 × 590 cm"), p("Eyelets every 25 cm (top and bottom)"), p(FLAT_100_200.en)],
        },
      },
      {
        id: "banner-fotowand",
        title: { de: "Banner Fotowand", en: "Banner, photo wall" },
        segment: images(33),
        body: {
          de: [p("492 × 220 cm"), p("Ösung !"), p(FLAT_100_200.de)],
          en: [p("492 × 220 cm"), p("Eyelets !"), p(FLAT_100_200.en)],
        },
      },
      {
        id: "feste-anzeigemonitore",
        title: { de: "Feste Anzeigemonitore", en: "Fixed display screens" },
        segment: tour(`${TOUR_BASE}#media-name=IMG_5146-A-EG-Wagenhalle_005&yaw=61.79&pitch=-2.04&fov=124.00`),
        body: {
          de: [p("Screens vor jedem Saal,"), p("42 Zoll (106 cm) · hochkant · 9:16 — ideal 1080 × 1920 px")],
          en: [p("Screens in front of every cinema,"), p("42 inch (106 cm) · portrait · 9:16 — ideally 1080 × 1920 px")],
        },
      },
      {
        id: "mobile-monitore",
        title: { de: "Mobile 4K Monitore", en: "Mobile 4K screens" },
        segment: images(30),
        body: {
          de: [
            p("Screens auf beweglichen Ständern, flexibel platzierbar & ausrichtbar."),
            p("60 Zoll (152 cm) · quer/hochkant · 16:9/9:16 — ideal 3840 × 2160 px (4K)"),
          ],
          en: [
            p("Screens on movable stands, flexible to place and to turn."),
            p("60 inch (152 cm) · landscape/portrait · 16:9/9:16 — ideally 3840 × 2160 px (4K)"),
          ],
        },
      },
      {
        id: "posterrahmen-indoor",
        title: { de: "Posterrahmen Indoor", en: "Indoor poster frames" },
        segment: images(34, 35),
        body: {
          de: [
            p("Diverse Positionen in der Wagenhalle (A1, 15 Stück)"),
            p("sowie in WCs über Urinalen (A3, Wagenhalle: 23, W-Hof: 20, Galerie: 22)"),
          ],
          en: [
            p("Various positions in the Wagenhalle (A1, 15 pcs)"),
            p("and in the restrooms, above the urinals (A3, Wagenhalle: 23, W-Hof: 20, Galerie: 22)"),
          ],
        },
      },
    ],
  },
  {
    id: "lage",
    title: { de: "Lage", en: "Location" },
    bottomMap: true,
    // Beside the whole section: the map.
    segment: { kind: "map" },
    intro: {
      de: [p(`Perfekt angebunden an den kulturreichen Kiez im Herzen von Berlin. ${LOREM}`)],
      en: [p(`Perfectly connected to the culturally rich neighbourhood in the heart of Berlin. ${LOREM}`)],
    },
    entries: [
      {
        id: "eingang-schoenhauser",
        group: { de: "Eingänge", en: "Entrances" },
        title: { de: "Schönhauser Allee 123", en: "Schönhauser Allee 123" },
        subtitle: { de: "Historischer Kinoeingang", en: "Historic cinema entrance" },
        places: [around("eg", 0.9006, 0.7699, 0.035)],
        body: { de: [p(LOREM)], en: [p(LOREM)] },
      },
      {
        id: "eingang-gleimstrasse",
        group: { de: "Eingänge", en: "Entrances" },
        title: { de: "Gleimstraße 31", en: "Gleimstraße 31" },
        subtitle: { de: "Modernisierter Atriumseingang", en: "Modernised atrium entrance" },
        places: [around("eg", 0.5293, 0.9119, 0.035)],
        body: { de: [p(LOREM)], en: [p(LOREM)] },
      },
      {
        id: "anlieferung",
        group: { de: "Anlieferung", en: "Deliveries" },
        title: { de: "Gleimstraße 35", en: "Gleimstraße 35" },
        subtitle: { de: "Umfassender Warenwirtschafts-/Zulieferungshof", en: "Extensive goods and delivery yard" },
        // PLACEHOLDER
        places: [around("eg", 0.2, 0.86, 0.06)],
        body: { de: [p(LOREM)], en: [p(LOREM)] },
      },
    ],
  },
  {
    id: "inventar",
    title: { de: "Inventar & Deko", en: "Inventory & decor" },
    intro: {
      de: [p("Einbindung folgt … dient als Planungsgrundlage für Veranstalter und Produktionspartner.")],
      en: [p("Coming soon … as a planning basis for organisers and production partners.")],
    },
    entries: [],
  },
  {
    id: "tech",
    title: { de: "Technische Grundausstattung", en: "Basic technical equipment" },
    entries: [
      {
        id: "stromversorgung",
        title: { de: "Stromversorgung", en: "Power supply" },
        segment: { kind: "map", pins: "power" },
        body: {
          de: [
            p(
              "Das Haus verfügt über diverse (Stark-)Stromanschlüsse, einsehbar auf der interaktiven Karte rechts: 32A CEE, 16A CEE, 63A CEE (Alternativ nutzbar), 32A CEE 1phasig",
            ),
          ],
          en: [
            p(
              "The building has a range of (high-voltage) power connections, shown on the interactive map on the right: 32A CEE, 16A CEE, 63A CEE (alternative use), 32A CEE single-phase",
            ),
          ],
        },
      },
      {
        id: "tech-kino-1",
        title: { de: "Kino 1", en: "Screen 1" },
        segment: images(24, 25),
        body: {
          de: [
            h("Bühne"),
            ul(
              "Bühnenbreite: ca. 10 m",
              "Bühnentiefe: ca. 3 m, aufgrund der Rundung an der tiefsten Stelle gemessen",
              "Bühnenzugänge auf Stage Left und Stage Right",
            ),
            h("Bild und Projektion"),
            ul(
              "Projektion über den fest installierten Kinoprojektor",
              "Kinoleinwand für Präsentationen, Film und Videocontent",
              "Externe Zuspielung und Präsentationsrechner nach technischer Abstimmung möglich",
            ),
            h("Ton"),
            ul(
              "Grundbeschallung des Saals vorhanden",
              "FOH Infrastruktur für Sprachveranstaltungen und Präsentationen",
              "Funkmikrofone und zusätzliche Audiotechnik nach Bedarf ergänzbar",
            ),
            h("Licht"),
            ul(
              "Einfache Bühnenausleuchtung als technische Grundversorgung",
              "Erweiterte Bühnen-, Effekt- und Ambientebeleuchtung nach Bedarf ergänzbar",
            ),
            p("Kino 1 eignet sich besonders für Vorträge, Panels, Screenings und Bühnenprogramme mit klarer Frontalsituation."),
          ],
          en: [
            h("Stage"),
            ul(
              "Stage width: approx. 10 m",
              "Stage depth: approx. 3 m, measured at the deepest point, as the stage is curved",
              "Stage access from stage left and stage right",
            ),
            h("Picture and projection"),
            ul(
              "Projection through the permanently installed cinema projector",
              "Cinema screen for presentations, film and video content",
              "External playback and presentation computers possible after technical coordination",
            ),
            h("Sound"),
            ul(
              "Basic PA for the room in place",
              "FOH infrastructure for talks and presentations",
              "Wireless microphones and further audio equipment can be added as needed",
            ),
            h("Light"),
            ul(
              "Simple stage lighting as the technical basics",
              "Further stage, effect and ambient lighting can be added as needed",
            ),
            p("Screen 1 suits talks, panels, screenings and stage programmes with a clear frontal set-up best."),
          ],
        },
      },
      {
        id: "tech-kino-7",
        title: { de: "Kino 7", en: "Screen 7" },
        segment: images(36),
        body: {
          de: [
            h("Bild und Projektion"),
            ul(
              "Kinoleinwand im Saal",
              "Videozuspielung über HDMI möglich",
              "Bildmischer und Medienrechner können veranstaltungsbezogen eingebunden werden",
            ),
            h("Ton"),
            ul(
              "Digitale Audioregie mit Dante fähiger Infrastruktur",
              "Funkmikrofonie für Moderation, Panels und Präsentationen möglich",
              "Anbindung externer Audioquellen möglich",
            ),
            h("Licht"),
            ul("DMX Infrastruktur vorhanden", "Bühnen- und Präsentationslicht kann passend zum Format ergänzt werden"),
            h("Signal und Infrastruktur"),
            ul(
              "CAT Verkabelung für Audio und Steuersignale",
              "HDMI Signalwege für Präsentations- und Videozuspielung",
              "Stromverteilung für Veranstaltungstechnik im Saal",
            ),
            p("Kino 7 ist für klassische Präsentationsformate, Panels, Screenings und kleinere Bühnenproduktionen ausgelegt."),
          ],
          en: [
            h("Picture and projection"),
            ul(
              "Cinema screen in the room",
              "Video playback over HDMI possible",
              "Vision mixers and media computers can be brought in for the event",
            ),
            h("Sound"),
            ul(
              "Digital audio control with Dante-capable infrastructure",
              "Wireless microphones for hosts, panels and presentations possible",
              "External audio sources can be connected",
            ),
            h("Light"),
            ul("DMX infrastructure in place", "Stage and presentation lighting can be added to suit the format"),
            h("Signal and infrastructure"),
            ul(
              "CAT cabling for audio and control signals",
              "HDMI signal paths for presentation and video playback",
              "Power distribution for event equipment in the room",
            ),
            p("Screen 7 is made for classic presentation formats, panels, screenings and smaller stage productions."),
          ],
        },
      },
      {
        id: "tech-kino-10",
        title: { de: "Kino 10", en: "Screen 10" },
        segment: images(18),
        body: {
          de: [
            h("Bühne und Bühnenbereich"),
            ul(
              "Bühnenbereich: ca. 18 m breit und ca. 4 m tief bis zur ersten Sitzreihe",
              "Nutzbare Bühnenfläche zwischen den Traversen Towern: ca. 11,50 m × 3,50 m",
              "Bütec Bühnenfläche: ca. 10 m × 3 m",
            ),
            h("Beschallung"),
            ul(
              "PA Tower in FD34P Ausführung",
              "L Acoustics Kiva Line Array System",
              "L Acoustics Kilo Low Mid Erweiterung",
              "Kirsch Audio Birk218 Subwoofer",
              "Side Fill vorhanden",
              "Front Fill und Center Speaker je nach Setup ergänzbar",
            ),
            h("Ton und Regie"),
            ul(
              "Digitale FOH Audioregie",
              "Digitale Stagebox und CAT basierte Signalführung",
              "Funkmikrofonie, Headsets und Bodypacks nach Bedarf einsetzbar",
              "Intercom für größere Produktionen möglich",
            ),
            h("Licht"),
            ul(
              "Seitenbeleuchtung für den Bühnenbereich",
              "Profiler und LED Flächenleuchten für Bühnen- und Keylight Setups",
              "DMX gesteuerte Lichttechnik",
              "Erweiterte Show- und Ambientebeleuchtung nach Bedarf möglich",
            ),
            h("Bild und Projektion"),
            ul(
              "Große Kinoleinwand",
              "Hochleistungsprojektion für Präsentationen und Videocontent",
              "Bildregie und Umschaltung mehrerer Quellen möglich",
              "HDMI und Glasfaser Signalwege für größere Video Setups",
            ),
            h("Strom"),
            ul("1 × 32 A CEE", "2 × 230 V Schuko", "Weitere Starkstromanschlüsse nach technischer Abstimmung"),
            p(
              "Kino 10 ist der technisch umfangreichste Saal und eignet sich insbesondere für größere Bühnenproduktionen, Konferenzen, Shows, Musikformate und komplexere Medienproduktionen.",
            ),
          ],
          en: [
            h("Stage and stage area"),
            ul(
              "Stage area: approx. 18 m wide and approx. 4 m deep up to the first row",
              "Usable stage between the truss towers: approx. 11.50 m × 3.50 m",
              "Bütec stage: approx. 10 m × 3 m",
            ),
            h("PA"),
            ul(
              "PA towers in FD34P design",
              "L-Acoustics Kiva line array system",
              "L-Acoustics Kilo low-mid extension",
              "Kirsch Audio Birk218 subwoofers",
              "Side fills in place",
              "Front fills and centre speaker can be added depending on the set-up",
            ),
            h("Sound and control"),
            ul(
              "Digital FOH audio control",
              "Digital stagebox and CAT-based signal routing",
              "Wireless microphones, headsets and bodypacks as needed",
              "Intercom possible for larger productions",
            ),
            h("Light"),
            ul(
              "Side lighting for the stage area",
              "Profiles and LED panels for stage and key-light set-ups",
              "DMX-controlled lighting",
              "Further show and ambient lighting possible as needed",
            ),
            h("Picture and projection"),
            ul(
              "Large cinema screen",
              "High-performance projection for presentations and video content",
              "Vision control and switching between several sources possible",
              "HDMI and fibre signal paths for larger video set-ups",
            ),
            h("Power"),
            ul("1 × 32 A CEE", "2 × 230 V Schuko", "Further high-voltage connections after technical coordination"),
            p(
              "Screen 10 is the most extensively equipped room, suited above all to larger stage productions, conferences, shows, music formats and more complex media productions.",
            ),
          ],
        },
      },
    ],
  },
  {
    id: "gastro",
    title: { de: "Gastro", en: "Food & drink" },
    segment: images(8),
    entries: [
      { id: "bars", title: { de: "Bars", en: "Bars" }, body: { de: [p(LOREM)], en: [p(LOREM)] } },
      { id: "catering", title: { de: "Catering", en: "Catering" }, body: { de: [p(LOREM)], en: [p(LOREM)] } },
    ],
  },
];

function floorPlanLinks(lang: Lang) {
  return [
    { label: "PDF", href: "https://drive.google.com/drive/folders/1kVHZEs-JLafgrMfkRFOC5tXlTSe8cWPS" },
    { label: "CAD/DWG", href: "https://drive.google.com/drive/folders/1MP6QqpcntvmGq2WW9KG2e3zqGE1L96iz" },
    { label: lang === "de" ? "3D Tour" : "3D tour", href: TOUR_SCHOENHAUSER },
  ];
}
