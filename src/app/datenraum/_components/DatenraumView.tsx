"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { COLOSSEUM } from "@/app/(dashboard)/events/_components/colosseumFloors";
import { SegmentedSlider } from "@/app/(dashboard)/events/_components/SegmentedSlider";
import { VenueMap } from "@/app/(dashboard)/events/_components/VenueMap";
import { areaContains, type MapArea } from "@/lib/eventAreas";
import {
  DATENRAUM_SECTIONS,
  HERO_IMAGE,
  type Block,
  type DatenraumEntry,
  type DatenraumPlace,
  type DatenraumSection,
  type Lang,
  type Segment,
} from "@/lib/datenraumContent";
import type { DatenraumImage } from "@/lib/datenraumMedia";
import { brandFont } from "@/lib/fonts";
import type { Floor } from "@/lib/venueFloors";
import { cn } from "@/lib/utils/cn";
import { DatenraumPrefsControls, UI, useDatenraumPrefs } from "./DatenraumPrefs";

// The page opens on the hero picture, the title over it. Scrolling, the
// picture goes up and away with the page while the title shrinks to float
// along the top (by the time the content reaches it). Then, on a wide
// screen, the content takes the left SEGMENT_SPLIT of it, and beside it
// whatever the title being read brings up — pictures, the floor plans or
// a 360° tour — rises into view as the one before rises away (sinks, going
// back up). In the bottom left, a small map lights up the spaces being read
// about. On a narrow screen each title's segment sits under its text.
const SMALL_TITLE_PX = 26;
// Narrower than this, segments sit in the text rather than beside it, and
// there's no corner map.
const WIDE_PX = 768;
// The title's middle and the switcher's, from the top, and how far down the
// content starts beneath them.
const TITLE_Y = 38;
const SWITCHER_Y = 94;
const TOP_ZONE = 128;
// Wide: how much of the width the content takes; segments have the rest.
const SEGMENT_SPLIT = 0.6;
const EDGE = 20;
// A segment's smallest height (the map's buttons need about this much).
const SEGMENT_MIN_H = 400;
// Where in the content's part of the screen something counts as being read:
// the last heading or title whose top has passed this far down it.
const READING_LINE = 0.38;
// A scroll to something picked on the map is over once the page has been
// still this long; until then, what it passes doesn't light up.
const SEEK_SETTLE_MS = 250;

type Mode = "overview" | "gallery";
type Rect = { x: number; y: number; w: number; h: number };
type Layout = {
  w: number;
  h: number;
  wide: boolean;
  // The scroll over which the title docks: the hero's height, less the
  // strip it docks in.
  travel: number;
  columnW: number;
  readingY: number;
  bigTitlePx: number;
  segment: Rect;
  corner: Rect;
};

function layoutFor(w: number, h: number): Layout {
  const wide = w >= WIDE_PX;
  const columnW = wide ? Math.round(w * SEGMENT_SPLIT) : w;
  const areaX = columnW + 4, areaW = w - EDGE - areaX;
  const areaY = TOP_ZONE, areaH = h - EDGE - areaY;
  const segH = Math.min(areaH, Math.max(areaW * 0.85, SEGMENT_MIN_H));
  const cornerW = Math.min(380, columnW * 0.42);
  const cornerH = Math.round(cornerW * 0.66);
  return {
    w,
    h,
    wide,
    travel: Math.max(1, h - TOP_ZONE),
    columnW,
    readingY: TOP_ZONE + (h - TOP_ZONE) * READING_LINE,
    bigTitlePx: Math.max(48, Math.min(w * 0.14, h * 0.2, 200)),
    segment: { x: areaX, y: areaY + (areaH - segH) / 2, w: areaW, h: segH },
    corner: { x: EDGE, y: h - EDGE - cornerH, w: cornerW, h: cornerH },
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

// What's being read (or hovered, or in view in the collection).
type Lit = { kind: "section"; id: string } | { kind: "entry"; id: string } | { kind: "entries"; ids: string[] } | null;
const keyOf = (lit: Lit) => (!lit ? "" : lit.kind === "entries" ? `entries:${lit.ids.join()}` : `${lit.kind}:${lit.id}`);

const sectionById = new Map(DATENRAUM_SECTIONS.map((s) => [s.id, s]));
const entryById = new Map(DATENRAUM_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, e] as const)));
const sectionOfEntry = new Map(DATENRAUM_SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, s] as const)));
const ALL_ENTRIES = DATENRAUM_SECTIONS.flatMap((s) => s.entries);
// Every heading and title, in the order they're read: to tell going down
// from going back up.
const ORDER = new Map(
  DATENRAUM_SECTIONS.flatMap((s) => [`section:${s.id}`, ...s.entries.map((e) => `entry:${e.id}`)]).map((k, i) => [k, i]),
);

