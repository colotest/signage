"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { MediaThumb } from "@/components/MediaThumb";
import { deleteScreen, setScreenRotation } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { useScreenPresence } from "@/lib/realtime/useScreenPresence";
import type { Screen, ScreenRotation } from "@/types/domain";
import { PauseIcon } from "@/components/icons/PlaybackIcons";
import { RenameScreenDialog } from "./RenameScreenDialog";
import { FitModeToggle } from "./FitModeToggle";
import { PlaybackControls } from "./PlaybackControls";
import { MediaMenuSheet } from "./MediaMenuSheet";

// Preview "postage stamp" footprint — flipping just swaps these two, like
// physically rotating the same little rectangle 90°. The square wrapper
// below is always PREVIEW_LONG on each side so flipping never changes the
// tile's outer footprint or pushes the info card — only the rectangle
// inside it changes shape, staying centered in that fixed square.
const PREVIEW_LONG = 320;
const PREVIEW_SHORT = 180;

const FADE_MS = 150;
const FRAME_ROTATE_MS = 300;

// One box-shadow offset per quarter-turn (0/90/180/270°), each pre-rotated
// so that once the frame's own rotate() is applied, the shadow always
// resolves back to the same "-1, 4" on-screen direction (down and slightly
// left) — see the comment further down where these are actually applied
// for the full derivation. Index i holds the offset for a 90*i degree
// counterclockwise frame rotation.
const FRAME_SHADOWS = [
  "-1px 4px 8px -2px rgba(0, 0, 0, 1)",
  "-4px -1px 8px -2px rgba(0, 0, 0, 1)",
  "1px -4px 8px -2px rgba(0, 0, 0, 1)",
  "4px 1px 8px -2px rgba(0, 0, 0, 1)",
];

