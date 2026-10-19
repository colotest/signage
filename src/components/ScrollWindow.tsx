import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils/cn";
import { EdgeBand } from "./EdgeBand";

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
// siblings of the scrolling element (EdgeBand), outside its fade mask on
// purpose: the wash they carry is what takes a row's own colour out along
// with its text,
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
      {top !== "none" && (
        <EdgeBand side="top" depth="var(--edge-top-size)" hold="var(--edge-top-hold)" blur="var(--edge-top-blur)" />
      )}
      {bottom !== "none" && (
        <EdgeBand
          side="bottom"
          depth="var(--edge-bottom-size)"
          hold="var(--edge-bottom-hold)"
          blur="var(--edge-bottom-blur)"
        />
      )}
      {overlay}
    </div>
  );
}
