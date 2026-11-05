"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setEventAreas, setEventPins } from "@/lib/actions/events";
import { cn } from "@/lib/utils/cn";
import { areaContains, MAX_AREA_POINTS, MAX_AREAS, type AreaPoint, type MapArea } from "@/lib/eventAreas";
import { linkedAreas } from "@/lib/venueAreas";
import { MAX_PIN_TITLE, MAX_PINS, type MapPin } from "@/lib/eventPins";
import { floorOf, FLOORS, type Floor } from "@/lib/venueFloors";
import { hallSplitCase } from "@/lib/checkliste";
import type { EventPerson, EventSummary } from "@/lib/events";
import { useScreenStatuses } from "@/lib/realtime/useScreenStatuses";
import type { VenueScreens } from "@/lib/venueScreens";
import {
  ChecklistReviewContext,
  ChecklistStateContext,
  reviewTypeIn,
  useChecklistReview,
  useChecklistState,
  type ChecklistState,
} from "./checklistState";
import { formatScrubMoment } from "./eventFormat";
import { EventsPane } from "./EventsPane";
import { NotePin } from "./NotePin";
import { EventDatesContext } from "./ParkingDates";
import { LinkedPinCard, pinAnswerKeys, pinChecklistAnchor, pinIsOn } from "./PinMenus";
import { ScreenPin } from "./ScreenPin";
import { MapCard, VenueMap, type MapFloor, type MapSpot, type PlanGeo } from "./VenueMap";

// Colosseum Berlin, the floors we serve, as vectors: the drawing slimmed
// down by scripts/flatten-floorplan.mjs (SCALE=100: all three were exported
// in one 101 × 53 frame, which they keep, so they line up). They move
// better on an iPad than the same drawn as pictures, one pixel per unit, by
// scripts/rasterize-floorplan.mjs — which still draws each floor's ghost,
// for while another's picked.
// True north points 11° clockwise of the plan's top edge, so facing north
// with the compass on, the plan sits turned 11° anticlockwise. (Lined up by
// eye on site, with the compass on.)
const NORTH_DEG = 11;
// Where the plans lie on the earth, from fitting OpenStreetMap's outline of
// the building onto the ground floor's walls: its south-east corner
// (52.5478° N, 13.41299° E) at the plan's lower right, the plan turned 9.4°
// from true north, and about 1.51 cm a unit — 66 to the metre, the
// building some 137 m end to end. All three floors are drawn to it.
const COLOSSEUM_GEO: PlanGeo = { lat: 52.5478, lon: 13.41299, x: 8461, y: 4662, turnDeg: 9.4, unitsPerMetre: 66.2 };
const FLOOR_NAMES: Record<Floor, { label: string; name: string }> = {
  eg: { label: "E", name: "Erdgeschoss" },
  zwischen: { label: "Zw", name: "Zwischengeschoss" },
  og: { label: "OG", name: "Obergeschoss" },
};
const COLOSSEUM: MapFloor[] = FLOORS.map((floor) => {
  const base = `/venues/colosseum-${floor}`;
  return {
    id: floor,
    ...FLOOR_NAMES[floor],
    plan: {
      src: `${base}.svg`,
      ghost: `${base}-ghost.webp`,
      width: 10100,
      height: 5300,
      vector: true,
      northDeg: NORTH_DEG,
      geo: COLOSSEUM_GEO,
    },
  };
});

