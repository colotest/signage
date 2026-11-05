"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { WheelchairIcon } from "@/components/icons/WheelchairIcon";
import { areaContains, type MapArea } from "@/lib/eventAreas";
import { brandFont } from "@/lib/fonts";
import { GUEST_SECTIONS, type GuestEntry, type GuestOverlay, type GuestPlace, type GuestSection } from "@/lib/guestContent";
import type { Floor } from "@/lib/venueFloors";
import { cn } from "@/lib/utils/cn";
import { COLOSSEUM } from "../../events/_components/colosseumFloors";
import { VenueMap, type MapSpot } from "../../events/_components/VenueMap";

// The page opens on the ground floor's plan filling the screen, the title
// over it. The first TRAVEL of the scroll (× the screen's height) turns
// that into the page: the title shrinks into a bar along the top, and the
// map into a card — the right third, vertically centred, on a wide screen;
// a band under the title on a narrow one — which stays put while the
// content scrolls by beside or beneath it.
const TRAVEL = 0.7;
const BAR_H = 76;
const SMALL_TITLE_PX = 26;
// Narrower than this, the map docks above the content rather than beside it.
const WIDE_PX = 768;
const DOCK_GAP = 20;
const DOCK_MIN_H = 380;
// Where in the content's part of the screen something counts as being read:
// the last heading or entry whose top has passed this far down it.
const READING_LINE = 0.38;
// A scroll to an entry picked on the map is over once the page has been
// still this long; until then, what it passes doesn't light up.
const SEEK_SETTLE_MS = 250;

type Rect = { x: number; y: number; w: number; h: number };
type Layout = {
  w: number;
  h: number;
  wide: boolean;
  travel: number;
  dock: Rect;
  // Where the content's part of the screen starts, below the bar (and on a
  // narrow screen, the map).
  contentTop: number;
  readingY: number;
  bigTitlePx: number;
};

function layoutFor(w: number, h: number): Layout {
  const wide = w >= WIDE_PX;
  let dock: Rect;
  if (wide) {
    // Landscape, as the plan is, so it fills the card — but never so
    // short that the map's own buttons don't fit down its side.
    const dw = w / 3 - DOCK_GAP;
    const dh = Math.min(h - BAR_H - DOCK_GAP * 2, Math.max(dw * 0.8, DOCK_MIN_H));
    dock = { x: (w * 2) / 3, y: BAR_H + (h - BAR_H - dh) / 2, w: dw, h: dh };
  } else {
    dock = { x: 12, y: BAR_H, w: w - 24, h: Math.round(Math.max(DOCK_MIN_H, h * 0.4)) };
  }
  const contentTop = wide ? BAR_H : dock.y + dock.h + 8;
  return {
    w,
    h,
    wide,
    travel: Math.round(h * TRAVEL),
    dock,
    contentTop,
    readingY: contentTop + (h - contentTop) * READING_LINE,
    bigTitlePx: Math.max(48, Math.min(w * 0.14, h * 0.2, 200)),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// What's lit up on the map: a whole section (while its heading's being
// read) or one entry.
type Lit = { kind: "section" | "entry"; id: string } | null;

const sectionById = new Map(GUEST_SECTIONS.map((s) => [s.id, s]));
const entryById = new Map(GUEST_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, e] as const)));
const sectionOfEntry = new Map(GUEST_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, s] as const)));
const ALL_ENTRIES = GUEST_SECTIONS.flatMap((s) => s.entries);

function litPlaces(lit: Lit): { entry: GuestEntry; place: GuestPlace; index: number }[] {
  if (!lit) return [];
  const entries = lit.kind === "entry" ? [entryById.get(lit.id)!] : (sectionById.get(lit.id)?.entries ?? []);
  return entries.flatMap((entry) => entry.places.map((place, index) => ({ entry, place, index })));
}

const placeArea = (entry: GuestEntry, index: number, place: GuestPlace): MapArea => ({
  id: `${entry.id}-${index}`,
  points: place.points,
  floor: place.floor,
});

