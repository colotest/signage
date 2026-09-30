"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { ProgressiveBlurEdge } from "./ProgressiveBlurEdge";

// The fixed height of a section's title row. The Playback Menu docks these
// rows at the top and bottom edges of its scroll view and sizes the lists
// around them, so it has to be an exact number rather than whatever the
// text happens to measure.
export const SECTION_TITLE_HEIGHT = 40;

// How far a heading's blur-fade band reaches up above the heading.
export const TITLE_BAND_FADE = 32;

// Below its top edge, the band holds at full strength down through the
// heading's text, then fades out a little past the heading — so content
// scrolling up under a docked heading is gone behind the text, and shows
// again only past it (as it does past the tick under the popup's title).
const TITLE_BAND_HOLD = 24;
export const TITLE_BAND_BELOW = 12;

// How far the list below a heading tucks in underneath it: its whole
// height, up to the band's strongest line along the heading's top edge, so
// the list's hard edge is never seen.
export const TITLE_TUCK_BELOW = SECTION_TITLE_HEIGHT;

// How much room the list below a heading keeps above its first row at
// rest — clear of the band's lower reach.
export const TITLE_CLEAR_BELOW = TITLE_BAND_BELOW;

// How much room the list above a heading keeps between its last row and the
// heading at rest — clear of the band's upper reach.
export const TITLE_CLEAR_ABOVE = TITLE_BAND_FADE;

// A page-sized section heading ("Playlists", "Calendar"). Given `onToggle`,
// it gets a chevron to the right of the text: pointing down while the
// section is on screen, right while it's scrolled out of view, and pressing
// it scrolls the section in or out. Without, it's just the heading.
// `trailing` sits at the row's far end (a sort "⋯") and stays outside that
// button.
//
// The heading has no background of its own. It carries a blur-fade band,
// always there, strongest from its top edge down through its text: from
// there it fades out to TITLE_BAND_BELOW past the heading, and upwards over
// TITLE_BAND_FADE. The list above ends at that top edge — its hard edge
// under the strongest line — and keeps TITLE_CLEAR_ABOVE of padding; the
// list below tucks in under the whole heading (TITLE_TUCK_BELOW) and keeps
// TITLE_CLEAR_BELOW above its first row. So at rest nothing sits
// in the band — it only ever shows on content actually scrolling towards or
// behind the heading. Being part of the heading, the band goes wherever it
// goes, docked or not.
//
// bandAbove={false} leaves out the upper part, for a heading whose list
// above brings its own fade; bandBelow={false} the lower one, for a heading
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
          style={{ height: TITLE_BAND_FADE }}
        >
          <ProgressiveBlurEdge side="bottom" extent={TITLE_BAND_FADE} />
        </div>
      )}
      {bandBelow && (
        <ProgressiveBlurEdge
          side="top"
          hold={TITLE_BAND_HOLD}
          extent={SECTION_TITLE_HEIGHT + TITLE_BAND_BELOW - TITLE_BAND_HOLD}
        />
      )}
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
