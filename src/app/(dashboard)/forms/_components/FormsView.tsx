"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setEventAreas, setEventPins } from "@/lib/actions/events";
import { cn } from "@/lib/utils/cn";
import { areaContains, MAX_AREA_POINTS, MAX_AREAS, type AreaPoint, type MapArea } from "@/lib/eventAreas";
import { linkedAreas } from "@/lib/venueAreas";
import { MAX_PIN_TITLE, MAX_PINS, type MapPin } from "@/lib/eventPins";
import { floorOf, FLOORS, type Floor } from "@/lib/venueFloors";
import type { EventPerson, EventSummary } from "@/lib/events";
import { ChecklistStateContext, useChecklistState, type ChecklistState } from "./checklistState";
import { EventsPane } from "./EventsPane";
import { LinkedPinCard } from "./PinMenus";
import { MapCard, VenueMap, type MapFloor, type MapSpot } from "./VenueMap";

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
// The plan's scale, from fitting OpenStreetMap's outline of the building
// onto the ground floor's walls: about 1.51 cm a unit, so 66 to the metre
// and the building some 137 m end to end. All three floors are drawn to it.
const UNITS_PER_METRE = 66.2;
const FLOOR_NAMES: Record<Floor, { label: string; name: string }> = {
  eg: { label: "E", name: "Erdgeschoss" },
  zwischen: { label: "0.5", name: "Zwischengeschoss" },
  og: { label: "1", name: "Obergeschoss" },
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
      unitsPerMetre: UNITS_PER_METRE,
      walls: `${base}.svg`,
    },
  };
});

// The map's standing pins, shown whatever event is open (or none): where
// each sits on the plan, as a fraction of its width and height, and on
// which floor (the ground floor if none). Placed on an event and copied out
// (see copyPins).
const DEFAULT_PINS: { id: string; title: string; u: number; v: number; floor?: Floor }[] = [
  { id: "gastro", title: "Gastro", u: 0.1549, v: 0.3618 },
  { id: "kino-2", title: "Kino 2", u: 0.4764, v: 0.1353 },
  { id: "kino-3", title: "Kino 3", u: 0.354, v: 0.0894 },
  { id: "kino-4", title: "Kino 4", u: 0.2767, v: 0.0579 },
  { id: "kino-5", title: "Kino 5", u: 0.1524, v: 0.0051 },
  { id: "wagenhalle-kino", title: "Wagenhalle 'Kino'", u: 0.4308, v: 0.3461 },
  { id: "wagenhalle-event", title: "Wagenhalle 'Event'", u: 0.2826, v: 0.5807 },
  { id: "garderobe", title: "Garderobe", u: 0.7099, v: 0.4784 },
  { id: "wc-unten", title: "WC 'Unten'", u: 0.6294, v: 0.1665 },
  { id: "wc-wagenhalle", title: "WC 'Wagenhalle'", u: 0.0894, v: 0.6599 },
  { id: "sicherheit", title: "Sicherheit", u: 0.7395, v: 0.8469 },
  { id: "parken", title: "Parken", u: 0.8867, v: 0.9893 },
];

// What the next tap on the map does: drop a new pin, move one there (onto
// the floor shown then, if it's been switched since), or add a corner to
// the area being drawn (its corners so far).
type Placing = { kind: "new" } | { kind: "move"; id: string } | { kind: "area"; points: AreaPoint[] };

// The Forms page: the events on one side (top on a phone, left on an iPad
// or desktop), each opening into its own setup pages, and the venue map on
// the other — with the open event's own pins and highlighted areas on it.
// The standing pins work the open event's Checkliste (see PinMenus); its
// own pins are named, moved and placed in edit mode ("Bearbeiten"), and its
// areas drawn there corner by corner (tapping the first corner again closes
// one) or picked out with a tap to be deleted.
export function FormsView({ events, people }: { events: EventSummary[]; people: EventPerson[] }) {
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  // The open event, from the URL (where EventsPane keeps it).
  const eventId = useSearchParams().get("event");
  const event = eventId ? events.find((e) => e.id === eventId) : undefined;
  // The events on the day the Events list's calendar is being scrubbed
  // over: shown on the map as if open — their pins, their Checkliste on
  // the standing pins — but only to look at, and only while no event is
  // open. Several on one day show together, combined: set up, they never
  // claim the same thing (the venue has one of each), so whichever has an
  // answer for something gives it.
  const [previewIds, setPreviewIds] = useState<string[]>([]);
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
  // The open event's Checkliste, shared by its setup page and the pins.
  const checklist = useChecklistState(event);
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
    setSelectedArea(null);
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
    if (placing.kind === "new") {
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

  const spots: MapSpot[] = [
    ...DEFAULT_PINS.filter((pin) => floorOf(pin) === floor).map((pin) => ({
      id: pin.id,
      u: pin.u,
      v: pin.v,
      node: (
        <LinkedPinCard
          pin={pin}
          // While editing, the standing pins are only names.
          state={event && !editing ? checklist : previewChecklist}
          open={openSpot === pin.id}
          onToggle={() => setOpenSpot((s) => (s === pin.id ? null : pin.id))}
          onShowCategory={showChecklistCategory}
        />
      ),
    })),
    ...floorPins.map((pin) => {
      const spotId = `pin:${pin.id}`;
      return {
        id: spotId,
        u: pin.u,
        v: pin.v,
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
    <ChecklistStateContext.Provider value={checklist}>
      {/* Fills the page's scroll area edge to edge (undoing its padding): each
          half scrolls or pans on its own instead. */}
      <div className="-mx-5 -my-6 flex h-[calc(100%+3rem)] flex-col md:flex-row">
        <div className="min-h-0 flex-1 border-b border-border md:w-[420px] md:flex-none md:border-b-0 md:border-r lg:w-[460px]">
          <EventsPane
            events={events}
            people={people}
            previewIds={previewEvents.map((e) => e.id)}
            onPreview={setPreviewIds}
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
            spots={spots}
            areas={shownAreas}
            selectedArea={editing ? selectedArea : null}
            draft={draft}
          />

          {/* Along the map's bottom, with an event open: "Bearbeiten" — and
              while editing, "+ Pin" and "+ Fläche" (or what a tap on the map
              is about to do), deleting the area picked out, for now copying
              the pins out, and "Fertig". Clear of the floor picker in the
              corner. */}
          <div className="pointer-events-none absolute bottom-3 left-3 right-[68px] z-20 flex flex-wrap items-end gap-2">
            {event && !editing && (
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
                  onClick={() => setPreviewIds([])}
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
    </ChecklistStateContext.Provider>
  );
}

const PILL =
  "pointer-events-auto rounded-full border border-border glass-material px-4 py-2 text-[15px] font-medium shadow-[var(--shadow-float)]";
const ADD_BUTTON =
  "pointer-events-auto rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast shadow-[var(--shadow-float)] hover:opacity-90 disabled:opacity-40";

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
