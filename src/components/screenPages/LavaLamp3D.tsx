"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BLOBS,
  GROUND,
  LAVA_TUNING,
  LavaLamp,
  hslToRgb,
  lights,
  paintLight,
  poseAt,
  rgbChannels,
} from "./LavaLamp";
import { createPass, webglUsable } from "./webgl";

// The Lava Lamp again, with depth: the same blobs on the same drifts,
// now with a place in depth as well, drifting slowly nearer and further.
// The flat lamp draws a picture of wax; this works out where the wax is.
//
// Each blob is a shape in three dimensions, held as its distance: how far
// any point is from its surface. Two blobs only run together where they
// actually meet, so one passing in front of another stays in front of it,
// a little nearer and a little brighter, rather than merging across the
// depth of the lamp. Where they do meet they are joined smoothly, with a
// fillet whose radius grows with how far they have run into each other:
// two that have just touched have a tight waist between them, and two
// most of the way merged a broad, round one. Nothing reaches out before
// they touch, which is what summed fields (metaballs, as this used to be)
// can't help doing — a pimple growing out of each towards the other.
//
// Wax holds together. Two blobs that have run together and are drifting
// apart don't simply come unstuck: each draws out towards the other, a
// drop hanging on by a thinning neck, until the neck can't hold and they
// let go — and then each springs back, past round into a flattened shape
// and back again, settling over a second or two, as surface tension
// pulls it in. That needs memory of what was joined to what, so it is
// worked out a frame at a time on the CPU (see settle) and handed to the
// shader as each blob's stretch.
//
// Every pixel looks into the lamp along its own line of sight: it finds
// which blobs lie across that line, steps along it from the front by the
// distance to the nearest surface (which can never overshoot one) until
// it arrives, and reads the surface there: which way it faces, from how
// the distance changes around it, and roughly how much wax lies behind it.
// How near the line of sight came to wax it missed is known as well, which
// is what softens the edges and lights the halo around them, evenly all
// round a join as anywhere else. That is enough to light it properly:
// - The bulb is below the vessel. Its light falls off with distance, so
//   wax low in the lamp is hot and wax at the top is in shade, and it
//   reaches round the wax a little past the terminator, as light does
//   into anything translucent.
// - Wax swallows light, blue fastest and red slowest: thick wax runs deep
//   red, thin wax glows, and the edges, where the line of sight crosses
//   least of it, glow most of all.
// - The bulb leaves a highlight on the undersides, a softer light over the
//   top leaves another, and at grazing angles the surface reflects a
//   little of the lit liquid around it.
// - The liquid is not clear: further wax is seen through more of it, so
//   distant blobs sink into its colour and soften at their edges.
//
// The liquid itself — the vessel's dark, its gradient and the bulb's glow
// — is the flat lamp's, painted once into a texture the wax is seen
// against. Where WebGL can't be had (library thumbnails, old sticks, a
// lost context) the flat lamp draws instead, in the same colours.

export const LAVA_3D_TUNING = {
  // A multiplier on every drift's duration: above 1 is slower.
  speed: 1,
  // How round the neck between two blobs gets as they run together: the
  // fillet's radius once they're well merged, as a fraction of the smaller
  // one's.
  merge: 1.5,
  // How far two joined blobs draw out after each other before letting go,
  // as a fraction of the smaller one's radius.
  pinch: 1.08,
  // How hard a blob springs back when it lets go, how long one wobble
  // takes, and how long the wobbling takes to die away (both seconds).
  bounce: 1,
  wobble: 1.4,
  damping: 2,
  // How deep the lamp is, as a fraction of the screen's short side: how
  // far apart in depth the blobs can lie.
  depth: 0,
  // How thick the liquid is: how far distant wax sinks into its colour.
  haze: 0,
  // How soft an edge is, and how much softer it gets in the distance.
  softness: 0.005,
  // The bulb: how strong, how far its light carries (as a fraction of the
  // screen's height), and how far below the bottom edge it sits (percent
  // of the height).
  bulb: 1.3,
  bulbReach: 2,
  lightDrop: 7,
  // How far the light wraps round the wax past the line where it would
  // stop on something opaque.
  wrap: 0.82,
  // How much light thick wax swallows, and how strongly thin wax and
  // edges glow with what gets through.
  absorb: 0,
  glow: 1.05,
  // Light from nowhere in particular, so the shaded tops of blobs aren't
  // black.
  ambient: 0,
  // The highlights: how strong, and how tight (higher is glossier).
  shine: 0.05,
  gloss: 5,
  // The softer light from over the top.
  topLight: 0.05,
  // The glow hot wax throws into the liquid just around it.
  halo: 0.1,
  // How brightly the wax is exposed; past 1 it rolls off rather than
  // clipping.
  exposure: 1.05,
  // The wax's colour.
  waxHue: 348,
  waxSaturation: 100,
  waxLightness: 53,
  // The liquid's darkening towards the top, as the flat lamp's.
  rampDepth: 0.85,
  rampStart: 0.2,
  // How many of the device's pixels the shader works in, and frames a
  // second at most.
  resolution: 0.5,
  fps: 30,
};

