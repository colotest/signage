"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { COLOSSEUM } from "@/app/(dashboard)/events/_components/colosseumFloors";
import { SegmentedSlider } from "@/app/(dashboard)/events/_components/SegmentedSlider";
import { VenueMap, type MapSpot } from "@/app/(dashboard)/events/_components/VenueMap";
import { areaContains, type MapArea } from "@/lib/eventAreas";
import {
  DATENRAUM_SECTIONS,
  type Block,
  type DatenraumEntry,
  type DatenraumPlace,
  type DatenraumSection,
  type L,
  type Lang,
  type Segment,
} from "@/lib/datenraumContent";
import {
  ACCESS_STYLE,
  POWER_STYLE,
  type DatenraumPin,
  type GalleryImage,
} from "@/lib/datenraumGallery";
import type { DatenraumImage } from "@/lib/datenraumMedia";
import { brandFont } from "@/lib/fonts";
import type { Floor } from "@/lib/venueFloors";
import { cn } from "@/lib/utils/cn";
import { DatenraumGallery, type GalleryLibrary } from "./DatenraumGallery";
import { DatenraumPrefsControls, UI, useDatenraumPrefs } from "./DatenraumPrefs";
import { DatenraumPicture, prefetchPicture, sliderSizes } from "./DatenraumPicture";
import { MapNotePin } from "./MapNotePin";

// The page opens straight on the content, the title and the switcher
// floating along the top. On a wide screen the content takes the left
// SEGMENT_SPLIT of it, and beside it
// whatever the title being read brings up — pictures, the floor plans or
// a 360° tour — rises into view as the one before rises away (sinks, going
// back up). In the bottom left, a small map lights up the spaces being read
// about. On a narrow screen each title's segment sits under its text.
// The title, on one line: its size, and its width for each pixel of it
// (Compacta, uppercase, tracking-tight).
const TITLE_PX = 52;
const TITLE_WIDTH_PER_PX = 4.8;
// Narrow: on two lines again ("COLOSSEUM" / "EVENT"), the longer this wide
// per pixel; and the line height (leading-[0.86]).
const TITLE_LINE_WIDTH_PER_PX = 3.13;
const TITLE_LEADING = 0.86;
// Narrow: how far in from either side the corner's buttons reach (light/
// dark on the left, the language on the right): the title, centred, fits
// between them.
const NARROW_SIDE = 104;
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
// Wide: where the segments' pictures start, as a share of the content's
// width — deep behind the text, which floats over them as they fade in,
// blurred and dimmed as under the title, towards the column's edge (where
// the map and tour cards start).
const SEGMENT_DEEP = 0.4;
// The text column's widest, and its side padding (md:px-10), wide.
const COLUMN_MAX = 680;
const COLUMN_PAD = 40;
// A 360° tour is drawn this much wider on either side than its card shows:
// the tour's own navigation panel, in its top right corner, falls outside
// it (the tour has no way to leave it closed), and the view stays centred.
const TOUR_CROP = 300;
// A picture slider's own padding at its ends, and above and below its
// pictures where it has no frame of its own (in the text, on a phone).
const ROW_PAD = 4;
// Where in the content's part of the screen something counts as being read:
// the last heading or title whose top has passed this far down it.
const READING_LINE = 0.38;
// A scroll to something picked on the map is over once the page has been
// still this long; until then, what it passes doesn't light up.
const SEEK_SETTLE_MS = 250;
// The small map in the bottom left, lighting up the spaces being read about
// — set aside for now; true brings it back.
const SHOW_CORNER_MAP = false;

type Mode = "overview" | "gallery";
type Rect = { x: number; y: number; w: number; h: number };
type Layout = {
  w: number;
  h: number;
  wide: boolean;
  // The scroll over which the title docks: the hero's height, less the
  // strip it docks in.
  columnW: number;
  readingY: number;
  segment: Rect;
  // How far in from the segments' left edge the map and tour cards start:
  // the column's edge.
  cardLeadIn: number;
  corner: Rect;
};

