"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MediaThumb } from "@/components/MediaThumb";
import { deleteScreen } from "@/lib/actions/screens";
import { cn } from "@/lib/utils/cn";
import { useScreenPresence } from "@/lib/realtime/useScreenPresence";
import type { Screen } from "@/types/domain";
import { RenameScreenDialog } from "./RenameScreenDialog";
import { OrientationToggle } from "./OrientationToggle";
import { MediaMenuSheet } from "./MediaMenuSheet";

export function ScreenTile({ screen }: { screen: Screen }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { online, nowPlaying } = useScreenPresence(screen.id);

  const playerPath = `/screen/${screen.id}`;

  function handleDelete() {
    if (!window.confirm(`Delete "${screen.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteScreen(screen.id);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="flex flex-col overflow-hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={cn(
            "group relative flex items-center justify-center bg-black/[.04] dark:bg-white/[.06]",
            screen.orientation === "landscape" ? "aspect-video w-full" : "aspect-[9/16] h-64 mx-auto",
          )}
        >
          {nowPlaying ? (
            <div className="absolute inset-0">
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
            </div>
          ) : (
            <span className="text-sm text-muted">No content assigned</span>
          )}
          <Badge className="absolute right-2 top-2" tone={online ? "success" : "neutral"}>
            {online ? "Live" : "Offline"}
          </Badge>
          <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-[15px] font-medium text-white group-hover:flex">
            Manage Content
          </span>
        </button>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <RenameScreenDialog screenId={screen.id} name={screen.name} />
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="text-[13px] text-danger hover:opacity-70"
            >
              Delete
            </button>
          </div>

          <OrientationToggle screenId={screen.id} orientation={screen.orientation} />

          <a
            href={playerPath}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate rounded-[var(--radius-sm)] bg-black/[.03] dark:bg-white/[.05] px-2.5 py-1.5 font-mono text-[12px] text-muted hover:text-accent"
          >
            {playerPath}
          </a>
        </div>
      </Card>

      <MediaMenuSheet screen={screen} open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
