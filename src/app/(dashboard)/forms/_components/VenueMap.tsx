"use client";

import { Fragment, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { AreaPoint, MapArea } from "@/lib/eventAreas";
import { cn } from "@/lib/utils/cn";
import { startCompass } from "./compass";
import { createTracker, loadWalls, type Tracker, type Walls } from "./deadReckoning";
import { startSteps } from "./steps";
import { createWheelClassifier } from "./wheelKind";

export type FloorPlan = {
  src: string;
  // The plan's size, in its own units: what spots' u and v are fractions
  // of.
  width: number;
  height: number;
  // Where the picture sits on the plan, in the same units, when it doesn't
  // fill it exactly.
  picture?: { x: number; y: number; width: number; height: number };
  // Drawn from vectors rather than pixels: sharp at any zoom, so only
  // ZOOM_IN_LIMIT stops the zoom (see MAX_PIXEL_ZOOM).
  vector?: boolean;
  // Which way true north lies on the drawing, in degrees clockwise from
  // its top edge. Turns the map to match the compass.
  northDeg: number;
  // The floor as it shows while another is picked: a small picture with
  // its blur drawn in (see scripts/rasterize-floorplan.mjs), filling the
  // plan.
  ghost?: string;
  // How many of the plan's units make a metre, and where its walls can be
  // read from (its vector drawing): for following the device round it on
  // foot (see deadReckoning). Without both, the map has no location
  // button.
  unitsPerMetre?: number;
  walls?: string;
};

// One of the building's floors. Its plan is drawn in the same frame as the
// others' (the same width and height), so they lie one over the other.
export type MapFloor = { id: string; label: string; name: string; plan: FloorPlan };

// How strongly the floors not picked show through, by how many floors away
// they are.
const GHOST_OPACITY = [1, 0.16, 0.08];
// Switching floors fades one plan into the other, and each ghost to how
// strongly it shows now, this long — once the new plan has loaded.
const FLOOR_FADE_MS = 300;

// A place on the plan, as a fraction of its width (u) and height (v), and
// what to show there. Spots stay upright and the same size on screen
// however the map is turned or zoomed.
export type MapSpot = { id: string; u: number; v: number; node: ReactNode };

// Where the map is looking: a point p on the plan lands on screen at
// (x, y) + rotate(r) · s·p.
type View = { x: number; y: number; s: number; r: number };

// The plan is a big picture. While the map moves it's slid and scaled as
// it was last drawn — smooth, but soft once it's been blown up far, so a
// zoom draws it again whenever it's come LIVE_REDRAW_ZOOM × closer or
// further than the drawing it's scaling. Once it comes to rest it's drawn
// again at the new zoom, up to this wide — past that a redraw would cost
// more memory than an iPad likes to give. That's only done when it would
// show: when the zoom has changed by more than
// RERASTER_ZOOM since the last time, when it's zoomed in past that width
// and the picture is being blown up, or when the map's turned and the
// picture's fine lines would be smudged by turning it. Sliding the upright
// map otherwise reuses the picture as it is.
const MAX_RASTER_PX = 5000;
const RERASTER_ZOOM = 0.05;
const LIVE_REDRAW_ZOOM = 1.3;
const SETTLE_MS = 180;
const ZOOM_OUT_LIMIT = 0.6; // × the zoom that fits the whole plan
// Zooming in stops at ZOOM_IN_LIMIT × that, past which the plan's lines get
// heavy — or, for a plan drawn from pixels, sooner on a big screen, where
// one of the picture's pixels (about one of the plan's units) would cover
// more than MAX_PIXEL_ZOOM of the screen's and it'd go soft.
const ZOOM_IN_LIMIT = 6;
const MAX_PIXEL_ZOOM = 1.5;
// Two fingers have to turn this far before a pinch starts turning the map
// too, so a plain pinch-to-zoom doesn't wobble it.
const ROTATE_THRESHOLD = (10 * Math.PI) / 180;
const TAP_SLOP_PX = 6;
const MAX_FLING = 2.5; // px per ms
const DOUBLE_TAP_MS = 300;

type Pointer = { x: number; y: number; t: number };

export function VenueMap({
  floors,
  floor,
  onFloorChange,
  spots,
  areas = [],
  selectedArea = null,
  draft = null,
  focus,
  onBackgroundTap,
  className,
}: {
  // The building's floors, bottom up, and which is picked: drawn in full,
  // the others showing through faintly above and below it (see
  // GHOST_OPACITY). With more than one floor, a picker for them sits in
  // the bottom corner.
  floors: MapFloor[];
  floor: string;
  onFloorChange?: (id: string) => void;
  // On the picked floor.
  spots: MapSpot[];
  // Highlighted areas, drawn on the plan beneath the spots (see PlanAreas);
  // the selected one outlined, and an area being drawn as far as it's got.
  areas?: MapArea[];
  selectedArea?: string | null;
  draft?: AreaPoint[] | null;
  // Bump the nonce to bring a spot into view (and the id to pick which).
  focus: { id: string; nonce: number } | null;
  // A tap on the map itself (not on a spot or a control), and where on the
  // plan it landed — as a fraction of its width and height, like a spot's
  // u and v (outside 0–1 when it's off the plan).
  onBackgroundTap?: (at: { u: number; v: number } | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const spotRefs = useRef(new Map<string, HTMLDivElement>());

  const viewRef = useRef<View | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const fitRef = useRef(1);
  const rasterRef = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const motionRef = useRef<number | null>(null); // rAF of an animation or a fling
  const frameRef = useRef<number | null>(null); // rAF of the next draw
  const pointersRef = useRef(new Map<number, Pointer>());
  const gestureRef = useRef<{
    start: Pointer;
    moved: boolean;
    multi: boolean;
    rotating: boolean;
    rotAccum: number;
    rotateMode: boolean; // a mouse drag with ⌥ or the right button
    samples: Pointer[];
  } | null>(null);
  const lastTapRef = useRef<Pointer | null>(null);
  // Until someone moves the map it stays fitted to its box, through any
  // resize; after that a resize keeps whatever's in the middle there.
  const touchedRef = useRef(false);

  const floorIndex = Math.max(floors.findIndex((f) => f.id === floor), 0);
  const plan = floors[floorIndex].plan;
  // The plan whose picture has loaded; swapping to another (another floor,
  // or the same as pixels) shows the spinner again until that one has —
  // over the spots and areas, which stay once the first has.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === plan.src;
  const ready = loadedSrc !== null;
  // The floor just switched away from, whose plan stays while the new one
  // loads and fades in over it.
  const [shownFloor, setShownFloor] = useState(floor);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (shownFloor !== floor) {
    setShownFloor(floor);
    setLeaving(shownFloor);
  }
  // Counts a plan as loaded a couple of frames on, so it's been drawn
  // see-through at least once and fades in — a cached one would otherwise
  // be in before its first frame, and just appear.
  function letIn(src: string) {
    if (loadedSrc === src) return;
    requestAnimationFrame(() => requestAnimationFrame(() => setLoadedSrc(src)));
  }
  useEffect(() => {
    if (!leaving || !loaded) return;
    const timer = setTimeout(() => setLeaving(null), FLOOR_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving, loaded]);
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  const headingRef = useRef<number | null>(null);
  const stopCompassRef = useRef<(() => void) | null>(null);
  // Following the device round the plan on foot (see deadReckoning):
  // "placing" waits for a tap on where it is, "on" follows its steps from
  // there.
  const [locating, setLocating] = useState<"off" | "placing" | "on">("off");
  const locatingRef = useRef(locating);
  const trackerRef = useRef<Tracker | null>(null);
  const wallsRef = useRef<Walls | null>(null);
  const stopLocatingRef = useRef<(() => void) | null>(null);
  // Which way the device faces, smoothed: a unit vector, x east and y north.
  const youHeadingRef = useRef<{ x: number; y: number } | null>(null);
  const youFrameRef = useRef<number | null>(null);
  const stepsRef = useRef(0);
  const youRef = useRef<HTMLDivElement | null>(null);
  const youRingRef = useRef<HTMLSpanElement>(null);
  const youConeRef = useRef<HTMLSpanElement>(null);
  const [youStats, setYouStats] = useState<{ steps: number; radiusM: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A nudge to the plan's north, set by hand while following the compass to
  // line the plan up with the room — the sum is the northDeg to keep.
  const [northNudge, setNorthNudge] = useState(0);
  const northRef = useRef(plan.northDeg);
  useEffect(() => {
    northRef.current = plan.northDeg + northNudge;
  });

  const spotsRef = useRef(spots);
  const onBackgroundTapRef = useRef(onBackgroundTap);
  useEffect(() => {
    spotsRef.current = spots;
    onBackgroundTapRef.current = onBackgroundTap;
  });

  // --- geometry -----------------------------------------------------------

  const toScreen = (v: View, px: number, py: number) => {
    const c = Math.cos(v.r), s = Math.sin(v.r);
    return { x: v.x + (px * c - py * s) * v.s, y: v.y + (px * s + py * c) * v.s };
  };

  function placeSpot(el: HTMLElement, spot: MapSpot) {
    const v = viewRef.current;
    if (!v) return;
    const p = toScreen(v, spot.u * plan.width, spot.v * plan.height);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  // Places the plan, the spots and the compass needle for the current view
  // — drawing the plan again first if the zoom has run too far from the
  // drawing being scaled (see LIVE_REDRAW_ZOOM).
  function draw() {
    const v = viewRef.current;
    const planEl = planRef.current;
    if (!v || !planEl) return;
    const rs = Math.min(v.s, MAX_RASTER_PX / plan.width);
    const drift = rs / rasterRef.current;
    if (drift > LIVE_REDRAW_ZOOM || drift < 1 / LIVE_REDRAW_ZOOM) setRaster(rs);
    planEl.style.transform = `translate(${v.x}px, ${v.y}px) rotate(${v.r}rad) scale(${v.s / rasterRef.current})`;
    for (const spot of spotsRef.current) {
      const el = spotRefs.current.get(spot.id);
      if (el) placeSpot(el, spot);
    }
    if (needleRef.current) {
      needleRef.current.style.transform = `rotate(${v.r + (northRef.current * Math.PI) / 180}rad)`;
    }
    placeYou();
  }

  // The device's dot: where the tracker has it, its ring as wide as it's
  // unsure (in the plan's units, so it scales with the zoom), and its cone
  // the way it faces, turned with the map.
  function placeYou() {
    const el = youRef.current, v = viewRef.current;
    const fix = trackerRef.current?.fix();
    if (!el || !v || !fix) return;
    const p = toScreen(v, fix.x, fix.y);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    if (youRingRef.current) {
      const d = `${2 * fix.radius * v.s}px`;
      youRingRef.current.style.width = d;
      youRingRef.current.style.height = d;
    }
    const h = youHeadingRef.current;
    if (youConeRef.current) {
      youConeRef.current.style.visibility = h ? "visible" : "hidden";
      if (h) {
        const facing = Math.atan2(h.x, h.y) + (northRef.current * Math.PI) / 180 + v.r;
        youConeRef.current.style.transform = `rotate(${facing}rad)`;
      }
    }
  }

  function setRaster(rs: number) {
    const planEl = planRef.current;
    if (!planEl) return;
    rasterRef.current = rs;
    planEl.style.width = `${plan.width * rs}px`;
    planEl.style.height = `${plan.height * rs}px`;
  }

  // Once the map's been still for a moment, redraws the plan sharp at the
  // zoom it's at, if that would look any different (see MAX_RASTER_PX).
  // While it moves the plan is its own layer (will-change), a picture the
  // browser can slide about without drawing it again. Dropping that layer
  // at every pause, as this once did, cost a full redraw at the pause and
  // another as the next move began; now it's only dropped for a redraw that
  // has to happen anyway, which also hands the next move a fresh layer —
  // Chrome kept redrawing a layer that had been through a zoom while the
  // next zoom was still under way.
  function settle() {
    if (pointersRef.current.size > 0 || motionRef.current !== null || followingRef.current) {
      settleTimer.current = setTimeout(settle, SETTLE_MS);
      return;
    }
    const v = viewRef.current;
    const planEl = planRef.current;
    if (!v || !planEl) return;
    const maxRaster = MAX_RASTER_PX / plan.width;
    const rs = Math.min(v.s, maxRaster);
    const rezoomed = Math.abs(rs / rasterRef.current - 1) > RERASTER_ZOOM;
    const blownUp = v.s > maxRaster * (1 + RERASTER_ZOOM);
    const turn = ((v.r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const turned = Math.min(turn, 2 * Math.PI - turn) > 0.001;
    if (!rezoomed && !blownUp && !turned) return;
    planEl.style.willChange = "auto";
    if (rezoomed) setRaster(rs);
    flush();
  }

  // Moves the map to a new view. A trackpad sends wheels twice as often as
  // the screen refreshes, and every one of them would otherwise restyle
  // the plan; so the view itself changes at once (the next event carries
  // on from it), but it's only drawn once, in the coming frame.
  function commit(next: View) {
    viewRef.current = clampView(next);
    const planEl = planRef.current;
    if (planEl && planEl.style.willChange !== "transform") planEl.style.willChange = "transform";
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        draw();
      });
    }
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, SETTLE_MS);
  }

  // Draws the view now rather than in the coming frame: for animations,
  // which already run a frame at a time, and for a change of the plan's
  // size, which has to land in the same frame as the scale that goes with
  // it.
  function flush() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    draw();
  }

  function maxZoom() {
    const fit = fitRef.current;
    if (plan.vector) return fit * ZOOM_IN_LIMIT;
    return Math.max(fit, Math.min(fit * ZOOM_IN_LIMIT, MAX_PIXEL_ZOOM / window.devicePixelRatio));
  }

  // Keeps at least part of the plan on screen: its middle can't be pushed
  // further out than about half its own size past an edge.
  function clampView(v: View): View {
    const { w, h } = sizeRef.current;
    const s = Math.min(Math.max(v.s, fitRef.current * ZOOM_OUT_LIMIT), maxZoom());
    let next = v;
    if (s !== v.s) next = zoomAbout(v, w / 2, h / 2, s / v.s, true);
    const c = toScreen(next, plan.width / 2, plan.height / 2);
    const reach = (Math.min(plan.width, plan.height) / 2) * next.s;
    const cx = Math.min(Math.max(c.x, Math.min(w / 2, -reach + 80)), Math.max(w / 2, w + reach - 80));
    const cy = Math.min(Math.max(c.y, Math.min(h / 2, -reach + 80)), Math.max(h / 2, h + reach - 80));
    return { ...next, x: next.x + cx - c.x, y: next.y + cy - c.y };
  }

  function zoomAbout(v: View, cx: number, cy: number, k: number, raw = false): View {
    let s = v.s * k;
    if (!raw) s = Math.min(Math.max(s, fitRef.current * ZOOM_OUT_LIMIT), maxZoom());
    const kk = s / v.s;
    return { ...v, s, x: cx + (v.x - cx) * kk, y: cy + (v.y - cy) * kk };
  }

  function rotateAbout(v: View, cx: number, cy: number, da: number): View {
    const c = Math.cos(da), s = Math.sin(da);
    const dx = v.x - cx, dy = v.y - cy;
    return { ...v, r: v.r + da, x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  // The whole plan, upright and centred.
  function fitView(w: number, h: number): View {
    const s = Math.min(w / plan.width, h / plan.height) * 0.94;
    return { s, r: 0, x: (w - plan.width * s) / 2, y: (h - plan.height * s) / 2 };
  }

  // --- motion ---------------------------------------------------------------

  function stopMotion() {
    if (motionRef.current !== null) cancelAnimationFrame(motionRef.current);
    motionRef.current = null;
  }

  function animateTo(target: View, ms = 480) {
    stopMotion();
    touchedRef.current = true;
    const from = viewRef.current;
    if (!from) return;
    // The short way round.
    let dr = (target.r - from.r) % (2 * Math.PI);
    if (dr > Math.PI) dr -= 2 * Math.PI;
    if (dr < -Math.PI) dr += 2 * Math.PI;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const e = 1 - Math.pow(1 - t, 3);
      // Scale in log space, so zooming feels even all the way.
      const s = from.s * Math.pow(target.s / from.s, e);
      viewRef.current = {
        s,
        r: from.r + dr * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      commit(viewRef.current);
      flush();
      motionRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    motionRef.current = requestAnimationFrame(step);
  }

  function fling(vx: number, vy: number) {
    stopMotion();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 32);
      last = now;
      const decay = Math.pow(0.994, dt);
      vx *= decay;
      vy *= decay;
      const v = viewRef.current!;
      commit({ ...v, x: v.x + vx * dt, y: v.y + vy * dt });
      flush();
      motionRef.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : null;
    };
    motionRef.current = requestAnimationFrame(step);
  }

  // --- setup ------------------------------------------------------------------

  // Sizes the map to its box, and keeps the same spot in the middle when
  // the box changes size (rotating an iPad, the split resizing).
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const prev = sizeRef.current;
      sizeRef.current = { w, h };
      fitRef.current = fitView(w, h).s;
      if (!viewRef.current || !touchedRef.current) {
        const v = fitView(w, h);
        setRaster(Math.min(v.s, MAX_RASTER_PX / plan.width));
        commit(v);
      } else {
        const v = viewRef.current;
        commit({ ...v, x: v.x + (w - prev.w) / 2, y: v.y + (h - prev.h) / 2 });
      }
      flush();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.width, plan.height]);

  // Wheel and trackpad, on any desktop browser. A mouse wheel zooms about
  // the pointer; a trackpad's two-finger swipe slides the map, like
  // scrolling a page (wheelKind tells the two apart). A trackpad pinch
  // arrives as a wheel with ctrlKey (Chrome, Edge and Firefox, on a Mac or
  // a Windows precision touchpad), and ⌘ or ctrl with either zooms too.
  // Desktop Safari sends its pinch — and the trackpad's two-finger turn,
  // which only it reports — as gesture events instead, which zoom and turn
  // the map; while one's under way any ctrl-wheel it also sends is ignored,
  // so the pinch doesn't count twice. iOS sends gesture events too,
  // alongside the touches already handled below, so they're ignored while
  // fingers are down.
  useEffect(() => {
    const el = containerRef.current!;
    const wheelKind = createWheelClassifier();
    let gesturing = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      if (gesturing && e.ctrlKey) return;
      stopMotion();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      if (e.ctrlKey || e.metaKey || wheelKind(e) === "mouse") {
        const k = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0025));
        commit(zoomAbout(v, e.clientX - rect.left, e.clientY - rect.top, k));
      } else {
        commit({ ...v, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit });
      }
    };
    let last: { scale: number; rotation: number } | null = null;
    type GestureEvent = UIEvent & { scale: number; rotation: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gesturing = true;
      last = pointersRef.current.size > 0 ? null : { scale: 1, rotation: 0 };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      const v = viewRef.current;
      if (!last || !v) return;
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const cx = g.clientX - rect.left, cy = g.clientY - rect.top;
      let next = zoomAbout(v, cx, cy, g.scale / last.scale);
      const da = ((g.rotation - last.rotation) * Math.PI) / 180;
      if (da && !followingRef.current) next = rotateAbout(next, cx, cy, da);
      last = { scale: g.scale, rotation: g.rotation };
      commit(next);
    };
    const onGestureEnd = () => {
      gesturing = false;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      stopMotion();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      clearTimeout(settleTimer.current);
      stopCompassRef.current?.();
      stopLocatingRef.current?.();
    },
    [],
  );

  // The picked floor's walls, for the tracker, while it's on (none for the
  // moment it takes to read another floor's, rather than the wrong ones).
  const locatingOn = locating !== "off";
  useEffect(() => {
    if (!locatingOn || !plan.walls) return;
    let live = true;
    wallsRef.current = null;
    trackerRef.current?.setWalls(null);
    void loadWalls(plan.walls).then((walls) => {
      if (!live) return;
      wallsRef.current = walls;
      trackerRef.current?.setWalls(walls);
    });
    return () => {
      live = false;
    };
  }, [locatingOn, plan.walls]);

  // Brings the focused spot into view: zoomed in a little if the map's out
  // at the whole plan, and a bit below the middle, so the card opening
  // above it has the room.
  useEffect(() => {
    if (!focus) return;
    const spot = spotsRef.current.find((s) => s.id === focus.id);
    const v = viewRef.current;
    if (!spot || !v) return;
    const { w, h } = sizeRef.current;
    const s = Math.min(Math.max(v.s, fitRef.current * 2.2), maxZoom());
    const at = toScreen({ ...v, x: 0, y: 0, s }, spot.u * plan.width, spot.v * plan.height);
    animateTo(clampView({ ...v, s, x: w / 2 - at.x, y: h * 0.66 - at.y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // --- pointers ---------------------------------------------------------------

  function local(e: PointerEvent<HTMLDivElement>): Pointer {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stopMotion();
    touchedRef.current = true;
    const p = local(e);
    pointersRef.current.set(e.pointerId, p);
    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        start: p,
        moved: false,
        multi: false,
        rotating: false,
        rotAccum: 0,
        rotateMode: e.pointerType === "mouse" && (e.altKey || e.button === 2),
        samples: [p],
      };
    } else if (gestureRef.current) {
      gestureRef.current.multi = true;
      gestureRef.current.moved = true;
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    const g = gestureRef.current;
    const v = viewRef.current;
    if (!prev || !g || !v) return;
    const p = local(e);

    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < TAP_SLOP_PX) return;
    g.moved = true;

    if (pointers.size === 1) {
      if (g.rotateMode && !followingRef.current) {
        const { w, h } = sizeRef.current;
        const a0 = Math.atan2(prev.y - h / 2, prev.x - w / 2);
        const a1 = Math.atan2(p.y - h / 2, p.x - w / 2);
        commit(rotateAbout(v, w / 2, h / 2, a1 - a0));
      } else {
        commit({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y });
        g.samples.push(p);
        if (g.samples.length > 6) g.samples.shift();
      }
    } else {
      // Two fingers: the pair's midpoint drags the map, their spread zooms
      // it and their angle turns it, all about that midpoint.
      const [a, b] = [...pointers.entries()].slice(0, 2);
      const other = a[0] === e.pointerId ? b[1] : a[1];
      if (a[0] !== e.pointerId && b[0] !== e.pointerId) {
        pointers.set(e.pointerId, p);
        return;
      }
      const c0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const c1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(p.x - other.x, p.y - other.y);
      let da = Math.atan2(p.y - other.y, p.x - other.x) - Math.atan2(prev.y - other.y, prev.x - other.x);
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;

      let next = { ...v, x: v.x + c1.x - c0.x, y: v.y + c1.y - c0.y };
      if (d0 > 0) next = zoomAbout(next, c1.x, c1.y, d1 / d0);
      if (!g.rotating) {
        g.rotAccum += da;
        if (Math.abs(g.rotAccum) > ROTATE_THRESHOLD) {
          g.rotating = true;
          da = g.rotAccum;
        }
      }
      if (g.rotating && !followingRef.current) next = rotateAbout(next, c1.x, c1.y, da);
      commit(next);
    }
    pointers.set(e.pointerId, p);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const pointers = pointersRef.current;
    if (!pointers.delete(e.pointerId)) return;
    const g = gestureRef.current;
    if (pointers.size > 0) {
      // One finger of a pinch lifted: the other carries on as a plain drag.
      if (g) g.samples = [];
      return;
    }
    gestureRef.current = null;
    if (!g) return;
    const p = local(e);

    if (!g.moved && e.type === "pointerup") {
      const last = lastTapRef.current;
      if (last && p.t - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
        lastTapRef.current = null;
        const v = viewRef.current;
        if (v) animateTo(clampView(zoomAbout(v, p.x, p.y, 2.2)), 320);
      } else {
        lastTapRef.current = p;
        const v = viewRef.current;
        let at: { u: number; v: number } | null = null;
        if (v) {
          // Back from the screen to the plan: the inverse of toScreen.
          const dx = p.x - v.x, dy = p.y - v.y;
          const c = Math.cos(v.r), s = Math.sin(v.r);
          at = {
            u: (dx * c + dy * s) / v.s / plan.width,
            v: (-dx * s + dy * c) / v.s / plan.height,
          };
        }
        if (locatingRef.current === "placing" && at) placeYourself(at.u * plan.width, at.v * plan.height);
        else onBackgroundTapRef.current?.(at);
      }
      return;
    }

    // Let go mid-drag: the map carries on a little, slowing down.
    const samples = g.samples.filter((sample) => p.t - sample.t < 100);
    if (!g.multi && !g.rotateMode && samples.length >= 2) {
      const first = samples[0], lastSample = samples[samples.length - 1];
      const dt = lastSample.t - first.t;
      if (dt > 0) {
        let vx = (lastSample.x - first.x) / dt, vy = (lastSample.y - first.y) / dt;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_FLING) {
          vx *= MAX_FLING / speed;
          vy *= MAX_FLING / speed;
        }
        if (speed > 0.25) fling(vx, vy);
      }
    }
  }

  // --- controls -----------------------------------------------------------------

  function zoomBy(k: number) {
    const v = viewRef.current;
    if (!v) return;
    const { w, h } = sizeRef.current;
    animateTo(clampView(zoomAbout(v, w / 2, h / 2, k)), 280);
  }

  function upright() {
    const v = viewRef.current;
    if (!v) return;
    const { w, h } = sizeRef.current;
    animateTo(rotateAbout(v, w / 2, h / 2, -v.r));
  }

  function stopFollowing() {
    if (!followingRef.current) return;
    followingRef.current = false;
    setFollowing(false);
    stopCompassRef.current?.();
    stopCompassRef.current = null;
    headingRef.current = null;
  }

  // While following the compass, eases the map round to the heading each
  // frame (the sensor's readings are jumpy; this smooths them out).
  function followLoop() {
    if (!followingRef.current) return;
    const v = viewRef.current;
    const heading = headingRef.current;
    if (v && heading !== null && pointersRef.current.size === 0) {
      const target = (-(heading + northRef.current) * Math.PI) / 180;
      let da = (target - v.r) % (2 * Math.PI);
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 0.002) {
        const { w, h } = sizeRef.current;
        commit(rotateAbout(v, w / 2, h / 2, da * 0.18));
        flush();
      }
    }
    requestAnimationFrame(followLoop);
  }

  function setLocate(next: "off" | "placing" | "on") {
    locatingRef.current = next;
    setLocating(next);
  }

  function updateYouStats() {
    const fix = trackerRef.current?.fix();
    setYouStats(fix && plan.unitsPerMetre ? { steps: stepsRef.current, radiusM: fix.radius / plan.unitsPerMetre } : null);
  }

  // The location button. Off, it starts the step counter and compass —
  // straight from the tap, as iOS asks — and waits for a tap on where the
  // device is. On, it waits for one again, to set it right; pressed again
  // while waiting, it's off.
  function onLocatePress() {
    if (locatingRef.current === "placing") {
      stopLocating();
      return;
    }
    if (locatingRef.current === "on") {
      setLocate("placing");
      return;
    }
    const steps = startSteps(onStep);
    const heading = startCompass(onYouHeading);
    setLocate("placing");
    void Promise.all([steps, heading]).then(([stopSteps, stopHeading]) => {
      const stop = () => {
        stopSteps?.();
        stopHeading?.();
      };
      if (locatingRef.current === "off") return stop();
      stopLocatingRef.current = stop;
      if (!stopSteps || !stopHeading) showNotice("Bewegungssensoren nicht verfügbar");
    });
  }

  function stopLocating() {
    stopLocatingRef.current?.();
    stopLocatingRef.current = null;
    trackerRef.current = null;
    youHeadingRef.current = null;
    stepsRef.current = 0;
    setLocate("off");
    setYouStats(null);
  }

  // A tap on the plan while waiting for one: the device is there.
  function placeYourself(x: number, y: number) {
    if (!plan.unitsPerMetre) return;
    let tracker = trackerRef.current;
    if (!tracker) {
      tracker = createTracker(plan.unitsPerMetre);
      tracker.setWalls(wallsRef.current);
      trackerRef.current = tracker;
    }
    tracker.place(x, y);
    stepsRef.current = 0;
    setLocate("on");
    updateYouStats();
    placeYou();
  }

  function onStep() {
    const tracker = trackerRef.current, h = youHeadingRef.current;
    if (!tracker || !h || locatingRef.current === "off") return;
    // The compass's degrees from north, turned to the plan's from its top.
    tracker.step((Math.atan2(h.x, h.y) * 180) / Math.PI + northRef.current);
    stepsRef.current += 1;
    updateYouStats();
    placeYou();
  }

  function onYouHeading(degrees: number) {
    const a = (degrees * Math.PI) / 180, h = youHeadingRef.current;
    youHeadingRef.current = h
      ? { x: h.x + (Math.sin(a) - h.x) * 0.3, y: h.y + (Math.cos(a) - h.y) * 0.3 }
      : { x: Math.sin(a), y: Math.cos(a) };
    if (youFrameRef.current === null) {
      youFrameRef.current = requestAnimationFrame(() => {
        youFrameRef.current = null;
        placeYou();
      });
    }
  }

  function showNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600);
  }

  // The compass button: starts turning the map with the device, so what's
  // ahead on the plan is ahead in the room. While it does, the map can still
  // be slid and zoomed but not turned by hand: only this button turns it
  // off. Pressed again — or on a device without a compass — it stands the
  // plan back upright.
  function onCompassPress() {
    if (followingRef.current) {
      stopFollowing();
      upright();
      return;
    }
    stopMotion();
    touchedRef.current = true;
    // Called straight from the tap: iOS only asks for permission from one.
    const starting = startCompass((heading) => {
      headingRef.current = heading;
    });
    void starting.then((stop) => {
      if (!stop) {
        upright();
        showNotice("Kompass nicht verfügbar");
        return;
      }
      stopCompassRef.current = stop;
      followingRef.current = true;
      setFollowing(true);
      requestAnimationFrame(followLoop);
      // Nothing heard after a moment: there's no compass after all
      // (desktops have the event, but never fire it).
      setTimeout(() => {
        if (followingRef.current && headingRef.current === null) {
          stopFollowing();
          upright();
          showNotice("Kompass nicht verfügbar");
        }
      }, 1200);
    });
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      // overflow-clip, not hidden: a hidden box can still be scrolled, and
      // focusing a card's button out at the edge did just that, sliding
      // the controls and cards away from the plan beneath them.
      className={cn("relative touch-none select-none overflow-clip bg-surface", className)}
    >
      <div
        ref={planRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: 0, height: 0, willChange: "transform" }}
      >
        {/* The floors bottom up, each in its place in the stack: the picked
            one drawn in full, the rest as their ghosts. Until the picked
            one's plan has loaded, it shows as its ghost still, and the
            floor before stays drawn in full. */}
        {floors.map((f, i) => {
          const away = Math.abs(i - floorIndex);
          const ghostAway = away === 0 && !loaded && leaving ? 1 : away;
          // Drawn in full: the picked floor, and the one switched away
          // from until the picked one's in. One picture for both, so the
          // one leaving carries on as it was, just fading.
          const current = away === 0;
          const full = current || f.id === leaving ? f.plan : null;
          const pic = full?.picture ?? { x: 0, y: 0, width: plan.width, height: plan.height };
          return (
            <Fragment key={f.id}>
              {f.plan.ghost && (
                // eslint-disable-next-line @next/next/no-img-element -- see below
                <img
                  src={f.plan.ghost}
                  alt=""
                  draggable={false}
                  decoding="async"
                  style={{
                    opacity: ghostAway > 0 ? (GHOST_OPACITY[ghostAway] ?? 0) : 0,
                    transitionDuration: `${FLOOR_FADE_MS}ms`,
                  }}
                  className="pointer-events-none absolute inset-0 h-full w-full max-w-none transition-opacity dark:invert dark:hue-rotate-180"
                />
              )}
              {full && (
                // eslint-disable-next-line @next/next/no-img-element -- one big picture drawn at whatever size the map needs, not a photo for next/image to resize
                <img
                  key={full.src}
                  src={full.src}
                  alt={current ? `Grundriss, ${f.name}` : ""}
                  draggable={false}
                  decoding="async"
                  // A cached plan can finish loading before React is
                  // listening, so it's checked for on mount as well.
                  ref={(img) => {
                    if (current && img?.complete && img.naturalWidth) letIn(full.src);
                  }}
                  onLoad={() => {
                    if (current) letIn(full.src);
                  }}
                  style={{
                    left: `${(pic.x / plan.width) * 100}%`,
                    top: `${(pic.y / plan.height) * 100}%`,
                    width: `${(pic.width / plan.width) * 100}%`,
                    height: `${(pic.height / plan.height) * 100}%`,
                    // Faded like a floor when it is one, otherwise (the map
                    // opening, Vektor ↔ Pixel) as it always was.
                    transitionDuration: leaving ? `${FLOOR_FADE_MS}ms` : "500ms",
                  }}
                  className={cn(
                    "pointer-events-none absolute max-w-none transition-opacity dark:invert dark:hue-rotate-180",
                    loaded === current ? "opacity-100" : "opacity-0",
                  )}
                />
              )}
            </Fragment>
          );
        })}
        {ready && <PlanAreas plan={plan} areas={areas} selected={selectedArea} draft={draft} />}
      </div>

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {youStats && (
        // The device, as followed on foot (see placeYou), beneath the spots.
        <div
          ref={(el) => {
            youRef.current = el;
            if (el) placeYou();
          }}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-[5]"
        >
          <span
            ref={youRingRef}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/40 bg-accent/10 transition-[width,height] duration-300"
          />
          <span ref={youConeRef} className="absolute -left-7 -top-7 block h-14 w-14">
            <svg viewBox="0 0 56 56" className="h-14 w-14">
              <path d="M28 28 17 4.5a26 26 0 0 1 22 0z" style={{ fill: "var(--accent)", fillOpacity: 0.35 }} />
            </svg>
          </span>
          <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-accent shadow-[0_1px_4px_var(--shadow-ambient-strong)]" />
        </div>
      )}

      {ready &&
        spots.map((spot) => (
          <div
            key={spot.id}
            // Placed from this render's spot, not spotsRef (only updated
            // after the commit): one just added or moved (an event's pins)
            // is where it belongs from its first frame.
            ref={(el) => {
              if (el) {
                spotRefs.current.set(spot.id, el);
                placeSpot(el, spot);
              } else {
                spotRefs.current.delete(spot.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 z-10"
          >
            {spot.node}
          </div>
        ))}

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border glass-material shadow-[var(--shadow-float)]"
      >
        <MapButton label="Vergrößern" onClick={() => zoomBy(1.6)}>
          <path d="M12 6v12M6 12h12" />
        </MapButton>
        <span className="mx-2 h-px bg-border" />
        <MapButton label="Verkleinern" onClick={() => zoomBy(1 / 1.6)}>
          <path d="M6 12h12" />
        </MapButton>
        <span className="mx-2 h-px bg-border" />
        <button
          type="button"
          onClick={onCompassPress}
          aria-pressed={following}
          aria-label={following ? "Kompass aus, Plan aufrichten" : "Nach Kompass ausrichten"}
          title={following ? "Kompass aus" : "Nach Kompass ausrichten"}
          className={cn(
            "no-press flex h-11 w-11 items-center justify-center transition-colors",
            following ? "bg-accent text-accent-contrast" : "text-foreground",
          )}
        >
          {/* The needle points to north on the plan as it's turned now. */}
          <span ref={needleRef} className="relative block h-6 w-6">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
              <path d="M12 2.5 15.2 12H8.8z" fill={following ? "currentColor" : "var(--danger)"} />
              <path d="M12 21.5 8.8 12h6.4z" fill="currentColor" opacity={following ? 0.55 : 0.35} />
            </svg>
          </span>
        </button>
        {plan.unitsPerMetre && plan.walls && (
          <>
            <span className="mx-2 h-px bg-border" />
            <button
              type="button"
              onClick={onLocatePress}
              aria-pressed={locating !== "off"}
              aria-label={
                locating === "off" ? "Eigenen Standort verfolgen" : locating === "on" ? "Standort neu setzen" : "Standort aus"
              }
              title={locating === "off" ? "Standort verfolgen" : locating === "on" ? "Standort neu setzen" : "Standort aus"}
              className={cn(
                "no-press flex h-11 w-11 items-center justify-center transition-colors",
                locating !== "off"
                  ? "bg-accent text-accent-contrast"
                  : "text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]",
              )}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path
                  d="M20.5 3.5 3.5 10.6l7.4 2.5 2.5 7.4z"
                  fill={locating === "on" ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {floors.length > 1 && (
        // The floors, top down as they stand.
        <div
          role="group"
          aria-label="Etage"
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-3 right-3 z-20 flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border glass-material shadow-[var(--shadow-float)]"
        >
          {[...floors].reverse().map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && <span className="mx-2 h-px bg-border" />}
              <button
                type="button"
                onClick={() => onFloorChange?.(f.id)}
                aria-pressed={f.id === floors[floorIndex].id}
                aria-label={f.name}
                title={f.name}
                className={cn(
                  "no-press flex h-11 w-11 items-center justify-center text-[15px] font-semibold tabular-nums transition-colors",
                  f.id === floors[floorIndex].id
                    ? "bg-accent text-accent-contrast"
                    : "text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]",
                )}
              >
                {f.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}

      {/* Beneath the controls: north to nudge while following the compass,
          then how the location's going, or a passing note. */}
      <div className="pointer-events-none absolute right-3 top-[198px] z-20 flex flex-col items-end gap-2">
        {following && (
          <NorthNudge
            value={normalizeDeg(plan.northDeg + northNudge)}
            onStep={(step) => setNorthNudge((n) => n + step)}
          />
        )}
        {!notice && locating !== "off" && (
          // Waiting for a tap, or how sure it is.
          <div
            role="status"
            className="pop-in origin-top-right rounded-full border border-border glass-material px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-float)]"
          >
            {locating === "placing" || !youStats
              ? youStats
                ? "Tippe, wo du stehst – nochmal: aus"
                : "Tippe auf den Plan, wo du stehst"
              : `± ${Math.max(1, Math.round(youStats.radiusM))} m · ${youStats.steps} Schritte`}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="pop-in origin-top-right rounded-full border border-border glass-material px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-float)]"
          >
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}

// Areas soften out at their edges over about this many of the plan's units
// (the blur's standard deviation) — wider zoomed in, as the plan is.
const AREA_SOFTNESS = 70;

// The areas, drawn in the plan's own units over the picture, so they slide,
// zoom and turn with it: each a blue fill blurred at its edges, the
// selected one outlined too. An area being drawn shows as a line through
// its corners so far, filled in faintly once there are three.
function PlanAreas({
  plan,
  areas,
  selected,
  draft,
}: {
  plan: FloorPlan;
  areas: MapArea[];
  selected: string | null;
  draft: AreaPoint[] | null;
}) {
  if (areas.length === 0 && !draft?.length) return null;
  const toPoints = (pts: AreaPoint[]) => pts.map((p) => `${p.u * plan.width},${p.v * plan.height}`).join(" ");
  const pad = AREA_SOFTNESS * 3;
  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        {/* One blur per area, its region just around that area: one across
            the whole plan would have the browser blur all of it. */}
        {areas.map((area) => {
          const xs = area.points.map((p) => p.u * plan.width), ys = area.points.map((p) => p.v * plan.height);
          const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
          return (
            <filter
              key={area.id}
              id={`area-soft-${area.id}`}
              filterUnits="userSpaceOnUse"
              x={x}
              y={y}
              width={Math.max(...xs) + pad - x}
              height={Math.max(...ys) + pad - y}
            >
              <feGaussianBlur stdDeviation={AREA_SOFTNESS} />
            </filter>
          );
        })}
      </defs>
      {areas.map((area) => (
        <polygon
          key={area.id}
          points={toPoints(area.points)}
          filter={`url(#area-soft-${area.id})`}
          style={{ fill: "var(--accent)", fillOpacity: 0.4 }}
        />
      ))}
      {areas
        .filter((area) => area.id === selected)
        .map((area) => (
          <polygon
            key={area.id}
            points={toPoints(area.points)}
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeDasharray="6 4"
            style={{ fill: "none", stroke: "var(--accent)" }}
          />
        ))}
      {draft && draft.length > 0 && (
        <>
          {draft.length >= 3 && <polygon points={toPoints(draft)} style={{ fill: "var(--accent)", fillOpacity: 0.15 }} />}
          <polyline
            points={toPoints(draft)}
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ fill: "none", stroke: "var(--accent)" }}
          />
        </>
      )}
    </svg>
  );
}

// -180 < degrees ≤ 180.
function normalizeDeg(degrees: number) {
  const d = ((degrees % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

// While following the compass: the plan's north, a degree at a time (held,
// it keeps going), to line the plan up with the room by eye. The number
// shown is the north to write into the plan (FloorPlan.northDeg).
function NorthNudge({ value, onStep }: { value: number; onStep: (step: number) => void }) {
  const repeat = useRef<{ timer?: ReturnType<typeof setTimeout> }>({});
  const stop = () => clearTimeout(repeat.current.timer);
  const start = (step: number) => {
    stop();
    onStep(step);
    const again = (delay: number) => {
      repeat.current.timer = setTimeout(() => {
        onStep(step);
        again(70);
      }, delay);
    };
    again(400);
  };
  useEffect(() => stop, []);
  const button = (step: number, label: string, glyph: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={() => start(step)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onStep(step);
      }}
      className="no-press flex h-9 w-9 items-center justify-center rounded-full text-[18px] font-medium hover:bg-[var(--control-fill-hover)]"
    >
      {glyph}
    </button>
  );
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="pop-in pointer-events-auto flex origin-top-right items-center gap-1 rounded-full border border-border glass-material p-1 shadow-[var(--shadow-float)]"
    >
      {/* A larger north turns the plan the other way round, anticlockwise. */}
      {button(1, "Plan 1° gegen den Uhrzeigersinn drehen", "↺")}
      <span className="min-w-[88px] text-center text-[13px] font-medium tabular-nums">Nord {value}°</span>
      {button(-1, "Plan 1° im Uhrzeigersinn drehen", "↻")}
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="no-press flex h-11 w-11 items-center justify-center text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

// A spot's card on the map: a dot on the place itself, and above it a
// label that opens out into the card's details.
//
// Pressing the title opens the card — or, given onTitlePress, does that
// instead (ticks the box beside it, say), and only the arrow opens it.
// adornment sits beside the title inside its button (that box); control
// after it, a control of its own (a switch). With no children there's
// nothing to open: no arrow, and the title alone does nothing.
export function MapCard({
  title,
  summary,
  open,
  onToggle,
  onTitlePress,
  adornment,
  control,
  children,
}: {
  title: string;
  // Shown after the title while closed: null reads "offen"; left out, nothing.
  summary?: string | null;
  open: boolean;
  onToggle: () => void;
  onTitlePress?: () => void;
  adornment?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  const openable = children != null && children !== false;
  const titleAction = onTitlePress ?? (openable ? onToggle : undefined);
  const titleContent = (
    <>
      <span className={cn("font-semibold", open ? "text-[17px]" : "text-[14px]")}>{title}</span>
      {!open && summary !== undefined && <span className="text-[14px] text-muted">{summary ?? "offen"}</span>}
      {adornment}
    </>
  );
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--surface),0_2px_6px_var(--shadow-ambient-strong)]"
      />
      <div className="absolute bottom-[7px] left-0 -translate-x-1/2">
        <div
          className={cn(
            "overflow-hidden border border-border glass-material shadow-[var(--shadow-float)] transition-[border-radius] duration-300",
            open ? "w-64 rounded-[var(--radius-lg)]" : "w-max rounded-full",
          )}
        >
          <div className={cn("flex items-center gap-2", open ? "px-4 pb-2 pt-3" : "px-3.5 py-2")}>
            {titleAction ? (
              <button
                type="button"
                onClick={titleAction}
                aria-expanded={onTitlePress ? undefined : open}
                className="no-press flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {titleContent}
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">{titleContent}</div>
            )}
            {control}
            {openable && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-label={open ? `${title} schließen` : `${title} öffnen`}
                // A bigger target than the arrowhead, without growing the pill.
                className="no-press -m-1.5 shrink-0 p-1.5 text-muted"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          {open && openable && <div className="pop-in origin-top px-4 pb-4">{children}</div>}
        </div>
        {/* A little stem from the card down to its dot. */}
        <span aria-hidden className="mx-auto block h-2 w-px bg-muted/60" />
      </div>
    </div>
  );
}
