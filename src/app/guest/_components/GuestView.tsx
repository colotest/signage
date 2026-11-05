"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLOSSEUM } from "@/app/(dashboard)/events/_components/colosseumFloors";
import { SegmentedSlider } from "@/app/(dashboard)/events/_components/SegmentedSlider";
import { VenueMap, type MapSpot } from "@/app/(dashboard)/events/_components/VenueMap";
import { WheelchairIcon } from "@/components/icons/WheelchairIcon";
import { areaContains, type MapArea } from "@/lib/eventAreas";
import { brandFont } from "@/lib/fonts";
import { GUEST_SECTIONS, type GuestEntry, type GuestOverlay, type GuestPlace, type GuestSection } from "@/lib/guestContent";
import type { Floor } from "@/lib/venueFloors";
import { cn } from "@/lib/utils/cn";

// The page opens on the ground floor's plan filling the screen, the title
// over it. The first TRAVEL of the scroll (× the screen's height) turns
// that into the page: the title shrinks to float along the top, and the
// map into the right MAP_SHARE of it, top to bottom, its left edge fading
// over the content — or, on a narrow screen, a card in a band under the title —
// where it stays while the content scrolls by.
const TRAVEL = 0.7;
const SMALL_TITLE_PX = 26;
// Narrower than this, the map docks above the content rather than beside it.
const WIDE_PX = 768;
// Wide: the title's middle and the switcher's, from the top, and how far
// down the content starts beneath them.
const TITLE_Y = 38;
const SWITCHER_Y = 94;
const TOP_ZONE = 128;
// Wide: how much of the width the map takes, and how far beyond that it
// reaches left over the content, fading in across it.
const MAP_SHARE = 0.4;
const FADE = 96;
// The text column's widest, and its side padding (md:px-10), wide.
const COLUMN_MAX = 680;
const COLUMN_PAD = 40;
// Narrow: the band the title docks in, and the map card under it.
const BAR_H = 76;
const DOCK_MIN_H = 380;
// Where in the content's part of the screen something counts as being read:
// the last heading or entry whose top has passed this far down it.
const READING_LINE = 0.38;
// A scroll to something picked on the map is over once the page has been
// still this long; until then, what it passes doesn't light up.
const SEEK_SETTLE_MS = 250;
// Pictures in the collection for an entry that has none of its own yet.
const GALLERY_PLACEHOLDERS = 2;

type Mode = "overview" | "gallery";
const MODES: { value: Mode; label: string }[] = [
  { value: "overview", label: "Übersicht" },
  { value: "gallery", label: "Bildersammlung" },
];

type Rect = { x: number; y: number; w: number; h: number };
type Layout = {
  w: number;
  h: number;
  wide: boolean;
  travel: number;
  dock: Rect;
  // Where the content's part of the screen starts, below the title (and on
  // a narrow screen, the map).
  contentTop: number;
  readingY: number;
  bigTitlePx: number;
};

function layoutFor(w: number, h: number): Layout {
  const wide = w >= WIDE_PX;
  const dock: Rect = wide
    ? { x: w * (1 - MAP_SHARE) - FADE, y: 0, w: w * MAP_SHARE + FADE, h }
    : { x: 12, y: BAR_H, w: w - 24, h: Math.round(Math.max(DOCK_MIN_H, h * 0.4)) };
  const contentTop = wide ? TOP_ZONE : dock.y + dock.h + 8;
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
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

// What's lit up on the map: a whole section (while its heading's being
// read), one entry, or those whose pictures are in view.
type Lit = { kind: "section"; id: string } | { kind: "entry"; id: string } | { kind: "entries"; ids: string[] } | null;

const sectionById = new Map(GUEST_SECTIONS.map((s) => [s.id, s]));
const entryById = new Map(GUEST_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, e] as const)));
const sectionOfEntry = new Map(GUEST_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, s] as const)));
const ALL_ENTRIES = GUEST_SECTIONS.flatMap((s) => s.entries);

function litEntries(lit: Lit): GuestEntry[] {
  if (!lit) return [];
  if (lit.kind === "entry") return [entryById.get(lit.id)!];
  if (lit.kind === "section") return sectionById.get(lit.id)?.entries ?? [];
  return lit.ids.map((id) => entryById.get(id)!);
}

