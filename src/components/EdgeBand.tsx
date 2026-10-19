import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

// A soft edge: content passing under it is blurred and washed out towards
// the hard edge it's anchored to — the edges of every scroll window (see
// ScrollWindow), and the bands of the Playback Menu's headings (see
// SectionTitle). Sized by CSS lengths, so the presets' variables
// ("Scroll windows' edges" in globals.css) can drive it, and the tuning
// panel reshape every edge live:
// - hold: how deep it stays at full strength from the hard edge;
// - depth: how far past that it eases off;
// - blur: its strongest blur, at the hard edge.
//
// CSS has no blur that varies across one element, so — the standard
// workaround — several backdrop-filter layers are stacked, each covering
// more of the edge with less blur: near the hard edge they all overlap and
// compound, further in only the widest, weakest ones still reach. Each layer
// is SOLID over its own stretch before fading out, and the next (weaker) one
// is solid exactly where it starts fading: a backdrop-filter layer at partial
// alpha shows a blend of blurred and untouched backdrop, so a stack that
// fades everywhere leaves a sharp copy of the content (letters, mostly)
// sitting on its own blur, as a halo. With solid cores, every point is
// covered by some layer at full alpha, and the only blending left is between
// two adjacent blur strengths. Four layers: a fifth's blur came to under a
// pixel — next to invisible, and still a backdrop filter to recompute on
// every scrolled frame. Fractions of the edge's depth, so a shallower edge
// keeps the same shape.
const LAYERS = [
  { strength: 1, solid: 6 / 80, stop: 20 / 80 },
  { strength: 1 / 2, solid: 20 / 80, stop: 36 / 80 },
  { strength: 1 / 4, solid: 36 / 80, stop: 52 / 80 },
  { strength: 1 / 8, solid: 52 / 80, stop: 1 },
];

// Over the blur, a wash of the background colour. Blur alone can't make
// content disappear: it smears text away, but a flat fill — a hovered row, a
// folder lit up as an upload target — survives any amount of blurring, so
// its colour would still be there where the text had already dissolved.
// Washing towards the background takes everything out at the same rate.
// "The background" is whatever the content sits on: the page, or inside the
// Playback Menu its popup's surface (--edge-scrim, see Sheet).
//
// Full tint exactly at the hard edge, easing off at once ((1 - t)²) across
// the whole depth. No plateau at full tint: one read as a flat strip of
// background between the edge and its gradient — and kept lists from sitting
// right up against each other.
const WASH_STOPS: [number, number][] = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((t) => [
  t,
  Math.round(100 * (1 - t) ** 2),
]);

export function EdgeBand({
  side,
  depth,
  hold = "0px",
  blur,
  className,
  style,
}: {
  // Which edge it's anchored to: "top" eases off downwards, "bottom" up.
  side: "top" | "bottom";
  depth: string;
  hold?: string;
  blur: string;
  className?: string;
  style?: CSSProperties;
}) {
  const at = (fraction: number) => `calc(${hold} + ${depth} * ${fraction.toFixed(4)})`;
  const direction = side === "top" ? "to bottom" : "to top";
  const anchor = side === "top" ? "top-0" : "bottom-0";
  const wash = `linear-gradient(${direction}, ${WASH_STOPS.map(
    ([fraction, percent]) =>
      `color-mix(in srgb, var(--edge-scrim, var(--background)) ${percent}%, transparent) ${at(fraction)}`,
  ).join(", ")})`;

  return (
    <div
      aria-hidden
      // blur-edge: power-saving mode swaps all this for one plain block (see
      // [data-power-saving] in globals.css).
      className={cn("blur-edge pointer-events-none absolute inset-x-0 z-[5]", anchor, className)}
      style={{ height: at(1), ...style }}
    >
      {LAYERS.map(({ solid, stop, strength }, i) => {
        const mask = `linear-gradient(${direction}, black 0, black ${at(solid)}, transparent ${at(stop)})`;
        const filter = `blur(calc(${blur} * ${strength}))`;
        return (
          <div
            key={i}
            className={cn("blur-edge-layer absolute inset-x-0", anchor)}
            style={{
              height: at(stop),
              backdropFilter: filter,
              WebkitBackdropFilter: filter,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
      <div className={cn("blur-edge-layer absolute inset-x-0", anchor)} style={{ height: at(1), background: wash }} />
    </div>
  );
}
