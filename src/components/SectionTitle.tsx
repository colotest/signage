"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { EdgeBand } from "./EdgeBand";

// The fixed height of a section's title row. The Playback Menu docks these
// rows at the top and bottom edges of its scroll view and sizes the lists
// around them, so it has to be an exact number rather than whatever the
// text happens to measure.
export const SECTION_TITLE_HEIGHT = 40;

// How far the list below a heading tucks in underneath it: its whole
// height, so the list's hard edge is never seen. Structural (the Playback
// Menu's layout counts on it), unlike the edges' looks below.
export const TITLE_TUCK_BELOW = SECTION_TITLE_HEIGHT;

// The headings' bands look like the scroll windows' edges, from the same
// presets ("Scroll windows' edges" in globals.css), so a list under a
// heading here fades exactly as one under the Library's titles does. The
// presets are measured against the Library's windows, which tuck --edge-
// title-tuck up under their title; a heading here is its own 40px instead.
// So rather than the raw numbers, what's kept is what they come to past the
// title: the band reaches (depth - tuck) below it, and the first row at rest
// sits (clear - tuck) below it.
export function titleBand(titleHeight: number) {
  return {
    hold: "var(--edge-title-hold)",
    depth: `max(0px, calc(${titleHeight}px + var(--edge-title-size) - var(--edge-title-tuck) - var(--edge-title-hold)))`,
    blur: "var(--edge-title-blur)",
  };
}

// Room the list below a heading keeps above its first row at rest.
export const TITLE_CLEAR_BELOW = "max(0px, calc(var(--edge-title-clear) - var(--edge-title-tuck)))";

// The bottom edge of a list ending above a heading (or ending anywhere in
// the Playback Menu) — a "plain" edge, as the Library's file browser has
// facing the playlists below it.
export const LIST_FOOT_BAND = {
  hold: "var(--edge-plain-hold)",
  depth: "var(--edge-plain-size)",
  blur: "var(--edge-plain-blur)",
};
export const LIST_FOOT_HEIGHT = "calc(var(--edge-plain-hold) + var(--edge-plain-size))";

// Room such a list keeps below its last row at rest.
export const TITLE_CLEAR_ABOVE = "var(--edge-plain-clear)";

// A page-sized section heading ("Playlists", "Calendar"). Given `onToggle`,
// it gets a chevron to the right of the text: pointing down while the
// section is on screen, right while it's scrolled out of view, and pressing
// it scrolls the section in or out. Without, it's just the heading.
// `trailing` sits at the row's far end (a sort "⋯") and stays outside that
// button.
//
// The heading has no background of its own. It carries soft edges (see
// EdgeBand), always there: below, the band content scrolling up under it
// passes into, from its top edge down past it (titleBand); above, the
// bottom edge of the list before it (LIST_FOOT_BAND). The list above ends
// at the heading's top edge and keeps TITLE_CLEAR_ABOVE of padding; the
// list below tucks in under the whole heading (TITLE_TUCK_BELOW) and keeps
// TITLE_CLEAR_BELOW above its first row. Being part of the heading, the
// bands go wherever it goes, docked or not.
//
// bandAbove={false} leaves out the upper one, for a heading whose list
// above brings its own; bandBelow={false} the lower one, for a heading
// nothing ever scrolls in under (both: the Playback Menu's "Calendar",
// which doesn't dock and sits under the Playlists list's footer). A band
// costs something even with nothing behind it, so none is drawn for
// nothing.
export function SectionTitle({
  title,
  inView = false,
  onToggle,
  trailing,
  bandAbove = true,
  bandBelow = true,
  className,
  style,
}: {
  title: string;
  inView?: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
  bandAbove?: boolean;
  bandBelow?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn("z-10 shrink-0", className)} style={{ height: SECTION_TITLE_HEIGHT, ...style }}>
      {bandAbove && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full"
          style={{ height: LIST_FOOT_HEIGHT }}
        >
          <EdgeBand side="bottom" {...LIST_FOOT_BAND} />
        </div>
      )}
      {bandBelow && <EdgeBand side="top" {...titleBand(SECTION_TITLE_HEIGHT)} />}
      {/* relative z-10: the text and buttons sit above the band. */}
      <div className="relative z-10 flex h-full items-center justify-between gap-3">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={inView ? `Scroll ${title} out of view` : `Scroll to ${title}`}
            className="no-press flex min-w-0 items-center gap-2 text-left"
          >
            <h2 className="truncate text-[28px] font-semibold tracking-tight">{title}</h2>
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className={cn("h-5 w-5 shrink-0 text-muted transition-transform duration-300", inView && "rotate-90")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <h2 className="min-w-0 truncate text-[28px] font-semibold tracking-tight">{title}</h2>
        )}
        {trailing}
      </div>
    </div>
  );
}
