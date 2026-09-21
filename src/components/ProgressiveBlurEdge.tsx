import { cn } from "@/lib/utils/cn";

// CSS has no primitive for "blur that varies across a single element" — the
// standard workaround (and the one used here) stacks several backdrop-filter
// layers, each covering more of the fade zone with progressively less blur.
// Near the outer edge (under a title, or near the bottom toolbar) every
// layer overlaps and their blur compounds; further in, only the widest/
// weakest layers still reach.
//
// BLUR_EXTENT is twice scroll-fade-y's own 40px fade, so the blur carries
// on past where the color fade has already settled — a softer, deeper
// hand-off at the edge. Each layer fades out over its *entire* span, start to stop, with no
// held "full strength" plateau first (earlier versions had one, via a
// feathered-but-still-largely-solid mask) — a plateau is what let a layer
// linger at near-full blur well past where the color fade had already
// mostly settled into opaque, reading as its own thing sitting on top of
// the fade rather than part of it. A continuous fade instead means every
// layer is already tapering off long before it reaches its own stop, so by
// the time each one's turn is up there's nothing left to clash with.
const BLUR_EXTENT = 80;
const LAYERS = [
  { stop: 0.2, blur: 16 },
  { stop: 0.4, blur: 8 },
  { stop: 0.65, blur: 4 },
  { stop: 0.8, blur: 2 },
  { stop: 1, blur: 1 },
].map(({ stop, blur }) => ({ stop: Math.round(stop * BLUR_EXTENT), blur }));

export function ProgressiveBlurEdge({ side }: { side: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 z-[5]", side === "top" ? "top-0" : "bottom-0")}
      style={{ height: BLUR_EXTENT }}
    >
      {LAYERS.map(({ stop, blur }, i) => {
        const gradient =
          side === "top"
            ? `linear-gradient(to bottom, black 0, transparent ${stop}px)`
            : `linear-gradient(to top, black 0, transparent ${stop}px)`;
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
    </div>
  );
}