export type Lava3DTuning = typeof LAVA_3D_TUNING;

// Where each blob sits in depth, from -1 (the back of the lamp) to 1 (the
// front), and how long its own slow drift in depth takes to go round.
// Spread so that blobs crossing paths are mostly at different depths.
const DEPTHS: { at: number; period: number; phase: number }[] = [
  { at: 0.3, period: 190, phase: 0.4 },
  { at: -0.45, period: 260, phase: 2.1 },
  { at: 0.05, period: 230, phase: 4.0 },
  { at: -0.75, period: 210, phase: 1.3 },
  { at: 0.55, period: 280, phase: 5.2 },
  { at: -0.2, period: 170, phase: 3.3 },
  { at: 0.8, period: 240, phase: 0.9 },
  { at: -0.6, period: 200, phase: 2.7 },
  { at: 0.4, period: 250, phase: 4.6 },
  { at: 0.9, period: 180, phase: 1.8 },
];

// As the flat lamp's: thumbnails draw flat, and no screen draws more than
// 1080 device pixels down its short side.
const MIN_WEBGL_SIDE = 240;
const MAX_SHORT_PX = 1080;

export function LavaLamp3D({
  tuning,
}: {
  now?: () => number;
  tuning?: Partial<Lava3DTuning>;
} = {}) {
  const t = { ...LAVA_3D_TUNING, ...tuning };
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [webglLost, setWebglLost] = useState(false);
  const tuningRef = useRef(t);
  useEffect(() => {
    tuningRef.current = t;
  });
  const litRef = useRef<number | null>(null);

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
  const webgl = !webglLost && short >= MIN_WEBGL_SIDE && webglUsable();
  const pixelScale =
    short > 0
      ? Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_SHORT_PX / short) * t.resolution
      : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!webgl || !canvas || size.width === 0) return;
    canvas.width = Math.max(Math.round(size.width * pixelScale), 1);
    canvas.height = Math.max(Math.round(size.height * pixelScale), 1);
    const shader = createShader(canvas);
    if (!shader) {
      setWebglLost(true);
      return;
    }
    function lost(event: Event) {
      event.preventDefault();
      setWebglLost(true);
    }
    canvas.addEventListener("webglcontextlost", lost);

    litRef.current ??= performance.now();
    const started = litRef.current;
    const { width, height } = size;
    let frame = 0;
    let last = -1;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const tune = tuningRef.current;
      if (last >= 0 && now - last < 1000 / tune.fps - 2) return;
      last = now;
      shader!.draw(canvas!.width, canvas!.height, width, height, (now - started) / 1000, tune);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      shader.dispose();
    };
  }, [webgl, size, pixelScale]);

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden" style={{ background: GROUND }}>
      {short > 0 &&
        (webgl ? (
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
        ) : (
          // The flat lamp, in the same colours and at the same pace.
          <LavaLamp
            renderer="canvas"
            tuning={{
              speed: t.speed,
              waxHue: t.waxHue,
              waxSaturation: t.waxSaturation,
              waxLightness: t.waxLightness,
              rampDepth: t.rampDepth,
              rampStart: t.rampStart,
              lightDrop: t.lightDrop,
            }}
          />
        ))}
    </div>
  );
}

// How many steps a line of sight takes at most. Each is as long as the
// distance to the nearest wax, so a line through empty liquid crosses it
// in a few and only one grazing a surface uses many.
const MARCH_STEPS = 24;