function layoutFor(w: number, h: number): Layout {
  const wide = w >= WIDE_PX;
  const columnW = wide ? Math.round(w * SEGMENT_SPLIT) : w;
  // The segments: from below the strip the title floats in down to the
  // bottom, and from deep behind the text to the right edge.
  const segX = Math.round(columnW * SEGMENT_DEEP);
  // The corner map: as wide as the text, in line with it.
  const textX = (columnW - Math.min(COLUMN_MAX, columnW)) / 2 + COLUMN_PAD;
  const cornerW = Math.min(COLUMN_MAX, columnW) - COLUMN_PAD * 2;
  const cornerH = Math.round(cornerW * 0.5);
  return {
    w,
    h,
    wide,
    columnW,
    readingY: TOP_ZONE + (h - TOP_ZONE) * READING_LINE,
    segment: { x: segX, y: TOP_ZONE, w: w - EDGE - segX, h: h - EDGE - TOP_ZONE },
    cardLeadIn: columnW - segX,
    corner: { x: textX, y: h - EDGE - cornerH, w: cornerW, h: cornerH },
  };
}


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

// The segments in the order the page brings them up.
const SEGMENT_KEYS: string[] = (() => {
  const keys: string[] = [];
  const add = (key: string | undefined) => {
    if (key && keys[keys.length - 1] !== key) keys.push(key);
  };
  for (const section of DATENRAUM_SECTIONS) {
    if (section.entries.length === 0) add(segmentFor({ kind: "section", id: section.id })?.key);
    for (const entry of section.entries) add(segmentFor({ kind: "entry", id: entry.id })?.key);
  }
  return keys;
})();
// How many segments ahead of the one up have their first picture fetched.
const PREFETCH_AHEAD = 2;

// Whether the corner map shows for what's lit: an entry's own say, or its
// section's.
function cornerMapFor(lit: Lit): boolean {
  if (lit?.kind === "section") return !!sectionById.get(lit.id)?.bottomMap;
  return litEntries(lit).some((entry) => entry.bottomMap ?? sectionOfEntry.get(entry.id)?.bottomMap ?? false);
}

// Pins from the Events page's maps (see datenraumGallery).
type Pins = { power: DatenraumPin[]; access: DatenraumPin[] };

// Pins on one floor, each showing its name once tapped (one at a time).
function pinSpots(pins: DatenraumPin[], floor: Floor, lang: Lang, open: string | null, onToggle: (id: string) => void): MapSpot[] {
  return pins
    .filter((pin) => pin.floor === floor)
    .map((pin) => {
      const style: { title: L<string>; subtitle?: L<string>; color: string } =
        pin.kind === "access" ? ACCESS_STYLE : POWER_STYLE[pin.kind];
      const subtitle = style.subtitle?.[lang];
      return {
        id: `pin:${pin.id}`,
        u: pin.u,
        v: pin.v,
        front: open === pin.id,
        node: (
          <MapNotePin
            color={style.color}
            title={style.title[lang] || pin.note || ""}
            subtitle={subtitle}
            wheelchair={pin.kind === "access"}
            open={open === pin.id}
            onToggle={() => onToggle(pin.id)}
          />
        ),
      };
    });
}

