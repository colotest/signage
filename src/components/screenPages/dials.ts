import { GLITTER_TUNING, countFlakes, type GlitterTuning } from "./Glitter";
import { LAVA_TUNING, type LavaTuning } from "./LavaLamp";
import { LAVA_3D_TUNING, type Lava3DTuning } from "./LavaLamp3D";

// The dials on the pages that take tuning, shared by the development tuners
// (/screen/lava-tuner, /screen/glitter-tuner) and the live tuning panel on
// a screen's dashboard tile, so there is one list of what can be turned and
// how far. `note` is what the number does, so a panel explains itself a
// month from now when none of this is fresh any more.
export type Dial<T> = { key: keyof T & string; label: string; min: number; max: number; step: number; note: string };

export const LAVA_DIALS: Dial<LavaTuning>[] = [
  { key: "reach", label: "Merge reach", min: 0.01, max: 0.16, step: 0.002, note: "How far a blob's falloff reaches past its body, as a fraction of the screen. The soft collar that pools with its neighbours', and so how readily two of them run together." },
  { key: "blobAlpha", label: "Blob height", min: 0.25, max: 1, step: 0.01, note: "How high one blob stands in the field. Only the headroom under 1 can be added to, so this is how far a merge can swell: at 1 none, at 0.5 two blobs can sum, at 0.33 three. Lower it and blobs shrink too, unless you take Edge level down with it." },
  { key: "cut", label: "Edge level", min: 0.08, max: 0.6, step: 0.01, note: "Where the edge is cut, up the field. Half of Blob height puts it exactly where blobs are drawn; lower leaves them larger than drawn and reaching further for each other." },
  { key: "alphaGain", label: "Edge hardness", min: 4, max: 60, step: 1, note: "How few pixels an edge takes to go from nothing to solid." },
  { key: "lift", label: "Light band", min: 0.005, max: 0.08, step: 0.002, note: "How wide the lit edge is. Narrow reads as gloss, wide as a dipped blob." },
  { key: "rimStrength", label: "Light strength", min: 0, max: 14, step: 0.2, note: "How bright the lit edges are, top and bottom together." },
  { key: "rimFocus", label: "Gloss focus", min: 0.6, max: 3, step: 0.05, note: "Above 1 concentrates the light into a sheen; 1 is a flat band." },
  { key: "topLight", label: "Light from above", min: 0, max: 1.5, step: 0.05, note: "The upper light, as a fraction of the one below it." },
  { key: "haloStrength", label: "Translucence", min: 0, max: 1, step: 0.02, note: "The glow outside the edge and the light inside it, together." },
  { key: "density", label: "Wax density", min: 0, max: 1.6, step: 0.05, note: "How much thick wax swallows light — the dark through a blob's middle." },
  { key: "speed", label: "Slowness", min: 0.3, max: 3, step: 0.05, note: "Multiplies every drift's duration. Above 1 is slower." },
  { key: "waxHue", label: "Wax hue", min: 0, max: 360, step: 1, note: "The one colour every blob is, before the vessel's light reaches it." },
  { key: "waxSaturation", label: "Wax saturation", min: 0, max: 100, step: 1, note: "How far from grey that colour sits." },
  { key: "waxLightness", label: "Wax lightness", min: 20, max: 80, step: 0.5, note: "How bright it is at the bottom of the vessel, before anything darkens it." },
  { key: "rampDepth", label: "Gradient depth", min: 0, max: 1.8, step: 0.05, note: "How far into the vessel's dark a blob sinks as it rises. Zero is one flat colour top to bottom." },
  { key: "rampStart", label: "Gradient start", min: 0, max: 0.7, step: 0.02, note: "How far up the screen the darkening begins. Higher keeps the lower half at full strength." },
  { key: "lightDrop", label: "Light drop", min: -6, max: 22, step: 1, note: "How far below the bottom edge the bulb's centre sits, in percent of the height." },
  { key: "resolution", label: "Resolution", min: 0.2, max: 1, step: 0.05, note: "WebGL only: the share of the device's pixels the shader works in. Half is a quarter of the cost; wax is smooth enough not to show it." },
  { key: "fps", label: "Frame cap", min: 10, max: 60, step: 1, note: "WebGL only: frames a second at most." },
];

