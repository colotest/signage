"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";
import { startCompass } from "./compass";

export type FloorPlan = {
  src: string;
  // The drawing's own size, in its own units (the SVG's viewBox).
  width: number;
  height: number;
  // Which way true north lies on the drawing, in degrees clockwise from
  // its top edge. Turns the map to match the compass.
  northDeg: number;
};

// A place on the plan, as a fraction of its width (u) and height (v), and
// what to show there. Spots stay upright and the same size on screen
// however the map is turned or zoomed.
export type MapSpot = { id: string; u: number; v: number; node: ReactNode };

// Where the map is looking: a point p on the plan lands on screen at
// (x, y) + rotate(r) · s·p.
type View = { x: number; y: number; s: number; r: number };

// The plan is drawn by the browser from the SVG. While the map moves it's
// a picture being slid and scaled (smooth, but soft once zoomed in); once
// it comes to rest it's redrawn sharp at the new zoom, up to this wide —
// past that a redraw would cost more memory than an iPad likes to give.
const MAX_RASTER_PX = 5000;
const SETTLE_MS = 180;
const ZOOM_OUT_LIMIT = 0.6; // × the zoom that fits the whole plan
const ZOOM_IN_LIMIT = 14;
// Two fingers have to turn this far before a pinch starts turning the map
// too, so a plain pinch-to-zoom doesn't wobble it.
const ROTATE_THRESHOLD = (10 * Math.PI) / 180;
const TAP_SLOP_PX = 6;
const MAX_FLING = 2.5; // px per ms
const DOUBLE_TAP_MS = 300;

type Pointer = { x: number; y: number; t: number };