// The map's standing pins, on every event: where each sits on the plan, as
// a fraction of its width and height, and on which floor (the ground floor
// if none). Placed as the pins of an untitled event without a date and
// copied out (see copyPins). Those whose id PinMenus knows (PIN_LINKS)
// work the open event's Checkliste; the rest are names. Where two meet, the
// later one's drawn over the earlier (Banner Outdoor over Haustechnik K1,
// Garderobe over Technik).
const DEFAULT_PINS: { id: string; title: string; u: number; v: number; floor?: Floor }[] = [
  { id: "banner-indoor", title: "Banner Indoor", u: 0.1392, v: 0.3728 },
  { id: "projektion-indoor", title: "Projektion Indoor", u: 0.4925, v: 0.6599 },
  { id: "haustechnik-k1", title: "Haustechnik K1", u: 0.5759, v: 0.8443 },
  { id: "banner-outdoor", title: "Banner Outdoor", u: 0.5676, v: 0.8777 },
  { id: "kino-5", title: "Kino 5", u: 0.1153, v: 0.242 },
  { id: "kino-4", title: "Kino 4", u: 0.206, v: 0.2833 },
  { id: "kino-3", title: "Kino 3", u: 0.2775, v: 0.3166 },
  { id: "kino-2", title: "Kino 2", u: 0.3669, v: 0.3553 },
  { id: "wc-halle-kino", title: "WC Halle/Kino", u: 0.4139, v: 0.3977 },
  { id: "wc-halle-hof", title: "WC Halle/Hof", u: 0.0839, v: 0.6887 },
  { id: "wc-kino", title: "WC Kino", u: 0.6558, v: 0.8845 },
  { id: "akkreditierung", title: "Akkreditierung", u: 0.4238, v: 0.7632 },
  { id: "technik", title: "Technik", u: 0.4318, v: 0.5243 },
  { id: "garderobe", title: "Garderobe", u: 0.4669, v: 0.5777 },
  { id: "kueche", title: "Küche", u: 0.0961, v: 0.4337 },
  { id: "main-bar", title: "Main Bar", u: 0.1674, v: 0.4862 },
  { id: "halle-geteilt", title: "Halle Geteilt", u: 0.283, v: 0.5576 },
  { id: "eingang-gleimstr", title: "Eingang Gleimstr.", u: 0.5293, v: 0.9119 },
  { id: "eingang-schoenhauser", title: "Eingang Schönh.", u: 0.9006, v: 0.7699 },
  { id: "kino-1", title: "Kino 1", u: 0.7541, v: 0.7169 },
  { id: "galerie-bar", title: "Galerie Bar", u: 0.4054, v: 0.5179, floor: "og" },
  { id: "kino-10", title: "Kino 10", u: 0.2042, v: 0.4013, floor: "og" },
  { id: "wc-oben", title: "WC Oben", u: 0.3549, v: 0.3715, floor: "og" },
  { id: "kino-7", title: "Kino 7", u: 0.2792, v: 0.6429, floor: "og" },
  { id: "kino-6", title: "Kino 6", u: 0.3907, v: 0.6424, floor: "og" },
  { id: "kino-8", title: "Kino 8", u: 0.153, v: 0.6414, floor: "og" },
  { id: "kino-9", title: "Kino 9", u: 0.0809, v: 0.4805, floor: "og" },
  { id: "telekollegen", title: "Telekollegen", u: 0.1088, v: 0.4361, floor: "og" },
  { id: "screen-9", title: "Screen 9", u: 0.1251, v: 0.5204, floor: "og" },
  { id: "screen-8", title: "Screen 8", u: 0.2377, v: 0.574, floor: "og" },
  { id: "screen-7", title: "Screen 7", u: 0.3075, v: 0.575, floor: "og" },
  { id: "screen-6", title: "Screen 6", u: 0.3617, v: 0.575, floor: "og" },
  { id: "screen-10", title: "Screen 10", u: 0.292, v: 0.4727, floor: "og" },
  { id: "screen-4", title: "Screen 4", u: 0.2074, v: 0.3682 },
  { id: "screen-3", title: "Screen 3", u: 0.2547, v: 0.3935 },
  { id: "screen-2", title: "Screen 2", u: 0.295, v: 0.4066 },
  { id: "screen-5", title: "Screen 5", u: 0.1656, v: 0.3503 },
  { id: "screen-mainbar", title: "Screen Mainbar", u: 0.1565, v: 0.5265 },
  { id: "screen-popcornbar-l", title: "Screen Popcornbar L", u: 0.8264, v: 0.8069 },
  { id: "screen-popcornbar-r", title: "Screen Popcornbar R", u: 0.795, v: 0.7855 },
  { id: "dj-position-treppe", title: "DJ Position Treppe", u: 0.4134, v: 0.5125 },
  { id: "sicherheit", title: "Sicherheit", u: 0.4418, v: 0.8025 },
  { id: "zwischenebene", title: "Zwischenebene", u: 0.477, v: 0.5235, floor: "zwischen" },
  { id: "galerie-flaeche", title: "Galerie Fläche", u: 0.1941, v: 0.5202, floor: "og" },
  { id: "barrierefreiheit", title: "Barrierefreiheit", u: 0.4652, v: 0.8454 },
  { id: "parken-kino", title: "Parkv. Kino", u: 0.6388, v: 0.9521 },
  { id: "parken-bioco", title: "Parkv. BioCo", u: 0.3724, v: 0.9559 },
];

// Standing pins shown as their dot alone, to keep the map clear: a tap on
// the dot brings out its card, and another puts it away. One also comes
// out by itself when what it shows changes from elsewhere (the Checkliste).
const DOT_PINS = new Set([
  "dj-position-treppe",
  "projektion-indoor",
  "wc-halle-kino",
  "wc-halle-hof",
  "wc-kino",
  "wc-oben",
  "screen-mainbar",
  "screen-popcornbar-l",
  "screen-popcornbar-r",
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `screen-${n}`),
]);

// The screen pins, by the dashboard's name for their screen: shown on the
// Events list's map too, each with a little preview of its screen (see
// ScreenPin).
const SCREEN_PINS: Record<string, string> = {
  ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [`screen-${n}`, `Kino ${n}`])),
  "screen-mainbar": "Mainbar",
  "screen-popcornbar-l": "Popcornbar L",
  "screen-popcornbar-r": "Popcornbar R",
};

