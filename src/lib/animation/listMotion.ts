// Shared list motion for rows, playlist cards and screen tiles.
//
// Removal: the element blurs and fades out first, then the space it leaves
// closes up — the rest of the list slides into it and settles.
// Entrance (the same thing in reverse): the space opens up first, pushing
// the rest of the list aside, then the element blurs into view within it.
//
// Runs on the live DOM node (Web Animations API) rather than through React
// state, so it works the same whether the row disappears optimistically or
// only once router.refresh() drops it. Every animation holds its end state
// (fill: forwards), so the element stays invisible and zero-sized until
// React actually unmounts it — nothing jumps if the server round trip
// outlasts the animation.

const FADE_MS = 200;
const CLOSE_GAP_MS = 380;
const EASE_OUT = "cubic-bezier(0.25, 1, 0.5, 1)";
// Matches --ease-spring in globals.css.
const EASE_SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

export type ListAnimation = {
  finished: Promise<void>;
  // Puts the element back exactly as it was — for when the delete fails.
  cancel: () => void;
};

export function animateRemoval(el: HTMLElement | null | undefined): ListAnimation {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { finished: Promise.resolve(), cancel: () => {} };
  }

  const animations: Animation[] = [];
  const originalStyle = el.getAttribute("style");
  let cancelled = false;

  el.style.pointerEvents = "none";
  const fade = el.animate(
    [
      { opacity: 1, filter: "blur(0px)" },
      { opacity: 0, filter: "blur(10px)" },
    ],
    { duration: FADE_MS, easing: EASE_OUT, fill: "forwards" },
  );
  animations.push(fade);

  const finished = fade.finished
    .then(() => {
      if (cancelled) return;
      const parent = el.parentElement;
      const display = parent ? getComputedStyle(parent).display : "block";
      // A grid reflows in two dimensions, which a height collapse can't
      // express — its remaining items glide to their new cells instead.
      const closing = display.includes("grid") ? slideSiblingsIntoPlace(el) : collapse(el);
      animations.push(...closing);
      return Promise.all(closing.map((a) => a.finished)).then(() => {});
    })
    // Cancelling rejects .finished — that's expected, not an error.
    .catch(() => {});

  return {
    finished,
    cancel: () => {
      cancelled = true;
      animations.forEach((a) => a.cancel());
      if (originalStyle === null) el.removeAttribute("style");
      else el.setAttribute("style", originalStyle);
    },
  };
}

export function animateEntrance(el: HTMLElement | null | undefined): ListAnimation {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { finished: Promise.resolve(), cancel: () => {} };
  }

  const style = getComputedStyle(el);
  const gap = columnGap(el);
  const previousOverflow = el.style.overflow;
  el.style.overflow = "hidden";

  const open = el.animate(
    [
      {
        height: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        borderTopWidth: "0px",
        borderBottomWidth: "0px",
        marginTop: "0px",
        marginBottom: `${-gap}px`,
      },
      {
        height: `${el.getBoundingClientRect().height}px`,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
      },
    ],
    { duration: CLOSE_GAP_MS, easing: EASE_SPRING },
  );
  // Created up front with a delay (held at its first frame meanwhile) rather
  // than chained off open.finished, so there's no frame in between where
  // the row shows at full opacity.
  const appear = el.animate(
    [
      { opacity: 0, filter: "blur(10px)" },
      { opacity: 1, filter: "blur(0px)" },
    ],
    { duration: FADE_MS + 60, delay: CLOSE_GAP_MS, easing: EASE_OUT, fill: "backwards" },
  );
  open.finished
    .then(() => {
      el.style.overflow = previousOverflow;
    })
    .catch(() => {});

  return {
    finished: appear.finished.then(() => {}).catch(() => {}),
    cancel: () => {
      open.cancel();
      appear.cancel();
      el.style.overflow = previousOverflow;
    },
  };
}

// Fades the element out while its server-side delete runs, and only
// resolves once both are done — so the caller's router.refresh() can't
// unmount it halfway through. Restores it if the delete throws.
export async function removeWithAnimation(el: HTMLElement | null | undefined, action: () => Promise<unknown>) {
  const removal = animateRemoval(el);
  try {
    await Promise.all([removal.finished, action()]);
  } catch (err) {
    removal.cancel();
    throw err;
  }
}

// Shrinks the element's box to nothing — padding, border and margins
// included — so everything after it slides up in step. In a flex column the
// gap next to it would still be left over at zero height, so a matching
// negative margin swallows it too.
function collapse(el: HTMLElement): Animation[] {
  const style = getComputedStyle(el);
  const gap = columnGap(el);

  el.style.overflow = "hidden";
  return [
    el.animate(
      [
        {
          height: `${el.getBoundingClientRect().height}px`,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          borderTopWidth: style.borderTopWidth,
          borderBottomWidth: style.borderBottomWidth,
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
        },
        {
          height: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          borderTopWidth: "0px",
          borderBottomWidth: "0px",
          marginTop: "0px",
          marginBottom: `${-gap}px`,
        },
      ],
      { duration: CLOSE_GAP_MS, easing: EASE_SPRING, fill: "forwards" },
    ),
  ];
}

// The row gap of a flex column the element sits in (0 for anything else).
function columnGap(el: HTMLElement) {
  const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
  return parentStyle?.display.includes("flex") && parentStyle.flexDirection.startsWith("column")
    ? parseFloat(parentStyle.rowGap) || 0
    : 0;
}

// FLIP: take the element out of layout, then start each sibling back where
// it was and let it glide to its new spot.
function slideSiblingsIntoPlace(el: HTMLElement): Animation[] {
  const siblings = Array.from(el.parentElement?.children ?? []).filter(
    (child): child is HTMLElement => child !== el && child instanceof HTMLElement,
  );
  const before = siblings.map((s) => s.getBoundingClientRect());
  el.style.display = "none";

  return siblings.flatMap((sibling, i) => {
    const after = sibling.getBoundingClientRect();
    const dx = before[i].left - after.left;
    const dy = before[i].top - after.top;
    if (dx === 0 && dy === 0) return [];
    return [
      sibling.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: CLOSE_GAP_MS + 80,
        easing: EASE_SPRING,
      }),
    ];
  });
}