export function ScreenTile({ screen }: { screen: Screen }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Seeded straight from the server-persisted value — no hydration-mismatch
  // risk the way a localStorage-sourced value would have, since this is
  // part of the SSR'd props rather than something only available post-mount.
  // Kept as an ever-increasing quarter-turn count rather than wrapping it
  // back to 0-3 on every click: rotate() animates via the raw numeric
  // difference between old and new values, so snapping 270deg back to 0deg
  // would animate the *shortest* path (270deg clockwise, i.e. backwards)
  // instead of continuing the one more counterclockwise step the button
  // actually performed. The wrapped 0/90/180/270 value — what's actually
  // rendered and persisted — is derived from this on every use.
  const [previewTurns, setPreviewTurns] = useState(Math.round((screen.rotation ?? 0) / 90));
  const [contentHidden, setContentHidden] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [pending, startTransition] = useTransition();
  const { online, nowPlaying } = useScreenPresence(screen.id);

  const playerPath = `/screen/${screen.id}`;

  function handleDelete() {
    startTransition(async () => {
      await deleteScreen(screen.id);
      router.refresh();
    });
  }

  // The bordered frame rotates as one piece, but its content (thumbnail/
  // text) must not visibly spin along with it. Sequenced rather than run
  // in parallel, so each phase is finished before the next starts: fade
  // the content out, then rotate the (now-invisible) frame one more
  // quarter-turn counterclockwise, then fade the content back in at its
  // new, plain (unrotated) dimensions. The rotation isn't just cosmetic —
  // it persists to the screen's real orientation, which the live player
  // reads to counter-rotate content for a physically rotated screen.
  function handleFlip() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setContentHidden(true);
    timersRef.current.push(
      setTimeout(() => {
        const nextTurns = previewTurns + 1;
        setPreviewTurns(nextTurns);
        const nextRotation = (((nextTurns % 4) + 4) % 4) * 90 as ScreenRotation;
        startTransition(async () => {
          await setScreenRotation(screen.id, nextRotation);
          router.refresh();
        });
        timersRef.current.push(setTimeout(() => setContentHidden(false), FRAME_ROTATE_MS));
      }, FADE_MS),
    );
  }

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  // The wrapped, "what orientation is this actually in" step — 0-3,
  // matching FRAME_SHADOWS' index and how many quarter-turns from upright.
  const step = (((previewTurns % 4) + 4) % 4);
  const isPortrait = step % 2 === 1;
  const contentWidth = isPortrait ? PREVIEW_SHORT : PREVIEW_LONG;
  const contentHeight = isPortrait ? PREVIEW_LONG : PREVIEW_SHORT;

  // The frame's shadow is rotated by the exact same transform as the frame
  // itself (rather than being a separate, non-rotating layer whose size is
  // interpolated) — that's what makes its motion read as "the same
  // rotation" instead of a competing morph. Left un-compensated, rotating
  // the shadow along with the frame would swing it away from "pointing
  // down" at 90/180/270°. So instead of animating the box-shadow itself,
  // its offset is pre-rotated by the inverse angle for each of the four
  // quarter-turns (FRAME_SHADOWS above), so that after the element's own
  // rotation is applied the shadow always resolves back to the same
  // on-screen direction, however many turns it's taken.
  const frameShadow = FRAME_SHADOWS[step];

  return (
    <>
      <div className="flex flex-col gap-[18px]">
        {/* Fixed-size square, centered above the info card — its own
            footprint never changes, so flipping can't shift the card below
            or the tile's outer size. */}
        <div
          className="group/preview relative self-center shrink-0"
          style={{ width: PREVIEW_LONG, height: PREVIEW_LONG }}
        >
          {/* Frame layer — background and shadow only, plus the click
              target. This is the piece that actually rotates; it holds no
              border (that lives on the content layer instead, so it can't
              clash with the image) and no text or images, since those
              would visibly spin along with it. Always laid out at its
              landscape size; each quarter-turn is a genuine rotate() of
              that same shape (counter-clockwise) rather than a width/height
              morph, so it turns like a little card — and the shadow's
              offset is swapped (not resized) in lockstep, so it turns with
              it too. The transform uses the raw, ever-increasing turn count
              rather than the wrapped 0-3 step — animating from 270deg back
              to a wrapped 0deg would take the shortest path (270deg
              clockwise) instead of continuing the one more turn the click
              actually performed. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className={cn(
                "relative transition-[transform,box-shadow] duration-300 ease-out",
                online ? "bg-black" : "bg-[#0a0a0a]",
              )}
              style={{
                width: PREVIEW_LONG,
                height: PREVIEW_SHORT,
                transform: `rotate(${-90 * previewTurns}deg)`,
                boxShadow: frameShadow,
              }}
            >
              {/* A little IR-receiver-style bar at the frame's native
                  bottom edge — since it's a plain child of the element that
                  rotates, it's carried around for free and always ends up
                  marking whichever edge was originally "down", which is the
                  only way to tell 0° from 180° (or 90° from 270°) apart at
                  a glance, since the box itself is the same shape and the
                  content inside stays upright either way. Poking out just
                  past the edge rather than sitting on the frame's own
                  surface, since the content layer covers the frame's full
                  footprint at every rotation and would otherwise hide it
                  entirely — this reads as a small bezel detail instead. */}
              <span
                aria-hidden
                className="absolute rounded-full bg-[#2e2e2e]"
                style={{ bottom: -4, left: "50%", width: 48, height: 5, transform: "translateX(-50%)" }}
              />
            </button>
          </div>

          {/* Content layer — never rotates. Swaps straight to the new
              orientation's plain dimensions while faded out, then fades
              back in once the frame above has finished turning. Bordered
              directly (rather than the frame underneath) so the border
              always wraps exactly what's on screen instead of overlapping
              or being overlapped by it. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "relative overflow-hidden transition-opacity duration-150",
                contentHidden ? "opacity-0" : "opacity-100",
              )}
              style={{ width: contentWidth, height: contentHeight, border: "7px solid #2e2e2e" }}
            >
              {online && nowPlaying && (
                <MediaThumb
                  fit={screen.fit_mode}
                  live
                  item={{
                    id: nowPlaying.mediaItemId,
                    name: nowPlaying.name,
                    media_type: nowPlaying.mediaType,
                    storage_path: nowPlaying.storagePath,
                    folder_id: null,
                    mime_type: "",
                    size_bytes: null,
                    created_at: "",
                  }}
                />
              )}
              {online && !nowPlaying && (
                <span className="px-2 text-center text-[11px] text-muted">No content assigned</span>
              )}
              {online && nowPlaying?.paused && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <PauseIcon className="h-8 w-8 text-white" />
                </span>
              )}
              <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-[12px] font-medium text-white group-hover/preview:flex">
                Manage Content
              </span>
            </div>
          </div>

          {/* Sits right at the frame's edge, only visible on hover/focus.
              Always turns counterclockwise by one more quarter-turn — a
              single direction is simpler than a bidirectional control and
              still reaches all four orientations in at most three clicks. */}
          <button
            type="button"
            onClick={handleFlip}
            title="Rotate screen 90° counterclockwise"
            className="absolute -right-2 -top-2 text-muted opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/preview:opacity-100"
          >
            <RotateIcon />
          </button>
        </div>

        {/* Info card — rounded corners, visually detached from the preview. */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <RenameScreenDialog screenId={screen.id} name={screen.name} />
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 rounded-full", online ? "bg-accent" : "bg-danger")}
                  aria-hidden
                />
                <span className="text-[13px] text-muted">{online ? "Online" : "Offline"}</span>
              </span>
              <a
                href={playerPath}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-black/[.03] dark:bg-white/[.05] px-2 py-1 font-mono text-[11px] text-muted hover:text-accent"
              >
                {playerPath}
              </a>
            </div>
            {confirmingDelete ? (
              <div className="flex shrink-0 items-center gap-2 text-[13px]">
                <span className="text-muted">Delete screen?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="font-medium text-danger hover:opacity-70"
                >
                  {pending ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={pending}
                  className="text-muted hover:opacity-70"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="shrink-0 text-[13px] font-medium text-danger hover:opacity-70"
              >
                Delete Screen
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <FitModeToggle screenId={screen.id} fitMode={screen.fit_mode} />
            <PlaybackControls
              screenId={screen.id}
              paused={nowPlaying?.paused ?? false}
              disabled={!online || !nowPlaying}
            />
          </div>
        </Card>
      </div>

      <MediaMenuSheet screen={screen} open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}

// Always counterclockwise, matching the one direction the button turns.
function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="3 3 3 9 9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
