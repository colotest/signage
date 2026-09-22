"use client";

import type { ControlMessage } from "@/lib/realtime/channels";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "@/components/icons/PlaybackIcons";

// paused/onTogglePaused are owned by the parent (ScreenTile) rather than
// this component, since the preview's pause overlay needs to reflect the
// same state. There's no way to confirm a screen actually received and
// applied a command — realtime presence used to report that back, but it
// proved unreliable enough to remove — so this is a local, optimistic
// reflection of "what was last asked of it" rather than a verified status.
//
// `send` comes from ScreenTile's one useScreenControl, shared with the
// wrench menu's Reload — one channel per screen rather than one each.
export function PlaybackControls({
  send,
  paused,
  onTogglePaused,
}: {
  send: (message: ControlMessage) => void;
  paused: boolean;
  onTogglePaused: () => void;
}) {

  function handleTogglePause() {
    send({ type: paused ? "play" : "pause" });
    onTogglePaused();
  }

  return (
    <div className="inline-flex self-start shrink-0 rounded-full bg-black/[.05] dark:bg-white/[.08] p-0.5 text-[13px]">
      <button
        type="button"
        onClick={() => send({ type: "prev" })}
        title="Previous item"
        aria-label="Previous item"
        className="press-ghost-fit rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <SkipBackIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleTogglePause}
        title={paused ? "Play" : "Pause"}
        aria-label={paused ? "Play" : "Pause"}
        className="press-ghost-fit rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => send({ type: "next" })}
        title="Next item"
        aria-label="Next item"
        className="press-ghost-fit rounded-full p-1.5 text-muted transition-colors hover:text-foreground"
      >
        <SkipForwardIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
