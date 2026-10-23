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
// Each blob is a ball of influence in three dimensions, as metaballs are:
// a smooth bump that falls to nothing at its edge, summed with its
// neighbours', and the wax is wherever the sum passes a threshold. Two
// blobs only run together where they actually meet, so one passing in
// front of another stays in front of it, a little nearer and a little
// brighter, rather than merging across the depth of the lamp.
//
// Every pixel looks into the lamp along its own line of sight: it finds
// which blobs lie across that line, steps along it from the front until
// the sum first passes the threshold — the surface — and reads the surface
// there: which way it faces, from the sum's slope, and how much wax lies
// behind it, which the bumps' shape gives in closed form. That is enough
// to light it properly:
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
  // How far past its own size each blob's pull reaches, as a fraction of
  // its radius: how readily two run together, and how thick the neck
  // between them is.
  merge: 0.7,
  // How deep the lamp is, as a fraction of the screen's short side: how
  // far apart in depth the blobs can lie.
  depth: 0.35,
  // How thick the liquid is: how far distant wax sinks into its colour.
  haze: 1.4,
  // How soft an edge is, and how much softer it gets in the distance.
  softness: 0.05,
  // The bulb: how strong, how far its light carries (as a fraction of the
  // screen's height), and how far below the bottom edge it sits (percent
  // of the height).
  bulb: 4.5,
  bulbReach: 0.42,
  lightDrop: 10,
  // How far the light wraps round the wax past the line where it would
  // stop on something opaque.
  wrap: 0.5,
  // How much light thick wax swallows, and how strongly thin wax and
  // edges glow with what gets through.
  absorb: 4,
  glow: 0.9,
  // Light from nowhere in particular, so the shaded tops of blobs aren't
  // black.
  ambient: 0.04,
  // The highlights: how strong, and how tight (higher is glossier).
  shine: 0.12,
  gloss: 30,
  // The softer light from over the top.
  topLight: 0,
  // The glow hot wax throws into the liquid just around it.
  halo: 0.35,
  // How brightly the wax is exposed; past 1 it rolls off rather than
  // clipping.
  exposure: 1.25,
  // The wax's colour, as the flat lamp has it.
  waxHue: LAVA_TUNING.waxHue,
  waxSaturation: LAVA_TUNING.waxSaturation,
  waxLightness: LAVA_TUNING.waxLightness,
  // The liquid's darkening towards the top, as the flat lamp's.
  rampDepth: LAVA_TUNING.rampDepth,
  rampStart: LAVA_TUNING.rampStart,
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

// How many steps a line of sight takes through the wax it crosses before
// narrowing in on the surface, and how many it narrows in by. The steps
// only span the depth of the blobs actually on that line, so a few do.
const MARCH_STEPS = 14;
const REFINE_STEPS = 5;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2 uCanvas;
uniform float uScale;
uniform vec2 uSize;
// Each blob: its centre (CSS pixels across and down, and in depth, nearer
// being larger), and how far its pull reaches.
uniform vec4 uBlobs[${BLOBS.length}];
// How much to undo each blob's drift stretch by, across and down.
uniform vec2 uShape[${BLOBS.length}];
uniform sampler2D uLiquid;
uniform float uThreshold;
uniform vec3 uWax;
uniform vec3 uBulb;
uniform vec3 uBulbLight;
uniform float uBulbReach;
// Wrap, absorb, glow, ambient.
uniform vec4 uMaterial;
// Shine, gloss, top light, exposure.
uniform vec4 uShine;
// The lamp's depth (half of it, either side of the middle), haze,
// softness, and the halo round the wax.
uniform vec4 uDepth;

float field(vec3 at) {
  float sum = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec3 off = vec3((at.xy - uBlobs[i].xy) * uShape[i], at.z - uBlobs[i].z);
    float q = dot(off, off) / (uBlobs[i].w * uBlobs[i].w);
    if (q < 1.0) {
      float k = 1.0 - q;
      sum += k * k * k;
    }
  }
  return sum;
}

