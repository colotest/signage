"use client";

import { ScreenPreview } from "@/app/(dashboard)/dashboard/_components/ScreenPreview";
import type { ScreenLiveStatus } from "@/lib/realtime/useScreenStatuses";
import { screenMediaAt, type VenueScreen } from "@/lib/venueScreens";
import type { MediaItem, PlaylistItemWithMedia } from "@/types/domain";

// The monitor's height, bezel and all: under three of a pin title's lines
// (20px each), so it sits in the pin without crowding the map.
const FRAME_HEIGHT = 54;
const BEZEL = 3;

// A "Screen" pin on the map: a little version of the dashboard's monitor
// for that screen — upright or turned as the screen hangs, live (as on the
// dashboard) or, given a moment on another day, what it'll be showing then
// (see screenMediaAt). The picture says which screen it is, so its title
// is only named for screen readers and on hover.
export function ScreenPin({
  title,
  screen,
  status,
  mediaById,
  at,
}: {
  title: string;
  screen: VenueScreen;
  status: ScreenLiveStatus | null;
  mediaById: Map<string, MediaItem>;
  // null: live.
  at: Date | null;
}) {
  const portrait = screen.rotation === 90 || screen.rotation === 270;
  const height = FRAME_HEIGHT - BEZEL * 2;
  const width = portrait ? (height * 9) / 16 : (height * 16) / 9;
  // A moment's picture, as if it were the only thing on air (the preview's
  // fallback without a status report).
  const scheduled = at ? screenMediaAt(screen, at) : null;
  const playlist = at ? (scheduled ? [{ media_item: scheduled } as PlaylistItemWithMedia] : []) : screen.onAir;
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--surface),0_2px_6px_var(--shadow-ambient-strong)]"
      />
      <div className="absolute bottom-[7px] left-0 -translate-x-1/2">
        <div
          role="img"
          aria-label={title}
          title={title}
          className="w-max rounded-[var(--radius-md)] border border-border glass-material p-1.5 shadow-[var(--shadow-float)]"
        >
          <div
            className="overflow-hidden rounded-[3px]"
            style={{ width: width + BEZEL * 2, height: FRAME_HEIGHT, border: `${BEZEL}px solid #2e2e2e` }}
          >
            <ScreenPreview
              screen={screen}
              playlist={playlist}
              status={at ? null : status}
              mediaById={mediaById}
              fitMode={screen.fit_mode}
              paused={!at && !!status?.paused}
              width={width}
              height={height}
            />
          </div>
        </div>
        <span aria-hidden className="mx-auto block h-2 w-px bg-muted/60" />
      </div>
    </div>
  );
}
