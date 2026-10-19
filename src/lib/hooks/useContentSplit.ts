import { useEffect, type RefObject } from "react";

// How a phone splits a column between two stacked sections that each end
// in a scrolling list — the Library's files and playlists — the way the
// Playback Menu splits Now Playing and Playlists: each section gets what
// its list needs, and only once together they'd outgrow the column does
// either scroll inside itself, each then held to half of it unless the
// other needs less and leaves it more.
//
// The first section is sized (straight on its element, as a flex basis);
// the second takes whatever is left — it's the one running on to the
// bottom of the screen. From sm up nothing is set, and the sections' own
// classes decide.
const PHONE = "(max-width: 639.98px)";

export function useContentSplit(
  containerRef: RefObject<HTMLElement | null>,
  firstRef: RefObject<HTMLElement | null>,
  secondRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const container = containerRef.current;
    const first = firstRef.current;
    const second = secondRef.current;
    if (!container || !first || !second) return;
    const phone = window.matchMedia(PHONE);
    let frame = 0;
    let placed = false;

    const apply = () => {
      if (!phone.matches) {
        first.style.removeProperty("flex");
        first.style.removeProperty("transition");
        placed = false;
        return;
      }
      const gap = parseFloat(getComputedStyle(container).rowGap) || 0;
      const room = Math.max(0, container.clientHeight - gap);
      const half = room / 2;
      const a = naturalHeight(first);
      const b = naturalHeight(second);
      if (a === null || b === null) return;
      const height = Math.round(Math.min(a, Math.max(half, room - b)));
      // Sized at once on arrival; after that, eased between sizes as lists
      // grow and shrink (a folder opening, a search narrowing the files).
      first.style.transition = placed ? "flex-basis 350ms var(--ease-spring)" : "none";
      first.style.flex = `0 0 ${height}px`;
      placed = true;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    // Watched: the column, and everything inside each list (rows come and
    // go, folders open, cards expand).
    const resizeObserver = new ResizeObserver(schedule);
    const watch = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(container);
      for (const section of [first, second]) {
        const scroller = section.querySelector<HTMLElement>(".scroll-window-scroller");
        if (!scroller) continue;
        for (const child of scroller.children) resizeObserver.observe(child);
      }
    };
    const mutationObserver = new MutationObserver(() => {
      watch();
      schedule();
    });
    for (const section of [first, second]) {
      const scroller = section.querySelector(".scroll-window-scroller");
      if (scroller) mutationObserver.observe(scroller, { childList: true });
    }
    watch();
    apply();
    phone.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      phone.removeEventListener("change", schedule);
      first.style.removeProperty("flex");
      first.style.removeProperty("transition");
    };
  }, [containerRef, firstRef, secondRef]);
}

// The height a section would need to show its whole list: as it stands,
// less the list's visible height, plus the list's full content (its rows
// and its own padding).
function naturalHeight(section: HTMLElement): number | null {
  const scroller = section.querySelector<HTMLElement>(".scroll-window-scroller");
  if (!scroller) return null;
  const style = getComputedStyle(scroller);
  let content = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  for (const child of scroller.children) {
    if (!(child instanceof HTMLElement)) continue;
    const position = getComputedStyle(child).position;
    if (position === "absolute" || position === "fixed") continue;
    content += child.offsetHeight;
  }
  return section.offsetHeight - scroller.clientHeight + content;
}
