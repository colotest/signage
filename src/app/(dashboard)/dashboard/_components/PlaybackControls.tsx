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
        "inline-flex self-start shrink-0 items-center rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => send({ type: "prev" })}
        className="rounded-full p-1.5 text-muted hover:text-foreground"
        aria-label="Previous item"
      >
        <SkipBackIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => send({ type: paused ? "play" : "pause" })}
        className="rounded-full p-1.5 text-muted hover:text-foreground"
        aria-label={paused ? "Play" : "Pause"}
      >
        {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => send({ type: "next" })}
        className="rounded-full p-1.5 text-muted hover:text-foreground"
        aria-label="Next item"
      >
        <SkipForwardIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
