"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils/cn";

// A list that grows with its content up to `maxHeight`, then scrolls with a
// plain hard edge — the blurring and fading happens elsewhere, on the
// headings next to it (see the Playback Menu). `overlapTop`/`overlapBottom`
// let the list's box reach up/down under those headings, so its hard edge
// sits right where their blur is strongest and is never seen; matching
// padding keeps the first and last rows clear of the headings at rest.
// `maxHeight` and the reported natural height are both the list's share of
// the layout, overlaps not included.
//
// Inside a scrolling page (`outerRef`), a wheel or trackpad gesture that
// runs this list to its end carries straight on into the page instead of
// stopping dead: browsers latch a gesture to whichever box it started in,
// so without the hand-off below the page only moves on the NEXT gesture.
// Touch keeps the browser's own chaining (the next swipe moves the page).
//
// The other way round, iOS gets it wrong: flick the page, and a finger put
// down on this list while the page is still gliding goes on moving the
// page. So a touch starting here while the page has only just moved stops
// the page dead — its scrolling is taken away until the finger's up —
// which leaves this list as the one thing there to scroll.
//
// A change of cap eases in rather than snapping — the lists' caps shift
// whenever the layout around them does (the file browser closing, the other
// list growing), and a jump there pushes everything below it around.
// How recently the page has to have moved for a touch on the list to count
// as landing mid-glide — a gliding page reports a scroll every frame.
const PAGE_GLIDE_MS = 100;

export function ListScroller({
  children,
  maxHeight,
  overlapTop = 0,
  overlapBottom = 0,
  outerRef,
  scrollRef,
  onNaturalHeight,
  onEdges,
  contentClassName,
  contentStyle,
  easeCap = true,
  scrollable = true,
}: {
  children: ReactNode;
  maxHeight?: number;
  overlapTop?: number;
  overlapBottom?: number;
  outerRef?: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onNaturalHeight?: (height: number) => void;
  // Whether there's more to scroll to above/below what's showing.
  onEdges?: (edges: { top: boolean; bottom: boolean }) => void;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  // Off while something else is setting the cap frame by frame (see the
  // Playback Menu's picker), where an ease would only make it lag behind.
  easeCap?: boolean;
  // Off: clipped but not scrolling at all — every wheel, trackpad or touch
  // scroll over it goes straight to the page (the Playback Menu, while
  // picking files, where scrolling means scrolling the file browser shut).
  scrollable?: boolean;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const callbacksRef = useRef({ onNaturalHeight, onEdges });
  const scrollableRef = useRef(scrollable);
  useEffect(() => {
    callbacksRef.current = { onNaturalHeight, onEdges };
    scrollableRef.current = scrollable;
  });

  useLayoutEffect(() => {
    const el = ownRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    if (scrollRef) scrollRef.current = el;

    let last = { top: false, bottom: false };
    function updateEdges() {
      const node = ownRef.current;
      if (!node) return;
      const next = {
        top: node.scrollTop > 1,
        bottom: node.scrollTop + node.clientHeight < node.scrollHeight - 1,
      };
      if (next.top === last.top && next.bottom === last.bottom) return;
      last = next;
      callbacksRef.current.onEdges?.(next);
    }

    const observer = new ResizeObserver(() => {
      callbacksRef.current.onNaturalHeight?.(content.offsetHeight);
      updateEdges();
    });
    observer.observe(content);
    observer.observe(el);
    el.addEventListener("scroll", updateEdges, { passive: true });

    function handleWheel(e: WheelEvent) {
      const outer = outerRef?.current;
      const node = ownRef.current;
      if (!outer || !node || !scrollableRef.current) return;
      const max = node.scrollHeight - node.clientHeight;
      if (max <= 0) return; // nothing to scroll here — the page takes it anyway
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1;
      const dy = e.deltaY * unit;
      const target = node.scrollTop + dy;
      if (target >= 0 && target <= max) return; // still inside the list
      e.preventDefault();
      const inside = Math.min(max, Math.max(0, target)) - node.scrollTop;
      node.scrollTop += inside;
      outer.scrollTop += dy - inside;
    }
    el.addEventListener("wheel", handleWheel, { passive: false });

    // Heard from the document (scroll doesn't bubble, but it can be
    // captured): the page's element isn't there yet when this runs — the
    // page's ref is set only after its contents' effects.
    let outerMovedAt = -Infinity;
    const onOuterScroll = (e: Event) => {
      if (e.target === outerRef?.current) outerMovedAt = performance.now();
    };
    let releaseOuter: (() => void) | null = null;
    function handleTouchStart() {
      const node = ownRef.current;
      const outer = outerRef?.current;
      if (!outer || !node || !scrollableRef.current || releaseOuter) return;
      if (node.scrollHeight - node.clientHeight <= 0) return; // nothing to scroll here
      if (performance.now() - outerMovedAt > PAGE_GLIDE_MS) return; // the page is at rest
      outer.style.overflowY = "hidden";
      const release = () => {
        outer.style.overflowY = "";
        window.removeEventListener("touchend", release);
        window.removeEventListener("touchcancel", release);
        releaseOuter = null;
      };
      releaseOuter = release;
      window.addEventListener("touchend", release);
      window.addEventListener("touchcancel", release);
    }
    document.addEventListener("scroll", onOuterScroll, { capture: true, passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateEdges);
      el.removeEventListener("wheel", handleWheel);
      document.removeEventListener("scroll", onOuterScroll, { capture: true });
      el.removeEventListener("touchstart", handleTouchStart);
      releaseOuter?.();
      if (scrollRef) scrollRef.current = null;
    };
  }, [outerRef, scrollRef]);

  return (
    <div
      ref={ownRef}
      className={cn("no-scrollbar", scrollable ? "overflow-y-auto" : "overflow-y-hidden")}
      style={{
        maxHeight: maxHeight === undefined ? undefined : maxHeight + overlapTop + overlapBottom,
        marginTop: -overlapTop,
        marginBottom: -overlapBottom,
        paddingTop: overlapTop,
        paddingBottom: overlapBottom,
        transition: easeCap ? "max-height 300ms ease-out" : "none",
      }}
    >
      <div ref={contentRef} className={contentClassName} style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
