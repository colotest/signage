import { useLayoutEffect, useRef, type RefObject } from "react";
import { animateEntrance } from "./listMotion";

const SETTLE_MS = 340;
// Matches --ease-spring in globals.css.
const EASE_SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

// FLIP for a list whose rows come and go or change order — a folder landing
// in its sorted place, a sort flipping, a file being deleted. Each row is
// measured after every render and, if it has moved since the last one,
// started back at its old position and animated to its new one, so the list
// rearranges itself rather than cutting to the result.
//
// Rows are matched by their own data-flip-key, and measured by offsetTop
// rather than a viewport rect: these lists scroll, and a rect would read
// every row as "moved" the moment the list is scrolled between renders.
export function useFlipRows(
  containerRef: RefObject<HTMLElement | null>,
  // A row that is new this render and should open its own space rather than
  // appear in place — the folder just created, say.
  entranceKey?: string | null,
) {
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const previous = positions.current;
    const next = new Map<string, number>();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const row of rows) {
      const key = row.dataset.flipKey;
      if (!key) continue;
      const top = row.offsetTop;
      next.set(key, top);
      if (still) continue;

      const before = previous.get(key);
      if (before === undefined) {
        // First render of the list isn't an arrival — only a row appearing
        // into a list that was already on screen is.
        if (previous.size > 0 && key === entranceKey) animateEntrance(row);
        continue;
      }
      const dy = before - top;
      if (Math.abs(dy) < 1) continue;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: SETTLE_MS,
        easing: EASE_SPRING,
      });
    }

    positions.current = next;
  });
}
