"use client";

import { cn } from "@/lib/utils/cn";
import { useScreenControl } from "@/lib/realtime/useScreenControl";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "@/components/icons/PlaybackIcons";

export function PlaybackControls({
  screenId,
  paused,
  disabled,
}: {
  screenId: number;
  paused: boolean;
  disabled?: boolean;
}) {
  const { send } = useScreenControl(screenId);

  return (
    <div
      className={cn(
        "inline-flex self-start shrink-0 rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => send({ type: "prev" })}
        title="Previous item"
        aria-label="Previous item"
        className="rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <SkipBackIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => send({ type: paused ? "play" : "pause" })}
        title={paused ? "Play" : "Pause"}
        aria-label={paused ? "Play" : "Pause"}
        className="rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => send({ type: "next" })}
        title="Next item"
        aria-label="Next item"
        className="rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <SkipForwardIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
