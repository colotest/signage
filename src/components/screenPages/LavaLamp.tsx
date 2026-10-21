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
const STAGE = 1 / 10;
// How far apart two blobs still reach for each other, as a fraction of the
// filtered layer's short side — a fixed pixel blur would swallow the whole
// lamp whole at library-thumbnail size and barely show on a 4K screen.
// ALPHA_GAIN is how hard the pooled alpha is pushed back to solid, and
// ALPHA_BIAS where the cut falls: together they decide whether a meeting
// reads as a neck of wax or as two blobs merely touching.
const BLUR_RATIO = 0.062;
// Each blob is drawn at BLOB_ALPHA and added to the ones under it rather
// than covering them, so the pooled field is a sum: one blob stands at
// BLOB_ALPHA, two on top of each other at twice that. Cutting that sum at
// a level below a single blob's own height is what makes a merge grow —
// where two have run together the field is far above the cut, so the edge
// is pushed out well past the union of the two outlines, and the mass that
// results is nearer the sum of them. Opaque blobs can only ever make a
// union, which is always less wax than went into it.
const BLOB_ALPHA = 1;
// The cut is ALPHA_BIAS / ALPHA_GAIN of the way up the field — a quarter,
// which is half of one blob's own height, and what makes a merge grow.
// The gain itself only decides how many pixels the edge takes to go from
// nothing to solid: the higher it is, the harder the edge. Soft edges were
// reading as fog rather than as wax.
const ALPHA_GAIN = 60;
const ALPHA_BIAS = -15;
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
// Narrow, now that the light on it is strong: a wide band at this strength
// is a blob dipped in wax, where a narrow one is a sheen on it.
const LIFT_RATIO = 0.079;
// Thick wax swallows light, so the middle of a mass goes deeper than its
// flat fill — and deeper again where two blobs have run together, which is
// where the field stands highest. Blue falls fastest, keeping it warm.
const DENSITY = [0.81, 0.96, 1] as const;
// The lit underside, as a colour and how hard it is carried. Taking it off
// the merged shape rather than off each blob is what carries the bevel
// unbroken across a join.
const RIM_COLOUR = [1, 0.93, 0.78] as const;
const RIM_STRENGTH = 0.2;
// Gloss is light concentrated, not merely more of it. Curving the band
// rather than scaling it flat pushes the weak tail — the part that spreads
// a highlight into a wash — down towards nothing, while the peak right at
// the edge keeps the lot. Above 1 it sharpens; at 1 it is the plain slope
// this used to be.
const RIM_FOCUS = 1.05;
// A second light, over the vessel, at half the strength of the bulb under
// it. It needs no shift of its own: the same two images that give the
// underside give the top edge with the operands the other way round, so
// this costs two sums and nothing else.
const TOP_LIGHT = 0.15;
// Translucence: the light that gets into the wax near its edge, where there
// is least of it to cross, and the glow it throws just beyond. Both come
// off one band read across the pooled field, straddling the cut — strongest
// just inside the edge, falling away outside it, and nearly nothing by the
// middle of a blob, where the wax is too thick to pass light at all.
//
// Read from no wax (0) to deep inside (1); the cut where the edge lands
// sits at a quarter. Screened over the finished wax rather than merged
// under it, which is what lets one band do both sides: outside the shape it
// falls on the background as a halo, inside it lights the body.
//
// Pinned tightly either side of the cut, and all but gone by a third.
// Spread any wider and it lights more than an edge: a neck between two
// blobs that have just met stands at about a third of the field for its
// whole width, so a band still strong there lights the entire join and the
// merge reads brighter than either blob — which is not what thin wax does.
const HALO_BAND = [0, 0.14, 0.82, 0.86, 0.1, 0, 0, 0, 0, 0, 0];
const HALO_COLOUR = [1, 0.45, 0.2] as const;
const HALO_STRENGTH = 0.16;


