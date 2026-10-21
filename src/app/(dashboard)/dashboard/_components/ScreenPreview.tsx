"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { MediaThumb } from "@/components/MediaThumb";
import { NoContentPlaceholder } from "@/components/NoContentPlaceholder";
import { PauseIcon } from "@/components/icons/PlaybackIcons";
import type { ScreenLiveStatus } from "@/lib/realtime/useScreenStatuses";
import type { FitMode, MediaItem, PlaylistItemWithMedia, Screen } from "@/types/domain";

// The long edge the empty-screen placeholder is laid out at before being
// shrunk into the preview, when the screen hasn't said what its own is
// (see placeholderScale below): a 1080p screen at no browser scaling.
const DEFAULT_LAYOUT_LONG = 1920;

// What's inside a monitor mockup: the screen's live picture at the given
// content size — shared by a screen's own tile and the small monitors on a
// group's tile. The frame, border and rotation around it are the caller's.
export function ScreenPreview({
  screen,
  playlist,
  status,
  mediaById,
  fitMode,
  paused,
  width,
  height,
}: {
  screen: Screen;
  // What's on air (playlist_items) — the fallback picture without status
  // reports, and whether a lone video loops.
  playlist: PlaylistItemWithMedia[];
  // What the screen's player last reported (see useScreenStatuses); null
  // until migration 0025 has run, in which case the preview falls back to
  // the first item on air.
  status: ScreenLiveStatus | null;
  mediaById: Map<string, MediaItem>;
  fitMode: FitMode;
  paused: boolean;
  width: number;
  height: number;
}) {
  // The live preview: what the player says is on screen right now. A
  // reported id that's no longer in the library (deleted a moment ago)
  // shows as nothing rather than guessing.
  const shownItem = status
    ? status.online && status.mediaItemId
      ? (mediaById.get(status.mediaItemId) ?? null)
      : null
    : (playlist[0]?.media_item ?? null);
  const offline = status !== null && !status.online;
  // A video in the preview plays in step with the screen, or holds its
  // paused frame. Paused here is the reported state, not a button's
  // optimistic one — only a report says which frame it stopped on.
  const videoSync =
    status?.online && status.positionMs !== null && status.seenAt !== null
      ? { positionMs: status.positionMs, reportedAt: status.seenAt, paused: status.paused, loop: playlist.length === 1 }
      : undefined;

  // The placeholder is drawn at the size the screen's browser actually
  // lays its page out at, then shrunk to fit — so its text and QR code take
  // up the same share of the tile as they do of the TV. A TV whose browser
  // scales by 2× lays out a 1080p panel at 960×540, making them twice as
  // large there. The long edge is what counts: a rotated screen lays its
  // content out at the same size, just turned.
  const layoutLong = status?.viewport ? Math.max(status.viewport.width, status.viewport.height) : DEFAULT_LAYOUT_LONG;
  const placeholderScale = Math.max(width, height) / layoutLong;
  // The small monitors on a group tile have no room for the last-seen line.
  const compact = Math.max(width, height) < 160;

  // --screen-bg/--screen-ink mirror what the real screen shows behind its
  // media (see Player), so a white-background screen previews white here
  // too — the clock page and the letterbox area around a fitted image both
  // read them.
  const background = screen.background === "white" ? "#fff" : "#000";
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={
        {
          backgroundColor: background,
          "--screen-bg": background,
          "--screen-ink": screen.background === "white" ? "#000" : "#fff",
        } as CSSProperties
      }
    >
      {shownItem ? (
        <MediaThumb fit={fitMode} live item={shownItem} sizes={`${Math.round(width)}px`} sync={videoSync} />
      ) : offline ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-black text-center">
          <span className={compact ? "text-[10px] font-medium text-white/60" : "text-[12px] font-medium text-white/70"}>
            Offline
          </span>
          {!compact && status.seenAt !== null && <LastSeen ms={status.seenAt} />}
        </span>
      ) : (
        <div
          className="origin-top-left"
          style={{
            width: width / placeholderScale,
            height: height / placeholderScale,
            transform: `scale(${placeholderScale})`,
          }}
        >
          <NoContentPlaceholder />
        </div>
      )}
      {paused && !offline && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
          <PauseIcon className={compact ? "h-4 w-4 text-white" : "h-8 w-8 text-white"} />
        </span>
      )}
    </div>
  );
}

const noSubscribe = () => () => {};

// The time is only ever written out in the browser, in its own time zone.
// The server renders in UTC, and suppressHydrationWarning doesn't correct
// a mismatch — it keeps the server's text — so after a reload an offline
// screen read two hours early here, until something re-rendered it.
// useSyncExternalStore's server snapshot leaves the line out of the server
// render and the hydration pass, and the browser adds it straight after.
function LastSeen({ ms }: { ms: number }) {
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return null;
  return <span className="text-[11px] text-white/40">Last seen {formatSeenAt(ms)}</span>;
}

// "14:32" today, "Mon 14:32" within the week, a date beyond that.
function formatSeenAt(ms: number) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ageDays = (new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000;
  if (ageDays < 1) return time;
  if (ageDays < 7) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}
