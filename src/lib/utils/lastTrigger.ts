// The control the user last pressed, so a popup it opens can grow out of it
// (see Sheet) and shrink back into it on close. Recorded app-wide by
// PressEffects on every pointerdown; keyboard opens fall back to whatever
// has focus.
let last: { el: HTMLElement; at: number } | null = null;

export function rememberTrigger(el: HTMLElement) {
  last = { el, at: performance.now() };
}

// Only a press from the last moment counts — a popup opened by a timer or
// a server response shouldn't fly out of something clicked minutes ago.
export function recentTrigger(): HTMLElement | null {
  if (last && performance.now() - last.at < 1000 && last.el.isConnected) return last.el;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.matches("button, a, [role='button']")) return focused;
  return null;
}
