"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { MediaThumb } from "@/components/MediaThumb";
import { deleteScreen } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { useScreenPresence } from "@/lib/realtime/useScreenPresence";
import type { Screen } from "@/types/domain";
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

export function ScreenTile({ screen }: { screen: Screen }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewLandscape, setPreviewLandscape] = useState(true);
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
  // the content out, then rotate the (now-invisible) frame, then fade the
  // content back in at its new, plain (unrotated) dimensions.
  function handleFlip() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setContentHidden(true);
    timersRef.current.push(
      setTimeout(() => {
        setPreviewLandscape((v) => !v);
        timersRef.current.push(setTimeout(() => setContentHidden(false), FRAME_ROTATE_MS));
      }, FADE_MS),
    );
  }

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const contentWidth = previewLandscape ? PREVIEW_LONG : PREVIEW_SHORT;
  const contentHeight = previewLandscape ? PREVIEW_SHORT : PREVIEW_LONG;

  // The frame's shadow is rotated by the exact same transform as the frame
  // itself (rather than being a separate, non-rotating layer whose size is
  // interpolated) — that's what makes its motion read as "the same
  // rotation" instead of a competing morph. Left un-compensated, rotating
  // the shadow along with the frame would swing it away from "pointing
  // down" once portrait. So instead of animating the box-shadow itself,
  // its offset is pre-rotated by the inverse angle, so that after the
  // element's own rotation is applied the shadow always resolves back to
  // the same on-screen direction. For rotate(-90deg) that maps local
  // offset (x, y) -> screen (-y, x); solving for a screen result of
  // (-1, 4) gives a local offset of (-4, -1).
  const frameShadow = previewLandscape
    ? "-1px 4px 8px -2px rgba(0, 0, 0, 1)"
    : "-4px -1px 8px -2px rgba(0, 0, 0, 1)";

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
              landscape size; "portrait" is a genuine rotate() of that same
              shape (counter-clockwise) rather than a width/height morph,
              so it turns like a little card — and the shadow's offset is
              swapped (not resized) in lockstep, so it turns with it too. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className={cn(
                "transition-[transform,box-shadow] duration-300 ease-out",
                online ? "bg-black" : "bg-[#0a0a0a]",
              )}
              style={{
                width: PREVIEW_LONG,
                height: PREVIEW_SHORT,
                transform: previewLandscape ? "rotate(0deg)" : "rotate(-90deg)",
                boxShadow: frameShadow,
              }}
            />
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
              Landscape can only rotate counter-clockwise (into portrait);
              portrait can only rotate clockwise (back into landscape) — so
              the icon always shows the direction the next click will
              actually turn, not a fixed glyph. */}
          <button
            type="button"
            onClick={handleFlip}
            title="Flip preview orientation (visual only)"
            className="absolute -right-2 -top-2 text-muted opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/preview:opacity-100"
          >
            <RotateIcon direction={previewLandscape ? "ccw" : "cw"} />
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

// Mirrored per direction so the arrow always curls the way the preview is
// about to actually turn: counter-clockwise from landscape, clockwise from
// portrait back to landscape.
function RotateIcon({ direction }: { direction: "cw" | "ccw" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      {direction === "ccw" ? (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="3 3 3 9 9 9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="21 3 21 9 15 9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
