"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { MediaThumb } from "@/components/MediaThumb";
import { deleteScreen } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { useScreenPresence } from "@/lib/realtime/useScreenPresence";
import type { Screen } from "@/types/domain";
import { RenameScreenDialog } from "./RenameScreenDialog";
import { FitModeToggle } from "./FitModeToggle";
import { MediaMenuSheet } from "./MediaMenuSheet";

// Preview "postage stamp" footprint — flipping just swaps these two, like
// physically rotating the same little rectangle 90°. The square wrapper
// below is always PREVIEW_LONG on each side so flipping never changes the
// tile's outer footprint or pushes the info card — only the rectangle
// inside it changes shape, staying centered in that fixed square.
const PREVIEW_LONG = 320;
const PREVIEW_SHORT = 180;

export function ScreenTile({ screen }: { screen: Screen }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewLandscape, setPreviewLandscape] = useState(true);
  const [pending, startTransition] = useTransition();
  const { online, nowPlaying } = useScreenPresence(screen.id);

  const playerPath = `/screen/${screen.id}`;

  function handleDelete() {
    startTransition(async () => {
      await deleteScreen(screen.id);
      router.refresh();
    });
  }

  const previewWidth = previewLandscape ? PREVIEW_LONG : PREVIEW_SHORT;
  const previewHeight = previewLandscape ? PREVIEW_SHORT : PREVIEW_LONG;

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Fixed-size square, centered above the info card — its own
            footprint never changes, so flipping can't shift the card below
            or the tile's outer size. */}
        <div
          className="relative self-center shrink-0"
          style={{ width: PREVIEW_LONG, height: PREVIEW_LONG }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {/* The actual preview — sharp corners, deliberately small;
                purely a cosmetic orientation preview, doesn't touch the
                real screen at all. This is what visibly resizes on flip. */}
            <div
              className="relative transition-all duration-200"
              style={{ width: previewWidth, height: previewHeight }}
            >
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className={cn(
                  "group absolute inset-0 flex items-center justify-center overflow-hidden",
                  online ? "bg-black/[.04] dark:bg-white/[.06]" : "bg-[#0a0a0a]",
                )}
              >
                {online && nowPlaying && (
                  <MediaThumb
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
                <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-[12px] font-medium text-white group-hover:flex">
                  Manage Content
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewLandscape((v) => !v)}
                title="Flip preview orientation (visual only)"
                className="absolute -right-2 -top-2 text-muted transition-colors hover:text-foreground"
              >
                <RotateIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Info card — rounded corners, visually detached from the preview. */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <RenameScreenDialog screenId={screen.id} name={screen.name} />
              <FitModeToggle screenId={screen.id} fitMode={screen.fit_mode} />
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

          <div className="flex items-center gap-1.5">
            <span
              className={cn("h-2 w-2 rounded-full", online ? "bg-accent" : "bg-danger")}
              aria-hidden
            />
            <span className="text-[13px] text-muted">{online ? "Live" : "Offline"}</span>
          </div>

          <a
            href={playerPath}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate rounded-[var(--radius-sm)] bg-black/[.03] dark:bg-white/[.05] px-2.5 py-1.5 font-mono text-[12px] text-muted hover:text-accent"
          >
            {playerPath}
          </a>
        </Card>
      </div>

      <MediaMenuSheet screen={screen} open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="21 3 21 9 15 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