// The sum's slope, worked out exactly: it points into the wax, so the
// surface faces the other way.
vec3 slope(vec3 at) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec3 off = vec3((at.xy - uBlobs[i].xy) * uShape[i], at.z - uBlobs[i].z);
    float r2 = uBlobs[i].w * uBlobs[i].w;
    float q = dot(off, off) / r2;
    if (q < 1.0) {
      float k = 1.0 - q;
      g -= 6.0 * k * k * vec3(off.xy * uShape[i], off.z) / r2;
    }
  }
  return g;
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

void main() {
  vec2 at = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) / uScale;
  vec2 uv = at / uSize;
  vec3 liquid = toLinear(texture2D(uLiquid, uv).rgb);

  // Which blobs lie across this line of sight, over what depth, how much
  // wax that is all told, and which reaches it most.
  float front = -1e5;
  float back = 1e5;
  float column = 0.0;
  float strongest = 0.0;
  float peak = 0.0;
  for (int i = 0; i < ${BLOBS.length}; i++) {
    vec2 off = (at - uBlobs[i].xy) * uShape[i];
    float r = uBlobs[i].w;
    float u = 1.0 - dot(off, off) / (r * r);
    if (u > 0.0) {
      float extent = r * sqrt(u);
      front = max(front, uBlobs[i].z + extent);
      back = min(back, uBlobs[i].z - extent);
      // A bump's own depth along the line, in closed form: r u^3.5 times
      // the integral of (1 - s^2)^3 over -1..1, 32/35.
      column += r * pow(u, 3.5) * 0.9142857;
      if (u > strongest) {
        strongest = u;
        peak = uBlobs[i].z;
      }
    }
  }
  if (front < back) {
    gl_FragColor = vec4(vignette(toSrgb(liquid), uv), 1.0);
    return;
  }

  // The bulb's light at a point.
  vec3 toBulbHere = uBulb - vec3(at, peak);
  float reachHere = length(toBulbHere) / uBulbReach;
  vec3 lightHere = uBulbLight / (1.0 + reachHere * reachHere);

  // From the front, stepping back until the sum first passes the
  // threshold, then halving the last step until it's found. The strongest
  // blob's own middle is looked at too, which is where a glancing line of
  // sight comes nearest the threshold — what the edge's softness reads.
  float most = field(vec3(at, peak));
  float surface = peak;
  float stride = (front - back) / ${MARCH_STEPS}.0;
  float previous = front;
  for (int s = 1; s <= ${MARCH_STEPS}; s++) {
    float z = front - stride * float(s);
    float f = field(vec3(at, z));
    most = max(most, f);
    if (f >= uThreshold) {
      float near = previous;
      float far = z;
      for (int k = 0; k < ${REFINE_STEPS}; k++) {
        float middle = 0.5 * (near + far);
        if (field(vec3(at, middle)) >= uThreshold) far = middle;
        else near = middle;
      }
      surface = far;
      break;
    }
    previous = z;
  }

  vec3 point = vec3(at, surface);
  vec3 g = slope(point);
  vec3 normal = dot(g, g) > 0.0 ? normalize(-g) : vec3(0.0, 0.0, 1.0);
  vec3 view = vec3(0.0, 0.0, 1.0);
  // How far back in the lamp the surface is: 0 at the very front, 1 at
  // the back.
  float farness = clamp((uDepth.x - surface) / (2.0 * uDepth.x), 0.0, 1.0);

  // The bulb's light where it lands.
  vec3 toBulb = uBulb - point;
  float reach = length(toBulb) / uBulbReach;
  vec3 light = uBulbLight / (1.0 + reach * reach);
  vec3 l = normalize(toBulb);

  // Through the wax: blue swallowed fastest, red slowest.
  float thickness = column / min(uSize.x, uSize.y) * uMaterial.y;
  vec3 swallow = vec3(0.35, 1.0, 1.6);
  vec3 held = exp(-thickness * swallow);
  vec3 thin = exp(-thickness * 0.5 * swallow);

  float wrapped = clamp((dot(normal, l) + uMaterial.x) / (1.0 + uMaterial.x), 0.0, 1.0);
  float edge = 1.0 - max(normal.z, 0.0);
  vec3 body = uWax * (uMaterial.w + light * wrapped) * held;
  vec3 glow = uWax * light * thin * uMaterial.z * (0.35 + edge * edge);
  float bulbShine = pow(max(dot(normal, normalize(l + view)), 0.0), uShine.y) * uShine.x;
  vec3 overhead = normalize(vec3(0.0, -1.0, 0.7));
  float topShine = pow(max(dot(normal, normalize(overhead + view)), 0.0), uShine.y * 0.6) * uShine.z;
  float fresnel = 0.04 + 0.96 * pow(edge, 5.0);
  vec3 wax = body + glow + light * bulbShine + vec3(0.9, 0.92, 1.0) * topShine + liquid * fresnel * 0.8;
  wax = 1.0 - exp(-wax * uShine.w);

  // Seen through the liquid in front of it, and softer the further back.
  wax = mix(wax, liquid, 1.0 - exp(-uDepth.y * farness));
  float soft = uThreshold * uDepth.z * (1.0 + 3.0 * farness);
  float cover = smoothstep(uThreshold - soft, uThreshold + soft, most);
  // Just outside the wax, the liquid glows with the light it scatters
  // off it — strongest at the edge, gone by the end of the blobs' reach.
  float nearWax = clamp(most / uThreshold, 0.0, 1.0);
  vec3 around = liquid + uWax * lightHere * uDepth.w * nearWax * nearWax * exp(-uDepth.y * farness);
  vec3 colour = mix(around, wax, cover);

  gl_FragColor = vec4(vignette(toSrgb(colour), uv), 1.0);
}
`;

function createShader(canvas: HTMLCanvasElement) {
  const pass = createPass(canvas, "Lava Lamp 3D", FRAGMENT, [
    "uCanvas", "uScale", "uSize", "uBlobs", "uShape", "uLiquid", "uThreshold", "uWax", "uBulb", "uBulbLight",
    "uBulbReach", "uMaterial", "uShine", "uDepth",
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

  const blobs = new Float32Array(BLOBS.length * 4);
  const shapes = new Float32Array(BLOBS.length * 2);

  return {
    draw(width: number, height: number, cssWidth: number, cssHeight: number, seconds: number, t: Lava3DTuning) {
      if (gl.isContextLost()) return;
      const short = Math.min(cssWidth, cssHeight);
      const halfDepth = (short * t.depth) / 2;

      BLOBS.forEach((blob, i) => {
        const pose = poseAt(blob.motion, (seconds + blob.delay) / (blob.duration * t.speed));
        const squash = Math.sqrt(pose.sx * pose.sy);
        const depth = DEPTHS[i];
        const z = halfDepth * Math.max(-1, Math.min(1, depth.at + 0.2 * Math.sin((seconds / (depth.period * t.speed)) * Math.PI * 2 + depth.phase)));
        blobs.set(
          [
            cssWidth * blob.x + pose.x * cssWidth * blob.sway,
            cssHeight * blob.y + pose.y * cssHeight * blob.travel * 0.5,
            z,
            ((short * blob.size * squash) / 2) * (1 + t.merge),
          ],
          i * 4,
        );
        shapes.set([squash / pose.sx, squash / pose.sy], i * 2);
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
      // A bump falls from 1 in the middle to nothing at its reach; its
      // surface, alone, is where it has fallen to this — which puts it at
      // the blob's own size whatever the merge reach.
      const threshold = (1 - 1 / (1 + t.merge) ** 2) ** 3;

      gl.uniform2f(at.uCanvas, width, height);
      gl.uniform1f(at.uScale, width / cssWidth);
      gl.uniform2f(at.uSize, cssWidth, cssHeight);
      gl.uniform4fv(at.uBlobs, blobs);
      gl.uniform2fv(at.uShape, shapes);
      gl.uniform1f(at.uThreshold, threshold);
      gl.uniform3f(at.uWax, ...wax);
      gl.uniform3f(at.uBulb, cssWidth / 2, cssHeight * (1 + t.lightDrop / 100), 0);
      gl.uniform3f(at.uBulbLight, t.bulb, t.bulb * 0.78, t.bulb * 0.5);
      gl.uniform1f(at.uBulbReach, cssHeight * t.bulbReach);
      gl.uniform4f(at.uMaterial, t.wrap, t.absorb, t.glow, t.ambient);
      gl.uniform4f(at.uShine, t.shine, t.gloss, t.topLight, t.exposure);
      gl.uniform4f(at.uDepth, Math.max(halfDepth, 1), t.haze, t.softness, t.halo);
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
