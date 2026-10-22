"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A cloud of glitter the size of the screen, floating in the dark: a dense
// bed of dim flakes, and every so often one of them catching the light. It
// is meant to be watched the way rain landing on a puddle is — random,
// never rhythmic, and calm because almost all of it is quiet at once.
//
// Nothing here moves a particle. A glint is not a flake travelling, it is a
// flake *turning*: each one has a tilt of its own, there is a light, and a
// flake flashes for the moment its tilt lines up with the reflection of
// that light — a sharp peak in brightness that rises and falls away as the
// flake tumbles through it. So the screen is cut into a grid of cells, one
// flake to a cell at a random spot inside it, and all that changes from
// frame to frame is the angles. That much is a sum per pixel, which is
// what a GPU is for, so the main renderer is a single WebGL fragment
// shader.
//
// The tilts are not spread evenly. Most flakes lie nearly flat, so the
// glints crowd around the one place on the screen where flat flakes
// reflect the light — the hotspot — and thin out away from it. The light
// wanders, slowly, and the hotspot wanders with it; that is the loose,
// rolling coherence real glitter has when it is tilted, and what tells the
// eye this is glitter and not static.
//
// Not every stick can run it. The shader needs full-precision floats,
// which the oldest Fire TV GPUs don't have in a fragment shader, and a
// browser holds only so many WebGL contexts open at once — a library or a
// dashboard full of live thumbnails would run out. So there is a second
// renderer, in plain canvas: the same bed painted once and slid about by
// the compositor, with only the flakes that are glinting drawn each frame.
// It takes over below a size worth a shader, wherever WebGL can't be had,
// and if a context is ever lost.

// The renderers, and which one actually ran — the tuner shows it.
export type GlitterRenderer = "webgl" | "canvas";
export type GlitterStats = { renderer: GlitterRenderer; fps: number };

// Everything worth turning a dial on. The tuner page
// (/screen/glitter-tuner, development only) drives these live against the
// real component; with no tuning passed, these are what the screens show.
export const GLITTER_TUNING = {
  // How big a cell — one flake's room — is, as a fraction of the screen's
  // short side, so a thumbnail and a 4K screen show the same cloud. Never
  // under MIN_CELL_PX, whatever this says.
  cell: 0.0045,
  // WebGL only: how many of the device's pixels the shader works in. The
  // cost is per pixel, so half of them is a quarter of the work; the browser
  // stretches the result back up, which softens each glint into a bloom.
  resolution: 0.5,
  // The share of cells holding a flake at all.
  density: 0.78,
  // How unevenly the flakes are spread: slow patches, thicker and thinner,
  // drifting through the cloud. 0 is even all over.
  clouds: 0.55,
  // How far from flat the flakes lie. Wider spreads the glints out across
  // the whole screen; narrower gathers them round the hotspot.
  spread: 0.5,
  // How much of the screen the hotspot covers: how fast the light's
  // reflection angle changes from one side to the other. Lower is a broader
  // hotspot.
  sweep: 0.5,
  // How exactly a flake has to line up to flash — the width of the
  // reflection, in the same units as the tilts. Smaller is rarer and
  // briefer and sharper.
  sparkle: 0.04,
  // How far each flake tumbles as it floats, and how fast. Tumbling is what
  // carries a flake through its flash, so it decides how long one lasts.
  tumble: 0.1,
  tumbleSpeed: 0.6,
  // How fast the light wanders, and how fast the cloud floats about.
  lightSpeed: 1,
  drift: 1,
  // The dim glitter that is always there, between flashes.
  bed: 0.16,
  // How bright a flash can get, and how rare the bright ones are: each
  // flake's brightest is a power of a random number, so higher leaves most
  // of them faint and only a few strong.
  gain: 3,
  falloff: 2.2,
  // The share of flakes that are holographic: rather than flashing silver,
  // they run through the three colours below as they turn.
  holo: 0.35,
  // The far layer: a second, finer cloud behind the first, at this fraction
  // of its brightness.
  far: 0.5,
  // WebGL only: the big flakes, nearest of all, which bloom and throw a
  // cross of light when they flash — the share of their cells holding one.
  // Fine flakes make the cloud; these are the moments in it.
  big: 0.6,
  // Canvas only: how many glints are born a second, per square of the
  // screen's short side.
  glints: 150,
  // Frames a second, at most. Nothing here moves fast enough to need more,
  // and the headroom is the stick's to keep cool with.
  fps: 30,
  // The colours. The silver is nearly white with a little warmth in it;
  // the holographic flakes run from purple through orange to green.
  silverHue: 40,
  purpleHue: 282,
  orangeHue: 28,
  greenHue: 150,
};