function litEntries(lit: Lit): DatenraumEntry[] {
  if (!lit) return [];
  if (lit.kind === "entry") return [entryById.get(lit.id)!];
  if (lit.kind === "section") return sectionById.get(lit.id)?.entries ?? [];
  return lit.ids.map((id) => entryById.get(id)!);
}

function litPlaces(lit: Lit): { entry: DatenraumEntry; place: DatenraumPlace; index: number }[] {
  return litEntries(lit).flatMap((entry) => (entry.places ?? []).map((place, index) => ({ entry, place, index })));
}

const placeArea = (entry: DatenraumEntry, index: number, place: DatenraumPlace): MapArea => ({
  id: `${entry.id}-${index}`,
  points: place.points,
  floor: place.floor,
});

// What a title being read brings up beside the text: its own segment, or
// its section's — keyed by whose it is.
function segmentFor(lit: Lit): { key: string; segment: Segment } | null {
  if (lit?.kind === "entry") {
    const entry = entryById.get(lit.id)!;
    if (entry.segment) return { key: entry.id, segment: entry.segment };
    const section = sectionOfEntry.get(lit.id)!;
    return section.segment ? { key: section.id, segment: section.segment } : null;
  }
  if (lit?.kind === "section") {
    const section = sectionById.get(lit.id)!;
    return section.segment ? { key: section.id, segment: section.segment } : null;
  }
  return null;
}

function segmentByKey(key: string): Segment | undefined {
  return entryById.get(key)?.segment ?? sectionById.get(key)?.segment;
}

// Whether the corner map shows for what's lit: an entry's own say, or its
// section's.
function cornerMapFor(lit: Lit): boolean {
  if (lit?.kind === "section") return !!sectionById.get(lit.id)?.bottomMap;
  return litEntries(lit).some((entry) => entry.bottomMap ?? sectionOfEntry.get(entry.id)?.bottomMap ?? false);
}

// The picture collection: every picture of every segment, by section, each
// lighting up its entry's places while it's in view.
type GalleryItem = { key: string; name: string; entry: DatenraumEntry | null };
function galleryOf(section: DatenraumSection): GalleryItem[] {
  const items: GalleryItem[] = [];
  const add = (segment: Segment | undefined, entry: DatenraumEntry | null) => {
    if (segment?.kind !== "images") return;
    for (const name of segment.images) items.push({ key: `${entry?.id ?? section.id}:${name}`, name, entry });
  };
  add(section.segment, null);
  for (const entry of section.entries) add(entry.segment, entry);
  return items;
}