// The blobs as the shader takes them, each in three vec4s: centre and
// radius; the axis it's drawn out along and how far its tip reaches past
// round; and the undoing of its drift's squash, its stretch along the
// axis (the wobble), and the fillet it joins the others with.
const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2 uCanvas;
uniform float uScale;
uniform vec2 uSize;
uniform vec4 uBlobA[${BLOBS.length}];
uniform vec4 uBlobB[${BLOBS.length}];
uniform vec4 uBlobC[${BLOBS.length}];
uniform sampler2D uLiquid;
uniform vec3 uWax;
uniform vec3 uBulb;
uniform vec3 uBulbLight;
uniform float uBulbReach;
// Wrap, absorb, glow, ambient.
uniform vec4 uMaterial;
// Shine, gloss, top light, exposure.
uniform vec4 uShine;
// The lamp's depth (half of it, either side of the middle), haze, edge
// softness and halo width (CSS pixels).
uniform vec4 uDepth;
uniform float uHalo;

// One blob's distance: an ellipsoid (Inigo Quilez's close estimate of
// one), round but for its drift's squash, its wobble along its axis, and a
// tip drawn out on one side, where it hangs on to a blob it's leaving.
// Handed the blob's own three vec4s rather than its index: WebGL only
// promises indexing a uniform array by a loop's own counter.
float blob(vec3 at, vec4 A, vec4 B, vec4 C) {
  vec3 off = at - A.xyz;
  off.xy *= C.xy;
  vec3 axis = B.xyz;
  float along = dot(off, axis);
  float across = length(off - along * axis);
  float r = A.w;
  float stretch = C.z;
  float tip = along > 0.0 ? B.w : 0.0;
  float ra = r * stretch + tip;
  // What it gains in length it loses in girth, near enough.
  float rc = r / sqrt(stretch * (1.0 + 0.5 * B.w / r));
  vec2 q = vec2(along / ra, across / rc);
  float k0 = length(q);
  float k1 = length(vec2(along / (ra * ra), across / (rc * rc)));
  return k0 * (k0 - 1.0) / max(k1, 0.0001);
}

