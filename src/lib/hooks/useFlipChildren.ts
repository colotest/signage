import { useLayoutEffect, useRef } from "react";

// Slides a row's children into their new places when the row's layout
// changes (something appearing beside them, a label getting longer), rather
// than letting them jump there — the FLIP technique: after each render,
// compare every child's position with where it was, start it back at its
// old spot with `translate` and let it glide home. Only horizontal moves,
// as this is for rows. Children appearing for the first time have nothing
// to glide from (give them their own entrance, e.g. pop-in).
export function useFlipChildren<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const positions = useRef(new WeakMap<Element, number>());

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const child of Array.from(row.children)) {
      // Hidden (display: none, e.g. desktop-only columns): no position.
      if (!(child instanceof HTMLElement) || child.offsetParent === null) continue;
      const x = child.offsetLeft;
      const prev = positions.current.get(child);
      positions.current.set(child, x);
      if (prev === undefined || prev === x || reducedMotion) continue;
      child.animate([{ translate: `${prev - x}px 0` }, { translate: "0 0" }], {
        duration: 560,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      });
    }
  });

  return ref;
}
