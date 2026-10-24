"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPass, webglUsable } from "./webgl";

// A lava lamp the size of the screen: warm blobs rising and falling through
// a dark ground, in the same burgundy-to-amber the clock's second hand
// comes from. Blobs that meet pull into one another and part again, which
// is the whole character of the thing.
//
// That merging is a field and a hard push on alpha. Every blob stands a
// soft mound up in a field they all share; where two of them overlap the
// mounds add, and multiplying the summed alpha snaps the result back into
// one solid outline with a neck drawn between them. It pushes *alpha*
// rather than contrast — CSS's contrast() works on colour as well, and at
// the strength this needs it drove every shade of wax to the same primary
// red, so the filter here is an SVG one whose colour matrix leaves RGB
// alone. The colour underneath is what keeps the shading inside each blob.
//
// The field used to be made by blurring flat discs, which is the obvious
// way to come by those mounds. It was also very nearly the whole cost of
// the page: a Gaussian blur takes a slow path whatever its radius, and
// measured against a screenful of lamps it was essentially all of the
// frame. So the mound is drawn instead — one radial gradient per blob,
// painted into a bitmap a quarter of the box on each side and stretched
// back up, which runs about three and a third times faster with no blur
// left anywhere.
//
// What a drawn mound has to be is not a matter of taste: it is exactly the
// profile a blurred disc has (see blurredDisc). Blurring is linear, so the
// blur of a sum of discs is the sum of their blurs — paint every blob with
// its own blurred-disc profile, add them, and the field is the one the blur
// used to produce, to well inside a byte. Guessing at the curve instead is
// what went wrong the first time this was tried: a bell falling away from
// the middle gave a blob no flat body, and the density shading and the lit
// edges read that as a lens inside each one.
//
// That is the canvas renderer. Where WebGL can be had, a shader does all of
// it instead, in one pass (see FRAGMENT at the bottom): the same mounds,
// summed per pixel straight from the same profiles, the same filter steps
// worked through in the same colour space, and the light layers laid over
// as one picture. A Fire TV stick spends most of the canvas renderer's
// frame running that filter over the whole screen; the shader does the
// same arithmetic in a fraction of it. The canvas renderer stays for
// library thumbnails, sticks without WebGL, and a lost context, as
// Glitter's does.
//
// The motion is a requestAnimationFrame loop, since something has to paint
// the field. It is the only thing on the main thread, and a dropped frame
// under a blob creeping across a screen is invisible — see the note on
// speed by the drifts.

// How far apart two blobs still reach for each other, as a fraction of the
// field's short side — a fixed one would swallow the lamp whole at
// library-thumbnail size and barely show on a 4K screen.
//
// This is how far a blob's own falloff reaches past its body: the soft
// collar that pools with its neighbours' and decides whether a meeting
// reads as a neck of wax or as two blobs merely touching. It is exactly
// what the blur's radius used to be, drawn rather than computed.
const REACH_RATIO = 0.062;
// How far past its body a mound is drawn, in reaches. A Gaussian is never
// quite nothing, but three and a half reaches out it is under a thousandth
// — less than a byte can hold, and nothing the field will miss.
const PROFILE_REACH = 3.5;
// Stops in one mound's gradient. The profile's steepest stretch runs over
// about two reaches, so at this spacing the straight line a gradient draws
// between neighbouring stops departs from the curve by a fraction of a
// 255th.
const PROFILE_STOPS = 32;
// Each blob is drawn at BLOB_ALPHA and added to the ones under it rather
// than covering them, so the pooled field is a sum: one blob stands at
// BLOB_ALPHA, two on top of each other at twice that. Cutting that sum at
// a level below a single blob's own height is what makes a merge grow —
// where two have run together the field is far above the cut, so the edge
// is pushed out well past the union of the two outlines, and the mass that
// results is nearer the sum of them. Opaque blobs can only ever make a
// union, which is always less wax than went into it.
const BLOB_ALPHA = 0.48;
// The cut is CUT of the way up the field — a little
// under two fifths of one blob's own height, which leaves the edge just
// outside where the blob is drawn, and is what makes a merge grow.
// The gain itself only decides how many pixels the edge takes to go from
// nothing to solid: the higher it is, the harder the edge. Soft edges were
// reading as fog rather than as wax.
const ALPHA_GAIN = 60;
// Held as the cut itself, so the dial reads exactly what's set; the bias
// follows from it.
const CUT = 0.18;
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
// unbroken across a join. Each light's colour is held as a hue (see
// lightHue) at a pale lightness — both a pale rose, which at 0 and 360
// are the same; the dial for the light above simply starts at its far end.
const RIM_HUE = 0;
const TOP_RIM_HUE = 360;
const RIM_SATURATION = 1;
const RIM_LIGHTNESS = 0.89;
const RIM_STRENGTH = 0.6;
// Gloss is light concentrated, not merely more of it. Curving the band
// rather than scaling it flat pushes the weak tail — the part that spreads
// a highlight into a wash — down towards nothing, while the peak right at
// the edge keeps the lot. Above 1 it sharpens; at 1 it is the plain slope
// this used to be.
const RIM_FOCUS = 1.15;
// A second light, over the vessel, at a fraction of the strength of the
// bulb under it. It needs no shift of its own: the same two images that give the
// underside give the top edge with the operands the other way round, so
// this costs two sums and nothing else.
const TOP_LIGHT = 0.4;
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
const HALO_STRENGTH = 0.1;
// How wide that band is depends on the blob: read off each blob's mound
// stretched by its size against one this big (a radius, as a fraction of
// the short side, about the average), so a big blob glows over a broad
// edge and a small one over a tight one. The shader only: the canvas
// renderer reads the band off the one pooled field, whose falloff is the
// same width for every blob.
const HALO_REFERENCE = 0.13;