export function DatenraumView({
  images,
  gallery,
  pins,
  canEdit,
  library,
}: {
  images: Record<string, DatenraumImage>;
  gallery: GalleryImage[];
  pins: Pins;
  // Whoever's roles reach the Media page: they can edit the collection.
  canEdit: boolean;
  library: GalleryLibrary | null;
}) {
  const { lang } = useDatenraumPrefs();
  const ui = UI[lang];
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // "section:id" / "entry:id": the headings and titles.
  const markRefs = useRef(new Map<string, HTMLElement>());

  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const modeRef = useRef<Mode>("overview");
  const [floor, setFloor] = useState<Floor>("eg");
  const [reading, setReading] = useState<Lit>(null);
  const readingRef = useRef<Lit>(null);
  // The corner map's pin showing its name.
  const [openPin, setOpenPin] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The segment beside the text, and the one going as it comes in.
  const [segments, setSegments] = useState<{ current: string | null; leaving: string | null; down: boolean }>({
    current: null,
    leaving: null,
    down: true,
  });
  const segmentsRef = useRef(segments);
  const seekRef = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);

  const viewed: Lit = mode === "overview" ? reading : null;
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

  // The first pictures of the next segments down the page, fetched quietly
  // while this one's read, so they're there as they come up.
  function prefetchAhead(key: string | null) {
    const at = key ? SEGMENT_KEYS.indexOf(key) : -1;
    for (const ahead of SEGMENT_KEYS.slice(at + 1, at + 1 + PREFETCH_AHEAD)) {
      const segment = segmentByKey(ahead);
      const image = segment?.kind === "images" ? images[segment.images[0]] : undefined;
      if (!image) continue;
      const aspect = image.width && image.height ? image.width / image.height : 4 / 3;
      prefetchPicture(image.url, sliderSizes(aspect, WIDE_PX));
    }
  }

  function read(next: Lit) {
    const was = readingRef.current;
    readingRef.current = next;
    setReading(next);
    setHovered(null);
    floorFor(next);
    prefetchAhead(segmentFor(next)?.key ?? null);
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

  // Picked on the map: the page scrolls to the entry.
  function seek(entry: DatenraumEntry) {
    const scroller = scrollRef.current;
    const mark = markRefs.current.get(`entry:${entry.id}`);
    if (!scroller || !mark) return;
    seekRef.current = seekRef.current ?? {};
    endSeekLater();
    read({ kind: "entry", id: entry.id });
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
    showSegment(null, true);
    // To the top of the other content.
    scrollRef.current?.scrollTo({ top: 0 });
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
    // A section's heading stands for its first title, so something's in
    // focus (and beside the text) from the heading on.
    if (found?.kind === "section") {
      const first = sectionById.get(found.id)?.entries[0];
      if (first) found = { kind: "entry", id: first.id };
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
        if (!seekRef.current) measure();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    // Where nothing takes it — beside the text with no segment there, or
    // under the hero once it's begun to scroll away — a scroll or a drag
    // lands on the page itself, beneath the scrolling content (which only
    // takes input where there's something of it: see the content's box).
    // It's handed on to the content, as if it had landed there.
    const onRootWheel = (e: WheelEvent) => {
      if (e.target !== root || e.ctrlKey) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
      scroller.scrollBy({ top: e.deltaY * unit });
    };
    let drag: { id: number; y: number } | null = null;
    const onRootDown = (e: PointerEvent) => {
      if (e.target !== root || e.pointerType === "mouse") return;
      root.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, y: e.clientY };
    };
    const onRootMove = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      scroller.scrollBy({ top: drag.y - e.clientY });
      drag.y = e.clientY;
    };
    const onRootUp = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    root.addEventListener("wheel", onRootWheel, { passive: false });
    root.addEventListener("pointerdown", onRootDown);
    root.addEventListener("pointermove", onRootMove);
    root.addEventListener("pointerup", onRootUp);
    root.addEventListener("pointercancel", onRootUp);
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onRootWheel);
      root.removeEventListener("pointerdown", onRootDown);
      root.removeEventListener("pointermove", onRootMove);
      root.removeEventListener("pointerup", onRootUp);
      root.removeEventListener("pointercancel", onRootUp);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(seekRef.current?.timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What's being read from the start, before any scroll: the page opens on
  // the content, its first title on the reading line already — and again
  // on coming back to the overview.
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, mode]);

  // The corner map: shown for what's being read, lighting up what's lit —
  // every other place on this floor faintly, to show it can be tapped —
  // with the section's pins, if it has any.
  const cornerShown = SHOW_CORNER_MAP && !!layout?.wide && cornerMapFor(viewed);
  const viewedSection =
    viewed?.kind === "section" ? sectionById.get(viewed.id) : viewed?.kind === "entry" ? sectionOfEntry.get(viewed.id) : undefined;
  const cornerSpots =
    viewedSection?.cornerPins === "access"
      ? pinSpots(pins.access, floor, lang, openPin, (id) => setOpenPin((o) => (o === id ? null : id)))
      : [];
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

  const sideSegments = !!layout?.wide && mode === "overview";
  // The title: one line over the middle of the page — or, on a narrow
  // screen, two, still centred, between the corners' buttons and level with
  // their top (smaller only if it has to be to fit there).
  const title = (() => {
    if (!layout || layout.wide) {
      const w = layout?.w ?? 0;
      return { px: TITLE_PX, lines: 1, x: w / 2, y: TITLE_Y, w: TITLE_PX * TITLE_WIDTH_PER_PX, h: TITLE_PX * TITLE_LEADING };
    }
    const room = layout.w - NARROW_SIDE * 2;
    const px = Math.min(TITLE_PX, room / TITLE_LINE_WIDTH_PER_PX);
    const h = 2 * px * TITLE_LEADING;
    return { px, lines: 2, x: layout.w / 2, y: 12 + h / 2, w: px * TITLE_LINE_WIDTH_PER_PX, h };
  })();
  // Narrow: the strip the title floats in (the switcher heads the content
  // instead), down to a little below it.
  const narrowTop = Math.round(title.y + title.h / 2 + 16);

  return (
    // Fills the page's scroll area edge to edge (undoing its padding): the
    // content scrolls in its own box, under the stage.
    // touch-none: a drag starting on the page itself (see onRootDown) is
    // handed on by hand, not panned by the browser; drags in the content
    // and the segments, which scroll by themselves, aren't affected.
    <div ref={rootRef} className="relative -mx-5 -my-6 h-[calc(100%+3rem)] touch-none overflow-hidden bg-surface">
      {layout && sideSegments && (
        // Beneath the content: the segments, their pictures reaching back
        // behind the text, which floats over them — fading in, blurred and
        // dimmed towards the column's edge, as content does under the title.
        <div className="pointer-events-none absolute inset-0">
          <Segments
            rect={layout.segment}
            cardLeadIn={layout.cardLeadIn}
            viewH={layout.h}
            state={segments}
            images={images}
            pins={pins}
            lang={lang}
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
          <div
            aria-hidden
            style={{
              left: layout.segment.x,
              top: 0,
              width: layout.cardLeadIn,
              height: layout.h,
              opacity: segments.current ? 1 : 0,
              maskImage: "linear-gradient(to right, #000 25%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, #000 25%, transparent)",
            }}
            className="absolute bg-[linear-gradient(to_right,color-mix(in_srgb,var(--surface)_80%,transparent),transparent)] backdrop-blur-md transition-opacity duration-500"
          />
        </div>
      )}

      {/* Only what's in it takes clicks, so the segments beneath stay in
          reach wherever the text doesn't cover them. */}
      <div ref={scrollRef} className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain">
        {layout && (
          <>
            <div className="pointer-events-auto" style={{ width: mode === "overview" ? layout.columnW : "100%" }}>
              <div
                className={cn("mx-auto px-6 pt-6 md:px-10", mode === "overview" ? "max-w-[680px]" : "max-w-[1200px]")}
                // Below the strip the title floats in; to the end, far enough
                // for the last title to reach the reading line.
                style={{ paddingTop: layout.wide ? TOP_ZONE : narrowTop, paddingBottom: layout.h - layout.readingY }}
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
                        pins={pins}
                        onPick={pick}
                        onUnpick={() => setHovered(null)}
                        onPassWheel={passWheel}
                        mark={mark}
                      />
                    ))
                  : (
                      <DatenraumGallery images={gallery} lang={lang} canEdit={canEdit} library={library} />
                    )}
              </div>
            </div>
          </>
        )}
      </div>

      {layout && (
        <div className="pointer-events-none absolute inset-0">
          {SHOW_CORNER_MAP && layout.wide && (
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
                onBackgroundTap={(at) => {
                  setOpenPin(null);
                  onMapTap(at);
                }}
                spots={cornerSpots}
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
            aria-hidden
            style={{
              width: layout.w,
              height: layout.wide ? TOP_ZONE + 36 : narrowTop,
              maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
              WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)",
            }}
            className="absolute left-0 top-0 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--surface)_85%,transparent),transparent)] backdrop-blur-md"
          />

          {/* The title, floating at the top over the middle of the page (see
              title above). */}
          <h1
            style={{ fontSize: title.px, left: title.x, top: title.y }}
            className={`${brandFont.className} absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center uppercase leading-[0.86] tracking-tight text-foreground`}
          >
            {title.lines === 2 ? (
              <>
                Colosseum
                <br />
                Event
              </>
            ) : (
              "Colosseum Event"
            )}
          </h1>
          <button
            type="button"
            aria-label="↑"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ left: title.x - title.w / 2, top: title.y - title.h / 2, width: title.w, height: title.h }}
            className="no-press pointer-events-auto absolute"
          />

          {layout.wide && (
            <div style={{ top: SWITCHER_Y }} className="pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2">
              {switcher}
            </div>
          )}

          {/* Top left, over everything: light or dark, German or English. */}
          {layout.wide ? (
            <DatenraumPrefsControls className="pointer-events-auto absolute left-3 top-3" />
          ) : (
            <>
              <DatenraumPrefsControls parts="theme" className="pointer-events-auto absolute left-3 top-3" />
              <DatenraumPrefsControls parts="language" className="pointer-events-auto absolute right-3 top-3" />
            </>
          )}
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
  pins,
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
  pins: Pins;
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
        <InlineSegment segment={section.segment} images={images} pins={pins} lang={lang} ui={ui} onPassWheel={onPassWheel} />
      )}

      <div className="mt-4 flex flex-col">
        {section.entries.map((entry, i) => (
          <Fragment key={entry.id}>
          {entry.group && entry.group[lang] !== section.entries[i - 1]?.group?.[lang] && (
            <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wider text-muted first:mt-0">
              {entry.group[lang]}
            </h3>
          )}
          <div ref={(el) => mark(`entry:${entry.id}`, el)} className="py-4">
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
                  "text-[22px] font-bold leading-tight tracking-tight transition-colors",
                  entryLit(entry) ? "text-accent" : "group-hover:text-accent",
                )}
              >
                {entry.title[lang]}
              </span>
              {entry.subtitle && <span className="mt-0.5 block text-[15px] text-muted">{entry.subtitle[lang]}</span>}
            </button>
            <Blocks blocks={entry.body[lang]} ui={ui} className="mt-2" />
            {inline && entry.segment && (
              <InlineSegment segment={entry.segment} images={images} pins={pins} lang={lang} ui={ui} onPassWheel={onPassWheel} />
            )}
          </div>
          </Fragment>
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
  cardLeadIn,
  viewH,
  state,
  images,
  pins,
  lang,
  ui,
  onPassWheel,
  onLeft,
}: {
  rect: Rect;
  cardLeadIn: number;
  viewH: number;
  state: { current: string | null; leaving: string | null; down: boolean };
  images: Record<string, DatenraumImage>;
  pins: Pins;
  lang: Lang;
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
  const fade = "linear-gradient(to right, transparent, #000 " + cardLeadIn + "px)";
  // The frame runs the window's full height, as the text does — the cards
  // sit where they belong in it, their shadows whole, and going they pass
  // on up under the title's blur rather than ending at an edge of their own.
  const frame = { top: rect.y, bottom: viewH - rect.y - rect.h };
  return (
    <div
      className="absolute"
      style={{ left: rect.x, top: 0, width: rect.w, height: viewH, maskImage: fade, WebkitMaskImage: fade }}
    >
      {keys.map((key) => {
        const segment = segmentByKey(key);
        if (!segment) return null;
        const leaving = key !== state.current;
        return (
          // Only the cards themselves take input: around them, it lands on
          // the page (and scrolls it, see onRootWheel).
          <div
            key={key}
            style={motion}
            inert={leaving}
            onAnimationEnd={leaving ? () => onLeft(key) : undefined}
            className={cn(
              "pointer-events-none absolute inset-0",
              leaving ? "datenraum-segment-out" : "datenraum-segment-in",
            )}
          >
            <SegmentView
              segment={segment}
              images={images}
              pins={pins}
              lang={lang}
              ui={ui}
              onPassWheel={onPassWheel}
              // Pictures from the far edge, the cards from the column's.
              leadIn={segment.kind === "images" ? 0 : cardLeadIn}
              frame={frame}
            />
          </div>
        );
      })}
    </div>
  );
}

