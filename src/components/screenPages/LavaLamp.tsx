"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

// A lava lamp the size of the screen: warm blobs rising and falling through
// a dark ground, in the same burgundy-to-amber the clock's second hand
// comes from. Blobs that meet pull into one another and part again, which
// is the whole character of the thing.
//
// That merging is a blur followed by a hard push on alpha: blurring
// overlapping shapes makes their soft edges pool together, and multiplying
// the pooled alpha snaps the result back into one solid outline with a neck
// drawn between them. It pushes *alpha* rather than contrast — CSS's
// contrast() works on colour as well, and at the strength this needs it
// drove every shade of wax to the same primary red, so the filter here is
// an SVG one whose colour matrix leaves RGB alone. The blurred colour
// underneath is what keeps the shading inside each blob.
//
// The catch is that a filter re-rasterises its whole layer on every frame,
// and a full-screen one at 1080p is exactly what a Fire TV stick can't
// afford — so the blobs live on a layer a third of the screen's size where
// the filter is a ninth of the work, and that layer is scaled back up by
// the compositor. Nothing is lost by it: every edge here is soft by design,
// so there is no detail for the upscale to blur away.
//
// The motion itself is CSS animation on `transform` alone, so it runs on
// the compositor and the main thread does nothing at all once the page is
// up — no requestAnimationFrame to stutter when the player is busy
// decoding a video.

// How much smaller the filtered layer is than the screen. A third keeps the
// goo smooth while cutting the filter's cost to a ninth.
const STAGE = 1 / 3;
// How far apart two blobs still reach for each other, as a fraction of the
// filtered layer's short side — a fixed pixel blur would swallow the whole
// lamp whole at library-thumbnail size and barely show on a 4K screen.
// ALPHA_GAIN is how hard the pooled alpha is pushed back to solid, and
// ALPHA_BIAS where the cut falls: together they decide whether a meeting
// reads as a neck of wax or as two blobs merely touching.
const BLUR_RATIO = 0.046;
const ALPHA_GAIN = 19;
const ALPHA_BIAS = -8;
// The halo: the merged silhouette blurred again, tinted hot and laid back
// underneath the wax, so light appears to carry past the edge of a blob
// instead of stopping at it. Wider than the goo blur, and the filter region
// has to be opened up or it would be clipped at the layer's edge.
const HALO_RATIO = 0.13;
const HALO_STRENGTH = 1.15;

// The lamp's own vessel. Deliberately not the screen's black/white
// background setting: a lava lamp is a dark vessel, and a white one isn't
// one.
const GROUND = "#120208";
// The lamp itself, below the glass: a hot pool at the base and the cone it
// throws up through the vessel.
const GLOW = "radial-gradient(58% 30% at 50% 106%, rgba(255, 150, 70, 0.3) 0%, rgba(255, 120, 50, 0) 72%)";
const LAMP = "radial-gradient(42% 16% at 50% 100%, rgba(255, 226, 170, 0.85) 0%, rgba(255, 170, 80, 0.5) 38%, rgba(255, 120, 40, 0) 100%)";
// Screened over everything, so whatever sits low in the vessel — wax most
// of all — is lit hotter than what has risen away from the light.
const LIGHT_FALLOFF =
  "linear-gradient(to top, rgba(255, 176, 92, 0.3) 0%, rgba(255, 140, 60, 0.12) 24%, rgba(255, 120, 50, 0.03) 50%, rgba(255, 110, 50, 0) 72%)";
const VIGNETTE = "radial-gradient(118% 86% at 50% 48%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 0.72) 100%)";

type Blob = {
  // Across the screen, and how far up it starts, as fractions of the box.
  x: number;
  y: number;
  // Diameter, as a fraction of the screen's short side.
  size: number;
  // Which of the three drifts below it takes, and how long one go round
  // lasts. The delays are negative so every blob starts mid-flight: all of
  // them setting off together from the same pose would read as a pattern.
  motion: "rise" | "fall" | "swell";
  duration: number;
  delay: number;
  // How far it travels and sways, as fractions of the screen's height and
  // width, and its own colour.
  travel: number;
  sway: number;
  colour: readonly [string, string, string];
};

// Core, body, rim. A lit object is brightest where the light strikes it and
// darkest at its edges; a glowing one is the other way about — light pools
// in it and leaks out through the thin wax at the edge, so the rim comes
// back up rather than falling into shadow, and the whole range is narrow.
// A wide range with a dark rim is exactly what made these read as polished
// balls catching a lamp rather than as wax with light inside them.
const AMBER = ["#ffcb86", "#f8782a", "#ffa54c"] as const;
const EMBER = ["#ffb46a", "#e9591f", "#f98b36"] as const;
const DEEP = ["#ff9d55", "#cf3519", "#e4702c"] as const;

const BLOBS: Blob[] = [
  { x: 0.26, y: 0.74, size: 0.3, motion: "rise", duration: 54, delay: -3, travel: 0.74, sway: 0.09, colour: AMBER },
  { x: 0.62, y: 0.8, size: 0.4, motion: "rise", duration: 77, delay: -31, travel: 0.86, sway: -0.12, colour: EMBER },
  { x: 0.46, y: 0.5, size: 0.46, motion: "swell", duration: 63, delay: -17, travel: 0.34, sway: 0.07, colour: DEEP },
  { x: 0.12, y: 0.32, size: 0.22, motion: "fall", duration: 69, delay: -44, travel: 0.66, sway: 0.13, colour: EMBER },
  { x: 0.86, y: 0.28, size: 0.28, motion: "fall", duration: 88, delay: -12, travel: 0.78, sway: -0.08, colour: DEEP },
  { x: 0.4, y: 0.14, size: 0.17, motion: "fall", duration: 46, delay: -27, travel: 0.54, sway: 0.16, colour: AMBER },
  { x: 0.76, y: 0.54, size: 0.2, motion: "rise", duration: 59, delay: -39, travel: 0.62, sway: -0.15, colour: AMBER },
  { x: 0.08, y: 0.62, size: 0.15, motion: "rise", duration: 41, delay: -9, travel: 0.48, sway: 0.11, colour: AMBER },
  { x: 0.94, y: 0.68, size: 0.24, motion: "swell", duration: 72, delay: -52, travel: 0.4, sway: -0.1, colour: EMBER },
  { x: 0.58, y: 0.22, size: 0.13, motion: "fall", duration: 50, delay: -21, travel: 0.44, sway: -0.14, colour: AMBER },
];

