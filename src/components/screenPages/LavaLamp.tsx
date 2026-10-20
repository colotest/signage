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
//
// Except in Safari. WebKit can't run an SVG filter on the compositor, so it
// paints the filtered layer in software — and any child it has lifted onto
// the GPU (every blob, animating `transform` with will-change) is drawn on
// top of that afterwards, unfiltered: the blobs slid past one another
// without ever merging. (A backgrounded tab composites differently, which
// is why it looked right there.) So outside Chromium the same drifts are
// played through registered custom properties instead: the keyframes move
// --lava-x/y and --lava-sx/sy, a plain transform reads them, and with no
// transform animation and no will-change nothing gets its own layer — the
// blobs are painted with the rest, through the filter. It costs a repaint
// per frame, which only matters on the Fire TV sticks, and those are
// Chromium.

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
// One soft copy of the merged silhouette, read three ways: as the wax's own
// thickness, as the band of thin wax around its edge, and as the halo
// beyond it. Blurring the merged alpha gives a field that stands at full
// height deep inside the mass, passes through half at the edge and falls
// away outside — near enough a measure of how much wax the light has to
// cross at each point, and the only thing any of the shading below needs.
//
// It costs one blur. Lighting the same field properly (feDiffuseLighting
// with a point light under the vessel) was the obvious way to do this and
// is what the previous version did: it cost a second blur and much the
// most expensive primitive in the filter, dropped the frame rate on the
// sticks, and looked no more like wax for it.
// How wide the depth field's gradient is, and so how broad the lit rim
// reads: too wide and a blob is all rim, a pale ring round a dark middle.
const RELIEF_RATIO = 0.05;
// Thick wax swallows light, so the middle of a mass goes deeper than its
// flat fill. Blue falls fastest, which keeps the shadow warm.
const DENSITY = [0.3, 0.36, 0.44] as const;
// Thin wax at the rim lets it through. The table is read across the depth
// field: nothing outside the shape, a peak where the wax is thin, and down
// to nothing again deep inside. This is the bevel, and taking it off the
// merged shape rather than off each blob is what carries it unbroken
// across a join.
// Read across the depth field from outside the shape (0) to deep within
// it (1): nothing beyond the edge, a peak just inside it where the wax is
// thin, and gone again before the middle.
const RIM_BAND = "0 0 0.3 0.85 1 0.35 0";
const RIM_COLOUR = "#ffbb6e";
const RIM_STRENGTH = 0.5;
// The halo beyond the edge, tinted hot and laid back underneath the wax, so
// light appears to carry past a blob instead of stopping at it. The filter
// region has to be opened up or it would be clipped at the layer's edge.
const HALO_STRENGTH = 0.32;

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
  colour: string;
};

// One flat colour each, and the lighting pass does the rest. Flat is what
// lets two of them become one: the merging blur mixes colour as well as
// alpha, so where blobs meet their fills run together smoothly and the
// result is a single body of wax in a colour between the two. A gradient
// fill survives that blur — its core is too big a feature to be smeared
// away — and stays legible as its own disc inside the merged outline, which
// is what made overlaps read as passing rather than joining.
//
// Brighter than the old core colours, since the lighting below can only
// take them down from here.
const AMBER = "#f5712a" as const;
const EMBER = "#e3561f" as const;
const DEEP = "#c43a1b" as const;

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

// The three drifts, each as poses at points through one go round: where
// the blob is, as multiples of its own sway (x) and travel (y), and how it's
// stretched. They all start and end on the same pose so a loop never jumps.
type Pose = { at: string; x: number; y: number; sx: number; sy: number };
const DRIFTS: Record<Blob["motion"], Pose[]> = {
  rise: [
    { at: "0%, 100%", x: 0, y: 1, sx: 0.84, sy: 0.94 },
    { at: "26%", x: 0.6, y: 0, sx: 0.9, sy: 1.14 },
    { at: "48%", x: 1, y: -1, sx: 1.16, sy: 0.9 },
    { at: "74%", x: 0.4, y: 0, sx: 0.96, sy: 1.1 },
  ],
  fall: [
    { at: "0%, 100%", x: 0, y: -1, sx: 1.12, sy: 0.92 },
    { at: "30%", x: 0.5, y: 0, sx: 0.94, sy: 1.12 },
    { at: "52%", x: 1, y: 1, sx: 0.88, sy: 1 },
    { at: "78%", x: 0.3, y: 0, sx: 1, sy: 1.08 },
  ],
  swell: [
    { at: "0%, 100%", x: -1, y: 1, sx: 1, sy: 1.04 },
    { at: "50%", x: 1, y: -1, sx: 1.22, sy: 1.1 },
  ],
};

const offset = (multiple: number, unit: string) => (multiple === 0 ? "0px" : `calc(var(${unit}) * ${multiple})`);

// The compositor's version: the poses as transform keyframes.
const COMPOSITED_KEYFRAMES = Object.entries(DRIFTS)
  .map(
    ([name, poses]) =>
      `@keyframes colo-lava-${name} {\n${poses
        .map(
          (p) =>
            `  ${p.at} { transform: translate3d(${offset(p.x, "--lava-sway")}, ${offset(p.y, "--lava-travel")}, 0) scale(${p.sx}, ${p.sy}); }`,
        )
        .join("\n")}\n}`,
  )
  .join("\n");