// A smooth minimum: two shapes joined with a fillet of radius k.
float join(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// The wax, as the distance to it, from just the blobs on this line.
//
// The blobs come grouped: each group is blobs joined to one another, in
// the order they're joined, each with the fillet of its own join to the
// group so far; a negative fillet starts the next group. A group's blobs
// are joined smoothly, and the groups only side by side — so a fillet
// grown between two well-merged blobs never reaches out to a third that
// hasn't touched either yet.
float wax(vec3 at, bool on[${BLOBS.length}]) {
  float all = 1e5;
  float group = 1e5;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    if (uBlobC[i].w < 0.0) {
      all = min(all, group);
      group = 1e5;
    }
    if (on[i]) group = join(group, blob(at, uBlobA[i], uBlobB[i], uBlobC[i]), max(uBlobC[i].w, 0.0));
  }
  return min(all, group);
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The flat lamp's vignette, laid over everything last.
vec3 vignette(vec3 srgb, vec2 uv) {
  float t = length((uv - vec2(0.5, 0.48)) / vec2(1.18, 0.86));
  float a = 0.74 * clamp((t - 0.52) / 0.48, 0.0, 1.0);
  return mix(srgb, vec3(6.0, 0.0, 10.0) / 255.0, a);
}

vec3 bulbLight(vec3 at) {
  float reach = length(uBulb - at) / uBulbReach;
  return uBulbLight / (1.0 + reach * reach);
}

void main() {
  vec2 at = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) / uScale;
  vec2 uv = at / uSize;
  vec3 liquid = toLinear(texture2D(uLiquid, uv).rgb);

  // Which blobs could be on this line of sight, near enough to touch it
  // or to light the liquid round it; over what depth; and roughly how much
  // wax the line crosses.
  float haloReach = uDepth.w * 6.0;
  bool on[${BLOBS.length}];
  float front = -1e5;
  float back = 1e5;
  float chord = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec2 off = (at - uBlobA[i].xy) * uBlobC[i].xy;
    float r = uBlobA[i].w;
    float bound = r * 1.3 * max(uBlobC[i].z, 1.0) + uBlobB[i].w + uBlobC[i].w + haloReach;
    float across = dot(off, off);
    on[i] = across < bound * bound;
    if (on[i]) {
      float extent = sqrt(bound * bound - across);
      front = max(front, uBlobA[i].z + extent);
      back = min(back, uBlobA[i].z - extent);
      if (across < r * r) chord += 2.0 * sqrt(r * r - across);
    }
  }
  if (front < back) {
    gl_FragColor = vec4(vignette(toSrgb(liquid), uv), 1.0);
    return;
  }

  // How near this line of sight passes the wax. It runs straight into
  // the screen, so how near it comes to each blob is that blob's distance
  // read at its own depth — exact for a round one — and the blobs' joins
  // apply to those as to the wax itself. Smooth everywhere, joins and all,
  // and no stepping needed to know it: it's what softens the edges and
  // lights the halo.
  // The depth it passes at is each blob's, weighted by how near it passes
  // that blob: taking the nearest one's outright would jump, in a straight
  // line, wherever two are equally near.
  float passes = 1e5;
  float passing = 1e5;
  float weights = 0.0;
  float depths = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    if (uBlobC[i].w < 0.0) {
      passes = min(passes, passing);
      passing = 1e5;
    }
    if (on[i]) {
      float d = blob(vec3(at, uBlobA[i].z), uBlobA[i], uBlobB[i], uBlobC[i]);
      float weight = exp(-max(d, 0.0) / uDepth.w);
      weights += weight;
      depths += weight * uBlobA[i].z;
      passing = join(passing, d, max(uBlobC[i].w, 0.0));
    }
  }
  passes = min(passes, passing);
  float passesZ = weights > 0.0 ? depths / weights : 0.0;

  // Only lines that reach the wax step into it: from the front, each step
  // as long as the distance to the nearest wax, until arriving. One that
  // runs out of steps grazing a surface takes the depth it was passing.
  float z = front;
  float surfaceZ = passesZ;
  if (passes < uDepth.z) {
    for (int s = 0; s < ${MARCH_STEPS}; s++) {
      float d = wax(vec3(at, z), on);
      if (d < 0.2) {
        surfaceZ = z;
        break;
      }
      z -= max(d * 0.9, 0.4);
      if (z < back) break;
    }
  }

  // How far back in the lamp: 0 at the very front, 1 at the back.
  float farness = clamp((uDepth.x - surfaceZ) / (2.0 * uDepth.x), 0.0, 1.0);
  float soft = max(uDepth.z * (1.0 + 3.0 * farness), 1.0 / uScale);
  float cover = 1.0 - smoothstep(-soft, soft, passes);

  // The halo: light scattered into the liquid by hot wax nearby, by how
  // near the line of sight passes it, faded right out before the edge of
  // what this pixel looks at.
  float gone = 1.0 - smoothstep(0.6 * haloReach, haloReach, passes);
  vec3 around = liquid
    + uWax * bulbLight(vec3(at, passesZ)) * uHalo * exp(-max(passes, 0.0) / uDepth.w) * gone * exp(-uDepth.y * farness);

  vec3 colour = around;
  if (cover > 0.0) {
    vec3 point = vec3(at, surfaceZ);
    // Which way the surface faces: how the distance changes around it,
    // sampled at the corners of a small tetrahedron.
    float e = 0.5;
    vec2 k = vec2(1.0, -1.0);
    vec3 normal = normalize(
      k.xyy * wax(point + k.xyy * e, on) + k.yyx * wax(point + k.yyx * e, on) +
      k.yxy * wax(point + k.yxy * e, on) + k.xxx * wax(point + k.xxx * e, on));
    vec3 view = vec3(0.0, 0.0, 1.0);

    vec3 light = bulbLight(point);
    vec3 l = normalize(uBulb - point);
    float thickness = chord / min(uSize.x, uSize.y) * uMaterial.y;
    vec3 swallow = vec3(0.35, 1.0, 1.6);
    vec3 held = exp(-thickness * swallow);
    vec3 thin = exp(-thickness * 0.5 * swallow);

    float wrapped = clamp((dot(normal, l) + uMaterial.x) / (1.0 + uMaterial.x), 0.0, 1.0);
    float grazing = 1.0 - max(normal.z, 0.0);
    vec3 body = uWax * (uMaterial.w + light * wrapped) * held;
    vec3 glow = uWax * light * thin * uMaterial.z * (0.35 + grazing * grazing);
    float bulbShine = pow(max(dot(normal, normalize(l + view)), 0.0), uShine.y) * uShine.x;
    vec3 overhead = normalize(vec3(0.0, -1.0, 0.7));
    float topShine = pow(max(dot(normal, normalize(overhead + view)), 0.0), uShine.y * 0.6) * uShine.z;
    float fresnel = 0.04 + 0.96 * pow(grazing, 5.0);
    vec3 lit = body + glow + light * bulbShine + vec3(0.9, 0.92, 1.0) * topShine + liquid * fresnel * 0.8;
    lit = 1.0 - exp(-lit * uShine.w);
    // Seen through the liquid in front of it.
    lit = mix(lit, liquid, 1.0 - exp(-uDepth.y * farness));
    colour = mix(around, lit, cover);
  }

  gl_FragColor = vec4(vignette(toSrgb(colour), uv), 1.0);
}
`;

// Which blobs are joined, and what each is doing about it: kept from one
// frame to the next, since whether two drifting apart are still holding
// on depends on whether they were joined a moment ago.
type Release = { at: number; axis: [number, number, number]; amount: number };
type Vec3 = [number, number, number];
type Placed = { x: number; y: number; z: number; r: number; axis: Vec3; tip: number };

function createPairs(count: number) {
  // Joined pairs, by "i j" with i < j, and the furthest they've run into
  // each other since joining (their least gap, negative).
  const joined = new Map<string, number>();
  // Each blob's last letting go, for its wobble.
  const released: (Release | null)[] = Array.from({ length: count }, () => null);
  return { joined, released };
}

// One frame of the joins: which pairs are joined, which of those are
// holding on as they drift apart and how far each blob is drawn out by it,
// which let go — and the blobs in the order the shader joins them, with
// each one's fillet to its group (negative: starts a group).
function settle(placed: Placed[], pairs: ReturnType<typeof createPairs>, seconds: number, t: Lava3DTuning) {
  const n = placed.length;
  const keyOf = (i: number, j: number) => `${i} ${j}`;
  const geometry = (i: number, j: number) => {
    const p = placed[i];
    const q = placed[j];
    const d: Vec3 = [q.x - p.x, q.y - p.y, q.z - p.z];
    const apart = Math.hypot(...d) || 1;
    const smaller = Math.min(p.r, q.r);
    return {
      gap: apart - (p.r + q.r),
      smaller,
      // How far apart, past touching, they can drift and still hold on.
      hold: Math.max(t.pinch * smaller, 0.001),
      axis: [d[0] / apart, d[1] / apart, d[2] / apart] as Vec3,
    };
  };

  // Touching joins them; joined, the furthest in they've gone is kept.
  // A blob that joins another stops wobbling: it's part of something now.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const { gap } = geometry(i, j);
      const key = keyOf(i, j);
      const deepest = pairs.joined.get(key);
      if (deepest !== undefined) pairs.joined.set(key, Math.min(deepest, gap));
      else if (gap < 0) {
        pairs.joined.set(key, gap);
        pairs.released[i] = pairs.released[j] = null;
      }
    }
  }

  // Whether i and j are joined some other way than directly — through
  // the rest of the blob they're both part of.
  const linkedWithout = (from: number, to: number, skip: string) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      for (let other = 0; other < n; other++) {
        if (seen.has(other)) continue;
        const key = keyOf(Math.min(at, other), Math.max(at, other));
        if (key === skip || !pairs.joined.has(key)) continue;
        if (other === to) return true;
        seen.add(other);
        queue.push(other);
      }
    }
    return false;
  };

  // Each join, as it stands: a fillet for the shader, and for one that
  // holds two parts together alone, the drawing-out as they part — or the
  // letting go, once they've drifted past holding. A join that isn't all
  // that holds them together just lapses when they drift apart: the blob
  // stays whole, and nothing in it bounces.
  const fillets = new Map<string, number>();
  for (const [key, deepest] of [...pairs.joined]) {
    const [i, j] = key.split(" ").map(Number);
    const { gap, smaller, hold, axis } = geometry(i, j);
    const alone = !linkedWithout(i, j, key);
    if (gap >= hold) {
      pairs.joined.delete(key);
      if (alone) {
        // They let go, each springing back from as far as it was drawn
        // out, which by now is the whole gap between them.
        const share = (r: number) => (gap * r) / (placed[i].r + placed[j].r) / (2 * r);
        pairs.released[i] = { at: seconds, axis, amount: share(placed[i].r) * t.bounce };
        pairs.released[j] = { at: seconds, axis: [-axis[0], -axis[1], -axis[2]], amount: share(placed[j].r) * t.bounce };
      }
      continue;
    }
    // Drawing out begins the moment they start to part, not once they're
    // clear of each other, and is sized to reach right across the gap
    // just as they let go: the neck thins all the way to a thread.
    let drawn = 0;
    if (alone) {
      const parted = Math.max(gap - deepest, 0);
      drawn = (parted * hold) / (hold - deepest);
      const total = placed[i].r + placed[j].r;
      const tipI = (drawn * 2 * placed[i].r) / total / 2;
      const tipJ = (drawn * 2 * placed[j].r) / total / 2;
      if (tipI > placed[i].tip) {
        placed[i].tip = tipI;
        placed[i].axis = axis;
      }
      if (tipJ > placed[j].tip) {
        placed[j].tip = tipJ;
        placed[j].axis = [-axis[0], -axis[1], -axis[2]];
      }
    }
    // The fillet grows from nothing at first touch with how far in they
    // are — counting what they're drawn out by — and so shrinks back to
    // nothing as they part.
    const into = Math.min(Math.max(drawn - gap, 0) / (0.6 * smaller), 1);
    fillets.set(key, t.merge * smaller * into * into * (3 - 2 * into));
  }

  // The order the shader joins them in: a group at a time, starting from
  // its most merged pair, then adding whichever blob has the roundest
  // join to what's there already, with that join's fillet. Every blob
  // then meets its group with the fillet of a join it actually has.
  const order: { index: number; fillet: number }[] = [];
  const done = new Set<number>();
  while (done.size < n) {
    let start = -1;
    let best = -1;
    for (const [key, fillet] of fillets) {
      const [i, j] = key.split(" ").map(Number);
      if (!done.has(i) && !done.has(j) && fillet > best) {
        best = fillet;
        start = i;
      }
    }
    if (start < 0) start = [...Array(n).keys()].find((i) => !done.has(i))!;
    order.push({ index: start, fillet: -1 });
    done.add(start);
    for (;;) {
      let next = -1;
      let fillet = -1;
      for (const [key, value] of fillets) {
        const [i, j] = key.split(" ").map(Number);
        const inside = done.has(i) ? i : done.has(j) ? j : -1;
        const outside = inside === i ? j : i;
        if (inside < 0 || done.has(outside) || !order.some((o) => o.index === inside)) continue;
        if (value > fillet) {
          fillet = value;
          next = outside;
        }
      }
      // Joined pairs whose fillet is still nothing (just touched) are in
      // the group too, with a fillet of nothing.
      if (next < 0) {
        for (const key of pairs.joined.keys()) {
          const [i, j] = key.split(" ").map(Number);
          if (done.has(i) !== done.has(j) && order.some((o) => o.index === (done.has(i) ? i : j))) {
            next = done.has(i) ? j : i;
            fillet = 0;
            break;
          }
        }
      }
      if (next < 0) break;
      order.push({ index: next, fillet: Math.max(fillet, 0) });
      done.add(next);
    }
  }
  return order;
}

function createShader(canvas: HTMLCanvasElement) {
  const pass = createPass(canvas, "Lava Lamp 3D", FRAGMENT, [
    "uCanvas", "uScale", "uSize", "uBlobA", "uBlobB", "uBlobC", "uLiquid", "uWax", "uBulb", "uBulbLight",
    "uBulbReach", "uMaterial", "uShine", "uDepth", "uHalo",
  ] as const);
  if (!pass) return null;
  const { gl, at } = pass;

  // The liquid: the vessel's dark with the flat lamp's light layers over
  // it, all but the vignette, which goes over the wax as well.
  const liquid = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, liquid);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(at.uLiquid, 0);
  const liquidCanvas = document.createElement("canvas");
  let liquidKey = "";

  const n = BLOBS.length;
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  const c = new Float32Array(n * 4);
  const pairs = createPairs(n);

  return {
    draw(width: number, height: number, cssWidth: number, cssHeight: number, seconds: number, t: Lava3DTuning) {
      if (gl.isContextLost()) return;
      const short = Math.min(cssWidth, cssHeight);
      const halfDepth = (short * t.depth) / 2;

      // Where every blob would be on its own.
      const placed = BLOBS.map((blob, i) => {
        const pose = poseAt(blob.motion, (seconds + blob.delay) / (blob.duration * t.speed));
        const squash = Math.sqrt(pose.sx * pose.sy);
        const depth = DEPTHS[i];
        const swing = Math.sin((seconds / (depth.period * t.speed)) * Math.PI * 2 + depth.phase);
        return {
          x: cssWidth * blob.x + pose.x * cssWidth * blob.sway,
          y: cssHeight * blob.y + pose.y * cssHeight * blob.travel * 0.5,
          z: halfDepth * Math.max(-1, Math.min(1, depth.at + 0.2 * swing)),
          r: (short * blob.size * squash) / 2,
          unsquashX: squash / pose.sx,
          unsquashY: squash / pose.sy,
          // What its joins make of it (see settle).
          axis: [0, 0, 1] as Vec3,
          tip: 0,
        };
      });

      const order = settle(placed, pairs, seconds, t);

      order.forEach(({ index, fillet }, slot) => {
        const p = placed[index];
        // The wobble after letting go: drawn out at first, then past round
        // into a flattened shape and back, dying away.
        let stretch = 1;
        const release = pairs.released[index];
        if (release && p.tip === 0) {
          const since = seconds - release.at;
          if (since > t.damping * 6) pairs.released[index] = null;
          else {
            stretch = Math.max(
              0.55,
              1 + release.amount * Math.cos((since / Math.max(t.wobble, 0.05)) * Math.PI * 2) * Math.exp(-since / Math.max(t.damping, 0.05)),
            );
            p.axis = release.axis;
          }
        }
        a.set([p.x, p.y, p.z, p.r], slot * 4);
        b.set([...p.axis, p.tip], slot * 4);
        c.set([p.unsquashX, p.unsquashY, stretch, fillet], slot * 4);
      });

      const key = [cssWidth, cssHeight, t.rampStart, t.rampDepth, t.lightDrop].join(" ");
      if (key !== liquidKey) {
        liquidKey = key;
        liquidCanvas.width = Math.max(Math.round(cssWidth / 4), 2);
        liquidCanvas.height = Math.max(Math.round(cssHeight / 4), 2);
        const ctx = liquidCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = GROUND;
          ctx.fillRect(0, 0, liquidCanvas.width, liquidCanvas.height);
          const layers = lights({ ...LAVA_TUNING, rampStart: t.rampStart, rampDepth: t.rampDepth, lightDrop: t.lightDrop });
          paintLight(ctx, layers.slice(0, -1), liquidCanvas.width, liquidCanvas.height, { over: true });
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, liquid);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, liquidCanvas);
      }

      const wax = rgbChannels(hslToRgb(t.waxHue, t.waxSaturation / 100, t.waxLightness / 100)).map(linear) as [
        number,
        number,
        number,
      ];

      gl.uniform2f(at.uCanvas, width, height);
      gl.uniform1f(at.uScale, width / cssWidth);
      gl.uniform2f(at.uSize, cssWidth, cssHeight);
      gl.uniform4fv(at.uBlobA, a);
      gl.uniform4fv(at.uBlobB, b);
      gl.uniform4fv(at.uBlobC, c);
      gl.uniform3f(at.uWax, ...wax);
      gl.uniform3f(at.uBulb, cssWidth / 2, cssHeight * (1 + t.lightDrop / 100), 0);
      gl.uniform3f(at.uBulbLight, t.bulb, t.bulb * 0.78, t.bulb * 0.5);
      gl.uniform1f(at.uBulbReach, cssHeight * t.bulbReach);
      gl.uniform4f(at.uMaterial, t.wrap, t.absorb, t.glow, t.ambient);
      gl.uniform4f(at.uShine, t.shine, t.gloss, t.topLight, t.exposure);
      gl.uniform4f(at.uDepth, Math.max(halfDepth, 1), t.haze, Math.max(t.softness * short * 0.05, 0.5), short * 0.035);
      gl.uniform1f(at.uHalo, t.halo);
      pass.draw(width, height);
    },
    dispose() {
      gl.deleteTexture(liquid);
      pass.dispose();
    },
  };
}

function linear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