// What the next tap on the map does: drop a new pin, or a note (see
// NotePin), move one there (onto the floor shown then, if it's been
// switched since), or add a corner to the area being drawn (its corners so
// far).
type Placing =
  | { kind: "new" }
  | { kind: "note" }
  | { kind: "move"; id: string }
  | { kind: "area"; points: AreaPoint[] };

// The open event's own pins and areas are edited in edit mode
// ("Bearbeiten") — hidden for now, with notes ("Notiz") in its place;
// true brings it back.
const SHOW_EDITING = false;

// Following the map with the Checkliste (see followMap): another pin's part
// of the list takes over only once its pin is this much nearer the map's
// middle than the one followed, so the list doesn't jump back and forth
// with the middle halfway between two.
const FOLLOW_SWITCH = 0.85;
// Followed whether they're on the map or not: Halle Geteilt while the
// hall's split isn't a question, and the Galerie Fläche from the floors
// below it.
const ALWAYS_FOLLOWED = new Set(["halle-geteilt", "galerie-flaeche"]);

// Scrolls the Checkliste to a category's or section's heading, just below
// the page's title bar, which stays over the top of the list. (Not with
// scrollIntoView, which would scroll whatever holds the list as well.)
function scrollChecklistTo(key: string) {
  const heading = document.getElementById(`checkliste-${key}`);
  let scroller = heading?.parentElement ?? null;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!heading || !scroller) return;
  const bar = scroller.querySelector(".sticky")?.getBoundingClientRect().height ?? 0;
  const top =
    heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - bar - 8;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