// The lamp's own vessel. Deliberately not the screen's black/white
// background setting: a lava lamp is a dark vessel, and a white one isn't
// one.
export const GROUND = "#17031a";
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
const WAX_HUE = 336;
const WAX_SATURATION = 100;
const WAX_LIGHTNESS = 45.5;
// Where the darkening starts, as a fraction of the way up, and the stops
// from there to the top: each is how far along that span it sits, the
// colour it lays over, and how much of it.
const RAMP_START = 0;
const RAMP_STOPS: [number, string, number][] = [
  [0, "52, 6, 26", 0.0],
  [0.22, "50, 6, 26", 0.057],
  [0.48, "46, 5, 26", 0.247],
  [0.76, "34, 4, 24", 0.551],
  [1, "24, 3, 20", 0.741],
];

// The light layers over the wax — the ramp above, and the lamp's glow, its
// falloff, the bulb and the vignette below — held as data rather than as
// CSS, so the two renderers paint them from the same numbers: the canvas
// one as CSS gradients on layers of their own, the shader as one picture
// laid over the wax inside it (see paintLight).
type Stop = [colour: string, at: number];
export type Light =
  | { kind: "up"; stops: Stop[] }
  // An elliptical radial gradient: its radii and centre as fractions of
  // the box's width and height, like CSS's "74% 48% at 50% 110%".
  | { kind: "ellipse"; size: [number, number]; at: [number, number]; stops: Stop[] };