// The lamp's own vessel. Deliberately not the screen's black/white
// background setting: a lava lamp is a dark vessel, and a white one isn't
// one.
const GROUND = "#17031a";
// Every blob is this one colour, flat — which is also what lets two of them
// become one, since the merging blur mixes colour as well as alpha and
// there is nothing left to mix. What varies is not the wax but the light
// reaching it: the ramp below lies over the whole vessel, so a blob is at
// full strength down by the bulb and sinks into the vessel's own dark as it
// climbs away from it. One blob crossing the screen passes through the
// entire range on its own.
//
// Plain alpha, not a multiply. A blend mode is the most expensive thing
// that can be put on a screen-sized layer: the compositor has to read back
// everything beneath it at full resolution and write it again, where an
// ordinary layer is just drawn over the top.
//
// A deep maroon, which took two tries to arrive at. A violet one pulled the
// hue towards itself and turned the neon to pastel halfway up the vessel.
// Black was honest but flat: it scales every channel alike, where the
// multiply this replaces cut green and blue harder than red, so the wax
// grew *more* saturated as it darkened. Laying a dark red over it does the
// same thing — red survives the blend, green and blue give way — which is
// where the glow in the deep end of the vessel comes from.
// Held as hue, saturation and lightness so the tuner can move them: this
// is #ff6a12, the orange it has been since the neon pass.
const WAX_HUE = 348;
const WAX_SATURATION = 100;
const WAX_LIGHTNESS = 53;
// Where the darkening starts, as a fraction of the way up, and the stops
// from there to the top: each is how far along that span it sits, the
// colour it lays over, and how much of it.
const RAMP_START = 0.2;
const RAMP_STOPS: [number, string, number][] = [
  [0, "52, 6, 26", 0.0],
  [0.22, "50, 6, 26", 0.057],
  [0.48, "46, 5, 26", 0.247],
  [0.76, "34, 4, 24", 0.551],
  [1, "24, 3, 20", 0.741],
];

function heightRamp(start: number, depth: number) {
  const stops = RAMP_STOPS.map(
    ([at, colour, alpha]) =>
      `rgba(${colour}, ${Math.min(alpha * depth, 1)}) ${Math.round((start + at * (1 - start)) * 100)}%`,
  );
  return `linear-gradient(to top, ${stops.join(", ")})`;
}
// The lamp itself, below the glass: a hot pool at the base and the cone it
// throws up through the vessel.
// Carries the glow the filter used to spread around each blob: a halo in
// there cost a colour matrix and a merge on every frame, and this is a
// static paint that costs one.
// How far below the bottom edge the bulb's centre sits, in percent of the
// height: at zero it straddles the edge and reads as a light lying on the
// floor of the screen, and a few percent under puts the source off-screen
// where a lamp's own bulb would be.
const LIGHT_DROP = 10;

function glow(drop: number) {
  return `radial-gradient(74% 48% at 50% ${100 + drop}%, rgba(255, 104, 104, 0.5) 0%, rgba(255, 66, 118, 0.16) 44%, rgba(220, 40, 140, 0) 78%)`;
}

