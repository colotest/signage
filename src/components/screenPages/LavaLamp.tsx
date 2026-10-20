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

// How much smaller the filtered layer is than the screen. The filter runs
// over every pixel of it on every frame, so this is the biggest single
// lever on cost. It is not, as it turns out, much of a lever on how soft
// the edges look: nearly all of that was the alpha cut spreading an edge
// over several of this layer's own pixels, which ALPHA_GAIN now fixes at
// about one. What the upscale adds on top is a pixel or two.
const STAGE = 1 / 4;
// How far apart two blobs still reach for each other, as a fraction of the
// filtered layer's short side — a fixed pixel blur would swallow the whole
// lamp whole at library-thumbnail size and barely show on a 4K screen.
// ALPHA_GAIN is how hard the pooled alpha is pushed back to solid, and
// ALPHA_BIAS where the cut falls: together they decide whether a meeting
// reads as a neck of wax or as two blobs merely touching.
const BLUR_RATIO = 0.05;
// Each blob is drawn at BLOB_ALPHA and added to the ones under it rather
// than covering them, so the pooled field is a sum: one blob stands at
// BLOB_ALPHA, two on top of each other at twice that. Cutting that sum at
// a level below a single blob's own height is what makes a merge grow —
// where two have run together the field is far above the cut, so the edge
// is pushed out well past the union of the two outlines, and the mass that
// results is nearer the sum of them. Opaque blobs can only ever make a
// union, which is always less wax than went into it.
const BLOB_ALPHA = 0.5;
// The cut is ALPHA_BIAS / ALPHA_GAIN of the way up the field — a quarter,
// which is half of one blob's own height, and what makes a merge grow.
// The gain itself only decides how many pixels the edge takes to go from
// nothing to solid: the higher it is, the harder the edge. Soft edges were
// reading as fog rather than as wax.
const ALPHA_GAIN = 34;
const ALPHA_BIAS = -8.5;
// All of the shading reads off the pooled field — the blurred sum of the
// blobs, before it is cut into a silhouette. It already stands high where
// the wax is thick, passes through the cut at the edge and falls away
// outside, which is everything a depth map needs to be; blurring the cut
// silhouette a second time to get one was work for nothing, and a blur is
// far and away the most expensive thing in this filter. There is one left.
//
// How far the field is lifted to find the underside. The rim light is the
// difference between the field and a copy of it shifted down: positive
// where a surface faces down, negative where it faces up, so clamping at
// zero leaves light on the undersides alone — which is where the bulb is.
const LIFT_RATIO = 0.03;
// Thick wax swallows light, so the middle of a mass goes deeper than its
// flat fill — and deeper again where two blobs have run together, which is
// where the field stands highest. Blue falls fastest, keeping it warm.
const DENSITY = [0.62, 0.74, 0.88] as const;
// The lit underside, as a colour and how hard it is carried. Taking it off
// the merged shape rather than off each blob is what carries the bevel
// unbroken across a join.
const RIM_COLOUR = [1, 0.86, 0.55] as const;
const RIM_STRENGTH = 1.25;
// The glow beyond the wax's edge, off the same pooled field. The filter
// region has to leave it room to spread into.
const HALO_STRENGTH = 0.55;

// The lamp's own vessel. Deliberately not the screen's black/white
// background setting: a lava lamp is a dark vessel, and a white one isn't
// one.
const GROUND = "#17031a";
// Every blob is this one colour, flat — which is also what lets two of them
// become one, since the merging blur mixes colour as well as alpha and
// there is nothing left to mix. What varies is not the wax but the light
// reaching it: the ramp below multiplies over the whole vessel, so a blob
// is at full strength down by the bulb and sinks towards the vessel's own
// dark as it climbs away from it. One blob crossing the screen passes
// through the entire range on its own.
const WAX = "#ff6a12";
const HEIGHT_RAMP =
  "linear-gradient(to top, rgba(255, 255, 255, 1) 0%, rgba(255, 216, 190, 1) 18%, rgba(216, 134, 124, 1) 44%, rgba(148, 66, 94, 1) 72%, rgba(104, 40, 78, 1) 100%)";
