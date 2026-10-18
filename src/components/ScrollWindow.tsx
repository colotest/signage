import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils/cn";
import { LAYERS, SCRIM_FRACTION, SCRIM_STOPS } from "./ProgressiveBlurEdge";

// What sits at one edge of a scroll window, which decides everything about
// that edge — see "Scroll windows' edges" in globals.css for the presets.
export type EdgeKind = "title" | "toolbar" | "plain" | "none";

// A scrolling list with soft edges, after iOS/macOS 26: the window reaches
// in under whatever is beside it (a title above, the page's bottom edge
// below), and content passing into that edge is blurred, faded and washed
// out rather than stopping at a hard line. Everything about each edge — how
// far it tucks under, how deep the blur goes, how far content fades, the
// room before the first row — comes from one preset per edge, so every
// list's edges match, and the tuning panel can change them all at once.
//
// The scrolling element is absolutely sized inside this one (which is what
// keeps the edges pinned while content scrolls beneath them); give this one
// its size from the layout around it (flex-1 and the like). The edges are
// siblings of the scrolling element, outside its fade mask on purpose: the
// wash they carry is what takes a row's own colour out along with its text,
// and a mask over it would erase it exactly where it does its work.
// `overlay` sits over the window above everything — the file browser's sort
// bar, say.
export function ScrollWindow({
  top,
  bottom,
  className,
  style,
  scrollerClassName,
  scrollerStyle,
  scrollerRef,
  overlay,
  children,
}: {
  top: EdgeKind;
  bottom: EdgeKind;
  className?: string;
  style?: CSSProperties;
  scrollerClassName?: string;
  scrollerStyle?: CSSProperties;
  scrollerRef?: Ref<HTMLDivElement>;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-edge-top={top}
      data-edge-bottom={bottom}
      className={cn("scroll-window min-h-0", className)}
      style={style}
    >
      <div
        ref={scrollerRef}
        style={scrollerStyle}
        className={cn(
          "scroll-window-scroller scroll-fade-y no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain",
          scrollerClassName,
        )}
      >
        {children}
      </div>
      {top !== "none" && <WindowEdge side="top" />}
      {bottom !== "none" && <WindowEdge side="bottom" />}
      {overlay}
    </div>
  );
}

// The same stacked blur and background wash as ProgressiveBlurEdge (see
// there for how and why), sized from the window's preset variables rather
// than from numbers, so tuning a preset reshapes every edge built on it
// live. Four layers rather than five: at these depths the weakest one's
// blur is under a pixel — next to invisible, and still a backdrop filter to
// recompute on every scrolled frame.
const WINDOW_LAYERS = LAYERS.slice(0, 4).map((layer, i, all) => ({
  ...layer,
  stop: i === all.length - 1 ? 1 : layer.stop,
  // Relative to the strongest layer, whose blur is the preset's own.
  strength: layer.blur / LAYERS[0].blur,
}));

function WindowEdge({ side }: { side: "top" | "bottom" }) {
  const v = (name: string) => `var(--edge-${side}-${name})`;
  const at = (fraction: number) => `calc(${v("hold")} + ${v("size")} * ${fraction.toFixed(4)})`;
  const direction = side === "top" ? "to bottom" : "to top";
  const anchor = side === "top" ? "top-0" : "bottom-0";
  const scrim = `linear-gradient(${direction}, ${SCRIM_STOPS.map(
    ([fraction, percent]) =>
      `color-mix(in srgb, var(--edge-scrim, var(--background)) ${percent}%, transparent) ${at(fraction * SCRIM_FRACTION)}`,
  ).join(", ")})`;

  return (
    <div
      aria-hidden
      // blur-edge: power-saving mode swaps all this for one plain block (see
      // [data-power-saving] in globals.css).
      className={cn("blur-edge pointer-events-none absolute inset-x-0 z-[5]", anchor)}
      style={{ height: at(1) }}
    >
      {WINDOW_LAYERS.map(({ solid, stop, strength }, i) => {
        const mask = `linear-gradient(${direction}, black 0, black ${at(solid)}, transparent ${at(stop)})`;
        const blur = `blur(calc(${v("blur")} * ${strength}))`;
        return (
          <div
            key={i}
            className={cn("blur-edge-layer absolute inset-x-0", anchor)}
            style={{
              height: at(stop),
              backdropFilter: blur,
              WebkitBackdropFilter: blur,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
      <div
        className={cn("blur-edge-layer absolute inset-x-0", anchor)}
        style={{ height: at(SCRIM_FRACTION), background: scrim }}
      />
    </div>
  );
}
