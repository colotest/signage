import { cn } from "@/lib/utils/cn";

// CSS has no primitive for "blur that varies across a single element" — the
// standard workaround (and the one used here) stacks several backdrop-filter
// layers, each covering more of the fade zone with progressively less blur,
// each masked with a soft feather at its own edge. Near the outer edge
// (under a title, or near the bottom toolbar) every layer overlaps and their
// blur compounds; further in, only the widest/weakest layers still reach.
//
// BLUR_EXTENT is deliberately shorter than scroll-fade-y's own 40px fade —
// the blur needs to fully resolve to zero well *before* the color fade
// finishes ramping to opaque (which happens gradually, not linearly: still
// only ~50% opaque at 20px, ~84% at 30px). Ending the blur at the same 40px
// boundary left a faint residual blur sitting on top of already-mostly-
// opaque, meant-to-be-sharp content — reading as its own layer floating
// above the fade rather than a part of it. Cutting it off earlier keeps the
// blur confined to the portion of the zone the color fade has already
// substantially hidden, so by the time content is meant to look sharp, it
// actually is.
const BLUR_EXTENT = 24;
const LAYERS = [
  { stop: 0.2, blur: 16 },
  { stop: 0.4, blur: 8 },
  { stop: 0.65, blur: 4 },
  { stop: 0.8, blur: 2 },
  { stop: 1, blur: 1 },
].map(({ stop, blur }) => ({ stop: Math.round(stop * BLUR_EXTENT), blur }));
const FEATHER = 4;

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