// The lamp itself, below the glass: a hot pool at the base and the cone it
// throws up through the vessel.
// Carries the glow the filter used to spread around each blob: a halo in
// there cost a colour matrix and a merge on every frame, and this is a
// static paint that costs one.
const GLOW = "radial-gradient(70% 44% at 50% 104%, rgba(255, 94, 120, 0.4) 0%, rgba(255, 60, 120, 0.12) 46%, rgba(220, 40, 140, 0) 78%)";
const LAMP = "radial-gradient(44% 17% at 50% 100%, rgba(255, 244, 214, 0.92) 0%, rgba(255, 170, 90, 0.55) 36%, rgba(255, 70, 120, 0) 100%)";
// Screened over everything, so whatever sits low in the vessel — wax most
// of all — is lit hotter than what has risen away from the light.
const LIGHT_FALLOFF =
  "linear-gradient(to top, rgba(255, 170, 90, 0.34) 0%, rgba(255, 110, 90, 0.14) 24%, rgba(230, 70, 140, 0.04) 50%, rgba(200, 60, 160, 0) 72%)";
const VIGNETTE = "radial-gradient(118% 86% at 50% 48%, rgba(0, 0, 0, 0) 52%, rgba(6, 0, 10, 0.74) 100%)";

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
  // width.
  travel: number;
  sway: number;
};


const BLOBS: Blob[] = [
  { x: 0.26, y: 0.74, size: 0.3, motion: "rise", duration: 94, delay: -3, travel: 0.74, sway: 0.09 },
  { x: 0.62, y: 0.8, size: 0.4, motion: "rise", duration: 135, delay: -31, travel: 0.86, sway: -0.12 },
  { x: 0.46, y: 0.5, size: 0.46, motion: "swell", duration: 110, delay: -17, travel: 0.34, sway: 0.07 },
  { x: 0.12, y: 0.32, size: 0.22, motion: "fall", duration: 121, delay: -44, travel: 0.66, sway: 0.13 },
  { x: 0.86, y: 0.28, size: 0.28, motion: "fall", duration: 154, delay: -12, travel: 0.78, sway: -0.08 },
  { x: 0.4, y: 0.14, size: 0.17, motion: "fall", duration: 80, delay: -27, travel: 0.54, sway: 0.16 },
  { x: 0.76, y: 0.54, size: 0.2, motion: "rise", duration: 103, delay: -39, travel: 0.62, sway: -0.15 },
  { x: 0.08, y: 0.62, size: 0.15, motion: "rise", duration: 72, delay: -9, travel: 0.48, sway: 0.11 },
  { x: 0.94, y: 0.68, size: 0.24, motion: "swell", duration: 126, delay: -52, travel: 0.4, sway: -0.1 },
  { x: 0.58, y: 0.22, size: 0.13, motion: "fall", duration: 88, delay: -21, travel: 0.44, sway: -0.14 },
];