export type GlitterTuning = typeof GLITTER_TUNING;

// A cell under this many pixels holds a flake smaller than one, which
// flickers rather than glints. In the shader it is also as fine as the
// cells go: with the resolution at a half, two of its pixels are four of
// the screen's.
const MIN_CELL_PX = 2;
// Below this short side, in CSS pixels, the canvas renderer draws: nothing
// that small needs a shader, and every thumbnail holding a WebGL context
// would run the browser out of them.
const MIN_WEBGL_SIDE = 240;
// The most device pixels down the short side either renderer works in. A
// 4K screen gets the 1080p cloud stretched up, which at glitter's scale
// does not show and costs a quarter.
const MAX_SHORT_PX = 1080;
// The vessel, near black and a little cool.
const GROUND = "#060509";
const GROUND_RGB = [6 / 255, 5 / 255, 9 / 255] as const;
// How far the hotspot wanders from the middle, in short sides.
const HOTSPOT_WANDER = 0.5;
// How far each layer floats from where it started, in short sides — a slow
// loop around and back, never off in one direction, so the numbers the
// shader works with never grow. The far one moves less: it is further away.
const NEAR_DRIFT = 0.22;
const FAR_DRIFT = 0.13;
// The slow warp laid over the drift, so the cloud eddies rather than
// sliding as one sheet: how far it pushes, and over what distance it turns,
// both in short sides.
const SWIRL_AMOUNT = 0.025;
const SWIRL_LENGTH = 0.9;
// The size of the thick and thin patches, in short sides.
const CLOUD_LENGTH = 0.7;
// The far layer's cells, and the big flakes', against the near one's. A
// whole number for the big ones, so their cells stay whole pixels too.
const FAR_CELL = 0.7;
const BIG_CELL = 10;

