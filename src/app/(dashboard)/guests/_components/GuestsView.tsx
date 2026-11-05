"use client";

import { useEffect, useRef, useState } from "react";
import { areaContains } from "@/lib/eventAreas";
import { GUEST_TOPICS, type GuestTopic } from "@/lib/guestTopics";
import type { Floor } from "@/lib/venueFloors";
import { cn } from "@/lib/utils/cn";
import { COLOSSEUM, FLOOR_NAMES } from "../../events/_components/colosseumFloors";
import { VenueMap, type MapSpot } from "../../events/_components/VenueMap";

// Where in the reading column a topic counts as the one being read: the
// last whose top has scrolled above this far down it.
const READING_LINE = 0.35;
// A scroll to a topic picked on the map is over once the column's been
// still this long — until then, the topics it passes on the way don't take
// the map with them.
const SEEK_SETTLE_MS = 250;
// How far below the column's top a topic picked on the map comes to rest.
const SEEK_OFFSET_PX = 16;

const byId = new Map(GUEST_TOPICS.map((topic) => [topic.id, topic]));
const spotId = (topic: GuestTopic) => `topic:${topic.id}`;
const areaId = (topic: GuestTopic) => `topic-area:${topic.id}`;

// One long page through the venue beside its map. Scrolling the topics
// brings the one being read up on the map (its floor, its spot, its area);
// a tap on the map — a topic's spot, or anywhere inside its area — scrolls
// the page to that topic, in whatever order one goes round.
export function GuestsView() {
  // null: still at the top, above the first topic.
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef(active);
  const [floor, setFloor] = useState<Floor>("eg");
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  // A topic picked on the map, while the page scrolls to it.
  const seekRef = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);

  // Brings a topic up on the map: its floor, and its spot into view.
  function showOnMap(id: string | null) {
    activeRef.current = id;
    setActive(id);
    const topic = id ? byId.get(id) : undefined;
    if (!topic) return;
    setFloor(topic.floor);
    setFocus((f) => ({ id: spotId(topic), nonce: (f?.nonce ?? 0) + 1 }));
  }

  function endSeekLater() {
    const seek = seekRef.current;
    if (!seek) return;
    clearTimeout(seek.timer);
    seek.timer = setTimeout(() => {
      seekRef.current = null;
    }, SEEK_SETTLE_MS);
  }

  // Picked on the map: the page scrolls to it, the map showing it already.
  function seek(id: string) {
    const column = columnRef.current;
    const section = sectionRefs.current.get(id);
    if (!column || !section) return;
    seekRef.current = seekRef.current ?? {};
    endSeekLater();
    showOnMap(id);
    const top = section.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop;
    column.scrollTo({ top: top - SEEK_OFFSET_PX, behavior: "smooth" });
  }

  // Following the reader down the page.
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    let frame = 0;
    function measure() {
      frame = 0;
      const line = column!.getBoundingClientRect().top + column!.clientHeight * READING_LINE;
      let reading: string | null = null;
      for (const topic of GUEST_TOPICS) {
        const section = sectionRefs.current.get(topic.id);
        if (section && section.getBoundingClientRect().top <= line) reading = topic.id;
      }
      if (reading !== activeRef.current) showOnMap(reading);
    }
    function onScroll() {
      if (seekRef.current) {
        endSeekLater();
        return;
      }
      if (!frame) frame = requestAnimationFrame(measure);
    }
    column.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      column.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(seekRef.current?.timer);
    };
  }, []);

  const activeTopic = active ? byId.get(active) : undefined;
  const floorTopics = GUEST_TOPICS.filter((topic) => topic.floor === floor);

  const spots: MapSpot[] = floorTopics.map((topic) => ({
    id: spotId(topic),
    u: topic.u,
    v: topic.v,
    front: topic.id === active,
    node: <TopicPin title={topic.title} active={topic.id === active} onPress={() => seek(topic.id)} />,
  }));

  // The topic being read has its area drawn; a tap inside any topic's area
  // on this floor goes to it, the smallest first where they overlap.
  const shownArea =
    activeTopic?.area && activeTopic.floor === floor ? [{ id: areaId(activeTopic), points: activeTopic.area, floor }] : [];

  function onMapTap(at: { u: number; v: number } | null) {
    if (!at) return;
    const hit = floorTopics
      .filter((topic) => topic.area && areaContains({ id: topic.id, points: topic.area }, at))
      .sort((a, b) => polygonSize(a.area!) - polygonSize(b.area!))[0];
    if (hit) seek(hit.id);
  }

  return (
    // Fills the page's scroll area edge to edge (undoing its padding), as on
    // the Events page: the topics scroll on their own beside the map — or,
    // on a phone, beneath it.
    <div className="-mx-5 -my-6 flex h-[calc(100%+3rem)] flex-col md:flex-row-reverse">
      <div className="relative h-[48%] min-h-[360px] shrink-0 border-b border-border md:h-auto md:min-h-0 md:flex-1 md:border-b-0 md:border-l">
        <VenueMap
          className="h-full w-full"
          floors={COLOSSEUM}
          floor={floor}
          onFloorChange={(id) => setFloor(id as Floor)}
          focus={focus}
          onBackgroundTap={onMapTap}
          spots={spots}
          areas={shownArea}
          selectedArea={shownArea[0]?.id ?? null}
        />
      </div>

      <div ref={columnRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:w-[min(46%,640px)] md:flex-none">
        <div className="mx-auto max-w-[640px] px-5 pb-[60vh] pt-6">
          <header className="pb-6">
            <h1 className="text-[28px] font-semibold tracking-tight">Colosseum Berlin</h1>
            <p className="mt-1 text-[15px] text-muted">
              Tippe auf einen Ort auf der Karte, um zu ihm zu springen – oder scrolle einfach durch.
            </p>
            <nav aria-label="Orte" className="mt-4 flex flex-wrap gap-2">
              {GUEST_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => seek(topic.id)}
                  className={cn(
                    "rounded-full border border-border px-3 py-1 text-[13px] font-medium transition-colors",
                    topic.id === active
                      ? "border-accent bg-accent text-accent-contrast"
                      : "hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                  )}
                >
                  {topic.title}
                </button>
              ))}
            </nav>
          </header>

          {GUEST_TOPICS.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(topic.id, el);
                else sectionRefs.current.delete(topic.id);
              }}
              aria-labelledby={`${topic.id}-title`}
              className="border-t border-border py-8"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  id={`${topic.id}-title`}
                  className={cn("text-[22px] font-semibold tracking-tight transition-colors", topic.id === active && "text-accent")}
                >
                  {topic.title}
                </h2>
                <button
                  type="button"
                  onClick={() => showOnMap(topic.id)}
                  className="shrink-0 text-[13px] font-medium text-muted hover:text-foreground"
                >
                  {FLOOR_NAMES[topic.floor].name} · Karte
                </button>
              </div>
              {topic.body.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3 text-[16px] leading-relaxed">
                  {topic.body.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[15px] italic text-muted">Text folgt.</p>
              )}
              {topic.pictures && topic.pictures.length > 0 && (
                <div className="mt-5 flex flex-col gap-4">
                  {topic.pictures.map((picture) => (
                    <figure key={picture.src}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- photos of any size from public/guests, shown at the column's width */}
                      <img
                        src={picture.src}
                        alt={picture.alt}
                        loading="lazy"
                        decoding="async"
                        className="w-full rounded-[var(--radius-lg)] border border-border object-cover"
                      />
                      {picture.caption && <figcaption className="mt-1.5 text-[13px] text-muted">{picture.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// A topic's place on the map: a dot with its name above it, as the Events
// map's pins are — filled in for the topic being read.
function TopicPin({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--surface),0_2px_6px_var(--shadow-ambient-strong)]"
      />
      <div className="absolute bottom-[7px] left-0 -translate-x-1/2">
        <button
          type="button"
          onClick={onPress}
          aria-current={active ? "location" : undefined}
          className={cn(
            "no-press block w-max rounded-full border px-3.5 py-2 text-[14px] font-semibold shadow-[var(--shadow-float)] transition-colors",
            active ? "border-accent bg-accent text-accent-contrast" : "border-border glass-material",
          )}
        >
          {title}
        </button>
        <span aria-hidden className="mx-auto block h-2 w-px bg-muted/60" />
      </div>
    </div>
  );
}

// An area's size on the plan (the shoelace formula), to pick the smaller of
// two that overlap.
function polygonSize(points: { u: number; v: number }[]) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j].u + points[i].u) * (points[j].v - points[i].v);
  }
  return Math.abs(sum) / 2;
}