function lamp(drop: number) {
  return `radial-gradient(44% 17% at 50% ${100 + drop}%, rgba(255, 244, 214, 0.92) 0%, rgba(255, 170, 90, 0.55) 36%, rgba(255, 70, 120, 0) 100%)`;
}
// Laid over everything, so whatever sits low in the vessel — wax most of
// all — is lit hotter than what has risen away from the light. Plain alpha
// again, for the same reason as the ramp: over a dark vessel it lands close
// enough to the screen blend it replaces.
const LIGHT_FALLOFF =
  "linear-gradient(to top, rgba(255, 186, 120, 0.4) 0%, rgba(255, 126, 96, 0.17) 24%, rgba(230, 80, 140, 0.05) 50%, rgba(200, 60, 160, 0) 72%)";
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
  { x: 0.26, y: 0.74, size: 0.3, motion: "rise", duration: 164, delay: -3, travel: 0.74, sway: 0.09 },
  { x: 0.62, y: 0.8, size: 0.4, motion: "rise", duration: 236, delay: -31, travel: 0.86, sway: -0.12 },
  { x: 0.46, y: 0.5, size: 0.46, motion: "swell", duration: 192, delay: -17, travel: 0.34, sway: 0.07 },
  { x: 0.12, y: 0.32, size: 0.22, motion: "fall", duration: 212, delay: -44, travel: 0.66, sway: 0.13 },
  { x: 0.86, y: 0.28, size: 0.28, motion: "fall", duration: 270, delay: -12, travel: 0.78, sway: -0.08 },
  { x: 0.4, y: 0.14, size: 0.17, motion: "fall", duration: 140, delay: -27, travel: 0.54, sway: 0.16 },
  { x: 0.76, y: 0.54, size: 0.2, motion: "rise", duration: 180, delay: -39, travel: 0.62, sway: -0.15 },
  { x: 0.08, y: 0.62, size: 0.15, motion: "rise", duration: 126, delay: -9, travel: 0.48, sway: 0.11 },
  { x: 0.94, y: 0.68, size: 0.24, motion: "swell", duration: 220, delay: -52, travel: 0.4, sway: -0.1 },
  { x: 0.58, y: 0.22, size: 0.13, motion: "fall", duration: 154, delay: -21, travel: 0.44, sway: -0.14 },
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

// Everything worth turning a dial on, with the constants above as its
// defaults — the lamp renders identically with no tuning passed. The tuner
// page (/screen/lava-tuner, development only) drives these live, so the
// numbers are found against the real thing rather than a copy of it.
export const LAVA_TUNING = {
  stage: STAGE,
  blur: BLUR_RATIO,
  blobAlpha: BLOB_ALPHA,
  alphaGain: ALPHA_GAIN,
  // Where in the field the edge is cut, as a fraction of the way up it.
  // Half of a blob's own height puts the edge exactly where the blob was
  // drawn; lower leaves it outside, so blobs read bigger than drawn and
  // two of them reach each other from further apart.
  cut: -ALPHA_BIAS / ALPHA_GAIN,
  lift: LIFT_RATIO,
  // One dial over the three channels, keeping their ratio: blue falls
  // fastest, which is what keeps a thick blob's middle warm.
  density: 1,
  rimStrength: RIM_STRENGTH,
  rimFocus: RIM_FOCUS,
  topLight: TOP_LIGHT,
  haloStrength: HALO_STRENGTH,
  // A multiplier on every drift's duration: above 1 is slower.
  speed: 1,
  waxHue: WAX_HUE,
  waxSaturation: WAX_SATURATION,
  waxLightness: WAX_LIGHTNESS,
  // How deep the vessel goes towards its own dark at the top, and how far
  // up the screen that darkening starts.
  rampDepth: 1,
  rampStart: RAMP_START,
  lightDrop: LIGHT_DROP,
};

export type LavaTuning = typeof LAVA_TUNING;

