// While a page sheet is up on a phone (see Sheet), the page behind it is
// almost entirely hidden — and installed to the Home Screen it's also being
// scaled back and forward as one layer. Anything in it that repaints itself
// every frame (a lava lamp's WebGL, glitter, a ticking clock, a looping
// video preview on a screen tile) then forces that whole layer to be redrawn
// on every frame of the card's motion, which is what made pulling it back
// down stutter. So for as long as a card is up, all of that holds still:
// from the moment it's presented until its close has played out.
//
// Only what's in the page itself (.app-shell) freezes. The card's own
// contents are portalled outside it, and keep going.

let frozen = false;
const pausedVideos = new Set<HTMLVideoElement>();
const thawListeners = new Set<() => void>();

export function freezePageMotion() {
  if (frozen) return;
  frozen = true;
  for (const video of document.querySelectorAll<HTMLVideoElement>(".app-shell video")) {
    if (video.paused) continue;
    pausedVideos.add(video);
    video.pause();
  }
}

export function thawPageMotion() {
  if (!frozen) return;
  frozen = false;
  for (const video of pausedVideos) {
    if (video.isConnected) video.play().catch(() => {});
  }
  pausedVideos.clear();
  for (const listener of thawListeners) listener();
}

// Whether something at `el` should hold still right now. Cheap enough to
// ask every frame: when nothing's frozen it's a single boolean.
export function isMotionFrozen(el: Element | null | undefined) {
  return frozen && !!el?.closest(".app-shell");
}

// For anything that has to do more than just carry on when the page comes
// back — a synced video preview re-aligning with its screen, say.
export function onPageMotionThaw(listener: () => void) {
  thawListeners.add(listener);
  return () => {
    thawListeners.delete(listener);
  };
}