function litPlaces(lit: Lit): { entry: GuestEntry; place: GuestPlace; index: number }[] {
  return litEntries(lit).flatMap((entry) => entry.places.map((place, index) => ({ entry, place, index })));
}

const keyOf = (lit: Lit) => (!lit ? "" : lit.kind === "entries" ? `entries:${lit.ids.join()}` : `${lit.kind}:${lit.id}`);

const placeArea = (entry: GuestEntry, index: number, place: GuestPlace): MapArea => ({
  id: `${entry.id}-${index}`,
  points: place.points,
  floor: place.floor,
});

// The picture collection: each entry's pictures, or placeholders for them.
type GalleryItem = { key: string; entry: GuestEntry; picture?: { src: string; alt: string } };
function galleryOf(section: GuestSection): GalleryItem[] {
  return section.entries.flatMap((entry) =>
    entry.picture
      ? [{ key: entry.id, entry, picture: entry.picture }]
      : Array.from({ length: GALLERY_PLACEHOLDERS }, (_, i) => ({ key: `${entry.id}-${i}`, entry })),
  );
}

export function GuestView() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const edgeBlurRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  // The blur under the title (wide) or the band it docks in (narrow).
  const topFadeRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // "section:id" / "entry:id" in the overview, "tile:id" (an entry's first
  // picture) in the collection.
  const markRefs = useRef(new Map<string, HTMLElement>());
  const carouselRefs = useRef(new Map<string, HTMLDivElement>());
  const tileRefs = useRef(new Map<HTMLElement, string>());

  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [docked, setDocked] = useState(false);
  const dockedRef = useRef(false);
  const [mode, setMode] = useState<Mode>("overview");
  const modeRef = useRef<Mode>("overview");
  const [floor, setFloor] = useState<Floor>("eg");
  const [reading, setReading] = useState<Lit>(null);
  const readingRef = useRef<Lit>(null);
  // Entries with a picture in view, in the collection.
  const [inFrame, setInFrame] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Set<string>>(new Set());
  const seekRef = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);

  const lit: Lit = hovered
    ? { kind: "entry", id: hovered }
    : mode === "gallery"
      ? inFrame.length > 0
        ? { kind: "entries", ids: inFrame }
        : null
      : reading;

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

  // Hovering (or tapping) an entry's title or picture: it lights up, and
  // in the overview its section's carousel turns to its picture.
  function pick(entry: GuestEntry) {
    setHovered(entry.id);
    floorFor({ kind: "entry", id: entry.id });
    if (modeRef.current === "overview") showPicture(entry);
  }

  function showPicture(entry: GuestEntry) {
    const section = sectionOfEntry.get(entry.id);
    const carousel = section && carouselRefs.current.get(section.id);
    const slide = carousel?.querySelector<HTMLElement>(`[data-entry="${entry.id}"]`);
    // The carousel is the slides' offset parent (it's positioned); the slide
    // comes to rest in line with the text, the run before it (scroll-padding)
    // to its left.
    if (carousel && slide) {
      const before = parseFloat(getComputedStyle(carousel).scrollPaddingLeft) || 0;
      carousel.scrollTo({ left: slide.offsetLeft - before, behavior: "smooth" });
    }
  }

  function endSeekLater() {
    const seek = seekRef.current;
    if (!seek) return;
    clearTimeout(seek.timer);
    seek.timer = setTimeout(() => {
      seekRef.current = null;
    }, SEEK_SETTLE_MS);
  }

  // Picked on the map: the page scrolls to the entry (or its pictures), lit
  // already.
  function seek(entry: GuestEntry) {
    const overview = modeRef.current === "overview";
    const scroller = scrollRef.current, l = layoutRef.current;
    const mark = markRefs.current.get(`${overview ? "entry" : "tile"}:${entry.id}`);
    if (!scroller || !mark || !l) return;
    seekRef.current = seekRef.current ?? {};
    endSeekLater();
    if (overview) {
      read({ kind: "entry", id: entry.id });
      showPicture(entry);
    } else {
      pick(entry);
    }
    const top = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: top - l.contentTop - 24, behavior: "smooth" });
  }

  function switchMode(next: Mode) {
    if (next === modeRef.current) return;
    modeRef.current = next;
    setMode(next);
    setHovered(null);
    readingRef.current = null;
    setReading(null);
    setInFrame([]);
    // To the top of the other content, the map staying docked.
    const scroller = scrollRef.current, l = layoutRef.current;
    if (scroller && l && scroller.scrollTop > l.travel) scroller.scrollTo({ top: l.travel });
  }

  // Lays the stage out for the scroll: the map and title from full screen
  // (p = 0) to docked (p = 1).
  function apply() {
    const l = layoutRef.current, scroller = scrollRef.current;
    if (!l || !scroller) return;
    const p = clamp01(scroller.scrollTop / l.travel);
    const t = easeInOut(p);
    const box = mapBoxRef.current;
    if (box) {
      box.style.left = `${lerp(0, l.dock.x, t)}px`;
      box.style.top = `${lerp(0, l.dock.y, t)}px`;
      box.style.width = `${lerp(l.w, l.dock.w, t)}px`;
      box.style.height = `${lerp(l.h, l.dock.h, t)}px`;
      if (l.wide) {
        // No edge of its own: its left side fades into the content.
        const mask = `linear-gradient(to right, rgba(0,0,0,${1 - t}) 0px, #000 ${FADE}px)`;
        box.style.maskImage = mask;
        box.style.webkitMaskImage = mask;
      } else {
        box.style.borderRadius = `${lerp(0, 16, t)}px`;
        box.style.borderColor = `color-mix(in srgb, var(--border) ${Math.round(t * 100)}%, transparent)`;
      }
    }
    if (edgeBlurRef.current) {
      edgeBlurRef.current.style.left = `${lerp(0, l.dock.x, t)}px`;
      edgeBlurRef.current.style.opacity = String(t);
    }
    if (veilRef.current) veilRef.current.style.opacity = String((1 - t) * 0.45);
    const title = titleRef.current;
    if (title) {
      const cy = lerp(l.h / 2, l.wide ? TITLE_Y : BAR_H / 2, t);
      const s = lerp(1, SMALL_TITLE_PX / l.bigTitlePx, t);
      title.style.transform = `translate(${l.w / 2}px, ${cy}px) translate(-50%, -50%) scale(${s})`;
    }
    const late = clamp01((t - 0.6) / 0.4);
    if (topFadeRef.current) topFadeRef.current.style.opacity = String(late);
    if (switcherRef.current) switcherRef.current.style.opacity = String(late);
    if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - p * 4));
    const nowDocked = p >= 0.999;
    if (nowDocked !== dockedRef.current) {
      dockedRef.current = nowDocked;
      setDocked(nowDocked);
    }
  }

  // Following the reader through the overview: the last heading or entry
  // above the reading line.
  function measure() {
    const l = layoutRef.current, root = rootRef.current;
    if (!l || !root || modeRef.current !== "overview") return;
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
    if (keyOf(found) !== keyOf(readingRef.current)) read(found);
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

  // The collection: which entries have a picture at least half in view,
  // below the title (and on a narrow screen, the map).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (mode !== "gallery" || !layout || !scroller) return;
    const visible = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const el = record.target as HTMLElement;
          if (record.isIntersecting) visible.add(el);
          else visible.delete(el);
        }
        const ids = ALL_ENTRIES.map((e) => e.id).filter((id) =>
          [...visible].some((el) => tileRefs.current.get(el) === id),
        );
        setInFrame((current) => (current.join() === ids.join() ? current : ids));
        if (!seekRef.current) setHovered(null);
        floorFor(ids.length > 0 ? { kind: "entries", ids } : null);
      },
      { root: scroller, rootMargin: `-${layout.contentTop}px 0px 0px 0px`, threshold: 0.5 },
    );
    for (const el of tileRefs.current.keys()) observer.observe(el);
    return () => observer.disconnect();
     
  }, [mode, layout]);

  // On the map: what's lit, glowing; every other place on this floor,
  // faintly, to show it can be tapped — once it can be, docked.
  const litOnFloor = litPlaces(lit).filter(({ place }) => place.floor === floor);
  const areas = litOnFloor.map(({ entry, index, place }) => placeArea(entry, index, place));
  const litIds = new Set(areas.map((a) => a.id));
  const faintAreas = ALL_ENTRIES.flatMap((entry) => entry.places.map((place, index) => placeArea(entry, index, place))).filter(
    (a) => docked && a.floor === floor && !litIds.has(a.id),
  );

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

  const mark = (key: string, el: HTMLElement | null) => {
    if (el) markRefs.current.set(key, el);
    else markRefs.current.delete(key);
  };

  // Wide: the content's window, out to where the map is drawn in full, and
  // how far past the text column's right edge that is.
  const contentWidth = layout?.wide ? layout.dock.x + FADE : 0;
  const bleed = layout?.wide ? (contentWidth - Math.min(COLUMN_MAX, contentWidth)) / 2 + COLUMN_PAD : 0;

  const switcher = (
    <SegmentedSlider label="Ansicht" options={MODES} value={mode} onChange={switchMode} className="w-[300px] max-w-full" />
  );

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): the
    // content scrolls in its own box, under the stage.
    <div ref={rootRef} className="relative -mx-5 -my-6 h-[calc(100%+3rem)] overflow-hidden bg-surface">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain">
        {layout && (
          <>
            <div aria-hidden style={{ height: layout.travel + layout.contentTop }} />
            {/* Wide: as far as the map's faded edge reaches, so what runs
                past the text column (the carousels) goes on beneath it. */}
            <div style={{ width: layout.wide ? contentWidth : "100%" }}>
              <div className="mx-auto max-w-[680px] px-6 md:px-10" style={{ paddingBottom: layout.h - layout.readingY }}>
                {/* Narrow: the switcher heads the content (wide, it floats
                    under the title). */}
                {!layout.wide && <div className="flex justify-center pb-4">{switcher}</div>}
                {mode === "overview"
                  ? GUEST_SECTIONS.map((section) => (
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
                        mark={mark}
                        bleed={bleed}
                        carouselRef={(el) => {
                          if (el) carouselRefs.current.set(section.id, el);
                          else carouselRefs.current.delete(section.id);
                        }}
                      />
                    ))
                  : GUEST_SECTIONS.map((section) => (
                      <GallerySection
                        key={section.id}
                        section={section}
                        hovered={hovered}
                        onPick={pick}
                        onUnpick={() => setHovered(null)}
                        tile={(el, entry, first) => {
                          if (el) tileRefs.current.set(el, entry.id);
                          if (first) mark(`tile:${entry.id}`, el);
                        }}
                        untile={(el) => tileRefs.current.delete(el)}
                      />
                    ))}
              </div>
            </div>
          </>
        )}
      </div>

      {layout && (
        <div className="pointer-events-none absolute inset-0">
          {layout.wide ? (
            // Wide: a soft blur behind the title and switcher, fading out
            // downwards, over the content only.
            <div
              ref={(el) => {
                topFadeRef.current = el;
              }}
              aria-hidden
              style={{
                width: layout.dock.x + FADE,
                height: TOP_ZONE + 36,
                opacity: 0,
                maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)",
              }}
              className="absolute left-0 top-0 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--surface)_85%,transparent),transparent)] backdrop-blur-md"
            />
          ) : (
            // Narrow: the band the title docks in, solid behind it and the
            // map below it. Tapped, back to the top.
            <button
              type="button"
              tabIndex={docked ? 0 : -1}
              aria-label="Nach oben"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              ref={(el) => {
                topFadeRef.current = el;
              }}
              style={{ height: layout.contentTop, opacity: 0, pointerEvents: docked ? "auto" : "none" }}
              className="no-press absolute inset-x-0 top-0 block border-b border-border header-surface"
            />
          )}

          {layout.wide && (
            // What scrolls beneath the map's faded edge, blurred.
            <div
              ref={edgeBlurRef}
              aria-hidden
              style={{
                width: FADE,
                opacity: 0,
                maskImage: "linear-gradient(to right, transparent, #000)",
                WebkitMaskImage: "linear-gradient(to right, transparent, #000)",
              }}
              className="absolute inset-y-0 backdrop-blur-sm"
            />
          )}

          <div
            ref={mapBoxRef}
            style={{ pointerEvents: docked ? "auto" : "none" }}
            className={cn(
              "absolute overflow-hidden bg-surface",
              !layout.wide && "border",
              !layout.wide && docked && "shadow-[var(--shadow-float)]",
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
              // Clear of the faded edge, once there is one.
              fitInsetLeft={
                layout.wide
                  ? (width) => FADE * clamp01((layout.w - width) / (layout.w - layout.dock.w))
                  : undefined
              }
            />
            <div ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 bg-surface" />
          </div>

          {/* The title: over the map to begin with, then floating at the
              top, over the whole page. */}
          <h1
            ref={titleRef}
            style={{ fontSize: layout.bigTitlePx }}
            className={`${brandFont.className} absolute left-0 top-0 origin-center whitespace-nowrap text-center uppercase leading-[0.86] tracking-tight text-foreground`}
          >
            Colosseum
            <br />
            Event
          </h1>
          {layout.wide && (
            // Over the docked title: back to the top.
            <button
              type="button"
              tabIndex={docked ? 0 : -1}
              aria-label="Nach oben"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              style={{ left: layout.w / 2 - 70, top: TITLE_Y - 26, pointerEvents: docked ? "auto" : "none" }}
              className="no-press absolute h-[52px] w-[140px]"
            />
          )}

          {layout.wide && (
            <div
              ref={switcherRef}
              inert={!docked}
              style={{ top: SWITCHER_Y, opacity: 0, pointerEvents: docked ? "auto" : "none" }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              {switcher}
            </div>
          )}

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
  bleed,
  carouselRef,
}: {
  section: GuestSection;
  lit: Lit;
  overlays: Set<string>;
  onToggleOverlay: (id: string) => void;
  onPick: (entry: GuestEntry) => void;
  onUnpick: () => void;
  mark: (key: string, el: HTMLElement | null) => void;
  // How far past the text column the carousel runs on either side: out to
  // the page's left edge, and on beneath the map's faded edge.
  bleed: number;
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
        style={{ marginLeft: -bleed, marginRight: -bleed, scrollPaddingLeft: bleed }}
        className="relative mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {bleed > 0 && <span aria-hidden className="shrink-0" style={{ width: bleed - 12 }} />}
        {section.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-entry={entry.id}
            onClick={() => onPick(entry)}
            // Sized to the text column, not the runs past it.
            style={{ width: `calc((100% - ${bleed * 2}px) * 0.78)` }}
            className={cn(
              "no-press relative aspect-[4/3] shrink-0 snap-start overflow-hidden rounded-[var(--radius-lg)] border transition-[border-color,box-shadow] duration-300",
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
        {/* Room for the last picture to come out from under the map. */}
        {bleed > 0 && <span aria-hidden className="shrink-0" style={{ width: bleed - 12 }} />}
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

// A section of the picture collection: its pictures in a grid, each one's
// place lit on the map while it's in view (or hovered).
function GallerySection({
  section,
  hovered,
  onPick,
  onUnpick,
  tile,
  untile,
}: {
  section: GuestSection;
  hovered: string | null;
  onPick: (entry: GuestEntry) => void;
  onUnpick: () => void;
  tile: (el: HTMLElement | null, entry: GuestEntry, first: boolean) => void;
  untile: (el: HTMLElement) => void;
}) {
  const items = galleryOf(section);
  return (
    <section aria-labelledby={`${section.id}-gallery`} className="pb-10 pt-4">
      <h2 id={`${section.id}-gallery`} className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {section.title}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map((item, i) => {
          const first = items.findIndex((other) => other.entry.id === item.entry.id) === i;
          return (
            <button
              key={item.key}
              type="button"
              ref={(el) => {
                if (el) tile(el, item.entry, first);
                return () => {
                  untile(el!);
                  if (first) tile(null, item.entry, true);
                };
              }}
              onMouseEnter={() => onPick(item.entry)}
              onMouseLeave={onUnpick}
              onFocus={() => onPick(item.entry)}
              onBlur={onUnpick}
              className={cn(
                "no-press relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border text-left transition-[border-color,box-shadow] duration-300",
                hovered === item.entry.id ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-border",
              )}
            >
              {item.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- photos of any size, cropped to the tile
                <img src={item.picture.src} alt={item.picture.alt} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <PicturePlaceholder title={item.entry.title} small />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Until there's a photo: a soft tile with the entry's name.
function PicturePlaceholder({ title, small = false }: { title: string; small?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_14%,var(--surface)),color-mix(in_srgb,var(--accent)_4%,var(--surface)))] px-2 text-center text-muted">
      <svg viewBox="0 0 24 24" className={small ? "h-6 w-6" : "h-8 w-8"} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m21 16-5-5-8 8" strokeLinejoin="round" />
      </svg>
      <span className={cn("font-medium", small ? "text-[12px]" : "text-[14px]")}>{title}</span>
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
