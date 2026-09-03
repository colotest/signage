"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { MediaThumb } from "@/components/MediaThumb";
import { setScreenRotation } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import type { PlaylistItemWithMedia, Screen, ScreenRotation } from "@/types/domain";
import { PauseIcon } from "@/components/icons/PlaybackIcons";
import { RenameScreenDialog } from "./RenameScreenDialog";
import { FitModeToggle } from "./FitModeToggle";
import { PlaybackControls } from "./PlaybackControls";
import { MediaMenuSheet } from "./MediaMenuSheet";
import { ScreenSetupMenu } from "./ScreenSetupMenu";

// Preview "postage stamp" footprint — flipping just swaps these two, like
// physically rotating the same little rectangle 90°. These are the TRUE
// content dimensions (a clean 16:9), not the bordered box's own size — see
// BORDER_WIDTH below for why that distinction matters.
const PREVIEW_LONG = 320;
const PREVIEW_SHORT = 180;

// The content layer's border used to be carved out of the PREVIEW_LONG ×
// PREVIEW_SHORT box itself (border-box sizing subtracts border thickness
// from the box you give it), so the actual rendered content ended up
// slightly off-16:9 while only the outer, bordered box stayed a clean
// 16:9. Fix: size that box (and the frame layer it sits flush against) up
// by the border thickness on each side, so the border sits *outside* the
// true 16:9 content area instead of eating into it.
const BORDER_WIDTH = 7;
const FRAME_LONG = PREVIEW_LONG + BORDER_WIDTH * 2;
const FRAME_SHORT = PREVIEW_SHORT + BORDER_WIDTH * 2;

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

export function ScreenTile({
  screen,
  playlist,
}: {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Purely local and optimistic — there's no reliable way to confirm a
  // screen actually received and applied a command (that used to come from
  // realtime presence, which proved unreliable enough to remove entirely),
  // so this just reflects the last thing asked of it from this dashboard.
  const [paused, setPaused] = useState(false);
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
  const firstItem = playlist[0];

  const playerPath = `/screen/${screen.id}`;

  // The bordered frame rotates as one piece, but its content (thumbnail/
  // text) must not visibly spin along with it. Sequenced rather than run
  // in parallel, so each phase is finished before the next starts: fade
  // the content out, then rotate the (now-invisible) frame however many
  // quarter-turns get from the current orientation to the picked one, then
  // fade the content back in at its new, plain (unrotated) dimensions. The
  // rotation isn't just cosmetic — it persists to the screen's real
  // orientation, which the live player reads to counter-rotate content for
  // a physically rotated screen.
  //
  // Takes the shortest path rather than always turning the same direction:
  // 3 quarter-turns forward (counterclockwise) lands on the same
  // orientation as 1 quarter-turn back (clockwise), so a "downward" pick
  // like 270deg -> 180deg turns clockwise instead of spinning 270deg the
  // other way around to get there. Direction only ever affects the sign of
  // previewTurns fed into rotate() below — FRAME_SHADOWS, the IR bar, and
  // the swapped dimensions all key off the wrapped 0-3 step, not which way
  // it got there, so nothing else here needs to change for either direction.
  function handleSelectRotation(target: ScreenRotation) {
    const currentStep = (((previewTurns % 4) + 4) % 4);
    const targetStep = target / 90;
    const forwardSteps = (((targetStep - currentStep) % 4) + 4) % 4;
    const steps = forwardSteps > 2 ? forwardSteps - 4 : forwardSteps;
    if (steps === 0) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setContentHidden(true);
    timersRef.current.push(
      setTimeout(() => {
        setPreviewTurns(previewTurns + steps);
        startTransition(async () => {
          await setScreenRotation(screen.id, target);
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
            or the tile's outer size. Sized off FRAME_LONG (the bordered
            box's own footprint), not the smaller true-content PREVIEW_LONG,
            so the frame can never clip against this wrapper's edge. */}
        <div
          className="group/preview relative self-center shrink-0"
          style={{ width: FRAME_LONG, height: FRAME_LONG }}
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
              className="relative bg-black transition-[transform,box-shadow] duration-300 ease-out"
              style={{
                width: FRAME_LONG,
                height: FRAME_SHORT,
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
              or being overlapped by it. Sized to contentWidth/Height *plus*
              the border on each side (matching FRAME_LONG/FRAME_SHORT) —
              border-box sizing would otherwise carve the border out of a
              true-16:9 box, leaving something slightly off-16:9 actually
              rendering underneath it. This way the border sits outside the
              true 16:9 area, so what's visible inside it stays exactly 16:9. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "relative overflow-hidden transition-opacity duration-150",
                contentHidden ? "opacity-0" : "opacity-100",
              )}
              style={{
                width: contentWidth + BORDER_WIDTH * 2,
                height: contentHeight + BORDER_WIDTH * 2,
                border: `${BORDER_WIDTH}px solid #2e2e2e`,
              }}
            >
              {firstItem ? (
                <MediaThumb fit={screen.fit_mode} live item={firstItem.media_item} />
              ) : (
                <span className="px-2 text-center text-[11px] text-muted">No content assigned</span>
              )}
              {paused && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <PauseIcon className="h-8 w-8 text-white" />
                </span>
              )}
              <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-[12px] font-medium text-white group-hover/preview:flex">
                Manage Content
              </span>
            </div>
          </div>
        </div>

        {/* Info card — rounded corners, visually detached from the preview. */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <RenameScreenDialog screenId={screen.id} name={screen.name} />
            </div>
            <ScreenSetupMenu
              screenId={screen.id}
              playerPath={playerPath}
              rotation={(step * 90) as ScreenRotation}
              onSelectRotation={handleSelectRotation}
            />
          </div>

          <div className="flex items-center gap-2">
            <FitModeToggle screenId={screen.id} fitMode={screen.fit_mode} />
            <PlaybackControls
              screenId={screen.id}
              paused={paused}
              onTogglePaused={() => setPaused((p) => !p)}
            />
          </div>
        </Card>
      </div>

      <MediaMenuSheet screen={screen} open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