export const GLITTER_DIALS: Dial<GlitterTuning>[] = [
  { key: "cell", label: "Flake size", min: 0.0015, max: 0.012, step: 0.0001, note: "One flake's cell, as a fraction of the screen's short side. Smaller is a finer, denser cloud and more work for the shader. In the shader it moves in whole pixels." },
  { key: "resolution", label: "Resolution", min: 0.25, max: 1, step: 0.05, note: "WebGL only: the share of the device's pixels the shader works in. Half is a quarter of the cost; the browser's stretch softens each glint into a small bloom." },
  { key: "density", label: "Density", min: 0.1, max: 1, step: 0.01, note: "The share of cells holding a flake." },
  { key: "clouds", label: "Clouds", min: 0, max: 1, step: 0.01, note: "How patchy the cloud is: thicker and thinner stretches drifting through it. WebGL only." },
  { key: "spread", label: "Tilt spread", min: 0.1, max: 1.2, step: 0.01, note: "How far from flat the flakes lie. Wider scatters the glints over the whole screen; narrower gathers them round the hotspot. WebGL only." },
  { key: "sweep", label: "Hotspot", min: 0, max: 1.2, step: 0.01, note: "How tightly the glints gather where the light reflects. Zero is evenly all over. WebGL only." },
  { key: "sparkle", label: "Sparkle", min: 0.008, max: 0.1, step: 0.001, note: "How exactly a flake has to line up to flash. Smaller is rarer, briefer, sharper glints; larger is more and softer." },
  { key: "tumble", label: "Tumble", min: 0, max: 0.4, step: 0.005, note: "How far each flake turns as it floats. More turning is more flakes passing through a flash. WebGL only." },
  { key: "tumbleSpeed", label: "Tumble speed", min: 0.1, max: 4, step: 0.05, note: "How fast they turn — and so how short a flash is." },
  { key: "lightSpeed", label: "Light speed", min: 0, max: 10, step: 0.1, note: "How fast the light, and the hotspot with it, wanders." },
  { key: "drift", label: "Float speed", min: 0, max: 20, step: 0.1, note: "How fast the cloud floats about and eddies." },
  { key: "bed", label: "Bed", min: 0, max: 0.8, step: 0.005, note: "The dim glitter that is always there, between flashes." },
  { key: "gain", label: "Flash", min: 0.2, max: 10, step: 0.05, note: "How bright a flash gets at its strongest." },
  { key: "falloff", label: "Rarity of bright", min: 0.5, max: 8, step: 0.1, note: "Higher leaves most flashes faint and only a few strong." },
  { key: "holo", label: "Holographic", min: 0, max: 1, step: 0.01, note: "The share of flakes that run through the colours rather than flashing silver." },
  { key: "far", label: "Far layer", min: 0, max: 1.5, step: 0.01, note: "How bright the finer cloud behind is." },
  { key: "big", label: "Big flakes", min: 0, max: 1, step: 0.01, note: "WebGL only: how many of the big near flakes there are — the ones that bloom and throw a cross when they flash." },
  { key: "flare", label: "Flare size", min: 0.02, max: 0.5, step: 0.002, note: "WebGL only: how big a big flake's bloom and cross can get, as a fraction of the screen. Larger flares come fewer to the screen." },
  { key: "rays", label: "Flare cross", min: 0, max: 4, step: 0.05, note: "How strong the cross of light through a flare is." },
  { key: "vivid", label: "Vivid colour", min: 0, max: 1, step: 0.01, note: "0 is soft film colours that bloom to white; 1 is saturated colour that holds even at its brightest. Holographic sets how many flakes get it." },
  { key: "glints", label: "Glints (canvas)", min: 5, max: 300, step: 1, note: "Canvas only: glints born a second, per square of the short side." },
  { key: "fps", label: "Frame cap", min: 10, max: 60, step: 1, note: "Frames a second at most." },
  { key: "silverHue", label: "Silver hue", min: 0, max: 360, step: 1, note: "The warmth in the silver." },
  { key: "purpleHue", label: "Purple hue", min: 0, max: 360, step: 1, note: "One end of the holographic run." },
  { key: "orangeHue", label: "Orange hue", min: 0, max: 360, step: 1, note: "The middle of the holographic run." },
  { key: "greenHue", label: "Green hue", min: 0, max: 360, step: 1, note: "The other end of the holographic run." },
];

