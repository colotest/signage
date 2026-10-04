import { useState } from "react";

// Keeps something mounted after it's told to close, until its exit
// animation has played: `mounted` stays true while `closing`, and the
// component calls `done()` once the animation ends (onAnimationEnd).
export function usePresence(open: boolean) {
  const [lingering, setLingering] = useState(open);
  // Adjusted during render (not in an effect) so opening mounts in the same
  // commit, with no frame where it's missing.
  if (open && !lingering) setLingering(true);
  return {
    mounted: open || lingering,
    closing: !open && lingering,
    done: () => setLingering(false),
  };
}