// The painted version (see the top of this file): the same poses as
// registered custom properties, which a static transform on each blob reads.
const PAINTED_KEYFRAMES = [
  `@property --lava-x { syntax: "<length>"; inherits: false; initial-value: 0px; }`,
  `@property --lava-y { syntax: "<length>"; inherits: false; initial-value: 0px; }`,
  `@property --lava-sx { syntax: "<number>"; inherits: false; initial-value: 1; }`,
  `@property --lava-sy { syntax: "<number>"; inherits: false; initial-value: 1; }`,
  ...Object.entries(DRIFTS).map(
    ([name, poses]) =>
      `@keyframes colo-lava-${name}-painted {\n${poses
        .map(
          (p) =>
            `  ${p.at} { --lava-x: ${offset(p.x, "--lava-sway")}; --lava-y: ${offset(p.y, "--lava-travel")}; --lava-sx: ${p.sx}; --lava-sy: ${p.sy}; }`,
        )
        .join("\n")}\n}`,
  ),
].join("\n");

// Chromium — the Fire TV sticks' WebView among it — applies an SVG filter
// to composited children; WebKit doesn't (see the top of this file).
// Firefox isn't known either way, so it takes the painted path too, which
// is correct everywhere.
function compositesFilteredChildren() {
  return /Chrome\/|Chromium\//.test(navigator.userAgent);
}

export function LavaLamp() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Scoped to this lamp: a library page draws several at once, and an SVG
  // filter is referenced by id.
  const gooId = `${useId()}-lava-goo`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Decided alongside the first measurement: nothing animates until then,
  // so the server render (which can't know the browser) never has to match.
  const [composited, setComposited] = useState(true);

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
    setComposited(compositesFilteredChildren());
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
  const relief = short * RELIEF_RATIO;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
      <style>{composited ? COMPOSITED_KEYFRAMES : PAINTED_KEYFRAMES}</style>

      {/* The filter itself draws nothing; it only lends its id to the layer
          below. Blur, then a matrix that leaves R, G and B untouched and
          multiplies alpha — that pair is the merging. One more blur gives
          the depth field, and everything after it is per-pixel arithmetic
          reading that field: the body's density, the lit rim, the halo. */}
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          {/* Opened up just enough for the halo to spread into: the region is
                filtered in full, so every percent of it is work. */}
          <filter id={gooId} x="-14%" y="-14%" width="128%" height="128%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="pooled" />
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${ALPHA_GAIN} ${ALPHA_BIAS}`}
              result="wax"
            />
            {/* How much wax the light has to cross, everywhere at once. */}
            <feGaussianBlur in="wax" stdDeviation={relief} result="depth" />

            {/* Deep wax, darker. The matrix turns that depth into a
                multiplier — 1 where there is no wax, down to 1 - DENSITY
                where it is thickest — and multiplying it into the wax in
                premultiplied space shades and clips in the one step. */}
            <feColorMatrix
              in="depth"
              type="matrix"
              values={`0 0 0 ${-DENSITY[0]} 1  0 0 0 ${-DENSITY[1]} 1  0 0 0 ${-DENSITY[2]} 1  0 0 0 0 1`}
              result="density"
            />
            <feComposite in="density" in2="wax" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="dense" />

            {/* Thin wax at the rim, lit. The band is a slice of the same
                depth field, flooded amber and screened back over the
                body — the bevel, running unbroken around whatever shape
                the blobs have made between them. */}
            <feComponentTransfer in="depth" result="band">
              <feFuncA type="table" tableValues={RIM_BAND} />
            </feComponentTransfer>
            <feFlood floodColor={RIM_COLOUR} floodOpacity={RIM_STRENGTH} result="rimColour" />
            <feComposite in="rimColour" in2="band" operator="in" result="rim" />
            <feBlend in="rim" in2="dense" mode="screen" result="lifted" />
            <feComposite in="lifted" in2="wax" operator="in" result="shaded" />

            <feColorMatrix
              in="depth"
              type="matrix"
              // Weighted towards red: an even warm lift took the halo
              // yellow-green, which read as a fluorescent tube rather than
              // as light through wax.
              values={`1.45 0.3 0 0 0  0.34 0.52 0 0 0  0.08 0.12 0.25 0 0  0 0 0 ${HALO_STRENGTH} 0`}
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="shaded" />
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
            // re-render of the filter at full size — where the browser can
            // still filter what's inside it (see the top of this file).
            willChange: composited ? "transform" : undefined,
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
                  // Flat, and opaque to its own rim: the blur is what
                  // softens an edge here, the alpha push is what hardens it
                  // again where two have pooled together, and the lighting
                  // pass is what gives the result its roundness.
                  background: blob.colour,
                  ...(composited
                    ? {
                        animation: `colo-lava-${blob.motion} ${blob.duration}s ease-in-out ${blob.delay}s infinite`,
                        willChange: "transform",
                      }
                    : {
                        animation: `colo-lava-${blob.motion}-painted ${blob.duration}s ease-in-out ${blob.delay}s infinite`,
                        transform: "translate(var(--lava-x), var(--lava-y)) scale(var(--lava-sx), var(--lava-sy))",
                      }),
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
