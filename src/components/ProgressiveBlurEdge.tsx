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
const BLUR_EXTENT = 80;
const LAYERS = [
  { blur: 16, solid: 6, stop: 20 },
  { blur: 8, solid: 20, stop: 36 },
  { blur: 4, solid: 36, stop: 52 },
  { blur: 2, solid: 52, stop: 66 },
  { blur: 1, solid: 66, stop: BLUR_EXTENT },
];

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
const SCRIM_EXTENT = 64;
const SCRIM_STOPS: [number, number][] = [
  [0, 100],
  [14, 94],
  [24, 74],
  [36, 45],
  [48, 18],
  [SCRIM_EXTENT, 0],
];

export function ProgressiveBlurEdge({ side }: { side: "top" | "bottom" }) {
  const direction = side === "top" ? "to bottom" : "to top";
  const scrim = `linear-gradient(${direction}, ${SCRIM_STOPS.map(
    ([offset, percent]) => `color-mix(in srgb, var(--background) ${percent}%, transparent) ${offset}px`,
  ).join(", ")})`;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 z-[5]", side === "top" ? "top-0" : "bottom-0")}
      style={{ height: BLUR_EXTENT }}
    >
      {LAYERS.map(({ blur, solid, stop }, i) => {
        const gradient = `linear-gradient(${direction}, black 0, black ${solid}px, transparent ${stop}px)`;
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: gradient,
              WebkitMaskImage: gradient,
            }}
          />
        );
      })}
      <div
        className={cn("absolute inset-x-0", side === "top" ? "top-0" : "bottom-0")}
        style={{ height: SCRIM_EXTENT, background: scrim }}
      />
    </div>
  );
}
