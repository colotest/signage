"use client";

import { useEffect, useRef, useState } from "react";
import { setEventPins } from "@/lib/actions/events";
import { MAX_PIN_TITLE, MAX_PINS, type MapPin } from "@/lib/eventPins";
import type { EventPerson, EventSummary } from "@/lib/events";
import { EventsPane, type EventsRoute } from "./EventsPane";
import { SegmentedSlider } from "./SegmentedSlider";
import { ENTRY_MODES, useVeranstaltung } from "./veranstaltung";
import { MapCard, VenueMap, type FloorPlan, type MapSpot } from "./VenueMap";

// Colosseum Berlin, ground floor. Slimmed down from the architects' 15 MB
// export (every transform baked in, strokes merged per colour and patch
// of the plan) — see scripts/flatten-floorplan.mjs.
const COLOSSEUM_EG: FloorPlan = {
  src: "/venues/colosseum-eg.svg",
  width: 9519,
  height: 5253,
  // Not confirmed against the building yet: the plan's top edge is taken
  // as north until someone checks it on site.
  northDeg: 0,
};

// Where each of the form's places sits on the plan, as a fraction of its
// width and height. The main entrance is the bank of doors at the bottom
// right.
const SPOTS = {
  eingang: { title: "Eingang", u: 0.815, v: 0.885 },
};

// What the next tap on the map does: drop a new pin, or move one there.
type Placing = { kind: "new" } | { kind: "move"; id: string };

// The Forms page: the events on one side (top on a phone, left on an iPad
// or desktop), each opening into its own setup pages, and the venue map on
// the other — with the open event's own pins on it.
export function FormsView({ events, people }: { events: EventSummary[]; people: EventPerson[] }) {
  const [form, update] = useVeranstaltung();
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  const [route, setRoute] = useState<EventsRoute>({ eventId: null, view: null });
  const event = route.eventId ? events.find((e) => e.id === route.eventId) : undefined;

  // Pins as changed here, ahead of the server (which catches up on the
  // next render of the page), by event.
  const [pinEdits, setPinEdits] = useState<Record<string, MapPin[]>>({});
  const pins = event ? (pinEdits[event.id] ?? event.mapPins) : [];
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Saves go one after another, so an older list can't land after a newer.
  const saveChain = useRef(Promise.resolve());

  // A note (copied, or a save that failed) goes again after a few seconds.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const entry = ENTRY_MODES.find((m) => m.value === form.eingang);

  function changeRoute(next: EventsRoute) {
    if (next.eventId !== route.eventId) {
      setPlacing(null);
      setOpenSpot(null);
    }
    setRoute(next);
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

  function onMapTap(at: { u: number; v: number } | null) {
    if (!placing) {
      setOpenSpot(null);
      return;
    }
    if (!at || at.u < 0 || at.u > 1 || at.v < 0 || at.v > 1) return; // off the plan: keep waiting
    const u = Math.round(at.u * 10000) / 10000;
    const v = Math.round(at.v * 10000) / 10000;
    if (placing.kind === "new") {
      const pin: MapPin = { id: crypto.randomUUID(), title: `Pin ${pins.length + 1}`, u, v };
      savePins([...pins, pin]);
      setOpenSpot(`pin:${pin.id}`);
    } else {
      savePins(pins.map((p) => (p.id === placing.id ? { ...p, u, v } : p)));
    }
    setPlacing(null);
  }

  // TEMPORARY: copies the map's pins (the standing ones and the open
  // event's) as code, to take pins placed here into SPOTS by hand.
  async function copyPins() {
    const lines = [
      ...Object.entries(SPOTS).map(([id, s]) => `  { id: ${JSON.stringify(id)}, title: ${JSON.stringify(s.title)}, u: ${s.u}, v: ${s.v} },`),
      ...pins.map((p) => `  { title: ${JSON.stringify(p.title)}, u: ${p.u}, v: ${p.v} },`),
    ];
    const text = `[\n${lines.join("\n")}\n]`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${lines.length} Pins kopiert`);
    } catch {
      window.prompt("Pins kopieren:", text);
    }
  }

  const spots: MapSpot[] = [
    {
      id: "eingang",
      u: SPOTS.eingang.u,
      v: SPOTS.eingang.v,
      node: (
        <MapCard
          title={SPOTS.eingang.title}
          summary={entry?.label ?? null}
          open={openSpot === "eingang"}
          onToggle={() => setOpenSpot((s) => (s === "eingang" ? null : "eingang"))}
        >
          <SegmentedSlider
            label="Eingang"
            options={ENTRY_MODES}
            value={form.eingang}
            onChange={(eingang) => update({ eingang })}
          />
          <p className="mt-2.5 text-[13px] text-muted">{entry?.hint ?? "Noch nicht festgelegt"}</p>
        </MapCard>
      ),
    },
    ...pins.map((pin) => {
      const spotId = `pin:${pin.id}`;
      return {
        id: spotId,
        u: pin.u,
        v: pin.v,
        node: (
          <MapCard
            title={pin.title || "Pin"}
            open={openSpot === spotId}
            onToggle={() => setOpenSpot((s) => (s === spotId ? null : spotId))}
          >
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
          </MapCard>
        ),
      };
    }),
  ];

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): each
    // half scrolls or pans on its own instead.
    <div className="-mx-5 -my-6 flex h-[calc(100%+3rem)] flex-col md:flex-row">
      <div className="min-h-0 flex-1 border-b border-border md:w-[420px] md:flex-none md:border-b-0 md:border-r lg:w-[460px]">
        <EventsPane events={events} people={people} route={route} onRoute={changeRoute} />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <VenueMap className="min-h-0 flex-1" plan={COLOSSEUM_EG} focus={null} onBackgroundTap={onMapTap} spots={spots} />

        {/* Along the map's bottom: the open event's "+ Pin", what a tap on
            the map is about to do, and (for now) copying the pins out. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-end gap-2">
          {placing ? (
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
            event && (
              <button
                type="button"
                onClick={() => {
                  setOpenSpot(null);
                  setPlacing({ kind: "new" });
                }}
                disabled={pins.length >= MAX_PINS}
                title={`Pin für ${event.title ?? "dieses Event"} setzen`}
                className="pointer-events-auto rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast shadow-[var(--shadow-float)] hover:opacity-90 disabled:opacity-40"
              >
                + Pin
              </button>
            )
          )}
          {/* TEMPORARY: see copyPins. */}
          <button
            type="button"
            onClick={copyPins}
            className="pointer-events-auto rounded-full border border-border glass-material px-4 py-2 text-[15px] font-medium shadow-[var(--shadow-float)]"
          >
            Pins kopieren
          </button>
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
