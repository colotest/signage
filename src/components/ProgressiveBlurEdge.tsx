import { cn } from "@/lib/utils/cn";

// CSS has no primitive for "blur that varies across a single element" — the
// standard workaround (and the one used here) stacks several backdrop-filter
// layers, each covering more of the fade zone with progressively less blur,
// each masked with a soft feather at its own edge. Near the outer edge
// (under a title, or near the bottom toolbar) every layer overlaps and their
// blur compounds; further in, only the widest/weakest layers still reach,
// thinning out to fully sharp right where scroll-fade-y's own color fade
// finishes settling into opaque. Position:absolute (not sticky) inside a
// position:relative scroll container is what keeps this pinned to the
// container's own edge rather than scrolling away with its content — same
// as how scroll-fade-y's mask-image is static/not scroll-position-aware.
const LAYERS = [
  { stop: 8, blur: 16 },
  { stop: 16, blur: 8 },
  { stop: 24, blur: 4 },
  { stop: 32, blur: 2 },
  { stop: 40, blur: 1 },
];
const FEATHER = 6;

export function ProgressiveBlurEdge({ side }: { side: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 z-[5] h-10", side === "top" ? "top-0" : "bottom-0")}
    >
      {LAYERS.map(({ stop, blur }, i) => {
        const solid = Math.max(stop - FEATHER, 0);
        const gradient =
          side === "top"
            ? `linear-gradient(to bottom, black 0, black ${solid}px, transparent ${stop}px)`
            : `linear-gradient(to top, black 0, black ${solid}px, transparent ${stop}px)`;
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