type SegmentProps = {
  segment: Segment;
  images: Record<string, DatenraumImage>;
  pins: Pins;
  lang: Lang;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
  // Beside the text: how far in from the segment's (faded) left edge it
  // starts — pictures scrolled back run on into that.
  leadIn?: number;
  // How far in from the top and bottom of its frame it sits.
  frame?: { top: number; bottom: number };
};

const NO_FRAME = { top: ROW_PAD, bottom: ROW_PAD };

function SegmentView({ segment, images, pins, lang, ui, onPassWheel, leadIn = 0, frame = NO_FRAME }: SegmentProps) {
  if (segment.kind === "images")
    return (
      <ImageSlider names={segment.images} images={images} ui={ui} onPassWheel={onPassWheel} leadIn={leadIn} frame={frame} />
    );
  return (
    <div
      className="pointer-events-none h-full"
      style={{ paddingLeft: leadIn, paddingTop: frame.top, paddingBottom: frame.bottom }}
    >
      {segment.kind === "tour" ? (
        <TourCard url={segment.url} ui={ui} />
      ) : (
        <PlanCard pins={segment.pins ? pins[segment.pins] : []} lang={lang} />
      )}
    </div>
  );
}

// Narrow: a title's segment under its text.
function InlineSegment(props: SegmentProps) {
  return (
    <div className="-mx-6 mt-4 aspect-[4/3] md:-mx-10">
      <SegmentView {...props} />
    </div>
  );
}