// The Events page: the events on one side (top on a phone, left on an iPad
// or desktop), each opening into its own setup pages, and the venue map on
// the other — with the open event's own pins and highlighted areas on it.
// The standing pins work the open event's Checkliste (see PinMenus). Notes
// are put on the map with "Notiz" (see NotePin); its own pins are named,
// moved and placed in edit mode ("Bearbeiten", hidden for now), and its
// areas drawn there corner by corner (tapping the first corner again closes
// one) or picked out with a tap to be deleted. With no event open, the map
// shows the screens' pins, live — or, scrubbing the calendar to another
// day, what they'll be showing then, beside the events on at that moment.
export function EventsView({
  events,
  people,
  screens,
}: {
  events: EventSummary[];
  people: EventPerson[];
  screens: VenueScreens;
}) {
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  // The open event, from the URL (where EventsPane keeps it), and whether
  // its Checkliste is the page showing.
  const params = useSearchParams();
  const eventId = params.get("event");
  const inChecklist = !!eventId && params.get("view") === "checkliste";
  const event = eventId ? events.find((e) => e.id === eventId) : undefined;
  // The events on the day the Events list's calendar is being scrubbed
  // over: shown on the map as if open — their pins, their Checkliste on
  // the standing pins — but only to look at, and only while no event is
  // open. Several on one day show together, combined: set up, they never
  // claim the same thing (the venue has one of each), so whichever has an
  // answer for something gives it.
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  // The moment it's scrubbed to: those events are the ones on then.
  const [scrubAt, setScrubAt] = useState<Date | null>(null);
  const previewAt = event ? null : scrubAt;
  function preview(ids: string[], at: Date | null = null) {
    setPreviewIds(ids);
    setScrubAt(at);
  }
  const previewEvents = event
    ? []
    : previewIds.map((id) => events.find((e) => e.id === id)).filter((e): e is EventSummary => !!e);

  // Pins as changed here, ahead of the server (which catches up on the
  // next render of the page), by event.
  const [pinEdits, setPinEdits] = useState<Record<string, MapPin[]>>({});
  const pins = event ? (pinEdits[event.id] ?? event.mapPins) : previewEvents.flatMap((e) => e.mapPins);
  // Areas likewise.
  const [areaEdits, setAreaEdits] = useState<Record<string, MapArea[]>>({});
  const areas = event ? (areaEdits[event.id] ?? event.mapAreas) : previewEvents.flatMap((e) => e.mapAreas);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  // The floor on show: only its pins and areas are on the map.
  const [floor, setFloor] = useState<Floor>("eg");
  const floorPins = pins.filter((p) => floorOf(p) === floor);
  const floorAreas = areas.filter((a) => floorOf(a) === floor);
  const [editing, setEditing] = useState(false);
  // The note being written in, if any (see NotePin).
  const [editingNote, setEditingNote] = useState<string | null>(null);
  // The open event's Checkliste, shared by its setup page and the pins —
  // while a type switch is being reviewed, as that would leave it (unsaved,
  // see ChecklistReview), on the map as on the list.
  const savedChecklist = useChecklistState(event);
  const review = useChecklistReview(event, reviewTypeIn(params, event), savedChecklist);
  const checklist = review?.state ?? savedChecklist;
  const previewChecklist: ChecklistState | null =
    previewEvents.length > 0
      ? {
          answer: (key) => previewEvents.map((e) => e.checklist[key]).find((a) => a !== null && a !== undefined) ?? null,
          save: () => {},
          error: null,
        }
      : null;
  // With the venue's own areas whose option is ticked for what's on show
  // (the Wagenhalle's halls — see venueAreas), beneath the event's own.
  const shownAreas = [...linkedAreas(event ? checklist.answer : (previewChecklist?.answer ?? null)), ...areas].filter(
    (a) => floorOf(a) === floor,
  );
  const [message, setMessage] = useState<string | null>(null);
  // The screens' players, as the dashboard follows them.
  const statusOf = useScreenStatuses(screens.statuses);
  const mediaById = useMemo(() => new Map(screens.media.map((m) => [m.id, m])), [screens.media]);
  const screenByPin = useMemo(() => {
    const byName = new Map(screens.screens.map((screen) => [screen.name.trim().toLowerCase(), screen]));
    return new Map(Object.entries(SCREEN_PINS).flatMap(([pin, name]) => {
      const screen = byName.get(name.toLowerCase());
      return screen ? [[pin, screen] as const] : [];
    }));
  }, [screens.screens]);
  // The dot pins brought out (see DOT_PINS), and what each showed last
  // render, to bring one out when that changes from elsewhere.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const shownAnswers = useRef<{ event: string | undefined; byPin: Map<string, string> } | null>(null);
  const toggleRevealed = (id: string) =>
    setRevealed((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const dotAnswers = JSON.stringify(
    [...DOT_PINS].map((id) => [id, JSON.stringify(pinAnswerKeys(id).map((key) => checklist.answer(key)))]),
  );
  const eventKey = event?.id;
  useEffect(() => {
    const byPin = new Map<string, string>(JSON.parse(dotAnswers));
    const before = shownAnswers.current;
    shownAnswers.current = { event: eventKey, byPin };
    // A first look, or another event: nothing's changed yet.
    if (!before || before.event !== eventKey) return;
    const changed = [...byPin].filter(([id, now]) => before.byPin.get(id) !== now).map(([id]) => id);
    if (changed.length) setRevealed((all) => new Set([...all, ...changed]));
  }, [dotAnswers, eventKey]);
  // Live, unless the calendar's scrubbed to another day than today.
  const screensAt = previewAt && previewAt.toDateString() !== new Date().toDateString() ? previewAt : null;
  // Saves go one after another, so an older list can't land after a newer.
  const saveChain = useRef(Promise.resolve());

  // A note (copied, or a save that failed) goes again after a few seconds.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);


  // Another event opened (or none): nothing of the last one's stays open
  // or half-placed.
  const [shownEventId, setShownEventId] = useState(eventId);
  if (shownEventId !== eventId) {
    setShownEventId(eventId);
    setPlacing(null);
    setOpenSpot(null);
    setEditing(false);
    setEditingNote(null);
    setSelectedArea(null);
    setRevealed(new Set());
  }

  // Another floor: whatever was open or picked out on the last goes, and so
  // does an area half drawn there. A pin being placed or moved lands on
  // the new one.
  function pickFloor(next: string) {
    setFloor(next as Floor);
    setOpenSpot(null);
    setSelectedArea(null);
    if (placing?.kind === "area") setPlacing(null);
  }

  // Opens the event's Checkliste (if it isn't already) at this category.
  // The page slides in first, so the heading is looked for over the next
  // second or so until it's there.
  function showChecklistCategory(categoryKey: string) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("view") !== "checkliste") {
      url.searchParams.set("view", "checkliste");
      window.history.pushState(null, "", url);
    }
    const started = performance.now();
    const find = () => {
      const heading = document.getElementById(`checkliste-${categoryKey}`);
      if (heading) heading.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (performance.now() - started < 1500) requestAnimationFrame(find);
    };
    requestAnimationFrame(find);
  }

  // A note's text as it's typed; and once it's left, kept — or, left empty,
  // the note taken off the map. From the pins as they are by then (a note
  // closing as another's placed, say), not as they were when it opened.
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  });
  function saveNote(id: string, note: string) {
    const current = pinsRef.current;
    if (current.find((p) => p.id === id)?.note === note) return;
    savePins(current.map((p) => (p.id === id ? { ...p, note } : p)));
  }
  function finishNote(id: string, note: string) {
    setEditingNote((n) => (n === id ? null : n));
    if (note.trim()) saveNote(id, note);
    else savePins(pinsRef.current.filter((p) => p.id !== id));
  }

  function savePins(next: MapPin[]) {
    if (!event) return;
    const id = event.id;
    setPinEdits((all) => ({ ...all, [id]: next }));
    saveChain.current = saveChain.current
      .then(async () => {
        const error = await setEventPins(id, next);
        if (error) setMessage(error);
      })
      // Offline, say: noted, and the chain carries on for the next save.
      .catch(() => setMessage("Pins konnten nicht gespeichert werden"));
  }

  function saveAreas(next: MapArea[]) {
    if (!event) return;
    const id = event.id;
    setAreaEdits((all) => ({ ...all, [id]: next }));
    saveChain.current = saveChain.current
      .then(async () => {
        const error = await setEventAreas(id, next);
        if (error) setMessage(error);
      })
      .catch(() => setMessage("Flächen konnten nicht gespeichert werden"));
  }

  // The area being drawn, closed (on its first corner) and kept.
  function closeArea() {
    if (placing?.kind !== "area" || placing.points.length < 3) return;
    const area: MapArea = { id: crypto.randomUUID(), points: placing.points, floor };
    saveAreas([...areas, area]);
    setPlacing(null);
    setSelectedArea(null);
  }

  function onMapTap(at: { u: number; v: number } | null) {
    if (!placing) {
      setOpenSpot(null);
      // While editing, a tap on an area picks it out (the topmost, where
      // they overlap); anywhere else lets it go.
      if (editing) setSelectedArea((at && [...floorAreas].reverse().find((a) => areaContains(a, at))?.id) ?? null);
      return;
    }
    if (!at || at.u < 0 || at.u > 1 || at.v < 0 || at.v > 1) return; // off the plan: keep waiting
    const u = Math.round(at.u * 10000) / 10000;
    const v = Math.round(at.v * 10000) / 10000;
    if (placing.kind === "area") {
      if (placing.points.length < MAX_AREA_POINTS) setPlacing({ kind: "area", points: [...placing.points, { u, v }] });
      return;
    }
    if (placing.kind === "note") {
      // Opened at once, to be written in.
      const pin: MapPin = { id: crypto.randomUUID(), title: "Notiz", u, v, floor, note: "" };
      savePins([...pins, pin]);
      setOpenSpot(`pin:${pin.id}`);
      setEditingNote(pin.id);
    } else if (placing.kind === "new") {
      const pin: MapPin = { id: crypto.randomUUID(), title: `Pin ${pins.length + 1}`, u, v, floor };
      savePins([...pins, pin]);
      setOpenSpot(`pin:${pin.id}`);
    } else {
      savePins(pins.map((p) => (p.id === placing.id ? { ...p, u, v, floor } : p)));
    }
    setPlacing(null);
  }

  // TEMPORARY: copies the map's pins (the standing ones and the open
  // event's) as code, to take pins placed here into DEFAULT_PINS by hand.
  async function copyPins() {
    const onFloor = (p: { floor?: Floor }) => (floorOf(p) === "eg" ? "" : `, floor: "${floorOf(p)}"`);
    const lines = [
      ...DEFAULT_PINS.map(
        (p) => `  { id: ${JSON.stringify(p.id)}, title: ${JSON.stringify(p.title)}, u: ${p.u}, v: ${p.v}${onFloor(p)} },`,
      ),
      ...pins.map((p) => `  { title: ${JSON.stringify(p.title)}, u: ${p.u}, v: ${p.v}${onFloor(p)} },`),
    ];
    const text = `[\n${lines.join("\n")}\n]`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${lines.length} Pins kopiert`);
    } catch {
      window.prompt("Pins kopieren:", text);
    }
  }

  const draft = placing?.kind === "area" ? placing.points : null;

  // An event open, all the standing pins; none, the screens alone — or all
  // of them again for the events on at a moment scrubbed to. Their switches
  // and options are only for the Checkliste: anywhere else (the event's
  // other pages, a moment previewed) the pins are names, and those switched
  // off aren't shown at all.
  const answersOnShow = event ? checklist.answer : (previewChecklist?.answer ?? null);
  const pinState = event && !editing && inChecklist ? checklist : null;
  const standing = DEFAULT_PINS.filter(
    (pin) =>
      floorOf(pin) === floor &&
      (event || previewEvents.length > 0 || screenByPin.has(pin.id)) &&
      (inChecklist || editing || !answersOnShow || pinIsOn(pin.id, answersOnShow) !== false) &&
      // Halle Geteilt, only while the hall could be shared.
      (pin.id !== "halle-geteilt" || editing || (!!answersOnShow && hallSplitCase(answersOnShow) !== null)),
  );

  // While the map's moved by hand with the Checkliste open, the list keeps
  // to the part whose pin (on the floor on show, or one of ALWAYS_FOLLOWED)
  // is nearest the map's middle — scrolled there each time that changes.
  // Once the map comes to rest the list is left alone, to be scrolled as
  // anyone likes; the next move starts following afresh.
  const followed = useRef<string | null>(null);
  function followMap(centre: { u: number; v: number } | null) {
    if (!centre) {
      followed.current = null;
      return;
    }
    if (!pinState) return;
    // Nearest by the plan's own lengths (it's wider than it's tall), each
    // part by the nearest of its pins.
    const { width, height } = COLOSSEUM[0].plan;
    const near = new Map<string, number>();
    const followable = [...standing, ...DEFAULT_PINS.filter((p) => ALWAYS_FOLLOWED.has(p.id) && !standing.includes(p))];
    for (const pin of followable) {
      const anchor = pinChecklistAnchor(pin.id);
      if (!anchor) continue;
      const d = Math.hypot((pin.u - centre.u) * width, (pin.v - centre.v) * height);
      near.set(anchor, Math.min(d, near.get(anchor) ?? Infinity));
    }
    let best: string | null = null;
    for (const [anchor, d] of near) if (best === null || d < near.get(best)!) best = anchor;
    if (best === null || best === followed.current) return;
    const current = followed.current !== null ? near.get(followed.current) : undefined;
    if (current !== undefined && near.get(best)! > current * FOLLOW_SWITCH) return;
    followed.current = best;
    scrollChecklistTo(best);
  }

  const spots: MapSpot[] = [
    ...standing.map((pin) => {
      const screen = !event ? screenByPin.get(pin.id) : undefined;
      return {
        id: pin.id,
        u: pin.u,
        v: pin.v,
        front: openSpot === pin.id,
        node: screen ? (
          <ScreenPin
            title={pin.title}
            screen={screen}
            status={statusOf(screen.id)}
            mediaById={mediaById}
            at={screensAt}
          />
        ) : (
          <DotPin
            dot={DOT_PINS.has(pin.id)}
            shown={revealed.has(pin.id)}
            title={pin.title}
            onToggle={() => {
              if (revealed.has(pin.id)) setOpenSpot((s) => (s === pin.id ? null : s));
              toggleRevealed(pin.id);
            }}
          >
            <LinkedPinCard
              pin={pin}
              // While editing, the standing pins are only names.
              state={pinState}
              open={openSpot === pin.id}
              onOpenChange={(open) => setOpenSpot((s) => (open ? pin.id : s === pin.id ? null : s))}
              onShowCategory={showChecklistCategory}
            />
          </DotPin>
        ),
      };
    }),
    ...floorPins.map((pin) => {
      const spotId = `pin:${pin.id}`;
      if (pin.note !== undefined) {
        return {
          id: spotId,
          u: pin.u,
          v: pin.v,
          front: openSpot === spotId,
          node: (
            <NotePin
              note={pin.note}
              open={openSpot === spotId}
              editing={editingNote === pin.id}
              canEdit={!!event}
              onOpenChange={(open) => setOpenSpot((s) => (open ? spotId : s === spotId ? null : s))}
              onEdit={() => {
                setOpenSpot(spotId);
                setEditingNote(pin.id);
              }}
              onSave={(text) => saveNote(pin.id, text)}
              onDone={(text) => finishNote(pin.id, text)}
            />
          ),
        };
      }
      return {
        id: spotId,
        u: pin.u,
        v: pin.v,
        front: openSpot === spotId,
        node: (
          <MapCard
            title={pin.title || "Pin"}
            open={editing && openSpot === spotId}
            onToggle={() => setOpenSpot((s) => (s === spotId ? null : spotId))}
          >
            {editing && (
              <PinEditor
                key={pin.id}
                pin={pin}
                onRename={(title) => savePins(pins.map((p) => (p.id === pin.id ? { ...p, title } : p)))}
                onMove={() => {
                  setOpenSpot(null);
                  setPlacing({ kind: "move", id: pin.id });
                }}
                onDelete={() => {
                  setOpenSpot(null);
                  savePins(pins.filter((p) => p.id !== pin.id));
                }}
              />
            )}
          </MapCard>
        ),
      };
    }),
    // The corners of the area being drawn: the first one a ring to tap to
    // close it, once there are enough corners for an area.
    ...(draft ?? []).map((point, i) => ({
      id: `corner:${i}`,
      u: point.u,
      v: point.v,
      node: i === 0 ? <FirstCorner canClose={draft!.length >= 3} onClose={closeArea} /> : <Corner />,
    })),
  ];

  return (
    <ChecklistReviewContext.Provider value={review}>
    <ChecklistStateContext.Provider value={checklist}>
      {/* The open event's dates, for its parking calendars to show under theirs. */}
      <EventDatesContext.Provider value={event ?? null}>
        {/* Fills the page's scroll area edge to edge (undoing its padding): each
            half scrolls or pans on its own instead. */}
        <div className="-mx-5 -my-6 flex h-[calc(100%+3rem)] flex-col md:flex-row">
          <div className="min-h-0 flex-1 border-b border-border md:w-[420px] md:flex-none md:border-b-0 md:border-r lg:w-[460px]">
            <EventsPane
              events={events}
              people={people}
              previewIds={previewEvents.map((e) => e.id)}
              previewAt={previewAt}
              onPreview={preview}
            />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <VenueMap
              className="min-h-0 flex-1"
              floors={COLOSSEUM}
              floor={floor}
              onFloorChange={pickFloor}
              focus={null}
              onBackgroundTap={onMapTap}
              onHandMove={followMap}
              spots={spots}
              areas={shownAreas}
              selectedArea={editing ? selectedArea : null}
              draft={draft}
            />

            {previewAt && (
              // The moment scrubbed to on the Events list's calendar, to the
              // minute, set like the map's controls.
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex h-11 items-center rounded-[var(--radius-md)] border border-border glass-material px-3.5 text-[15px] font-semibold tabular-nums shadow-[var(--shadow-float)]">
                {formatScrubMoment(previewAt)}
              </div>
            )}

            {/* Along the map's bottom, with an event open: "Notiz" — or, with
                SHOW_EDITING, "Bearbeiten", and while editing, "+ Pin" and
                "+ Fläche" (or what a tap on the map is about to do),
                deleting the area picked out, for now copying the pins out,
                and "Fertig". Clear of the floor picker in the corner. */}
            <div className="pointer-events-none absolute bottom-3 left-3 right-[68px] z-20 flex flex-wrap items-end gap-2">
              {/* With an event open: "Notiz" puts a note on the map, a tap
                  on the plan saying where (see NotePin). */}
              {event && !editing &&
                (placing?.kind === "note" ? (
                  <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border glass-material py-1.5 pl-4 pr-1.5 text-[14px] shadow-[var(--shadow-float)]">
                    <span>Tippe auf den Plan, um die Notiz zu setzen</span>
                    <button
                      type="button"
                      onClick={() => setPlacing(null)}
                      className="rounded-full bg-[var(--control-fill)] px-3 py-1.5 font-medium hover:bg-[var(--control-fill-hover)]"
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSpot(null);
                      setPlacing({ kind: "note" });
                    }}
                    disabled={pins.length >= MAX_PINS}
                    className={cn(PILL, "disabled:opacity-40")}
                  >
                    Notiz
                  </button>
                ))}
              {SHOW_EDITING && event && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenSpot(null);
                    setEditing(true);
                  }}
                  className={PILL}
                >
                  Bearbeiten
                </button>
              )}
              {event && editing && (
                <>
                  {placing?.kind === "area" ? (
                    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border glass-material py-1.5 pl-4 pr-1.5 text-[14px] shadow-[var(--shadow-float)]">
                      <span>
                        {placing.points.length < 3
                          ? "Tippe die Ecken der Fläche auf den Plan"
                          : "Weiter Ecken setzen – oder auf die erste tippen, um zu schließen"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPlacing({ kind: "area", points: placing.points.slice(0, -1) })}
                        disabled={placing.points.length === 0}
                        className="rounded-full bg-[var(--control-fill)] px-3 py-1.5 font-medium hover:bg-[var(--control-fill-hover)] disabled:opacity-40"
                      >
                        Zurück
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlacing(null)}
                        className="rounded-full bg-[var(--control-fill)] px-3 py-1.5 font-medium hover:bg-[var(--control-fill-hover)]"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : placing ? (
                    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border glass-material py-1.5 pl-4 pr-1.5 text-[14px] shadow-[var(--shadow-float)]">
                      <span>{placing.kind === "new" ? "Tippe auf den Plan, um den Pin zu setzen" : "Tippe auf die neue Stelle"}</span>
                      <button
                        type="button"
                        onClick={() => setPlacing(null)}
                        className="rounded-full bg-[var(--control-fill)] px-3 py-1.5 font-medium hover:bg-[var(--control-fill-hover)]"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSpot(null);
                          setSelectedArea(null);
                          setPlacing({ kind: "new" });
                        }}
                        disabled={pins.length >= MAX_PINS}
                        title={`Pin für ${event.title ?? "dieses Event"} setzen`}
                        className={ADD_BUTTON}
                      >
                        + Pin
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSpot(null);
                          setSelectedArea(null);
                          setPlacing({ kind: "area", points: [] });
                        }}
                        disabled={areas.length >= MAX_AREAS}
                        title={`Fläche für ${event.title ?? "dieses Event"} markieren`}
                        className={ADD_BUTTON}
                      >
                        + Fläche
                      </button>
                      {selectedArea && (
                        <div className="pop-in pointer-events-auto flex items-center gap-2 rounded-full border border-border glass-material py-1.5 pl-4 pr-1.5 text-[14px] shadow-[var(--shadow-float)]">
                          <span>Fläche</span>
                          <button
                            type="button"
                            onClick={() => {
                              saveAreas(areas.filter((a) => a.id !== selectedArea));
                              setSelectedArea(null);
                            }}
                            className="rounded-full bg-danger/10 px-3 py-1.5 font-medium text-danger hover:bg-danger/15"
                          >
                            Löschen
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {/* TEMPORARY: see copyPins. */}
                  <button type="button" onClick={copyPins} className={PILL}>
                    Pins kopieren
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setPlacing(null);
                      setOpenSpot(null);
                      setSelectedArea(null);
                    }}
                    className={cn(PILL, "font-semibold text-accent")}
                  >
                    Fertig
                  </button>
                </>
              )}
              {previewEvents.length > 0 && (
                // Which event the map's showing, scrubbed to on the calendar.
                <div className="pop-in pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border glass-material py-1.5 pl-4 pr-1.5 text-[14px] shadow-[var(--shadow-float)]">
                  <span className="text-muted">Vorschau</span>
                  <span className="min-w-0 truncate font-semibold">
                    {previewEvents.map((e) => e.title?.trim() || "Untitled Event").join(" + ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => preview([])}
                    aria-label="Vorschau schließen"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              )}
              {checklist.error && (
                <p role="alert" className="pointer-events-auto rounded-full border border-border glass-material px-3 py-1.5 text-[13px] font-medium text-danger shadow-[var(--shadow-float)]">
                  {checklist.error}
                </p>
              )}
              {message && (
                <button
                  type="button"
                  onClick={() => setMessage(null)}
                  className="pop-in pointer-events-auto rounded-full border border-border glass-material px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-float)]"
                >
                  {message}
                </button>
              )}
            </div>
          </div>
        </div>
      </EventDatesContext.Provider>
    </ChecklistStateContext.Provider>
    </ChecklistReviewContext.Provider>
  );
}

const PILL =
  "pointer-events-auto rounded-full border border-border glass-material px-4 py-2 text-[15px] font-medium shadow-[var(--shadow-float)]";
const ADD_BUTTON =
  "pointer-events-auto rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast shadow-[var(--shadow-float)] hover:opacity-90 disabled:opacity-40";

// A dot pin (see DOT_PINS): its dot alone, or with its card once brought
// out — the dot, either way, the button that brings the card out or puts
// it away. Any other pin is just its card.
function DotPin({
  dot,
  shown,
  title,
  onToggle,
  children,
}: {
  dot: boolean;
  shown: boolean;
  title: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!dot) return children;
  return (
    <div className="relative">
      {shown ? (
        children
      ) : (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--surface),0_2px_6px_var(--shadow-ambient-strong)]"
        />
      )}
      {/* Over the dot, a bigger target than the dot itself. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={shown}
        aria-label={shown ? `${title} ausblenden` : `${title} zeigen`}
        title={shown ? undefined : title}
        className="no-press absolute left-0 top-0 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
    </div>
  );
}

// The first corner of an area being drawn: a ring, tapped to close the area
// once it has three corners or more. The tap target is bigger than the ring.
function FirstCorner({ canClose, onClose }: { canClose: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={!canClose}
      aria-label="Fläche schließen"
      title={canClose ? "Fläche schließen" : undefined}
      className="group absolute left-0 top-0 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center disabled:cursor-default"
    >
      <span
        className={cn(
          "block rounded-full border-[3px] border-accent bg-surface shadow-[0_1px_4px_var(--shadow-ambient-strong)] transition-[width,height]",
          canClose ? "h-5 w-5 group-hover:h-6 group-hover:w-6" : "h-3.5 w-3.5",
        )}
      />
    </button>
  );
}

// Any other corner of an area being drawn.
function Corner() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2px_var(--surface)]"
    />
  );
}

// An event pin's card: its name (saved when you're done typing — on Enter
// or leaving the field), moving it, and taking it off the map.
function PinEditor({
  pin,
  onRename,
  onMove,
  onDelete,
}: {
  pin: MapPin;
  onRename: (title: string) => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(pin.title);
  const commit = () => {
    const next = title.trim();
    if (next !== pin.title) onRename(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        maxLength={MAX_PIN_TITLE}
        placeholder="Titel"
        aria-label="Titel des Pins"
        className="select-text rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onMove}
          className="flex-1 rounded-full bg-[var(--control-fill)] px-3 py-1.5 text-[14px] font-medium hover:bg-[var(--control-fill-hover)]"
        >
          Verschieben
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 rounded-full bg-danger/10 px-3 py-1.5 text-[14px] font-medium text-danger hover:bg-danger/15"
        >
          Löschen
        </button>
      </div>
      <p className="text-[12px] text-muted">
        u {pin.u} · v {pin.v}
      </p>
    </div>
  );
}