export function GuestsView() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const barBackRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef(new Map<string, HTMLElement>()); // "section:id" / "entry:id"
  const carouselRefs = useRef(new Map<string, HTMLDivElement>());

  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [docked, setDocked] = useState(false);
  const dockedRef = useRef(false);
  const [floor, setFloor] = useState<Floor>("eg");
  const [reading, setReading] = useState<Lit>(null);
  const readingRef = useRef<Lit>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Set<string>>(new Set());
  const seekRef = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);

  const lit: Lit = hovered ? { kind: "entry", id: hovered } : reading;

  // Brings what's lit onto the map's floor, unless some of it's on the
  // floor shown already.
  function floorFor(next: Lit) {
    const places = litPlaces(next);
    if (places.length === 0) return;
    setFloor((f) => (places.some(({ place }) => place.floor === f) ? f : places[0].place.floor));
  }

  function read(next: Lit) {
    readingRef.current = next;
    setReading(next);
    setHovered(null);
    floorFor(next);
  }

  // Hovering (or tapping) an entry's title: it lights up, and its section's
  // carousel turns to its picture.
  function pick(entry: GuestEntry) {
    setHovered(entry.id);
    floorFor({ kind: "entry", id: entry.id });
    showPicture(entry);
  }

  function showPicture(entry: GuestEntry) {
    const section = sectionOfEntry.get(entry.id);
    const carousel = section && carouselRefs.current.get(section.id);
    const slide = carousel?.querySelector<HTMLElement>(`[data-entry="${entry.id}"]`);
    if (!carousel || !slide) return;
    // The carousel is the slides' offset parent (it's positioned).
    carousel.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }

  function endSeekLater() {
    const seek = seekRef.current;
    if (!seek) return;
    clearTimeout(seek.timer);
    seek.timer = setTimeout(() => {
      seekRef.current = null;
    }, SEEK_SETTLE_MS);
  }

  // Picked on the map: the page scrolls to the entry, lit already.
  function seek(entry: GuestEntry) {
    const scroller = scrollRef.current, mark = markRefs.current.get(`entry:${entry.id}`), l = layoutRef.current;
    if (!scroller || !mark || !l) return;
    seekRef.current = seekRef.current ?? {};
    endSeekLater();
    read({ kind: "entry", id: entry.id });
    showPicture(entry);
    const top = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: top - l.contentTop - 24, behavior: "smooth" });
  }

  // Lays the stage out for the scroll: the map and title from full screen
  // (p = 0) to docked (p = 1).
  function apply() {
    const l = layoutRef.current, scroller = scrollRef.current;
    if (!l || !scroller) return;
    const p = Math.min(Math.max(scroller.scrollTop / l.travel, 0), 1);
    const t = easeInOut(p);
    const box = mapBoxRef.current;
    if (box) {
      box.style.left = `${lerp(0, l.dock.x, t)}px`;
      box.style.top = `${lerp(0, l.dock.y, t)}px`;
      box.style.width = `${lerp(l.w, l.dock.w, t)}px`;
      box.style.height = `${lerp(l.h, l.dock.h, t)}px`;
      box.style.borderRadius = `${lerp(0, 16, t)}px`;
      box.style.borderColor = `color-mix(in srgb, var(--border) ${Math.round(t * 100)}%, transparent)`;
    }
    if (veilRef.current) veilRef.current.style.opacity = String((1 - t) * 0.45);
    const title = titleRef.current;
    if (title) {
      const cx = lerp(l.w / 2, l.wide ? l.w / 3 : l.w / 2, t);
      const cy = lerp(l.h / 2, BAR_H / 2, t);
      const s = lerp(1, SMALL_TITLE_PX / l.bigTitlePx, t);
      title.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${s})`;
    }
    if (barBackRef.current) barBackRef.current.style.opacity = String(Math.max(0, (t - 0.6) / 0.4));
    if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - p * 4));
    const nowDocked = p >= 0.999;
    if (nowDocked !== dockedRef.current) {
      dockedRef.current = nowDocked;
      setDocked(nowDocked);
    }
  }

  // Following the reader: the last heading or entry above the reading line.
  function measure() {
    const l = layoutRef.current, root = rootRef.current;
    if (!l || !root) return;
    const line = root.getBoundingClientRect().top + l.readingY;
    let found: Lit = null;
    for (const section of GUEST_SECTIONS) {
      for (const [key, next] of [
        [`section:${section.id}`, { kind: "section", id: section.id }] as const,
        ...section.entries.map((e) => [`entry:${e.id}`, { kind: "entry", id: e.id }] as const),
      ]) {
        const mark = markRefs.current.get(key);
        if (mark && mark.getBoundingClientRect().top <= line) found = next;
      }
    }
    const was = readingRef.current;
    if (found?.kind !== was?.kind || found?.id !== was?.id) read(found);
  }

  useLayoutEffect(() => {
    const root = rootRef.current!, scroller = scrollRef.current!;
    const ro = new ResizeObserver(() => {
      const next = layoutFor(root.clientWidth, root.clientHeight);
      layoutRef.current = next;
      setLayout(next);
    });
    ro.observe(root);
    let frame = 0;
    const onScroll = () => {
      if (seekRef.current) endSeekLater();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
        if (!seekRef.current) measure();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(seekRef.current?.timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Laid out again for a new size, once the stage is in the DOM for it.
  useLayoutEffect(() => {
    apply();
  }, [layout]);

  // On the map: what's lit, glowing; every other place on this floor,
  // faintly, to show it can be tapped — once it can be, docked.
  const litOnFloor = litPlaces(lit).filter(({ place }) => place.floor === floor);
  const litIds = new Set(litOnFloor.map(({ entry, index, place }) => placeArea(entry, index, place).id));
  const areas = litOnFloor.map(({ entry, index, place }) => placeArea(entry, index, place));
  const faintAreas = ALL_ENTRIES.flatMap((entry) =>
    entry.places.map((place, index) => ({ entry, place, index })),
  )
    .filter(({ place }) => place.floor === floor)
    .map(({ entry, index, place }) => placeArea(entry, index, place))
    .filter((a) => docked && !litIds.has(a.id));

  const overlaySpots: MapSpot[] = GUEST_SECTIONS.flatMap((s) => s.overlays ?? [])
    .filter((o) => overlays.has(o.id))
    .flatMap((o) =>
      o.spots
        .filter((spot) => spot.floor === floor)
        .map((spot, i) => ({ id: `${o.id}:${i}`, u: spot.u, v: spot.v, node: <OverlayMarker overlay={o} /> })),
    );

  function onMapTap(at: { u: number; v: number } | null) {
    if (!at) return;
    const hits = ALL_ENTRIES.flatMap((entry) =>
      entry.places
        .filter((place) => place.floor === floor && areaContains({ id: entry.id, points: place.points }, at))
        .map((place) => ({ entry, size: polygonSize(place.points) })),
    ).sort((a, b) => a.size - b.size);
    if (hits[0]) seek(hits[0].entry);
  }

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): the
    // content scrolls in its own box, under the stage.
    <div ref={rootRef} className="relative -mx-5 -my-6 h-[calc(100%+3rem)] overflow-hidden">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain">
        {layout && (
          <>
            <div aria-hidden style={{ height: layout.travel + layout.contentTop }} />
            <div style={{ width: layout.wide ? (layout.w * 2) / 3 : "100%" }}>
              <div className="mx-auto max-w-[680px] px-6 md:px-10" style={{ paddingBottom: layout.h - layout.readingY }}>
                {GUEST_SECTIONS.map((section) => (
                  <Section
                    key={section.id}
                    section={section}
                    lit={lit}
                    overlays={overlays}
                    onToggleOverlay={(id) =>
                      setOverlays((current) => {
                        const next = new Set(current);
                        if (!next.delete(id)) next.add(id);
                        return next;
                      })
                    }
                    onPick={pick}
                    onUnpick={() => setHovered(null)}
                    mark={(key, el) => {
                      if (el) markRefs.current.set(key, el);
                      else markRefs.current.delete(key);
                    }}
                    carouselRef={(el) => {
                      if (el) carouselRefs.current.set(section.id, el);
                      else carouselRefs.current.delete(section.id);
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {layout && (
        <div className="pointer-events-none absolute inset-0">
          {/* The bar the title shrinks into, solid behind it once it's
              there (and, on a narrow screen, behind the map below it).
              Tapped, back to the top. */}
          <button
            ref={barBackRef}
            type="button"
            tabIndex={docked ? 0 : -1}
            aria-label="Nach oben"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              height: layout.wide ? BAR_H : layout.contentTop,
              opacity: 0,
              pointerEvents: docked ? "auto" : "none",
            }}
            className="no-press absolute inset-x-0 top-0 block border-b border-border header-surface"
          />

          <div
            ref={mapBoxRef}
            style={{ pointerEvents: docked ? "auto" : "none" }}
            className={cn(
              "absolute overflow-hidden border bg-surface",
              docked && "shadow-[var(--shadow-float)]",
            )}
          >
            <VenueMap
              className="h-full w-full"
              floors={COLOSSEUM}
              floor={floor}
              onFloorChange={(id) => setFloor(id as Floor)}
              focus={null}
              onBackgroundTap={onMapTap}
              spots={overlaySpots}
              areas={areas}
              faintAreas={faintAreas}
              controls={docked}
            />
            <div ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 bg-background" />
          </div>

          {/* The title: over the map to begin with, then the bar's. */}
          <h1
              ref={titleRef}
              style={{ fontSize: layout.bigTitlePx }}
              className={`${brandFont.className} absolute left-0 top-0 origin-center whitespace-nowrap text-center uppercase leading-[0.86] tracking-tight text-foreground`}
            >
              Colosseum
              <br />
              Event
            </h1>

          <div
            ref={hintRef}
            aria-hidden
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[13px] font-medium text-muted"
          >
            Scrollen
            <svg viewBox="0 0 24 24" className="h-5 w-5 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  section,
  lit,
  overlays,
  onToggleOverlay,
  onPick,
  onUnpick,
  mark,
  carouselRef,
}: {
  section: GuestSection;
  lit: Lit;
  overlays: Set<string>;
  onToggleOverlay: (id: string) => void;
  onPick: (entry: GuestEntry) => void;
  onUnpick: () => void;
  mark: (key: string, el: HTMLElement | null) => void;
  carouselRef: (el: HTMLDivElement | null) => void;
}) {
  const sectionLit = lit?.kind === "section" && lit.id === section.id;
  const entryLit = (entry: GuestEntry) => sectionLit || (lit?.kind === "entry" && lit.id === entry.id);
  return (
    <section aria-labelledby={`${section.id}-title`} className="border-t border-border pb-14 pt-10 first:border-t-0 first:pt-4">
      <h2
        id={`${section.id}-title`}
        ref={(el) => mark(`section:${section.id}`, el)}
        className="text-[34px] font-semibold tracking-tight"
      >
        {section.title}
      </h2>
      {section.intro && <p className="mt-3 text-[17px] leading-relaxed text-foreground/85">{section.intro}</p>}

      <div className="mt-6 flex flex-col">
        {section.entries.map((entry, i) => {
          const newGroup = entry.group && entry.group !== section.entries[i - 1]?.group;
          return (
            <Fragment key={entry.id}>
              {newGroup && (
                <h3 className="mb-1 mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted first:mt-0">
                  {entry.group}
                </h3>
              )}
              <div ref={(el) => mark(`entry:${entry.id}`, el)} className="py-3">
                <button
                  type="button"
                  onMouseEnter={() => onPick(entry)}
                  onMouseLeave={onUnpick}
                  onFocus={() => onPick(entry)}
                  onBlur={onUnpick}
                  onClick={() => onPick(entry)}
                  className="no-press group block text-left"
                >
                  <span
                    className={cn(
                      "text-[21px] font-semibold tracking-tight transition-colors",
                      entryLit(entry) ? "text-accent" : "group-hover:text-accent",
                    )}
                  >
                    {entry.title}
                  </span>
                  {entry.subtitle && <span className="block text-[15px] text-muted">{entry.subtitle}</span>}
                </button>
                {entry.body && <p className="mt-1.5 text-[16px] leading-relaxed text-foreground/85">{entry.body}</p>}
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* One picture per entry, turned to by hovering its title. */}
      <div
        ref={carouselRef}
        className="relative mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {section.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-entry={entry.id}
            onClick={() => onPick(entry)}
            className={cn(
              "no-press relative aspect-[4/3] w-[78%] shrink-0 snap-start overflow-hidden rounded-[var(--radius-lg)] border transition-[border-color,box-shadow] duration-300",
              entryLit(entry) && !sectionLit ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-border",
            )}
          >
            {entry.picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- photos of any size, shown at the slide's
              <img src={entry.picture.src} alt={entry.picture.alt} className="h-full w-full object-cover" />
            ) : (
              <PicturePlaceholder title={entry.title} />
            )}
          </button>
        ))}
      </div>

      {section.overlays && section.overlays.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {section.overlays.map((overlay) => {
            const on = overlays.has(overlay.id);
            return (
              <button
                key={overlay.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleOverlay(overlay.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors",
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                )}
              >
                <OverlayIcon icon={overlay.icon} className="h-[18px] w-[18px]" />
                {overlay.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Until there's a photo: a soft tile with the entry's name.
function PicturePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_14%,var(--surface)),color-mix(in_srgb,var(--accent)_4%,var(--surface)))] text-muted">
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m21 16-5-5-8 8" strokeLinejoin="round" />
      </svg>
      <span className="text-[14px] font-medium">{title}</span>
    </div>
  );
}

function OverlayIcon({ icon, className }: { icon: GuestOverlay["icon"]; className?: string }) {
  if (icon === "wheelchair") return <WheelchairIcon className={className} />;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />
    </svg>
  );
}

// An overlay's place on the map: its symbol in a round badge.
function OverlayMarker({ overlay }: { overlay: GuestOverlay }) {
  return (
    <span
      role="img"
      aria-label={overlay.label}
      title={overlay.label}
      className="pop-in absolute left-0 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[0_0_0_3px_var(--surface),0_2px_6px_var(--shadow-ambient-strong)]"
    >
      <OverlayIcon icon={overlay.icon} className="h-[18px] w-[18px]" />
    </span>
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