// Picture cards in a row, at the segment's height, scrolled sideways: by a
// swipe or a trackpad's sideways scroll as usual, by dragging with the
// mouse, and by an ordinary scroll wheel — which, once the row has run out
// that way, goes on to scroll the page. The first picture starts out with
// its right edge on the row's: one narrower than the row would otherwise
// sit back in the fade behind the text, so the row leads in with the
// difference.

function ImageSlider({
  names,
  images,
  leadIn = 0,
  frame = NO_FRAME,
  ui,
  onPassWheel,
}: {
  names: string[];
  images: Record<string, DatenraumImage>;
  ui: Record<string, string>;
  onPassWheel: (deltaY: number) => void;
  leadIn?: number;
  frame?: { top: number; bottom: number };
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const [lead, setLead] = useState(leadIn);
  const dragRef = useRef<{ x: number; left: number; id: number } | null>(null);

  // The lead-in: the row's width less the first picture's, so its right
  // edge meets the row's (EDGE in from the window's), measured whenever
  // either changes size.
  useLayoutEffect(() => {
    const row = rowRef.current, first = firstRef.current;
    if (!row || !first) return;
    const measure = () => setLead(Math.max(leadIn, ROW_PAD, row.clientWidth - first.offsetWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(first);
    return () => ro.disconnect();
  }, [leadIn]);
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

  // On a picture (the row itself lets input through, see below), held
  // there while it's dragged.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
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
      // The row reaches its frame's top and bottom (so it doesn't cut the
      // pictures' shadows off), and only the pictures in it take input.
      style={{ paddingLeft: lead, paddingRight: ROW_PAD, paddingTop: frame.top, paddingBottom: frame.bottom }}
      className="pointer-events-none flex h-full cursor-grab touch-pan-x select-none gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
    >
      {names.map((name, i) => {
        const image = images[name];
        const aspect = image?.width && image?.height ? image.width / image.height : 4 / 3;
        return (
          <div
            key={`${name}-${i}`}
            ref={i === 0 ? firstRef : undefined}
            style={{ aspectRatio: aspect }}
            className="pointer-events-auto relative h-full shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)]"
          >
            {image ? (
              // The first straight away and ahead of the rest; the others as
              // they come near.
              <DatenraumPicture
                src={image.url}
                alt=""
                sizes={sliderSizes(aspect, WIDE_PX)}
                urgent={i === 0}
                className="object-cover"
              />
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
    <div className="pointer-events-auto relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-black shadow-[var(--shadow-float)]">
      <iframe
        src={url}
        title={ui.tour}
        loading="lazy"
        allow="fullscreen; accelerometer; gyroscope; magnetometer; xr-spatial-tracking"
        allowFullScreen
        style={{ left: -TOUR_CROP, width: `calc(100% + ${TOUR_CROP * 2}px)` }}
        className="absolute top-0 h-full max-w-none border-0"
      />
      {/* The tour's credit, cut off with its edges, given again where it
          shows — as the tour has it (nexpics' copyright element). */}
      <a
        href="https://www.nexpics.com"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2.5 left-2 flex items-start gap-[5px] text-[13px] leading-none text-black [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,'Helvetica_Neue',sans-serif]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- nexpics' own logo, from their server */}
        <img src="https://tours.nexpics.com/elements/nexpics-logo_000000.png" alt="nexpics" className="mt-[4px] w-[90px]" />
        <span>
          <i>by</i> mediaglobe ©
        </span>
      </a>
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

// The floor plans as on the Events page: three floors, dragged and zoomed —
// with pins, if it has any (the power connections), each showing its name
// once tapped.
function PlanCard({ pins, lang }: { pins: DatenraumPin[]; lang: Lang }) {
  const [floor, setFloor] = useState<Floor>("eg");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="pointer-events-auto h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-float)]">
      <VenueMap
        className="h-full w-full"
        floors={COLOSSEUM}
        floor={floor}
        onFloorChange={(id) => setFloor(id as Floor)}
        focus={null}
        onBackgroundTap={() => setOpen(null)}
        spots={pinSpots(pins, floor, lang, open, (id) => setOpen((o) => (o === id ? null : id)))}
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