export function DatenraumView({ images }: { images: Record<string, DatenraumImage> }) {
  const { lang } = useDatenraumPrefs();
  const ui = UI[lang];
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topFadeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  // "section:id" / "entry:id" in the overview, "tile:id" (an entry's first
  // picture) in the collection.
  const markRefs = useRef(new Map<string, HTMLElement>());
  const tileRefs = useRef(new Map<HTMLElement, string | null>());

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
  // The segment beside the text, and the one going as it comes in.
  const [segments, setSegments] = useState<{ current: string | null; leaving: string | null; down: boolean }>({
    current: null,
    leaving: null,
    down: true,
  });
  const segmentsRef = useRef(segments);
  const seekRef = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);

  const viewed: Lit = mode === "gallery" ? (inFrame.length > 0 ? { kind: "entries", ids: inFrame } : null) : reading;
  const lit: Lit = hovered ? { kind: "entry", id: hovered } : viewed;

  // Brings what's lit onto the map's floor, unless some of it's on the
  // floor shown already.
  function floorFor(next: Lit) {
    const places = litPlaces(next);
    if (places.length === 0) return;
    setFloor((f) => (places.some(({ place }) => place.floor === f) ? f : places[0].place.floor));
  }

  function showSegment(key: string | null, down: boolean) {
    const now = segmentsRef.current;
    if (key === now.current) return;
    const next = { current: key, leaving: now.current, down };
    segmentsRef.current = next;
    setSegments(next);
  }

  function read(next: Lit) {
    const was = readingRef.current;
    readingRef.current = next;
    setReading(next);
    setHovered(null);
    floorFor(next);
    const down = (ORDER.get(keyOf(next)) ?? -1) >= (ORDER.get(keyOf(was)) ?? -1);
    showSegment(segmentFor(next)?.key ?? null, down);
  }

  // Hovering (or tapping) a title or picture lights its places up.
  function pick(entry: DatenraumEntry) {
    setHovered(entry.id);
    floorFor({ kind: "entry", id: entry.id });
  }

  function endSeekLater() {
    const seek = seekRef.current;
    if (!seek) return;
    clearTimeout(seek.timer);
    seek.timer = setTimeout(() => {
      seekRef.current = null;
    }, SEEK_SETTLE_MS);
  }

  // Picked on the map: the page scrolls to the entry (or its pictures).
  function seek(entry: DatenraumEntry) {
    const overview = modeRef.current === "overview";
    const scroller = scrollRef.current;
    const mark = markRefs.current.get(`${overview ? "entry" : "tile"}:${entry.id}`);
    if (!scroller || !mark) return;
    seekRef.current = seekRef.current ?? {};
    endSeekLater();
    if (overview) read({ kind: "entry", id: entry.id });
    else pick(entry);
    const top = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: top - TOP_ZONE - 24, behavior: "smooth" });
  }

  function switchMode(next: Mode) {
    if (next === modeRef.current) return;
    modeRef.current = next;
    setMode(next);
    setHovered(null);
    readingRef.current = null;
    setReading(null);
    setInFrame([]);
    showSegment(null, true);
    // To the top of the other content, the title staying docked.
    const scroller = scrollRef.current, l = layoutRef.current;
    if (scroller && l && scroller.scrollTop > l.travel) scroller.scrollTo({ top: l.travel });
  }

  // The title from over the hero (p = 0) to docked along the top (p = 1).
  function apply() {
    const l = layoutRef.current, scroller = scrollRef.current;
    if (!l || !scroller) return;
    const p = clamp01(scroller.scrollTop / l.travel);
    const t = easeInOut(p);
    const title = titleRef.current;
    if (title) {
      const cy = lerp(l.h / 2, TITLE_Y, t);
      const s = lerp(1, SMALL_TITLE_PX / l.bigTitlePx, t);
      title.style.transform = `translate(${l.w / 2}px, ${cy}px) translate(-50%, -50%) scale(${s})`;
    }
    const late = clamp01((t - 0.6) / 0.4);
    if (topFadeRef.current) topFadeRef.current.style.opacity = String(late);
    if (switcherRef.current) switcherRef.current.style.opacity = String(late);
    const nowDocked = p >= 0.999;
    if (nowDocked !== dockedRef.current) {
      dockedRef.current = nowDocked;
      setDocked(nowDocked);
    }
  }

  // Following the reader through the overview: the last heading or title
  // above the reading line.
  function measure() {
    const l = layoutRef.current, root = rootRef.current;
    if (!l || !root || modeRef.current !== "overview") return;
    const line = root.getBoundingClientRect().top + l.readingY;
    let found: Lit = null;
    for (const section of DATENRAUM_SECTIONS) {
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
  // below the title.
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
      { root: scroller, rootMargin: `-${TOP_ZONE}px 0px 0px 0px`, threshold: 0.5 },
    );
    for (const el of tileRefs.current.keys()) observer.observe(el);
    return () => observer.disconnect();
     
  }, [mode, layout]);

  // The corner map: shown for what's being read (or in view), lighting up
  // what's lit — every other place on this floor faintly, to show it can be
  // tapped.
  const cornerShown = !!layout?.wide && cornerMapFor(viewed);
  const litOnFloor = litPlaces(lit).filter(({ place }) => place.floor === floor);
  const areas = litOnFloor.map(({ entry, index, place }) => placeArea(entry, index, place));
  const litIds = new Set(areas.map((a) => a.id));
  const faintAreas = ALL_ENTRIES.flatMap((entry) =>
    (entry.places ?? []).map((place, index) => placeArea(entry, index, place)),
  ).filter((a) => a.floor === floor && !litIds.has(a.id));

  function onMapTap(at: { u: number; v: number } | null) {
    if (!at) return;
    const hits = ALL_ENTRIES.flatMap((entry) =>
      (entry.places ?? [])
        .filter((place) => place.floor === floor && areaContains({ id: entry.id, points: place.points }, at))
        .map((place) => ({ entry, size: polygonSize(place.points) })),
    ).sort((a, b) => a.size - b.size);
    if (hits[0]) seek(hits[0].entry);
  }

  // A sideways slider that's run out: the rest of the wheel scrolls the page.
  const passWheel = (deltaY: number) => scrollRef.current?.scrollBy({ top: deltaY });

  const mark = (key: string, el: HTMLElement | null) => {
    if (el) markRefs.current.set(key, el);
    else markRefs.current.delete(key);
  };

  const switcher = (
    <SegmentedSlider
      label={ui.view}
      options={[
        { value: "overview" as Mode, label: ui.overview },
        { value: "gallery" as Mode, label: ui.gallery },
      ]}
      value={mode}
      onChange={switchMode}
      className="w-[300px] max-w-full"
    />
  );

  const hero = images[HERO_IMAGE];
  const sideSegments = !!layout?.wide && mode === "overview";

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): the
    // content scrolls in its own box, under the stage.
    <div ref={rootRef} className="relative -mx-5 -my-6 h-[calc(100%+3rem)] overflow-hidden bg-surface">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain">
        {layout && (
          <>
            {/* The hero: the picture behind the title, scrolling away. */}
            <div className="relative overflow-hidden" style={{ height: layout.h }}>
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element -- one large photo, cropped to the window
                <img src={hero.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <PicturePlaceholder name={HERO_IMAGE} ui={ui} className="absolute inset-0" />
              )}
              <div
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--surface)_55%,transparent),color-mix(in_srgb,var(--surface)_30%,transparent)_45%,var(--surface))]"
              />
              <div
                aria-hidden
                className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[13px] font-medium text-foreground/70"
              >
                {ui.scroll}
                <svg viewBox="0 0 24 24" className="h-5 w-5 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <div style={{ width: mode === "overview" ? layout.columnW : "100%" }}>
              <div
                className={cn("mx-auto px-6 pt-6 md:px-10", mode === "overview" ? "max-w-[680px]" : "max-w-[1200px]")}
                style={{ paddingBottom: layout.h - layout.readingY }}
              >
                {/* Narrow: the switcher heads the content (wide, it floats
                    under the title). */}
                {!layout.wide && <div className="flex justify-center pb-4">{switcher}</div>}
                {mode === "overview"
                  ? DATENRAUM_SECTIONS.map((section) => (
                      <SectionView
                        key={section.id}
                        section={section}
                        lang={lang}
                        lit={lit}
                        // Narrow: segments in the text.
                        inline={!layout.wide}
                        images={images}
                        onPick={pick}
                        onUnpick={() => setHovered(null)}
                        onPassWheel={passWheel}
                        mark={mark}
                      />
                    ))
                  : DATENRAUM_SECTIONS.map((section) => (
                      <GallerySection
                        key={section.id}
                        section={section}
                        lang={lang}
                        images={images}
                        hovered={hovered}
                        onPick={pick}
                        onUnpick={() => setHovered(null)}
                        tile={(el, entry, first) => {
                          if (el) tileRefs.current.set(el, entry?.id ?? null);
                          if (first && entry) mark(`tile:${entry.id}`, el);
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
          {sideSegments && (
            <Segments
              rect={layout.segment}
              viewH={layout.h}
              state={segments}
              images={images}
              ui={ui}
              onPassWheel={passWheel}
              onLeft={(key) =>
                setSegments((s) => {
                  if (s.leaving !== key) return s;
                  const next = { ...s, leaving: null };
                  segmentsRef.current = next;
                  return next;
                })
              }
            />
          )}

          {layout.wide && (
            // The corner map: rises into view for the spaces, sinks away
            // after.
            <div
              inert={!cornerShown}
              style={{
                left: layout.corner.x,
                top: layout.corner.y,
                width: layout.corner.w,
                height: layout.corner.h,
                transform: cornerShown ? "none" : `translateY(${layout.corner.h + EDGE * 2}px)`,
              }}
              className={cn(
                "absolute overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-float)] transition-transform duration-500 ease-[var(--ease-spring)]",
                cornerShown && "pointer-events-auto",
              )}
            >
              <VenueMap
                className="h-full w-full"
                floors={COLOSSEUM}
                floor={floor}
                onFloorChange={(id) => setFloor(id as Floor)}
                focus={null}
                onBackgroundTap={onMapTap}
                spots={[]}
                areas={areas}
                faintAreas={faintAreas}
                controls={false}
              />
              <FloorChips floor={floor} onFloor={setFloor} label={ui.floor} />
            </div>
          )}

          {/* A soft blur behind the title and switcher, fading out
              downwards, over the content. */}
          <div
            ref={topFadeRef}
            aria-hidden
            style={{
              width: layout.wide && mode === "overview" ? layout.columnW : layout.w,
              height: TOP_ZONE + 36,
              opacity: 0,
              maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
              WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)",
            }}
            className="absolute left-0 top-0 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--surface)_85%,transparent),transparent)] backdrop-blur-md"
          />

          {/* The title: over the hero to begin with, then floating at the
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
          <button
            type="button"
            tabIndex={docked ? 0 : -1}
            aria-label="↑"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ left: layout.w / 2 - 70, top: TITLE_Y - 26, pointerEvents: docked ? "auto" : "none" }}
            className="no-press absolute h-[52px] w-[140px]"
          />

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

          {/* Top left, over everything: light or dark, German or English. */}
          <DatenraumPrefsControls className="pointer-events-auto absolute left-3 top-3" />
        </div>
      )}
    </div>
  );
}

