"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { brandFont } from "@/lib/fonts";
import { COLOSSEUM_WORDMARK, HOUR_ARM, HOUR_MARKINGS, MINUTE_ARM, TEN_MIN_MARKINGS, type ArmArt } from "./clockArt";

// The whole screen is the watch face: the dial's markings are a rectangular
// border sitting at 90% of the screen, and everything else is measured
// against it. Laid out from a measured pixel size rather than container
// query units, both because the dial's proportions decide the layout (a
// landscape screen turns the markings a quarter-turn — see clockArt.ts) and
// because a kiosk browser on old hardware can be years behind on CSS.

// How much of the screen the dial's markings span.
const DIAL_SCALE = 0.95;
// The hands are drawn at the markings' own scale, which is what the
// artwork was designed around: the minute hand's tip then lands just past
// the middle of the hour marks at 3 and 9 o'clock. These are in the same
// units, measured out from the centre.
const SECOND_REACH = MINUTE_ARM.pivotY;
const SECOND_TAIL = SECOND_REACH * 0.14;
const SECOND_WIDTH = 40;
const HINGE_DOT = 55;
// Where each wordmark's centre sits, measured down the screen. A landscape
// screen is short, so both pull in towards the middle to stay clear of the
// marks at 12 and 6.
const COLO_FROM_TOP = { portrait: 0.2, landscape: 0.3 };
const CALLIGRAPHY_FROM_TOP = { portrait: 0.8, landscape: 0.7 };
// How hard each layer reads against the background. The hands stay at full
// strength; everything printed on the dial sits back behind them.
const MARKING_OPACITY = { hour: 0.27, tenMinute: 0.27 };
const WORDMARK_OPACITY = 0.27;
// A deep burgundy, the one touch of colour on the face.
const BURGUNDY = "#800020";

export function ClockFace({ now = Date.now }: { now?: () => number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function measure() {
      if (root) setSize({ width: root.clientWidth, height: root.clientHeight });
    }
    measure();
    // A screen's box changes on rotation and on a kiosk browser's own
    // window resize, and a library thumbnail is laid out after mount.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      {/* Its own layer, so a background image can take its place later
          without touching anything the face is built out of. */}
      <div className="absolute inset-0 bg-black" />
      {size.width > 0 && size.height > 0 && <Face width={size.width} height={size.height} now={now} />}
    </div>
  );
}

function Face({ width, height, now }: { width: number; height: number; now: () => number }) {
  // On a landscape screen the markings are turned a quarter-turn, so the
  // artwork is laid out against the screen's dimensions swapped back round.
  const landscape = width > height;
  const orientation = landscape ? "landscape" : "portrait";
  const frameWidth = landscape ? height : width;
  const frameHeight = landscape ? width : height;

  // Pixels per unit of the markings artwork: the dial keeps its own
  // proportions and takes up DIAL_SCALE of the screen.
  const scale = Math.min(
    (DIAL_SCALE * frameWidth) / HOUR_MARKINGS.width,
    (DIAL_SCALE * frameHeight) / HOUR_MARKINGS.height,
  );
  const dialWidth = HOUR_MARKINGS.width * scale;
  const dialHeight = HOUR_MARKINGS.height * scale;
  // The dial's short side, whichever way round it's turned — every element
  // on the face is sized off this, so the face looks the same either way.
  const shortSide = dialWidth;

  return (
    <>
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: dialWidth,
          height: dialHeight,
          transform: `translate(-50%, -50%) rotate(${landscape ? 90 : 0}deg)`,
        }}
      >
        <Markings art={HOUR_MARKINGS} opacity={MARKING_OPACITY.hour} />
        <Markings art={TEN_MIN_MARKINGS} opacity={MARKING_OPACITY.tenMinute} />
      </div>

      {/* Both wordmarks sit inside the dial and stay upright whichever way
          the markings are turned, printed under the hands like a watch's.
          Each is centred on its own line down the screen; their sizes go by
          the dial's short side, so they look the same either way round. */}
      <div
        className={`${brandFont.className} absolute left-1/2 uppercase leading-none tracking-tight text-white`}
        style={{
          top: height * COLO_FROM_TOP[orientation],
          transform: "translate(-50%, -50%)",
          fontSize: shortSide * 0.225,
          opacity: WORDMARK_OPACITY,
        }}
      >
        Colo
      </div>
      <svg
        className="absolute left-1/2"
        style={{
          top: height * CALLIGRAPHY_FROM_TOP[orientation],
          transform: "translate(-50%, -50%)",
          width: shortSide * 0.5,
          opacity: WORDMARK_OPACITY,
        }}
        viewBox={`0 0 ${COLOSSEUM_WORDMARK.width} ${COLOSSEUM_WORDMARK.height}`}
        aria-hidden
      >
        <path d={COLOSSEUM_WORDMARK.d} fill="#fff" />
      </svg>

      <Hands width={width} height={height} scale={scale} now={now} />
    </>
  );
}