export function VenueMap({
  plan,
  spots,
  focus,
  onBackgroundTap,
  className,
}: {
  plan: FloorPlan;
  spots: MapSpot[];
  // Bump the nonce to bring a spot into view (and the id to pick which).
  focus: { id: string; nonce: number } | null;
  onBackgroundTap?: () => void;
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

  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  const headingRef = useRef<number | null>(null);
  const stopCompassRef = useRef<(() => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // Places the plan, the spots and the compass needle for the current view.
  function draw() {
    const v = viewRef.current;
    const planEl = planRef.current;
    if (!v || !planEl) return;
    planEl.style.transform = `translate(${v.x}px, ${v.y}px) rotate(${v.r}rad) scale(${v.s / rasterRef.current})`;
    for (const spot of spotsRef.current) {
      const el = spotRefs.current.get(spot.id);
      if (!el) continue;
      const p = toScreen(v, spot.u * plan.width, spot.v * plan.height);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
    if (needleRef.current) {
      needleRef.current.style.transform = `rotate(${v.r + (plan.northDeg * Math.PI) / 180}rad)`;
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
  // zoom it's at.
  function settle() {
    if (pointersRef.current.size > 0 || motionRef.current !== null || followingRef.current) {
      settleTimer.current = setTimeout(settle, SETTLE_MS);
      return;
    }
    const v = viewRef.current;
    const planEl = planRef.current;
    if (!v || !planEl) return;
    const rs = Math.min(v.s, MAX_RASTER_PX / plan.width);
    if (Math.abs(rs / rasterRef.current - 1) > 0.05) setRaster(rs);
    planEl.style.willChange = "auto";
    draw();
  }

  function commit(next: View) {
    viewRef.current = clampView(next);
    if (planRef.current) planRef.current.style.willChange = "transform";
    draw();
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, SETTLE_MS);
  }

  // Keeps at least part of the plan on screen: its middle can't be pushed
  // further out than about half its own size past an edge.
  function clampView(v: View): View {
    const { w, h } = sizeRef.current;
    const fit = fitRef.current;
    const s = Math.min(Math.max(v.s, fit * ZOOM_OUT_LIMIT), fit * ZOOM_IN_LIMIT);
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
    if (!raw) {
      const fit = fitRef.current;
      s = Math.min(Math.max(s, fit * ZOOM_OUT_LIMIT), fit * ZOOM_IN_LIMIT);
    }
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
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.width, plan.height]);

  // Wheel and trackpad: a two-finger swipe (or a mouse wheel) slides the
  // map, like scrolling a page; a trackpad pinch arrives as a wheel with
  // ctrlKey, and ⌘ or ctrl with a wheel zooms too, about the pointer. Desktop
  // Safari's trackpad pinch-and-turn comes as its own gesture events, which
  // also turn the map; iOS sends those too, alongside the touches already
  // handled below, so they're ignored while fingers are down.
  useEffect(() => {
    const el = containerRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      stopMotion();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      if (e.ctrlKey || e.metaKey) {
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
      if (da) {
        stopFollowing();
        next = rotateAbout(next, cx, cy, da);
      }
      last = { scale: g.scale, rotation: g.rotation };
      commit(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      stopMotion();
      clearTimeout(settleTimer.current);
      stopCompassRef.current?.();
    },
    [],
  );

  // Brings the focused spot into view: zoomed in a little if the map's out
  // at the whole plan, and a bit below the middle, so the card opening
  // above it has the room.
  useEffect(() => {
    if (!focus) return;
    const spot = spotsRef.current.find((s) => s.id === focus.id);
    const v = viewRef.current;
    if (!spot || !v) return;
    const { w, h } = sizeRef.current;
    const s = Math.min(Math.max(v.s, fitRef.current * 2.2), fitRef.current * ZOOM_IN_LIMIT);
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
      if (g.rotateMode) {
        const { w, h } = sizeRef.current;
        const a0 = Math.atan2(prev.y - h / 2, prev.x - w / 2);
        const a1 = Math.atan2(p.y - h / 2, p.x - w / 2);
        stopFollowing();
        commit(rotateAbout(v, w / 2, h / 2, a1 - a0));
      } else if (e.pointerType !== "mouse") {
        // A mouse or trackpad click-and-drag doesn't move the map — on a Mac
        // that's the two-finger swipe's job (the wheel handler above).
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
      if (g.rotating) {
        stopFollowing();
        next = rotateAbout(next, c1.x, c1.y, da);
      }
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
        onBackgroundTapRef.current?.();
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
      const target = (-(heading + plan.northDeg) * Math.PI) / 180;
      let da = (target - v.r) % (2 * Math.PI);
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 0.002) {
        const { w, h } = sizeRef.current;
        commit(rotateAbout(v, w / 2, h / 2, da * 0.18));
      }
    }
    requestAnimationFrame(followLoop);
  }

  function showNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600);
  }

  // The compass button: starts turning the map with the device, so what's
  // ahead on the plan is ahead in the room. Pressed again — or on a device
  // without a compass — it stands the plan back upright.
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
      <div ref={planRef} className="absolute left-0 top-0 origin-top-left" style={{ width: 0, height: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- an SVG drawn by the browser at whatever size the map needs, not a photo for next/image to resize */}
        <img
          src={plan.src}
          alt="Grundriss"
          draggable={false}
          decoding="async"
          // A cached plan can finish loading before React is listening, so
          // it's checked for on mount as well.
          ref={(img) => {
            if (img?.complete && img.naturalWidth) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          className={cn(
            "pointer-events-none block h-full w-full transition-opacity duration-500 dark:invert dark:hue-rotate-180",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {loaded &&
        spots.map((spot) => (
          <div
            key={spot.id}
            ref={(el) => {
              if (el) spotRefs.current.set(spot.id, el);
              else spotRefs.current.delete(spot.id);
              draw();
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
      </div>

      {notice && (
        <div
          role="status"
          className="pop-in pointer-events-none absolute right-3 top-[150px] z-20 origin-top-right rounded-full border border-border glass-material px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-float)]"
        >
          {notice}
        </div>
      )}
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
export function MapCard({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
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
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn(
              "no-press flex w-full items-center gap-2 text-left",
              open ? "px-4 pb-2 pt-3" : "px-3.5 py-2",
            )}
          >
            <span className={cn("font-semibold", open ? "text-[17px]" : "text-[14px]")}>{title}</span>
            {!open && <span className="text-[14px] text-muted">{summary ?? "offen"}</span>}
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className={cn("ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open && <div className="pop-in origin-top px-4 pb-4">{children}</div>}
        </div>
        {/* A little stem from the card down to its dot. */}
        <span aria-hidden className="mx-auto block h-2 w-px bg-muted/60" />
      </div>
    </div>
  );
}