// One keyframe set per kind of drift. They all start and end on the same
// pose so a loop never jumps, and only ever set `transform`.
const KEYFRAMES = `
@keyframes colo-lava-rise {
  0%, 100% { transform: translate3d(0, var(--lava-travel), 0) scale(0.84, 0.94); }
  26% { transform: translate3d(calc(var(--lava-sway) * 0.6), 0, 0) scale(0.9, 1.14); }
  48% { transform: translate3d(var(--lava-sway), calc(var(--lava-travel) * -1), 0) scale(1.16, 0.9); }
  74% { transform: translate3d(calc(var(--lava-sway) * 0.4), 0, 0) scale(0.96, 1.1); }
}
@keyframes colo-lava-fall {
  0%, 100% { transform: translate3d(0, calc(var(--lava-travel) * -1), 0) scale(1.12, 0.92); }
  30% { transform: translate3d(calc(var(--lava-sway) * 0.5), 0, 0) scale(0.94, 1.12); }
  52% { transform: translate3d(var(--lava-sway), var(--lava-travel), 0) scale(0.88, 1); }
  78% { transform: translate3d(calc(var(--lava-sway) * 0.3), 0, 0) scale(1, 1.08); }
}
@keyframes colo-lava-swell {
  0%, 100% { transform: translate3d(calc(var(--lava-sway) * -1), var(--lava-travel), 0) scale(1, 1.04); }
  50% { transform: translate3d(var(--lava-sway), calc(var(--lava-travel) * -1), 0) scale(1.22, 1.1); }
}`;

export function LavaLamp() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Scoped to this lamp: a library page draws several at once, and an SVG
  // filter is referenced by id.
  const gooId = `${useId()}-lava-goo`;
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measured rather than sized in container query units, for the same
  // reason the clock measures itself: a kiosk browser on a years-old stick
  // may not have them, and this has to look right in a 32px library
  // thumbnail as well as on a 4K screen.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function measure() {
      if (root) setSize({ width: root.clientWidth, height: root.clientHeight });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Everything inside the filtered layer is in its own smaller pixels.
  const stageWidth = size.width * STAGE;
  const stageHeight = size.height * STAGE;
  const short = Math.min(stageWidth, stageHeight);
  const blur = short * BLUR_RATIO;
  const halo = short * HALO_RATIO;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
      <style>{KEYFRAMES}</style>

      {/* The filter itself draws nothing; it only lends its id to the layer
          below. Blur, then a matrix that leaves R, G and B untouched and
          multiplies alpha — that pair is the merging. The rest is the
          halo: the merged shape blurred wide, pushed hot and amber by a
          second matrix, and laid back under the wax it came from. */}
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          <filter id={gooId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="pooled" />
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${ALPHA_GAIN} ${ALPHA_BIAS}`}
              result="wax"
            />
            <feGaussianBlur in="wax" stdDeviation={halo} result="spread" />
            <feColorMatrix
              in="spread"
              type="matrix"
              // Weighted towards red: an even warm lift took the halo
              // yellow-green, which read as a fluorescent tube rather than
              // as light through wax.
              values={`1.45 0.3 0 0 0  0.34 0.52 0 0 0  0.08 0.12 0.25 0 0  0 0 0 ${HALO_STRENGTH} 0`}
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="wax" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {short > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: stageWidth,
            height: stageHeight,
            filter: `url(#${gooId})`,
            transform: `scale(${1 / STAGE})`,
            transformOrigin: "0 0",
            // Keeps the scaled-up result a compositor job rather than a
            // re-render of the filter at full size.
            willChange: "transform",
          }}
        >
          {BLOBS.map((blob, i) => {
            const diameter = short * blob.size;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: stageWidth * blob.x - diameter / 2,
                  top: stageHeight * blob.y - diameter / 2,
                  width: diameter,
                  height: diameter,
                  borderRadius: "50%",
                  // Opaque to its own rim: the blur is what softens an
                  // edge here, and the alpha push is what hardens it again
                  // where two of them have pooled together. The pooled
                  // light sits low, where the bulb is, and the rim lifts
                  // back towards it. There is deliberately no highlight
                  // anywhere: a tight bright spot is a reflection, and one
                  // spot was enough to turn the whole thing glassy.
                  background: `radial-gradient(circle closest-side at 50% 68%, ${blob.colour[0]} 0%, ${blob.colour[1]} 62%, ${blob.colour[2]} 100%)`,
                  animation: `colo-lava-${blob.motion} ${blob.duration}s ease-in-out ${blob.delay}s infinite`,
                  willChange: "transform",
                  ["--lava-travel" as string]: `${stageHeight * blob.travel * 0.5}px`,
                  ["--lava-sway" as string]: `${stageWidth * blob.sway}px`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* The light itself, and what it does to everything above it. All of
          these sit outside the filtered layer, so none of them is dragged
          through the alpha push, and all are static: one paint each and
          nothing after that. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: GLOW }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: LIGHT_FALLOFF, mixBlendMode: "screen" }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: LAMP }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: VIGNETTE }} />
    </div>
  );
}