export function Glitter({
  tuning,
  renderer = "auto",
  onStats,
}: {
  now?: () => number;
  tuning?: Partial<GlitterTuning>;
  // The tuner can hold the canvas renderer on, to compare the two.
  renderer?: "auto" | "canvas";
  onStats?: (stats: GlitterStats) => void;
} = {}) {
  const t = { ...GLITTER_TUNING, ...tuning };
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nearBedRef = useRef<HTMLDivElement>(null);
  const farBedRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [webglLost, setWebglLost] = useState(false);

  // The loops read the dials from here rather than restarting on every
  // change, so moving a slider doesn't throw the cloud back to the start.
  const tuningRef = useRef(t);
  const statsRef = useRef(onStats);
  useEffect(() => {
    tuningRef.current = t;
    statsRef.current = onStats;
  });

  // Measured, like the lamp and the clock: a kiosk browser on an old stick
  // may not have container query units, and this has to look right in a
  // library thumbnail as well as on a 4K screen.
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

  const short = Math.min(size.width, size.height);
  const mode: GlitterRenderer =
    renderer === "auto" && !webglLost && short >= MIN_WEBGL_SIDE && webglUsable() ? "webgl" : "canvas";
  // Device pixels per CSS pixel, held under MAX_SHORT_PX down the short side.
  const deviceScale =
    short > 0 ? Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_SHORT_PX / short) : 1;
  const pixelScale = mode === "webgl" ? deviceScale * t.resolution : deviceScale;

  // The shader: one full-screen triangle, redrawn each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode !== "webgl" || !canvas || size.width === 0) return;
    canvas.width = Math.max(Math.round(size.width * pixelScale), 1);
    canvas.height = Math.max(Math.round(size.height * pixelScale), 1);
    const shader = createShader(canvas);
    if (!shader) {
      setWebglLost(true);
      return;
    }
    // A lost context is a stick short of memory, or a browser with too
    // many open; either way the canvas renderer carries on in its place.
    function lost(event: Event) {
      event.preventDefault();
      setWebglLost(true);
    }
    canvas.addEventListener("webglcontextlost", lost);

    const width = canvas.width;
    const height = canvas.height;
    const shortPx = Math.min(width, height);
    const stop = runFrames(tuningRef, statsRef, "webgl", (clock, tune) => {
      shader.draw(width, height, shortPx, wholeCell(tune.cell * shortPx), clock, tune);
    });
    return () => {
      stop();
      canvas.removeEventListener("webglcontextlost", lost);
      shader.dispose();
    };
  }, [mode, size.width, size.height, pixelScale]);

  // The canvas renderer's beds: a tile of dim flakes painted once per
  // layer, repeated across a box a tile larger than the screen and slid
  // about inside it by the loop below. Moving a layer is the compositor's
  // work alone; nothing is painted again.
  const bedTuning = [t.cell, t.density, t.bed, t.holo, t.far, t.silverHue, t.purpleHue, t.orangeHue, t.greenHue];
  const bedKey = bedTuning.join(" ");
  useEffect(() => {
    if (mode !== "canvas" || short === 0) return;
    const urls: string[] = [];
    let cancelled = false;
    const tune = tuningRef.current;
    const cssCell = Math.max(tune.cell * short, MIN_CELL_PX / pixelScale);
    for (const [ref, far] of [
      [nearBedRef, false],
      [farBedRef, true],
    ] as const) {
      const tile = paintBed(BED_TILE * pixelScale, cssCell * pixelScale * (far ? FAR_CELL : 1), far, tune);
      tile.toBlob((blob) => {
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        if (ref.current) ref.current.style.backgroundImage = `url(${url})`;
      });
    }
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // bedKey stands for every dial the tiles are painted from.
  }, [mode, short, pixelScale, bedKey]);

  // The canvas renderer's glints, and the beds' drift.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode !== "canvas" || !canvas || size.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = Math.max(Math.round(size.width * pixelScale), 1);
    canvas.height = Math.max(Math.round(size.height * pixelScale), 1);
    const glints = createGlints(context, canvas.width, canvas.height);
    const stop = runFrames(tuningRef, statsRef, "canvas", (clock, tune, step) => {
      const shortCss = Math.min(size.width, size.height);
      const near = clock.drift(NEAR_DRIFT, 0);
      const far = clock.drift(FAR_DRIFT, 1);
      slide(nearBedRef.current, near[0] * shortCss, near[1] * shortCss);
      slide(farBedRef.current, far[0] * shortCss, far[1] * shortCss);
      glints.frame(clock, tune, step, near, far);
    });
    return () => {
      stop();
      glints.dispose();
    };
  }, [mode, size.width, size.height, pixelScale]);

  const bedStyle = {
    width: size.width + BED_TILE,
    height: size.height + BED_TILE,
    backgroundSize: `${BED_TILE}px ${BED_TILE}px`,
    willChange: "transform",
  };

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
      {short > 0 && mode === "canvas" && (
        <>
          <div ref={farBedRef} className="pointer-events-none absolute left-0 top-0" style={bedStyle} />
          <div ref={nearBedRef} className="pointer-events-none absolute left-0 top-0" style={bedStyle} />
          {/* The shader darkens its own corners; the canvas renderer has
              them darkened over the top, once. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(120% 90% at 50% 50%, rgba(0, 0, 0, 0) 45%, rgba(3, 2, 6, 0.6) 100%)" }}
          />
        </>
      )}
      {short > 0 && (
        // A fresh element for each renderer: a canvas that has given out one
        // kind of context won't give out the other.
        <canvas
          key={mode}
          ref={canvasRef}
          className="absolute left-0 top-0 block h-full w-full"
          style={{ zIndex: 1 }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The clock both renderers keep. Each motion runs on its own, advanced by
// the frame's time at its own dial's speed rather than read off the time
// since start: moving a speed dial then changes how fast things go from
// here on, instead of jumping everything to where the new speed says it
// would have been by now.

type Clock = {
  light: number;
  tumble: number;
  float: number;
  // Where the hotspot is, from the middle, in short sides.
  hotspot(): [number, number];
  // How far a layer has floated, in short sides.
  drift(amount: number, layer: number): [number, number];
};

function createClock(): Clock {
  return {
    light: 0,
    tumble: 0,
    float: 0,
    hotspot() {
      return [HOTSPOT_WANDER * Math.sin(this.light * 0.029 + 0.4), HOTSPOT_WANDER * Math.sin(this.light * 0.019 + 2.1)];
    },
    drift(amount, layer) {
      // Each layer on its own pair of slow, unrelated periods — nine to
      // fifteen minutes round — so the two never line up into one motion.
      const [fx, fy, phase] = layer === 0 ? [0.011, 0.0083, 1] : [0.0091, 0.0127, 2.6];
      return [amount * Math.sin(this.float * fx), amount * Math.sin(this.float * fy + phase)];
    },
  };
}

// The frame loop, held to the fps dial, reporting the rate it actually
// manages once a second. A frame after a long gap — a hidden tab, a busy
// stick — moves the clock on by a quarter of a second at most, so nothing
// lurches to catch up.
function runFrames(
  tuningRef: { current: GlitterTuning },
  statsRef: { current: ((stats: GlitterStats) => void) | undefined },
  renderer: GlitterRenderer,
  paint: (clock: Clock, tuning: GlitterTuning, step: number) => void,
) {
  const clock = createClock();
  let frame = 0;
  let last = -1;
  let counted = 0;
  let countedSince = -1;

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const tune = tuningRef.current;
    if (last >= 0 && now - last < 1000 / tune.fps - 2) return;
    const step = last < 0 ? 0 : Math.min((now - last) / 1000, 0.25);
    last = now;
    clock.light += step * tune.lightSpeed;
    clock.tumble += step * tune.tumbleSpeed;
    clock.float += step * tune.drift;
    paint(clock, tune, step);

    counted++;
    if (countedSince < 0) countedSince = now;
    if (now - countedSince >= 1000) {
      statsRef.current?.({ renderer, fps: Math.round((counted * 1000) / (now - countedSince)) });
      counted = 0;
      countedSince = now;
    }
  }

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// The shader.

// Whether this browser can run the shader at all, found out once with a
// throwaway context and given straight back. It needs highp floats in the
// fragment shader — the cell hashes and the positions inside each cell are
// garbage at half precision — and it asks the browser to refuse outright
// rather than fall back on drawing WebGL in software, which on a stick
// would be far slower than the canvas renderer.
let webglVerdict: boolean | undefined;

function webglUsable() {
  if (webglVerdict !== undefined) return webglVerdict;
  if (typeof document === "undefined") return false;
  const gl = getWebgl(document.createElement("canvas"));
  const high = gl?.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  webglVerdict = !!high && high.precision >= 23;
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return webglVerdict;
}

function getWebgl(canvas: HTMLCanvasElement) {
  const options: WebGLContextAttributes = {
    // Opaque: the shader paints the ground itself, and an opaque canvas
    // composites as a plain copy rather than a blend.
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: "low-power",
  };
  return (canvas.getContext("webgl", options) ??
    canvas.getContext("experimental-webgl", options)) as WebGLRenderingContext | null;
}

const VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Every pixel works out which cell it is in, and from the cell's own hash
// everything about the flake there: whether there is one, where in the cell
// it sits, how big, how it is tilted, how bright it can get, and whether it
// is silver or holographic. Then how near its tilt is to the reflection of
// the light at that point on the screen, and that nearness, through a
// Gaussian, is the glint. Three layers of it — near, far, and a few big
// flakes nearer still — and the sum
// rolled off softly into the ground so the brightest flashes bloom white
// instead of clipping.
const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
// Near cell, far cell, and one over the short side, all in pixels.
uniform vec3 uCell;
// The reflection's tilt at the middle of the screen, and how fast it
// changes across it.
uniform vec2 uLight;
uniform float uSweep;
// Three slow oscillations every flake's tumble is a mix of.
uniform vec2 uTumble1;
uniform vec2 uTumble2;
uniform vec2 uTumble3;
// Near layer's drift, far layer's drift, in pixels.
uniform vec4 uDrift;
// Swirl: two phases, how far it pushes, how fast it turns over distance.
uniform vec4 uSwirl;
// Clouds: two phases, how much, how fast they turn over distance.
uniform vec4 uClouds;
// Density, spread, tumble, sharpness (one over the reflection's width,
// squared).
uniform vec4 uFlake;
// Bed, gain, falloff, holographic share.
uniform vec4 uShine;
// Far layer's brightness; big layer's density.
uniform float uFar;
uniform float uBig;
uniform vec3 uGround;
uniform vec3 uSilver;
uniform vec3 uPurple;
uniform vec3 uOrange;
uniform vec3 uGreen;

// Four random numbers from four, after Dave Hoskins' "Hash without Sine":
// no sin(), so no dependence on how a GPU happens to reduce large angles.
vec4 hash44(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.xxyz + p.yzzw) * p.zywx);
}

// One layer of flakes. A big layer's cells are wide enough to hold a
// flash's bloom and its cross of light inside them, which a fine one's —
// a pixel or two across — can't.
vec3 flakes(vec2 at, vec2 screen, float cell, float seed, float density, float big) {
  vec2 inCells = at / cell;
  vec2 id = floor(inCells);
  vec2 inCell = inCells - id;

  // Thicker and thinner patches. The threshold a flake has to beat moves
  // with them, so at a patch's edge flakes fade in and out — softly, over
  // the last stretch of the threshold — rather than blinking.
  vec2 centre = (id + 0.5) * cell;
  float patch = 0.5 + 0.5 * sin(centre.x * uClouds.w + uClouds.x) * sin(centre.y * uClouds.w * 0.83 + uClouds.y);
  float keep = density * mix(1.0, patch, uClouds.z);
  vec4 a = hash44(vec4(id, seed, 1.0));
  if (a.x > keep) return vec3(0.0);
  float present = clamp((keep - a.x) * 12.0, 0.0, 1.0);

  vec4 b = hash44(vec4(id, seed, 2.0));
  vec4 c = hash44(vec4(id, seed, 3.0));
  vec4 d = hash44(vec4(id, seed, 4.0));

  // The tilt: two uniform numbers summed make a triangle, which keeps most
  // flakes near flat and none far over. Then the tumble, each flake its own
  // mix of the same three slow swings.
  vec2 tilt = (b.xy + b.zw - 1.0) * uFlake.y
    + uFlake.z * ((c.x * 2.0 - 1.0) * uTumble1 + (c.y * 2.0 - 1.0) * uTumble2 + (c.z * 2.0 - 1.0) * uTumble3);
  vec2 miss = tilt - (uLight + screen * uSweep);
  float off = dot(miss, miss) * uFlake.w;
  float glint = exp(-off);
  // The same reflection, far wider: the soft sheen the hotspot puts on
  // the whole bed around it.
  float sheen = exp(-off * 0.015);
  // The big ones are close, and close flakes are the bright ones.
  float peak = 0.08 + 0.92 * pow(c.w, uShine.z * mix(1.0, 0.5, big));
  float shine = glint * peak;

  vec3 tint = uSilver;
  if (d.x < uShine.w) {
    // Holographic: the colour follows which side of the reflection the
    // flake is on, so one flake runs through two of them as it turns.
    float angle = d.y * 6.2832;
    float side = dot(miss, vec2(cos(angle), sin(angle))) * sqrt(uFlake.w) * 0.5 + (d.z - 0.5);
    tint = side < 0.0 ? mix(uOrange, uPurple, min(-side, 1.0)) : mix(uOrange, uGreen, min(side, 1.0));
  }

  // A flake swells a little as it flashes, which is how a bright point
  // looks to an eye or a lens. It is drawn as a soft spot, never narrower
  // than about a pixel: a flake smaller than one falls between the points
  // the pixels are read at and goes missing, or blinks as it drifts across
  // them. Measured in pixels, since that is what it must not fall below.
  float radius = mix(0.24, 0.36, a.y) * mix(1.0, 0.15, big) * cell * (0.8 + 0.45 * shine);
  vec2 spot = 0.5 + (a.zw - 0.5) * mix(0.4, 0.24, big);
  vec2 fromSpot = (inCell - spot) * cell;
  float cover = exp(-dot(fromSpot, fromSpot) / (radius * radius + 0.3));
  float light = cover;
  if (big > 0.0) {
    // A soft bloom round the flash, and a faint cross through it, which
    // grows faster than the flash does, so only the strongest throw one.
    // Both fall to nothing inside the cell, since nothing outside it is
    // looked at.
    float bloom = exp(-dot(fromSpot, fromSpot) / (radius * radius * 2.0 + 3.0));
    vec2 along = abs(fromSpot);
    vec2 fade = 1.0 - smoothstep(0.16 * cell, 0.36 * cell, along);
    float reach = 0.11 * cell;
    float rays = exp(-along.x / reach - along.y * along.y * 2.0) * fade.x
      + exp(-along.y / reach - along.x * along.x * 2.0) * fade.y;
    light += 0.3 * bloom + shine * rays;
  }

  // The dim bed fills a fine cell rather than sitting in it as a dot: at a
  // pixel or two it is grain, not points, and dots on a grid that fine
  // read as the grid. A big flake's bed is its own spot.
  vec3 bed = uShine.x * (0.35 + 0.65 * c.w) * (0.3 + 0.7 * sheen) * mix(uSilver, tint, 0.5) * mix(0.5, cover, big);
  vec3 flash = shine * uShine.y * mix(tint, vec3(1.0), glint * glint * 0.4) * light;
  return (bed + flash) * present;
}

void main() {
  vec2 at = gl_FragCoord.xy;
  vec2 screen = (at - 0.5 * uResolution) * uCell.z;
  vec2 swirl = uSwirl.z * vec2(sin(at.y * uSwirl.w + uSwirl.x), sin(at.x * uSwirl.w + uSwirl.y));
  // The big flakes are the nearest, so they float furthest: parallax.
  vec3 glitter = flakes(at + swirl + uDrift.xy, screen, uCell.x, 0.0, uFlake.x, 0.0)
    + uFar * flakes(at + swirl * 0.6 + uDrift.zw, screen, uCell.y, 17.0, uFlake.x, 0.0)
    + flakes(at + swirl * 1.4 + uDrift.xy * 1.4, screen, uCell.x * ${BIG_CELL}.0, 31.0, uBig, 1.0);
  float vignette = 1.0 - 0.55 * smoothstep(0.35, 1.0, length(screen * vec2(0.85, 1.1)));
  gl_FragColor = vec4(uGround + (1.0 - uGround) * (1.0 - exp(-glitter * vignette)), 1.0);
}
`;

function createShader(canvas: HTMLCanvasElement) {
  const gl = getWebgl(canvas);
  if (!gl) return null;
  const program = gl.createProgram();
  const parts = [compile(gl, gl.VERTEX_SHADER, VERTEX), compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)];
  if (!program || parts.some((part) => !part)) return null;
  for (const part of parts) gl.attachShader(program, part!);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Glitter: shader didn't link", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // One triangle twice the screen's size covers all of it, with no seam
  // down a diagonal for two triangles to meet along.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const names = [
    "uResolution", "uCell", "uLight", "uSweep", "uTumble1", "uTumble2", "uTumble3", "uDrift", "uSwirl",
    "uClouds", "uFlake", "uShine", "uFar", "uBig", "uGround", "uSilver", "uPurple", "uOrange", "uGreen",
  ] as const;
  const at = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    (typeof names)[number],
    WebGLUniformLocation | null
  >;

  return {
    draw(width: number, height: number, shortPx: number, cell: number, clock: Clock, tune: GlitterTuning) {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(at.uResolution, width, height);
      gl.uniform3f(at.uCell, cell, wholeCell(cell * FAR_CELL), 1 / shortPx);
      // The hotspot is where a flat flake reflects the light, which is
      // where the reflection's tilt comes to nothing: the light's tilt in
      // the middle is the hotspot's offset times the sweep, turned round.
      const [hx, hy] = clock.hotspot();
      gl.uniform2f(at.uLight, -hx * tune.sweep, -hy * tune.sweep);
      gl.uniform1f(at.uSweep, tune.sweep);
      // Unrelated rates on each axis of each swing, between about seven and
      // sixteen seconds round, so no two flakes ever settle into step.
      const s = clock.tumble;
      gl.uniform2f(at.uTumble1, Math.sin(s * 0.41), Math.sin(s * 0.53 + 1.1));
      gl.uniform2f(at.uTumble2, Math.sin(s * 0.67 + 2.3), Math.sin(s * 0.79 + 0.4));
      gl.uniform2f(at.uTumble3, Math.sin(s * 0.93 + 4.2), Math.sin(s * 0.61 + 3.1));
      const near = clock.drift(NEAR_DRIFT, 0);
      const far = clock.drift(FAR_DRIFT, 1);
      gl.uniform4f(at.uDrift, near[0] * shortPx, near[1] * shortPx, far[0] * shortPx, far[1] * shortPx);
      const f = clock.float;
      gl.uniform4f(
        at.uSwirl,
        (f * 0.09) % (Math.PI * 2),
        (f * 0.07 + 1.7) % (Math.PI * 2),
        SWIRL_AMOUNT * shortPx,
        (Math.PI * 2) / (SWIRL_LENGTH * shortPx),
      );
      gl.uniform4f(
        at.uClouds,
        (f * 0.031) % (Math.PI * 2),
        (f * 0.023 + 0.8) % (Math.PI * 2),
        tune.clouds,
        (Math.PI * 2) / (CLOUD_LENGTH * shortPx),
      );
      gl.uniform4f(at.uFlake, tune.density, tune.spread, tune.tumble, 1 / (tune.sparkle * tune.sparkle));
      gl.uniform4f(at.uShine, tune.bed, tune.gain, tune.falloff, tune.holo);
      gl.uniform1f(at.uFar, tune.far);
      gl.uniform1f(at.uBig, tune.big);
      gl.uniform3f(at.uGround, ...GROUND_RGB);
      const palette = colours(tune);
      gl.uniform3f(at.uSilver, ...palette[0]);
      gl.uniform3f(at.uPurple, ...palette[1]);
      gl.uniform3f(at.uOrange, ...palette[2]);
      gl.uniform3f(at.uGreen, ...palette[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      parts.forEach((part) => gl.deleteShader(part));
    },
  };
}

// Cells come in whole pixels. One a fraction over a pixel wide puts every
// pixel at a different point in its cell, and the bed beats against the
// pixel grid in faint stripes.
function wholeCell(px: number) {
  return Math.max(Math.round(px), MIN_CELL_PX);
}

function compile(gl: WebGLRenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Glitter: shader didn't compile", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

// ---------------------------------------------------------------------------
// The canvas renderer.

// One bed tile's side, in CSS pixels. It repeats, but at this size and
// under a few thousand random flakes the repeat doesn't show.
const BED_TILE = 256;

// A tile of the dim bed, its flakes scattered one to a cell like the
// shader's, so the two renderers show the same grain.
function paintBed(side: number, cell: number, far: boolean, tune: GlitterTuning) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = Math.round(side);
  const ctx = tile.getContext("2d");
  if (!ctx) return tile;
  const palette = colours(tune).map(([r, g, b]) => `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`);
  const cells = Math.max(Math.round(side / cell), 1);
  const step = tile.width / cells;
  const brightness = tune.bed * (far ? tune.far : 1) * 1.1;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (Math.random() > tune.density) continue;
      const holo = Math.random() < tune.holo;
      const colour = holo ? palette[1 + Math.floor(Math.random() * 3)] : palette[0];
      ctx.fillStyle = `rgba(${colour}, ${Math.min(brightness * (0.35 + 0.65 * Math.random()), 1)})`;
      const dot = Math.max(step * 0.36, 1);
      ctx.fillRect((x + 0.26 + Math.random() * 0.48) * step - dot / 2, (y + 0.26 + Math.random() * 0.48) * step - dot / 2, dot, dot);
    }
  }
  return tile;
}

function slide(layer: HTMLDivElement | null, x: number, y: number) {
  if (!layer) return;
  // The bed repeats every tile, so only the drift's remainder over one
  // matters — and the box is a tile larger than the screen to cover it.
  const dx = ((x % BED_TILE) + BED_TILE) % BED_TILE;
  const dy = ((y % BED_TILE) + BED_TILE) % BED_TILE;
  layer.style.transform = `translate3d(${-dx}px, ${-dy}px, 0)`;
}

type Glint = {
  // Where on its bed, in canvas pixels — it floats with the bed under it.
  x: number;
  y: number;
  far: boolean;
  born: number;
  life: number;
  peak: number;
  // Palette entries it starts and ends on; the same for a silver one.
  from: number;
  to: number;
};

// Glints, born at random and drawn only while they last. Each is a
// pre-drawn sprite, tinted once per colour up front, so a frame is a
// clear and a few dozen to a few hundred copies of small images.
function createGlints(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const shortPx = Math.min(width, height);
  let live: Glint[] = [];
  let age = 0;
  let sprites: HTMLCanvasElement[] = [];
  let paletteKey = "";
  const star = paintStar();

  return {
    frame(clock: Clock, tune: GlitterTuning, step: number, near: [number, number], far: [number, number]) {
      const key = [tune.silverHue, tune.purpleHue, tune.orangeHue, tune.greenHue].join(" ");
      if (key !== paletteKey) {
        paletteKey = key;
        sprites = colours(tune).map(paintSprite);
      }
      age += step;

      // How many are born this frame: a Poisson draw, which is what makes
      // the timing random rather than merely irregular.
      const expected = tune.glints * ((width * height) / (shortPx * shortPx)) * step * (tune.sparkle / 0.04);
      const [hx, hy] = clock.hotspot();
      for (let born = poisson(expected); born > 0; born--) {
        const farLayer = Math.random() < 0.3;
        // Half anywhere, half crowded round the hotspot, as the shader's
        // tilts crowd them.
        let x = Math.random() * width;
        let y = Math.random() * height;
        if (Math.random() < 0.5) {
          const [gx, gy] = gaussianPair();
          x = width / 2 + (hx + gx * 0.35) * shortPx;
          y = height / 2 + (hy + gy * 0.35) * shortPx;
        }
        const [dx, dy] = farLayer ? far : near;
        const holo = Math.random() < tune.holo;
        const from = holo ? 1 + Math.floor(Math.random() * 3) : 0;
        live.push({
          x: x + dx * shortPx,
          y: y + dy * shortPx,
          far: farLayer,
          born: age,
          life: (0.35 + Math.random() * 0.8) / Math.max(tune.tumbleSpeed, 0.05),
          peak: 0.08 + 0.92 * Math.random() ** tune.falloff,
          from,
          // Purple, orange, green run in that order, so a flake goes to its
          // neighbour, as a film's colours do.
          to: holo ? (from === 2 ? (Math.random() < 0.5 ? 1 : 3) : 2) : 0,
        });
      }
      live = live.filter((glint) => age - glint.born < glint.life);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      const cell = Math.max(tune.cell * shortPx, MIN_CELL_PX);
      for (const glint of live) {
        const through = (age - glint.born) / glint.life;
        const shine = Math.exp(-(((through - 0.5) * 4) ** 2));
        const strength = Math.min(shine * glint.peak * tune.gain * 0.33 * (glint.far ? tune.far : 1), 1);
        const [dx, dy] = glint.far ? far : near;
        const x = glint.x - dx * shortPx;
        const y = glint.y - dy * shortPx;
        const size = cell * 4 * (glint.far ? FAR_CELL : 1) * (0.6 + 0.6 * shine);
        const blend = (1 - Math.cos(Math.PI * through)) / 2;
        ctx.globalAlpha = strength * (1 - blend);
        ctx.drawImage(sprites[glint.from], x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = strength * blend;
        ctx.drawImage(sprites[glint.to], x - size / 2, y - size / 2, size, size);
        // The strongest few throw a faint cross of light, as a bright point
        // does through an eye's lashes or a lens.
        if (glint.peak > 0.9 && !glint.far) {
          ctx.globalAlpha = strength * 0.35;
          ctx.drawImage(star, x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2);
        }
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      live = [];
      ctx.clearRect(0, 0, width, height);
    },
  };
}

const SPRITE = 32;

// A bright point: a white-hot core in its colour's halo.
function paintSprite([r, g, b]: [number, number, number]) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = SPRITE;
  const ctx = sprite.getContext("2d")!;
  const colour = `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`;
  const gradient = ctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.14, `rgba(${colour}, 0.9)`);
  gradient.addColorStop(0.4, `rgba(${colour}, 0.22)`);
  gradient.addColorStop(1, `rgba(${colour}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return sprite;
}

function paintStar() {
  const side = SPRITE * 2;
  const star = document.createElement("canvas");
  star.width = star.height = side;
  const ctx = star.getContext("2d")!;
  for (const across of [true, false]) {
    const gradient = across
      ? ctx.createLinearGradient(0, 0, side, 0)
      : ctx.createLinearGradient(0, 0, 0, side);
    gradient.addColorStop(0, "rgba(255, 246, 230, 0)");
    gradient.addColorStop(0.5, "rgba(255, 246, 230, 0.8)");
    gradient.addColorStop(1, "rgba(255, 246, 230, 0)");
    ctx.fillStyle = gradient;
    if (across) ctx.fillRect(0, side / 2 - 0.75, side, 1.5);
    else ctx.fillRect(side / 2 - 0.75, 0, 1.5, side);
  }
  return star;
}

function poisson(expected: number) {
  const limit = Math.exp(-expected);
  let count = 0;
  let product = Math.random();
  while (product > limit) {
    count++;
    product *= Math.random();
  }
  return count;
}

function gaussianPair(): [number, number] {
  const radius = Math.sqrt(-2 * Math.log(1 - Math.random()));
  const angle = Math.random() * Math.PI * 2;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

// ---------------------------------------------------------------------------

// Silver, purple, orange, green, as 0–1 channels. The saturations and
// lightnesses are fixed: the silver nearly white, the holographic colours
// strong but light, as a thin film's are.
function colours(tune: GlitterTuning): [number, number, number][] {
  return [
    hsl(tune.silverHue, 0.3, 0.88),
    hsl(tune.purpleHue, 0.85, 0.66),
    hsl(tune.orangeHue, 0.95, 0.6),
    hsl(tune.greenHue, 0.7, 0.55),
  ];
}

function hsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
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
  return [r + base, g + base, b + base];
}