// Slow. A lava lamp takes minutes to turn itself over, and at a frame rate
// the sticks can only just hold, slow movement is also what keeps the
// motion reading as smooth — the same dropped frame is invisible under a
// blob creeping across a screen and obvious under one hurrying. The squash
// at each end of a travel is gentle for the same reason it is slow: wax is
// solid enough to keep its shape, and a blob that stretches far reads as
// syrup.
//
// The three drifts, each as poses at points through one go round: where
// the blob is, as multiples of its own sway (x) and travel (y), and how it's
// stretched. They all start and end on the same pose so a loop never jumps.
type Pose = { at: string; x: number; y: number; sx: number; sy: number };
const DRIFTS: Record<Blob["motion"], Pose[]> = {
  rise: [
    { at: "0%, 100%", x: 0, y: 1, sx: 0.912, sy: 0.967 },
    { at: "26%", x: 0.6, y: 0, sx: 0.945, sy: 1.077 },
    { at: "48%", x: 1, y: -1, sx: 1.088, sy: 0.945 },
    { at: "74%", x: 0.4, y: 0, sx: 0.978, sy: 1.055 },
  ],
  fall: [
    { at: "0%, 100%", x: 0, y: -1, sx: 1.066, sy: 0.956 },
    { at: "30%", x: 0.5, y: 0, sx: 0.967, sy: 1.066 },
    { at: "52%", x: 1, y: 1, sx: 0.934, sy: 1.0 },
    { at: "78%", x: 0.3, y: 0, sx: 1.0, sy: 1.044 },
  ],
  swell: [
    { at: "0%, 100%", x: -1, y: 1, sx: 1.0, sy: 1.022 },
    { at: "50%", x: 1, y: -1, sx: 1.121, sy: 1.055 },
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
  const lift = short * LIFT_RATIO;

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
      <style>{composited ? COMPOSITED_KEYFRAMES : PAINTED_KEYFRAMES}</style>

      {/* The filter itself draws nothing; it only lends its id to the layer
          below. One blur gives the pooled field; a matrix that leaves R, G
          and B untouched and multiplies alpha cuts it into the wax. Every
          pass after that is per-pixel arithmetic reading the same pooled
          field — the body's density, the lit underside — and costs a
          fraction of what another blur would. */}
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          {/* Opened up just enough for the glow to spread into: the region
              is filtered in full, so every percent of it is work on every
              frame. */}
          <filter id={gooId} x="-9%" y="-9%" width="118%" height="118%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="pooled" />
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${ALPHA_GAIN} ${ALPHA_BIAS}`}
              result="wax"
            />
            {/* Deep wax, darker. The matrix turns the pooled field into a
                multiplier — 1 where there is no wax, down to 1 - DENSITY
                where it stands highest — and multiplying it into the wax in
                premultiplied space shades and clips in the one step. */}
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`0 0 0 ${-DENSITY[0]} 1  0 0 0 ${-DENSITY[1]} 1  0 0 0 ${-DENSITY[2]} 1  0 0 0 0 1`}
              result="density"
            />
            <feComposite in="density" in2="wax" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="dense" />

            {/* The lit underside. Lifting the depth field and subtracting
                the original leaves a positive difference only where the
                surface faces down — the far side gives a negative one,
                which clamps away to nothing — so the light lands on the
                undersides of the wax and nowhere else, which is where the
                bulb is. One shift and one subtraction, both cheap, and no
                lighting primitive. */}
            {/* Shifted down, so what was interior now sits over the lower
                edge: the difference comes out positive along the bottom of
                the wax and negative along the top, where it clamps away. */}
            <feOffset in="pooled" dx="0" dy={lift} result="lowered" />
            <feComposite in="lowered" in2="pooled" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="underside" />
            {/* Flat amber at the strength of that difference: constant
                colour out of a slope of nought, alpha straight off the
                difference, screened onto the body in premultiplied space,
                which is one pass rather than a blend. */}
            <feComponentTransfer in="underside" result="rim">
              <feFuncR type="linear" slope="0" intercept={RIM_COLOUR[0]} />
              <feFuncG type="linear" slope="0" intercept={RIM_COLOUR[1]} />
              <feFuncB type="linear" slope="0" intercept={RIM_COLOUR[2]} />
              <feFuncA type="linear" slope={RIM_STRENGTH} intercept="0" />
            </feComponentTransfer>
            {/* The pooled field reaches past the wax, so the difference
                does too; without this the light spills off every blob as a
                bright band of its own, outside the shape. */}
            <feComposite in="rim" in2="wax" operator="in" result="litEdge" />
            <feComposite in="litEdge" in2="dense" operator="arithmetic" k1="-1" k2="1" k3="1" k4="0" result="shaded" />

            {/* The glow around each mass, laid back underneath it. The
                pooled field already reaches past the wax — that is what
                merging uses — so this is a tint and a merge, with no blur
                of its own. It used to cost one, which is why it went. */}
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`1.5 0.2 0 0 0  0.4 0.42 0 0 0  0.3 0.1 0.4 0 0  0 0 0 ${HALO_STRENGTH} 0`}
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
                  // Flat, and added to whatever is under it rather than
                  // covering it (see BLOB_ALPHA): two blobs crossing make a
                  // field twice as high, which is what lets the merged mass
                  // come out bigger than the union of the two.
                  background: WAX,
                  opacity: BLOB_ALPHA,
                  mixBlendMode: "plus-lighter",
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

      {/* The one colour the wax is, graded by where it has got to in the
          vessel: multiplied over everything under it, so a blob reads at
          full strength by the bulb and sinks into the vessel's dark as it
          rises. Over the ground, which is nearly black already, it barely
          registers. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: HEIGHT_RAMP, mixBlendMode: "multiply" }}
      />

      {/* The light itself, and what it does to everything above it. All of
          these sit outside the filtered layer, so none of them is dragged
          through the alpha push, and all are static: one paint each and
          nothing after that. The ramp above cannot touch them — they are
          the lamp, not the wax. */}
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