export function LavaLamp({ tuning }: { now?: () => number; tuning?: Partial<LavaTuning> } = {}) {
  const t = { ...LAVA_TUNING, ...tuning };
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
  const stageWidth = size.width * t.stage;
  const stageHeight = size.height * t.stage;
  const short = Math.min(stageWidth, stageHeight);
  const blur = short * t.blur;
  const lift = short * t.lift;
  // The gain only decides how many pixels the edge takes; the cut decides
  // where it falls. Multiplying them keeps the two independent, so
  // sharpening an edge never moves it.
  const alphaBias = -t.cut * t.alphaGain;
  const wax = `hsl(${t.waxHue} ${t.waxSaturation}% ${t.waxLightness}%)`;

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
          {/* Opened up for the halo to spread into, and no further: the
              region is filtered in full, so every percent of it is work on
              every frame. */}
          <filter id={gooId} x="-9%" y="-9%" width="118%" height="118%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="pooled" />
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${t.alphaGain} ${alphaBias}`}
              result="wax"
            />
            {/* Deep wax, darker. The matrix turns the pooled field into a
                multiplier — 1 where there is no wax, down to 1 - DENSITY
                where it stands highest — and multiplying it into the wax in
                premultiplied space shades and clips in the one step. */}
            <feColorMatrix
              in="pooled"
              type="matrix"
              values={DENSITY.map((d) => `0 0 0 ${-Math.min(d * t.density, 1)} 1`).join("  ") + "  0 0 0 0 1"}
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
            {/* The same difference the other way about is positive along
                the top of the wax, where the other one clamped away: the
                light above, carried at TOP_LIGHT of the one below. */}
            <feComposite in="pooled" in2="lowered" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="topside" />
            <feComposite
              in="underside"
              in2="topside"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3={t.topLight}
              k4="0"
              result="lights"
            />
            {/* Flat amber at the strength of that difference: constant
                colour out of a slope of nought, alpha straight off the
                difference, screened onto the body in premultiplied space,
                which is one pass rather than a blend. */}
            <feComponentTransfer in="lights" result="rim">
              <feFuncR type="linear" slope="0" intercept={RIM_COLOUR[0]} />
              <feFuncG type="linear" slope="0" intercept={RIM_COLOUR[1]} />
              <feFuncB type="linear" slope="0" intercept={RIM_COLOUR[2]} />
              <feFuncA type="gamma" amplitude={t.rimStrength} exponent={t.rimFocus} offset="0" />
            </feComponentTransfer>
            {/* The pooled field reaches past the wax, so the difference
                does too; without this the light spills off every blob as a
                bright band of its own, outside the shape. */}
            <feComposite in="rim" in2="wax" operator="in" result="litEdge" />
            <feComposite in="litEdge" in2="dense" operator="arithmetic" k1="-1" k2="1" k3="1" k4="0" result="shaded" />

            {/* Light through the thin wax at the edge, and past it. One
                band, screened over the lot: where there is no wax under it
                the screen leaves it as it is, so the same pass that lights
                the inside of an edge throws the halo outside it. */}
            <feComponentTransfer in="pooled" result="translucence">
              <feFuncR type="linear" slope="0" intercept={HALO_COLOUR[0]} />
              <feFuncG type="linear" slope="0" intercept={HALO_COLOUR[1]} />
              <feFuncB type="linear" slope="0" intercept={HALO_COLOUR[2]} />
              <feFuncA type="table" tableValues={HALO_BAND.map((v) => v * t.haloStrength).join(" ")} />
            </feComponentTransfer>
            <feComposite in="translucence" in2="shaded" operator="arithmetic" k1="-1" k2="1" k3="1" k4="0" />


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
            transform: `scale(${1 / t.stage})`,
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
                  background: wax,
                  opacity: t.blobAlpha,
                  mixBlendMode: "plus-lighter",
                  ...(composited
                    ? {
                        animation: `colo-lava-${blob.motion} ${blob.duration * t.speed}s ease-in-out ${blob.delay}s infinite`,
                        willChange: "transform",
                      }
                    : {
                        animation: `colo-lava-${blob.motion}-painted ${blob.duration * t.speed}s ease-in-out ${blob.delay}s infinite`,
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
      <div className="pointer-events-none absolute inset-0" style={{ background: heightRamp(t.rampStart, t.rampDepth) }} />

      {/* The light itself, and what it does to everything above it. All of
          these sit outside the filtered layer, so none of them is dragged
          through the alpha push, and all are static: one paint each and
          nothing after that. The ramp above cannot touch them — they are
          the lamp, not the wax. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: glow(t.lightDrop) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: LIGHT_FALLOFF }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: lamp(t.lightDrop) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: VIGNETTE }} />
    </div>
  );
}