function Markings({ art, opacity }: { art: { width: number; height: number; d: string }; opacity?: number }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${art.width} ${art.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={art.d} fill="#fff" opacity={opacity} />
    </svg>
  );
}

function Hands({
  width,
  height,
  scale,
  now,
}: {
  width: number;
  height: number;
  scale: number;
  now: () => number;
}) {
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);
  const handsRef = useRef<SVGGElement>(null);

  // Rotated straight on the DOM every frame rather than through React
  // state — a re-render per frame for three transforms would be pure
  // overhead on a set-top box. They stay hidden until the first frame has
  // placed them, so a server-rendered 12 o'clock never flashes up.
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let frame = 0;
    // Only the second hand really moves every frame. Repainting the other
    // two costs a re-raster of a detailed path for a fraction of a degree
    // nobody can see, so they're left alone until they've actually turned
    // far enough to land on a different pixel.
    let lastHour: number | null = null;
    let lastMinute: number | null = null;
    function tick() {
      const t = new Date(nowRef.current());
      const s = t.getSeconds() + t.getMilliseconds() / 1000;
      const m = t.getMinutes() + s / 60;
      const h = (t.getHours() % 12) + m / 60;
      if (lastHour === null || Math.abs(h * 30 - lastHour) > 0.02) {
        lastHour = h * 30;
        hourRef.current?.setAttribute("transform", `rotate(${lastHour})`);
      }
      if (lastMinute === null || Math.abs(m * 6 - lastMinute) > 0.02) {
        lastMinute = m * 6;
        minuteRef.current?.setAttribute("transform", `rotate(${lastMinute})`);
      }
      secondRef.current?.setAttribute("transform", `rotate(${s * 6})`);
      if (handsRef.current) handsRef.current.style.opacity = "1";
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const secondWidth = Math.max(SECOND_WIDTH * scale, 1);

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-label="Clock" role="img">
      <g transform={`translate(${width / 2}, ${height / 2})`}>
        <g ref={handsRef} style={{ opacity: 0 }}>
          <g ref={hourRef}>
            <Arm art={HOUR_ARM} scale={scale} />
          </g>
          <g ref={minuteRef}>
            <Arm art={MINUTE_ARM} scale={scale} />
          </g>
          {/* Plain line, round-capped, no bulge of its own — just the
              little hinge dot it's mounted on over the other two. */}
          <g ref={secondRef}>
            <line
              x1={0}
              y1={SECOND_TAIL * scale}
              x2={0}
              y2={-SECOND_REACH * scale}
              stroke={BURGUNDY}
              strokeWidth={secondWidth}
              strokeLinecap="round"
            />
          </g>
          <circle r={Math.max(HINGE_DOT * scale, 1.5)} fill={BURGUNDY} />
        </g>
      </g>
    </svg>
  );
}

// Drawn pointing at 12, turned about its own hinge, which sits on the
// centre of the face.
function Arm({ art, scale }: { art: ArmArt; scale: number }) {
  return (
    <g transform={`scale(${scale}) translate(${-art.pivotX}, ${-art.pivotY})`}>
      <path d={art.d} fill="#fff" />
    </g>
  );
}