function heightRamp(start: number, depth: number): Light {
  return {
    kind: "up",
    stops: RAMP_STOPS.map(([at, colour, alpha]) => [
      `rgba(${colour}, ${Math.min(alpha * depth, 1)})`,
      Math.round((start + at * (1 - start)) * 100) / 100,
    ]),
  };
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
const LIGHT_DROP = 7;

function glow(drop: number): Light {
  return {
    kind: "ellipse",
    size: [0.74, 0.48],
    at: [0.5, 1 + drop / 100],
    stops: [
      ["rgba(255, 104, 104, 0.5)", 0],
      ["rgba(255, 66, 118, 0.16)", 0.44],
      ["rgba(220, 40, 140, 0)", 0.78],
    ],
  };
}

function lamp(drop: number): Light {
  return {
    kind: "ellipse",
    size: [0.44, 0.17],
    at: [0.5, 1 + drop / 100],
    stops: [
      ["rgba(255, 244, 214, 0.92)", 0],
      ["rgba(255, 170, 90, 0.55)", 0.36],
      ["rgba(255, 70, 120, 0)", 1],
    ],
  };
}
// Laid over everything, so whatever sits low in the vessel — wax most of
// all — is lit hotter than what has risen away from the light. Plain alpha
// again, for the same reason as the ramp: over a dark vessel it lands close
// enough to the screen blend it replaces.
const LIGHT_FALLOFF: Light = {
  kind: "up",
  stops: [
    ["rgba(255, 186, 120, 0.4)", 0],
    ["rgba(255, 126, 96, 0.17)", 0.24],
    ["rgba(230, 80, 140, 0.05)", 0.5],
    ["rgba(200, 60, 160, 0)", 0.72],
  ],
};
const VIGNETTE: Light = {
  kind: "ellipse",
  size: [1.18, 0.86],
  at: [0.5, 0.48],
  stops: [
    ["rgba(0, 0, 0, 0)", 0.52],
    ["rgba(6, 0, 10, 0.74)", 1],
  ],
};

// Every light layer, bottom to top, as the tuning places them.
export function lights(t: LavaTuning): Light[] {
  return [heightRamp(t.rampStart, t.rampDepth), glow(t.lightDrop), LIGHT_FALLOFF, lamp(t.lightDrop), VIGNETTE];
}

function css(light: Light) {
  const percent = (value: number) => `${Math.round(value * 10000) / 100}%`;
  const stops = light.stops.map(([colour, at]) => `${colour} ${percent(at)}`).join(", ");
  return light.kind === "up"
    ? `linear-gradient(to top, ${stops})`
    : `radial-gradient(${percent(light.size[0])} ${percent(light.size[1])} at ${percent(light.at[0])} ${percent(light.at[1])}, ${stops})`;
}

// Every light layer flattened into one picture, for the shader to lay over
// the wax: layers laid over one another one by one come to the same as a
// single layer that is their sum, so five full-screen blends a frame
// become one texture read. Smooth gradients, so a small canvas does.
export function paintLight(
  ctx: CanvasRenderingContext2D,
  layers: Light[],
  width: number,
  height: number,
  // Painted over what's already there, rather than onto a clear canvas.
  { over = false }: { over?: boolean } = {},
) {
  if (!over) ctx.clearRect(0, 0, width, height);
  for (const light of layers) {
    ctx.save();
    let gradient: CanvasGradient;
    if (light.kind === "up") {
      gradient = ctx.createLinearGradient(0, height, 0, 0);
    } else {
      // A circle of radius 1, stretched into the ellipse.
      const [rx, ry] = [light.size[0] * width, light.size[1] * height];
      ctx.translate(light.at[0] * width, light.at[1] * height);
      ctx.scale(rx, ry);
      gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    }
    for (const [colour, at] of light.stops) gradient.addColorStop(Math.min(Math.max(at, 0), 1), colour);
    ctx.fillStyle = gradient;
    if (light.kind === "up") ctx.fillRect(0, 0, width, height);
    else {
      const [cx, cy] = [light.at[0] / light.size[0], light.at[1] / light.size[1]];
      ctx.fillRect(-cx, -cy, 1 / light.size[0], 1 / light.size[1]);
    }
    ctx.restore();
  }
}

export type Blob = {
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


export const BLOBS: Blob[] = [
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

// The same drifts as numbers, for the canvas variant: every stop in order,
// with "0%, 100%" written out at both ends.
const POSES: Record<Blob["motion"], { at: number; x: number; y: number; sx: number; sy: number }[]> =
  Object.fromEntries(
    Object.entries(DRIFTS).map(([motion, poses]) => [
      motion,
      poses
        .flatMap((pose) => pose.at.split(",").map((at) => ({ ...pose, at: parseFloat(at) / 100 })))
        .sort((a, b) => a.at - b.at),
    ]),
  ) as Record<Blob["motion"], { at: number; x: number; y: number; sx: number; sy: number }[]>;

// Where a drift has got to at this point in its cycle. CSS eases between
// keyframes rather than running straight at them, so this does too — a
// cosine, which is near enough ease-in-out that the difference does not
// show at this speed.
export function poseAt(motion: Blob["motion"], phase: number) {
  const poses = POSES[motion];
  const at = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < poses.length - 2 && poses[i + 1].at <= at) i++;
  const from = poses[i];
  const to = poses[i + 1];
  const span = to.at - from.at;
  const k = span > 0 ? (1 - Math.cos(Math.PI * ((at - from.at) / span))) / 2 : 0;
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    sx: from.sx + (to.sx - from.sx) * k,
    sy: from.sy + (to.sy - from.sy) * k,
  };
}

// Everything worth turning a dial on, with the constants above as its
// defaults — the lamp renders identically with no tuning passed. The tuner
// page (/screen/lava-tuner, development only) drives these live, so the
// numbers are found against the real thing rather than a copy of it.
export const LAVA_TUNING = {
  reach: REACH_RATIO,
  // Canvas variant only: how small the field is painted before being
  // stretched back up.
  fieldScale: 0.25,
  blobAlpha: BLOB_ALPHA,
  alphaGain: ALPHA_GAIN,
  // Where in the field the edge is cut, as a fraction of the way up it.
  // Half of a blob's own height puts the edge exactly where the blob was
  // drawn; lower leaves it outside, so blobs read bigger than drawn and
  // two of them reach each other from further apart.
  cut: CUT,
  lift: LIFT_RATIO,
  // One dial over the three channels, keeping their ratio: blue falls
  // fastest, which is what keeps a thick blob's middle warm.
  density: 0.8,
  rimStrength: RIM_STRENGTH,
  rimFocus: RIM_FOCUS,
  topLight: TOP_LIGHT,
  // The colours of the light from below and the light from above.
  lightHue: RIM_HUE,
  topLightHue: TOP_RIM_HUE,
  haloStrength: HALO_STRENGTH,
  // A multiplier on every drift's duration: above 1 is slower.
  speed: 1,
  waxHue: WAX_HUE,
  waxSaturation: WAX_SATURATION,
  waxLightness: WAX_LIGHTNESS,
  // How deep the vessel goes towards its own dark at the top, and how far
  // up the screen that darkening starts.
  rampDepth: 0.25,
  rampStart: RAMP_START,
  lightDrop: LIGHT_DROP,
  // WebGL only: how many of the device's pixels the shader works in. Wax
  // is smooth, so half of them — a quarter of the work — loses nothing
  // the stretch back up doesn't smooth over.
  resolution: 0.5,
  // WebGL only: frames a second, at most. A lamp turns itself over in
  // minutes; the headroom is the stick's to keep cool with.
  fps: 30,
};

export type LavaTuning = typeof LAVA_TUNING;

// Which renderer ran, and how fast — the tuner shows it.
export type LavaStats = { renderer: "webgl" | "canvas"; fps: number };

// Below this short side, in CSS pixels, the canvas renderer draws: nothing
// that small needs a shader, and every library thumbnail holding a WebGL
// context would run the browser out of them.
const MIN_WEBGL_SIDE = 240;
// The most device pixels down the short side the shader works in; a 4K
// screen gets the 1080p lamp stretched up.
const MAX_SHORT_PX = 1080;

export function LavaLamp({
  tuning,
  renderer = "auto",
  onStats,
}: {
  now?: () => number;
  tuning?: Partial<LavaTuning>;
  // The tuner can hold the canvas renderer on, to compare the two.
  renderer?: "auto" | "canvas";
  onStats?: (stats: LavaStats) => void;
} = {}) {
  const t = { ...LAVA_TUNING, ...tuning };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const [webglLost, setWebglLost] = useState(false);
  // The shader reads the dials from here each frame rather than starting
  // over on every change.
  const tuningRef = useRef(t);
  const statsRef = useRef(onStats);
  useEffect(() => {
    tuningRef.current = t;
    statsRef.current = onStats;
  });
  const rootRef = useRef<HTMLDivElement>(null);
  // Scoped to this lamp: a library page draws several at once, and an SVG
  // filter is referenced by id.
  const gooId = `${useId()}-lava-goo`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  // When the lamp was lit. Held across the painter's restarts — every dial
  // that changes how it paints restarts it — so turning one live from the
  // dashboard doesn't throw every blob back to where it began.
  const litRef = useRef<number | null>(null);

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
  const short = Math.min(size.width, size.height);
  const mode = renderer === "auto" && !webglLost && short >= MIN_WEBGL_SIDE && webglUsable() ? "webgl" : "canvas";
  const pixelScale =
    short > 0
      ? Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_SHORT_PX / short) * t.resolution
      : 1;
  const lift = short * t.lift;
  // The gain only decides how many pixels the edge takes; the cut decides
  // where it falls. Multiplying them keeps the two independent, so
  // sharpening an edge never moves it.
  const alphaBias = -t.cut * t.alphaGain;
  const wax = hslToRgb(t.waxHue, t.waxSaturation / 100, t.waxLightness / 100);
  const rimBelow = rimColour(t.lightHue);
  const rimAbove = rimColour(t.topLightHue);

  // The canvas variant's painter: one bitmap, a quarter of the box on each
  // side, redrawn every frame and stretched up by the browser. Building the
  // field small and letting bilinear filtering carry it back up is what
  // keeps the cut off a staircase — the steps get interpolated across
  // instead of amplified — and the gradients have no corners to crease.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode !== "canvas" || !canvas || size.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const scale = t.fieldScale;
    canvas.width = Math.max(Math.round(size.width * scale), 1);
    canvas.height = Math.max(Math.round(size.height * scale), 1);
    const shortSide = Math.min(canvas.width, canvas.height);
    // The reach in this bitmap's own pixels. The bitmap is stretched to the
    // whole box, so holding it to a fraction of the short side is what keeps
    // a thumbnail and a 4K screen looking like the same lamp.
    const reach = shortSide * t.reach;
    litRef.current ??= performance.now();
    const started = litRef.current;

    let frame = 0;
    const count = frameCounter("canvas", statsRef);
    function paint(now: number) {
      count(now);
      const ctx = context!;
      const seconds = (now - started) / 1000;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = t.blobAlpha;

      for (const blob of BLOBS) {
        const pose = poseAt(blob.motion, (seconds + blob.delay) / (blob.duration * t.speed));
        // The round part of the blob, which is what the profile is of: the
        // drift's squash is applied around it as an area-preserving stretch,
        // so a stretched blob carries the mass it had.
        const squash = Math.sqrt(pose.sx * pose.sy);
        const body = (shortSide * blob.size * squash) / 2;
        const outer = body + PROFILE_REACH * reach;
        const profile = profileFor(body / reach);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
        for (let stop = 0; stop < profile.length; stop++) {
          gradient.addColorStop(stop / (profile.length - 1), `rgba(${wax}, ${profile[stop]})`);
        }

        ctx.save();
        ctx.translate(
          canvas!.width * blob.x + pose.x * canvas!.width * blob.sway,
          canvas!.height * blob.y + pose.y * canvas!.height * blob.travel * 0.5,
        );
        ctx.scale(pose.sx / squash, pose.sy / squash);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, outer, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      frame = requestAnimationFrame(paint);
    }

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [mode, size.width, size.height, t.fieldScale, t.blobAlpha, t.reach, t.speed, wax]);

  // The shader's painter: one pass a frame, at most fps a second.
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (mode !== "webgl" || !canvas || size.width === 0) return;
    canvas.width = Math.max(Math.round(size.width * pixelScale), 1);
    canvas.height = Math.max(Math.round(size.height * pixelScale), 1);
    const shader = createShader(canvas);
    if (!shader) {
      setWebglLost(true);
      return;
    }
    // A stick short of memory, or a browser with too many open: the canvas
    // renderer carries on in its place.
    function lost(event: Event) {
      event.preventDefault();
      setWebglLost(true);
    }
    canvas.addEventListener("webglcontextlost", lost);

    litRef.current ??= performance.now();
    const started = litRef.current;
    const count = frameCounter("webgl", statsRef);
    const { width, height } = size;
    let frame = 0;
    let last = -1;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const tune = tuningRef.current;
      if (last >= 0 && now - last < 1000 / tune.fps - 2) return;
      last = now;
      count(now);
      shader!.draw(canvas!.width, canvas!.height, width, height, (now - started) / 1000, tune);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      shader.dispose();
    };
  }, [mode, size, pixelScale]);

  if (mode === "webgl") {
    return (
      <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
        {short > 0 && <canvas key="webgl" ref={glCanvasRef} className="absolute inset-0 block h-full w-full" />}
      </div>
    );
  }


  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
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
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${t.alphaGain} ${alphaBias}`}
              result="wax"
            />
            {/* Deep wax, darker. The matrix turns the pooled field into a
                multiplier — 1 where there is no wax, down to 1 - DENSITY
                where it stands highest — and multiplying it into the wax in
                premultiplied space shades and clips in the one step. */}
            <feColorMatrix
              in="SourceGraphic"
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
            <feOffset in="SourceGraphic" dx="0" dy={lift} result="lowered" />
            <feComposite in="lowered" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="underside" />
            {/* The same difference the other way about is positive along
                the top of the wax, where the other one clamped away: the
                light above, carried at TOP_LIGHT of the one below. */}
            <feComposite in="SourceGraphic" in2="lowered" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="topside" />
            {/* Each light's colour at the strength of its difference:
                constant colour out of a slope of nought, alpha straight off
                the difference — the light above at its fraction of the one
                below, which the gamma's amplitude carries — then the two
                added, which never overlap, since a surface faces either up
                or down. Screened onto the body in premultiplied space,
                which is one pass rather than a blend. */}
            <feComponentTransfer in="underside" result="rimBelow">
              <feFuncR type="linear" slope="0" intercept={rimBelow[0]} />
              <feFuncG type="linear" slope="0" intercept={rimBelow[1]} />
              <feFuncB type="linear" slope="0" intercept={rimBelow[2]} />
              <feFuncA type="gamma" amplitude={t.rimStrength} exponent={t.rimFocus} offset="0" />
            </feComponentTransfer>
            <feComponentTransfer in="topside" result="rimAbove">
              <feFuncR type="linear" slope="0" intercept={rimAbove[0]} />
              <feFuncG type="linear" slope="0" intercept={rimAbove[1]} />
              <feFuncB type="linear" slope="0" intercept={rimAbove[2]} />
              <feFuncA type="gamma" amplitude={t.rimStrength * t.topLight ** t.rimFocus} exponent={t.rimFocus} offset="0" />
            </feComponentTransfer>
            <feComposite in="rimBelow" in2="rimAbove" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rim" />
            {/* The pooled field reaches past the wax, so the difference
                does too; without this the light spills off every blob as a
                bright band of its own, outside the shape. */}
            <feComposite in="rim" in2="wax" operator="in" result="litEdge" />
            <feComposite in="litEdge" in2="dense" operator="arithmetic" k1="-1" k2="1" k3="1" k4="0" result="shaded" />

            {/* Light through the thin wax at the edge, and past it. One
                band, screened over the lot: where there is no wax under it
                the screen leaves it as it is, so the same pass that lights
                the inside of an edge throws the halo outside it. */}
            <feComponentTransfer in="SourceGraphic" result="translucence">
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
            width: size.width,
            height: size.height,
            filter: `url(#${gooId})`,
          }}
        >
          <canvas
            key="canvas"
            ref={canvasRef}
            className="h-full w-full"
            // The bitmap is a quarter of this box on each side; the browser
            // stretches it, smoothing as it goes, which is the whole point.
            style={{ display: "block" }}
          />
        </div>
      )}

      {/* The one colour the wax is, graded by where it has got to in the
          vessel: multiplied over everything under it, so a blob reads at
          full strength by the bulb and sinks into the vessel's dark as it
          rises. Over the ground, which is nearly black already, it barely
          registers. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: css(heightRamp(t.rampStart, t.rampDepth)) }} />

      {/* The light itself, and what it does to everything above it. All of
          these sit outside the filtered layer, so none of them is dragged
          through the alpha push, and all are static: one paint each and
          nothing after that. The ramp above cannot touch them — they are
          the lamp, not the wax. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: css(glow(t.lightDrop)) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: css(LIGHT_FALLOFF) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: css(lamp(t.lightDrop)) }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: css(VIGNETTE) }} />
    </div>
  );
}

// "r, g, b", ready to drop into rgb() or rgba(). The wax is held as hue,
// saturation and lightness so the tuner can move them, but a blob's falloff
// needs that colour at several alphas — and hsl() with a slash alpha is
// newer than some of the kiosk browsers this has to run on.
export function hslToRgb(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((((hue % 360) + 360) % 360) / 60);
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const base = lightness - chroma / 2;
  return [r, g, b].map((channel) => Math.round((channel + base) * 255)).join(", ");
}


// e^-z I0(z), the modified Bessel function of the first kind scaled so it
// stays tame: I0 on its own runs a double out of room by an argument of
// about 700, which a blob of any size reaches. Abramowitz & Stegun 9.8.1
// and 9.8.2, good to a few parts in a hundred million either side of 3.75.
function scaledBessel0(z: number) {
  if (z < 3.75) {
    const t = z / 3.75;
    const y = t * t;
    const i0 =
      1 +
      y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
    return Math.exp(-z) * i0;
  }
  const t = 3.75 / z;
  return (
    (0.39894228 +
      t *
        (0.01328592 +
          t *
            (0.00225319 +
              t *
                (-0.00157565 +
                  t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) /
    Math.sqrt(z)
  );
}

// The mound one blob stands up: the profile a flat disc of its own size has
// once it is blurred, from the middle out to PROFILE_REACH past the body,
// with everything measured in reaches.
//
// A disc of radius R blurred by a Gaussian one reach wide, read a distance
// r from the middle, is the Gaussian integrated over the disc. In polar
// coordinates the angle comes out as a Bessel function and leaves a single
// integral over the radius, which the trapezium rule does to more places
// than are wanted here:
//
//   P(r) = INTEGRAL from 0 to R of exp(-(r-u)^2 / 2) * e^-ru I0(r u) * u du
//
// The Gaussian and the Bessel are split that way on purpose — the pair
// e^-ru I0(ru) is a slow, well-behaved decay where I0 alone overflows.
// Checked against the closed form in the middle, 1 - e^(-R^2 / 2), and
// against a brute-force convolution out in the tail: both agree to about a
// ten-thousandth, a fortieth of a byte.
function blurredDisc(bodyInReaches: number) {
  const steps = 160;
  const outer = bodyInReaches + PROFILE_REACH;
  const profile: number[] = [];
  for (let stop = 0; stop < PROFILE_STOPS; stop++) {
    const r = (outer * stop) / (PROFILE_STOPS - 1);
    let sum = 0;
    for (let step = 0; step <= steps; step++) {
      const u = (bodyInReaches * step) / steps;
      // Half weight at both ends, which is all the trapezium rule is.
      const weight = step === 0 || step === steps ? 0.5 : 1;
      sum += weight * Math.exp(-((r - u) ** 2) / 2) * scaledBessel0(r * u) * u;
    }
    profile.push(Math.min((sum * bodyInReaches) / steps, 1));
  }
  return profile;
}

// A blob's body breathes as it drifts, so the profile is wanted at a great
// many sizes — but across that little range it is the same curve stretched,
// so the sizes are rounded into twentieths of a reach and the curves kept.
// A couple of hundred are ever computed, and the geometry stays continuous
// whichever rounded curve a frame gets, because it is always drawn out to
// the blob's true size.
const PROFILES = new Map<number, number[]>();

function profileFor(bodyInReaches: number) {
  const key = Math.max(Math.round(bodyInReaches * 20) / 20, 0.05);
  let profile = PROFILES.get(key);
  if (!profile) {
    profile = blurredDisc(key);
    PROFILES.set(key, profile);
  }
  return profile;
}

// Counts frames for the tuner's readout, reporting once a second.
export function frameCounter(renderer: LavaStats["renderer"], statsRef: { current: ((stats: LavaStats) => void) | undefined }) {
  let counted = 0;
  let since = -1;
  return (now: number) => {
    counted++;
    if (since < 0) since = now;
    if (now - since < 1000) return;
    statsRef.current?.({ renderer, fps: Math.round((counted * 1000) / (now - since)) });
    counted = 0;
    since = now;
  };
}

// ---------------------------------------------------------------------------
// The shader.

// Where a blob is at this moment, and how big, in whatever pixels the box
// is measured in — the same placing the canvas renderer works out inline.
function placeBlob(blob: Blob, seconds: number, t: LavaTuning, width: number, height: number) {
  const short = Math.min(width, height);
  const reach = short * t.reach;
  const pose = poseAt(blob.motion, (seconds + blob.delay) / (blob.duration * t.speed));
  const squash = Math.sqrt(pose.sx * pose.sy);
  const body = (short * blob.size * squash) / 2;
  return {
    x: width * blob.x + pose.x * width * blob.sway,
    y: height * blob.y + pose.y * height * blob.travel * 0.5,
    // How much to undo the drift's stretch by, along each axis, to read the
    // round profile.
    unstretchX: squash / pose.sx,
    unstretchY: squash / pose.sy,
    body,
    outer: body + PROFILE_REACH * reach,
    profile: profileFor(body / reach),
  };
}

// The rows of the profile texture: one per blob, PROFILE_STOPS across.
const PROFILE_ROWS = 16;

// The canvas renderer, step for step: the mounds summed as the canvas sums
// them ("lighter": added, held at 1), then each filter primitive in turn.
// SVG filters work in linear light unless told otherwise, so this does
// too — the wax's colour is taken into it on the way in, the filter's own
// colours (the rim, the halo) are linear already, and the result comes
// back out to sRGB before it's laid over the vessel and the light layers.
const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2 uCanvas;
// Canvas pixels per CSS pixel; everything else is in CSS pixels, down
// from the top, as the canvas renderer's field and filter are.
uniform float uScale;
// Each blob's centre, and how much to undo its stretch along each axis.
uniform vec4 uBlobs[${BLOBS.length}];
// Each blob's outer edge and body, in CSS pixels.
uniform vec2 uRadii[${BLOBS.length}];
uniform sampler2D uProfiles;
uniform sampler2D uLight;
uniform float uBlobAlpha;
uniform float uGain;
uniform float uCut;
uniform float uLift;
uniform vec3 uDensity;
// Rim strength, rim focus, light from above.
uniform vec3 uRim;
uniform vec3 uRimBelow;
uniform vec3 uRimAbove;
uniform float uHaloReference;
uniform vec3 uHaloColour;
uniform float uHalo[11];
uniform vec3 uWax;
uniform vec3 uGround;

// The mounds summed, before the canvas would hold the sum at 1.
float field(vec2 at) {
  float sum = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec2 off = (at - uBlobs[i].xy) * uBlobs[i].zw;
    float r = length(off) / uRadii[i].x;
    float stop = min(r, 1.0) * ${(PROFILE_STOPS - 1) / PROFILE_STOPS} + ${0.5 / PROFILE_STOPS};
    sum += texture2D(uProfiles, vec2(stop, (float(i) + 0.5) / ${PROFILE_ROWS}.0)).a * step(r, 1.0);
  }
  return sum * uBlobAlpha;
}

// The same field with each blob's falloff stretched by its size against
// the reference one, about its body's edge: what the translucence band is
// read across, so it spans more of a big blob's edge than a small one's.
float sized(vec2 at) {
  float sum = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec2 off = (at - uBlobs[i].xy) * uBlobs[i].zw;
    float body = uRadii[i].y;
    float r = max(body + (length(off) - body) * uHaloReference / body, 0.0) / uRadii[i].x;
    float stop = min(r, 1.0) * ${(PROFILE_STOPS - 1) / PROFILE_STOPS} + ${0.5 / PROFILE_STOPS};
    sum += texture2D(uProfiles, vec2(stop, (float(i) + 0.5) / ${PROFILE_ROWS}.0)).a * step(r, 1.0);
  }
  return min(sum * uBlobAlpha, 1.0);
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// feFuncA's table: straight lines between eleven values.
float halo(float a) {
  float x = clamp(a, 0.0, 1.0) * 10.0;
  float value = 0.0;
  for (int k = 0; k < 10; k++) {
    float f = x - float(k);
    if (f >= 0.0 && f <= 1.0) value = mix(uHalo[k], uHalo[k + 1], f);
  }
  return value;
}

// Arithmetic k1 = -1, k2 = k3 = 1: a screen, in premultiplied colour.
vec4 screen(vec4 over, vec4 under) {
  return over + under - over * under;
}

void main() {
  vec2 at = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) / uScale;
  float sum = field(at);
  float a = min(sum, 1.0);
  float above = min(field(at - vec2(0.0, uLift)), 1.0);

  // Adding colour as well as alpha, the canvas runs a thick spot's colour
  // past the wax towards white wherever the sum passes 1; so does this.
  vec3 source = toLinear(min(uWax * sum, 1.0) / max(a, 0.0001));

  float waxAlpha = clamp(uGain * (a - uCut), 0.0, 1.0);
  vec4 dense = vec4(source * (1.0 - uDensity * a) * waxAlpha, waxAlpha);

  // A surface faces up or down, so only one light falls on it.
  float below = max(above - a, 0.0);
  float lights = clamp(below + uRim.z * max(a - above, 0.0), 0.0, 1.0);
  float rimAlpha = lights > 0.0 ? clamp(uRim.x * pow(lights, uRim.y), 0.0, 1.0) * waxAlpha : 0.0;
  vec3 rimColour = below > 0.0 ? uRimBelow : uRimAbove;
  vec4 shaded = screen(vec4(rimColour * rimAlpha, rimAlpha), dense);

  float haloAlpha = clamp(halo(sized(at)), 0.0, 1.0);
  vec4 lit = screen(vec4(uHaloColour * haloAlpha, haloAlpha), shaded);

  vec3 colour = lit.a > 0.0 ? toSrgb(lit.rgb / lit.a) : vec3(0.0);
  vec3 painted = mix(uGround, colour, lit.a);
  vec4 light = texture2D(uLight, vec2(gl_FragCoord.x / uCanvas.x, 1.0 - gl_FragCoord.y / uCanvas.y));
  gl_FragColor = vec4(light.rgb + (1.0 - light.a) * painted, 1.0);
}
`;

function createShader(canvas: HTMLCanvasElement) {
  const pass = createPass(canvas, "Lava Lamp", FRAGMENT, [
    "uCanvas", "uScale", "uBlobs", "uRadii", "uProfiles", "uLight", "uBlobAlpha", "uGain", "uCut", "uLift",
    "uDensity", "uRim", "uRimBelow", "uRimAbove", "uHaloReference", "uHaloColour", "uHalo", "uWax", "uGround",
  ] as const);
  if (!pass) return null;
  const { gl, at } = pass;

  function texture(unit: number) {
    const made = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, made);
    // Linear between texels: along a profile, that's the straight line a
    // canvas gradient draws between its stops.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return made;
  }

  // The profiles: rewritten only when a blob's breathing moves it onto
  // another of the cached curves, a few times a minute.
  const profiles = texture(0);
  const profileBytes = new Uint8Array(PROFILE_STOPS * PROFILE_ROWS);
  const shown: (number[] | null)[] = BLOBS.map(() => null);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, PROFILE_STOPS, PROFILE_ROWS, 0, gl.ALPHA, gl.UNSIGNED_BYTE, profileBytes);

  // The light layers, painted small and premultiplied, so laying them over
  // is one multiply-add; repainted only when the box or their dials change.
  const light = texture(1);
  const lightCanvas = document.createElement("canvas");
  let lightKey = "";

  gl.uniform1i(at.uProfiles, 0);
  gl.uniform1i(at.uLight, 1);
  gl.uniform3f(at.uHaloColour, ...HALO_COLOUR);
  gl.uniform3f(at.uGround, ...hexChannels(GROUND));

  const blobs = new Float32Array(BLOBS.length * 4);
  const radii = new Float32Array(BLOBS.length * 2);

  return {
    draw(width: number, height: number, cssWidth: number, cssHeight: number, seconds: number, t: LavaTuning) {
      if (gl.isContextLost()) return;

      let changed = false;
      BLOBS.forEach((blob, i) => {
        const placed = placeBlob(blob, seconds, t, cssWidth, cssHeight);
        blobs.set([placed.x, placed.y, placed.unstretchX, placed.unstretchY], i * 4);
        radii.set([placed.outer, placed.body], i * 2);
        if (shown[i] !== placed.profile) {
          shown[i] = placed.profile;
          placed.profile.forEach((value, stop) => (profileBytes[i * PROFILE_STOPS + stop] = Math.round(value * 255)));
          changed = true;
        }
      });
      if (changed) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, profiles);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PROFILE_STOPS, PROFILE_ROWS, gl.ALPHA, gl.UNSIGNED_BYTE, profileBytes);
      }

      const key = [cssWidth, cssHeight, t.rampStart, t.rampDepth, t.lightDrop].join(" ");
      if (key !== lightKey) {
        lightKey = key;
        lightCanvas.width = Math.max(Math.round(cssWidth / 4), 2);
        lightCanvas.height = Math.max(Math.round(cssHeight / 4), 2);
        const ctx = lightCanvas.getContext("2d");
        if (ctx) paintLight(ctx, lights(t), lightCanvas.width, lightCanvas.height);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, light);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lightCanvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }

      const short = Math.min(cssWidth, cssHeight);
      gl.uniform2f(at.uCanvas, width, height);
      gl.uniform1f(at.uScale, width / cssWidth);
      gl.uniform4fv(at.uBlobs, blobs);
      gl.uniform2fv(at.uRadii, radii);
      gl.uniform1f(at.uHaloReference, short * HALO_REFERENCE);
      gl.uniform3f(at.uRimBelow, ...rimColour(t.lightHue));
      gl.uniform3f(at.uRimAbove, ...rimColour(t.topLightHue));
      gl.uniform1f(at.uBlobAlpha, t.blobAlpha);
      gl.uniform1f(at.uGain, t.alphaGain);
      gl.uniform1f(at.uCut, t.cut);
      gl.uniform1f(at.uLift, short * t.lift);
      gl.uniform3f(at.uDensity, ...(DENSITY.map((d) => Math.min(d * t.density, 1)) as [number, number, number]));
      gl.uniform3f(at.uRim, t.rimStrength, t.rimFocus, t.topLight);
      gl.uniform1fv(at.uHalo, HALO_BAND.map((v) => v * t.haloStrength));
      gl.uniform3f(at.uWax, ...rgbChannels(hslToRgb(t.waxHue, t.waxSaturation / 100, t.waxLightness / 100)));
      pass.draw(width, height);
    },
    dispose() {
      gl.deleteTexture(profiles);
      gl.deleteTexture(light);
      pass.dispose();
    },
  };
}

// A light's colour on the rim's pale cream, as 0–1 channels: the filter
// takes them as they are, in its own linear light.
function rimColour(hue: number) {
  return rgbChannels(hslToRgb(hue, RIM_SATURATION, RIM_LIGHTNESS));
}

// "r, g, b" (see hslToRgb) and "#rrggbb", as 0–1 channels.
export function rgbChannels(rgb: string) {
  return rgb.split(",").map((channel) => Number(channel) / 255) as [number, number, number];
}

export function hexChannels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
