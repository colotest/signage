import { cn } from "@/lib/utils/cn";

// CSS has no primitive for "blur that varies across a single element" — the
// standard workaround (and the one used here) stacks several backdrop-filter
// layers, each covering more of the fade zone with progressively less blur.
// Near the outer edge (under a title, or near the bottom toolbar) every
// layer overlaps and their blur compounds; further in, only the widest/
// weakest layers still reach.
//
// Each layer is SOLID over its own band before it fades out, and the next
// (weaker) layer is solid exactly where the one before it starts fading.
// That matters more than it sounds: a backdrop-filter layer at partial
// alpha shows a blend of the blurred backdrop and the untouched one, so a
// stack that fades everywhere leaves a sharp copy of the content — most
// visibly letters — sitting on top of its own blur, reading as a halo.
// With solid cores, every point in the zone is covered by some layer at
// full alpha, so the only blending left is between two adjacent blur
// strengths, and the last hand-off (1px blur to none) is imperceptible.
// Fractions of the edge's own depth, so a shallower edge keeps the same
// shape. Blur radii scale with it too — a deep blur crammed into a short
// edge would have to drop off far too fast to read as the same effect.
const BLUR_EXTENT = 80;
const LAYERS = [
  { blur: 16, solid: 6, stop: 20 },
  { blur: 8, solid: 20, stop: 36 },
  { blur: 4, solid: 36, stop: 52 },
  { blur: 2, solid: 52, stop: 66 },
  { blur: 1, solid: 66, stop: BLUR_EXTENT },
].map(({ blur, solid, stop }) => ({
  blur: blur / BLUR_EXTENT,
  solid: solid / BLUR_EXTENT,
  stop: stop / BLUR_EXTENT,
}));

// A wash of the page's own background over the same edge, on top of the
// blur. Blur alone can't make content disappear: it smears text into
// illegibility, but a flat fill — a hovered row, a folder lit up as the
// upload target — survives any amount of blurring at full strength, so the
// color would still be clearly there where the text had already dissolved.
// Fading it with the content's own mask doesn't fix that either, since a
// mask dims a flat fill and blurred text by the same fraction while the
// text is already far weaker. Washing everything toward the background
// colour is what makes a flat fill fade at the same rate as everything
// else. Note this only works from OUTSIDE the content's mask — a scrim
// inside it gets faded away by that same mask exactly where it's needed.
//
// "The background" means whatever these lists actually sit on, which isn't
// always the page: inside the Playback Menu it's the popup's own surface.
// Anything rendering them on something other than the page says so by
// setting --edge-scrim on an ancestor (see Sheet).
const SCRIM_FRACTION = 64 / BLUR_EXTENT;
const SCRIM_STOPS: [number, number][] = [
  [0, 100],
  [14 / 64, 94],
  [24 / 64, 74],
  [36 / 64, 45],
  [48 / 64, 18],
  [1, 0],
];

export function ProgressiveBlurEdge({
  side,
  // Shallower where another list sits right beyond this edge: the deep
  // version is most of the empty band between two stacked lists, and only
  // an edge with the page beyond it has room for it.
  extent = BLUR_EXTENT,
}: {
  side: "top" | "bottom";
  extent?: number;
}) {
  const direction = side === "top" ? "to bottom" : "to top";
  const scrimExtent = Math.round(extent * SCRIM_FRACTION);
  const scrim = `linear-gradient(${direction}, ${SCRIM_STOPS.map(
    ([fraction, percent]) =>
      `color-mix(in srgb, var(--edge-scrim, var(--background)) ${percent}%, transparent) ${Math.round(fraction * scrimExtent)}px`,
  ).join(", ")})`;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 z-[5]", side === "top" ? "top-0" : "bottom-0")}
      style={{ height: extent }}
    >
      {LAYERS.map(({ blur, solid, stop }, i) => {
        const gradient = `linear-gradient(${direction}, black 0, black ${(solid * extent).toFixed(1)}px, transparent ${(stop * extent).toFixed(1)}px)`;
        const radius = (blur * extent).toFixed(2);
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${radius}px)`,
              WebkitBackdropFilter: `blur(${radius}px)`,
              maskImage: gradient,
              WebkitMaskImage: gradient,
            }}
          />
        );
      })}
      <div
        className={cn("absolute inset-x-0", side === "top" ? "top-0" : "bottom-0")}
        style={{ height: scrimExtent, background: scrim }}
      />
    </div>
  );
}