export const LAVA_3D_DIALS: Dial<Lava3DTuning>[] = [
  { key: "speed", label: "Slowness", min: 0.3, max: 3, step: 0.05, note: "Multiplies every drift's duration. Above 1 is slower." },
  { key: "merge", label: "Merge reach", min: 0.2, max: 1.5, step: 0.02, note: "How far past its own size each blob's pull reaches: how readily two run together, and how thick the neck between them." },
  { key: "depth", label: "Lamp depth", min: 0, max: 1, step: 0.01, note: "How deep the lamp is, as a fraction of the screen: how far apart in depth the blobs lie. At 0 it's flat, and everything merges." },
  { key: "haze", label: "Haze", min: 0, max: 4, step: 0.05, note: "How thick the liquid is: how far the blobs at the back sink into its colour." },
  { key: "softness", label: "Edge softness", min: 0.005, max: 0.3, step: 0.005, note: "How soft an edge is; the back of the lamp is softer again." },
  { key: "bulb", label: "Bulb", min: 0, max: 10, step: 0.1, note: "How strong the bulb under the lamp is." },
  { key: "bulbReach", label: "Bulb reach", min: 0.1, max: 2, step: 0.02, note: "How far up the lamp its light carries, as a fraction of the screen's height." },
  { key: "lightDrop", label: "Light drop", min: -6, max: 40, step: 1, note: "How far below the bottom edge the bulb sits, in percent of the height." },
  { key: "wrap", label: "Light wrap", min: 0, max: 1.5, step: 0.02, note: "How far the bulb's light reaches round the wax past where it would stop on something opaque." },
  { key: "absorb", label: "Wax density", min: 0, max: 5, step: 0.05, note: "How much light thick wax swallows — blue first, so thick wax runs deep red." },
  { key: "glow", label: "Translucence", min: 0, max: 3, step: 0.05, note: "How strongly thin wax and edges glow with the light that gets through." },
  { key: "ambient", label: "Ambient", min: 0, max: 0.5, step: 0.01, note: "Light from nowhere in particular, so the shaded tops aren't black." },
  { key: "shine", label: "Highlight", min: 0, max: 3, step: 0.05, note: "How strong the bulb's highlight on the wax is." },
  { key: "gloss", label: "Gloss", min: 2, max: 200, step: 1, note: "How tight the highlights are: higher is glossier." },
  { key: "topLight", label: "Light from above", min: 0, max: 2, step: 0.05, note: "The softer highlight from over the top." },
  { key: "halo", label: "Halo", min: 0, max: 2, step: 0.02, note: "The glow hot wax throws into the liquid just around it." },
  { key: "exposure", label: "Exposure", min: 0.3, max: 4, step: 0.05, note: "How brightly the wax is exposed; past 1 it rolls off rather than clipping." },
  { key: "waxHue", label: "Wax hue", min: 0, max: 360, step: 1, note: "The wax's colour." },
  { key: "waxSaturation", label: "Wax saturation", min: 0, max: 100, step: 1, note: "How far from grey the wax sits." },
  { key: "waxLightness", label: "Wax lightness", min: 20, max: 80, step: 0.5, note: "How light the wax is before any light reaches it." },
  { key: "rampDepth", label: "Gradient depth", min: 0, max: 1.8, step: 0.05, note: "How far the liquid darkens towards the top." },
  { key: "rampStart", label: "Gradient start", min: 0, max: 0.7, step: 0.02, note: "How far up the screen that darkening begins." },
  { key: "resolution", label: "Resolution", min: 0.2, max: 1, step: 0.05, note: "The share of the device's pixels the shader works in. The cost goes with its square." },
  { key: "fps", label: "Frame cap", min: 10, max: 60, step: 1, note: "Frames a second at most." },
];

// The pages that can be tuned live, by the key their media item's
// storage_path names ("page:<key>", see index.tsx).
// `count`, where a page has one, says how much it's drawing on a screen of
// the given size — a line for the top of its panel.
type TunablePageInfo = {
  name: string;
  defaults: Record<string, number>;
  dials: Dial<Record<string, number>>[];
  count?: (tuning: Record<string, number>, width: number, height: number) => string;
};

export const TUNABLE_PAGES: Record<"glitter" | "lavalamp" | "lavalamp3d", TunablePageInfo> = {
  glitter: {
    name: "Glitter",
    defaults: GLITTER_TUNING,
    dials: GLITTER_DIALS as Dial<Record<string, number>>[],
    count: (tuning, width, height) => glitterCount({ ...GLITTER_TUNING, ...tuning }, width, height),
  },
  lavalamp: { name: "Lava Lamp", defaults: LAVA_TUNING, dials: LAVA_DIALS as Dial<Record<string, number>>[] },
  lavalamp3d: { name: "Lava Lamp 3D", defaults: LAVA_3D_TUNING, dials: LAVA_3D_DIALS as Dial<Record<string, number>>[] },
};

export function glitterCount(tuning: GlitterTuning, width: number, height: number) {
  const { fine, big } = countFlakes(tuning, width, height);
  return `≈ ${fine.toLocaleString("en")} flakes · ${big.toLocaleString("en")} big`;
}

export type TunablePage = keyof typeof TUNABLE_PAGES;

export function tunablePage(storagePath: string | null | undefined): TunablePage | null {
  const key = storagePath?.startsWith("page:") ? storagePath.slice("page:".length) : "";
  return key in TUNABLE_PAGES ? (key as TunablePage) : null;
}