// --- the content ----------------------------------------------------------------

function SectionView({
  section,
  lang,
  lit,
  inline,
  images,
  onPick,
  onUnpick,
  onPassWheel,
  mark,
}: {
  section: DatenraumSection;
  lang: Lang;
  lit: Lit;
  inline: boolean;
  images: Record<string, DatenraumImage>;
  onPick: (entry: DatenraumEntry) => void;
  onUnpick: () => void;
  onPassWheel: (deltaY: number) => void;
  mark: (key: string, el: HTMLElement | null) => void;
}) {
  const ui = UI[lang];
  const sectionLit = lit?.kind === "section" && lit.id === section.id;
  const entryLit = (entry: DatenraumEntry) => sectionLit || (lit?.kind === "entry" && lit.id === entry.id);
  return (
    <section aria-labelledby={`${section.id}-title`} className="border-t border-border pb-14 pt-10 first:border-t-0 first:pt-4">
      <h2
        id={`${section.id}-title`}
        ref={(el) => mark(`section:${section.id}`, el)}
        className={`${brandFont.className} text-[48px] uppercase leading-[0.95] tracking-tight`}
      >
        {section.title[lang]}
      </h2>
      {section.intro && <Blocks blocks={section.intro[lang]} ui={ui} className="mt-3" />}
      {inline && section.segment && (
        <InlineSegment segment={section.segment} images={images} ui={ui} onPassWheel={onPassWheel} />
      )}

      <div className="mt-4 flex flex-col">
        {section.entries.map((entry) => (
          <div key={entry.id} ref={(el) => mark(`entry:${entry.id}`, el)} className="py-4">
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
                  `${brandFont.className} text-[28px] uppercase leading-[1.05] tracking-tight transition-colors`,
                  entryLit(entry) ? "text-accent" : "group-hover:text-accent",
                )}
              >
                {entry.title[lang]}
              </span>
            </button>
            <Blocks blocks={entry.body[lang]} ui={ui} className="mt-2" />
            {inline && entry.segment && (
              <InlineSegment segment={entry.segment} images={images} ui={ui} onPassWheel={onPassWheel} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Blocks({ blocks, ui, className }: { blocks: Block[]; ui: Record<string, string>; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 text-[16px] leading-relaxed text-foreground/85", className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "p":
            return <p key={i}>{block.text}</p>;
          case "heading":
            return (
              <h4 key={i} className="mt-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
                {block.text}
              </h4>
            );
          case "bullets":
            return (
              <ul key={i} className="flex list-disc flex-col gap-0.5 pl-5 marker:text-muted">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "ideal":
            return (
              <div key={i} className="mt-2">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">{ui.idealFor}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium leading-none tracking-wide text-foreground/80"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          case "links":
            return (
              <div key={i} className="mt-2 flex flex-wrap gap-2">
                {block.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                  >
                    {link.label}
                    <ExternalIcon className="h-3.5 w-3.5 text-muted" />
                  </a>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}

// --- segments ---------------------------------------------------------------------

// Beside the text: the current segment, and the one leaving as it comes in.
// Going down the page the new one rises from below the window and the old
// one up and out of the top; going back up, the other way round.
function Segments({
  rect,
  viewH,
  state,
  images,
  ui,
  onPassWheel,
  onLeft,
}: {
  rect: Rect;
  viewH: number;
  state: { current: string | null; leaving: string | null; down: boolean };
  images: Record<string, DatenraumImage>;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
  onLeft: (key: string) => void;
}) {
  const below = viewH - rect.y + EDGE;
  const above = -(rect.y + rect.h + EDGE);
  const motion = {
    "--from": `${state.down ? below : above}px`,
    "--to": `${state.down ? above : below}px`,
  } as CSSProperties;
  const keys = [state.leaving, state.current].filter((k, i, all): k is string => !!k && all.indexOf(k) === i);
  return (
    <div className="absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {keys.map((key) => {
        const segment = segmentByKey(key);
        if (!segment) return null;
        const leaving = key !== state.current;
        return (
          <div
            key={key}
            style={motion}
            onAnimationEnd={leaving ? () => onLeft(key) : undefined}
            className={cn(
              "absolute inset-0",
              leaving ? "datenraum-segment-out pointer-events-none" : "datenraum-segment-in pointer-events-auto",
            )}
          >
            <SegmentView segment={segment} images={images} ui={ui} onPassWheel={onPassWheel} />
          </div>
        );
      })}
    </div>
  );
}

function SegmentView({
  segment,
  images,
  ui,
  onPassWheel,
}: {
  segment: Segment;
  images: Record<string, DatenraumImage>;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
}) {
  if (segment.kind === "images") return <ImageSlider names={segment.images} images={images} ui={ui} onPassWheel={onPassWheel} />;
  if (segment.kind === "tour") return <TourCard url={segment.url} ui={ui} />;
  return <PlanCard />;
}

// Narrow: a title's segment under its text.
function InlineSegment(props: {
  segment: Segment;
  images: Record<string, DatenraumImage>;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
}) {
  return (
    <div className="-mx-6 mt-4 aspect-[4/3] md:-mx-10">
      <SegmentView {...props} />
    </div>
  );
}

// Picture cards in a row, at the segment's height, scrolled sideways: by a
// swipe or a trackpad's sideways scroll as usual, by dragging with the
// mouse, and by an ordinary scroll wheel — which, once the row has run out
// that way, goes on to scroll the page.
function ImageSlider({
  names,
  images,
  ui,
  onPassWheel,
}: {
  names: string[];
  images: Record<string, DatenraumImage>;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; left: number; id: number } | null>(null);
  const passRef = useRef(onPassWheel);
  useEffect(() => {
    passRef.current = onPassWheel;
  });

  useEffect(() => {
    const row = rowRef.current!;
    const onWheel = (e: WheelEvent) => {
      // Sideways already (a trackpad), or a pinch: as the browser does it.
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? row.clientWidth : 1;
      const dy = e.deltaY * unit;
      const max = row.scrollWidth - row.clientWidth;
      const next = Math.min(Math.max(row.scrollLeft + dy, 0), max);
      if (Math.abs(next - row.scrollLeft) >= 1) row.scrollLeft = next;
      else passRef.current(dy);
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.currentTarget.scrollLeft = drag.left - (e.clientX - drag.x);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }

  return (
    <div
      ref={rowRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="flex h-full cursor-grab touch-pan-x select-none gap-3 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
    >
      {names.map((name, i) => {
        const image = images[name];
        const aspect = image?.width && image?.height ? image.width / image.height : 4 / 3;
        return (
          <div
            key={`${name}-${i}`}
            style={{ aspectRatio: aspect }}
            className="relative h-full shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)]"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- photos of any size, shown at the card's
              <img src={image.url} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <PicturePlaceholder name={name} ui={ui} className="h-full w-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// A 360° tour, hosted elsewhere, loaded whole into the card — with a way to
// open it on its own.
function TourCard({ url, ui }: { url: string; ui: Record<string, string> }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-black shadow-[var(--shadow-float)]">
      <iframe
        src={url}
        title={ui.tour}
        loading="lazy"
        allow="fullscreen; accelerometer; gyroscope; magnetometer; xr-spatial-tracking"
        allowFullScreen
        className="h-full w-full border-0"
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ui.openTour}
        title={ui.openTour}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-border glass-material text-foreground shadow-[var(--shadow-float)]"
      >
        <ExternalIcon className="h-4 w-4" />
      </a>
    </div>
  );
}

// The floor plans as on the Events page: three floors, dragged and zoomed.
function PlanCard() {
  const [floor, setFloor] = useState<Floor>("eg");
  return (
    <div className="h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-float)]">
      <VenueMap
        className="h-full w-full"
        floors={COLOSSEUM}
        floor={floor}
        onFloorChange={(id) => setFloor(id as Floor)}
        focus={null}
        spots={[]}
      />
    </div>
  );
}

// The corner map's floors, small (its own buttons are hidden, too big for
// the card).
function FloorChips({ floor, onFloor, label }: { floor: Floor; onFloor: (floor: Floor) => void; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-2 right-2 z-20 flex overflow-hidden rounded-full border border-border glass-material text-[12px] font-semibold shadow-[var(--shadow-float)]"
    >
      {[...COLOSSEUM].reverse().map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={f.id === floor}
          aria-label={f.name}
          title={f.name}
          onClick={() => onFloor(f.id as Floor)}
          className={cn(
            "no-press px-2.5 py-1 transition-colors",
            f.id === floor ? "bg-accent text-accent-contrast" : "text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.08]",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// --- the collection -------------------------------------------------------------

function GallerySection({
  section,
  lang,
  images,
  hovered,
  onPick,
  onUnpick,
  tile,
  untile,
}: {
  section: DatenraumSection;
  lang: Lang;
  images: Record<string, DatenraumImage>;
  hovered: string | null;
  onPick: (entry: DatenraumEntry) => void;
  onUnpick: () => void;
  tile: (el: HTMLElement | null, entry: DatenraumEntry | null, first: boolean) => void;
  untile: (el: HTMLElement) => void;
}) {
  const ui = UI[lang];
  const items = galleryOf(section);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${section.id}-gallery`} className="pb-10 pt-4">
      <h2 id={`${section.id}-gallery`} className={`${brandFont.className} mb-3 text-[30px] uppercase leading-none tracking-tight`}>
        {section.title[lang]}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item, i) => {
          const first = items.findIndex((other) => other.entry === item.entry) === i;
          const image = images[item.name];
          return (
            <figure key={item.key} className="min-w-0">
              <div
                ref={(el) => {
                  if (el) tile(el, item.entry, first);
                  return () => {
                    if (el) untile(el);
                    if (first) tile(null, item.entry, true);
                  };
                }}
                onMouseEnter={item.entry ? () => onPick(item.entry!) : undefined}
                onMouseLeave={onUnpick}
                className={cn(
                  "relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border transition-[border-color,box-shadow] duration-300",
                  item.entry && hovered === item.entry.id ? "border-accent shadow-[0_0_0_2px_var(--accent)]" : "border-border",
                )}
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- photos of any size, cropped to the tile
                  <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <PicturePlaceholder name={item.name} ui={ui} className="h-full w-full" small />
                )}
              </div>
              {item.entry && (
                <figcaption className="mt-1 truncate text-[12px] text-muted">{item.entry.title[lang]}</figcaption>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

// Until its photo's uploaded: a soft tile saying which picture goes here.
function PicturePlaceholder({
  name,
  ui,
  className,
  small = false,
}: {
  name: string;
  ui: Record<string, string>;
  className?: string;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_16%,var(--surface)),color-mix(in_srgb,var(--accent)_4%,var(--surface)))] text-muted",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className={small ? "h-6 w-6" : "h-8 w-8"} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m21 16-5-5-8 8" strokeLinejoin="round" />
      </svg>
      <span className={cn("font-medium tabular-nums", small ? "text-[12px]" : "text-[14px]")}>
        {ui.picture} {name}
      </span>
    </div>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
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
