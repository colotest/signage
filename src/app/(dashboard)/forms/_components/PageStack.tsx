"use client";

import { useState, type ReactNode } from "react";

export type StackPage = { key: string; node: ReactNode };

// A stack of pages, the top one showing: push one on and it slides in from
// the right over the one before (which stays mounted underneath, scroll
// position and all); pop it and it slides back out. The styles are
// .page-stack-page in globals.css. Each page scrolls by itself, so give
// its content its own padding.
export function PageStack({ pages }: { pages: StackPage[] }) {
  // Pages just popped, kept until they've slid out.
  const [leaving, setLeaving] = useState<StackPage[]>([]);
  // Pages just pushed, until they've slid in.
  const [entering, setEntering] = useState<Set<string>>(new Set());
  // The pages as of the last change, by key (and the nodes, for the ones
  // that then slide out). The array itself is new on every render.
  const signature = pages.map((p) => p.key).join("\n");
  const [prev, setPrev] = useState({ signature, pages });

  // Noticed during render rather than in an effect, so a pushed page's
  // first frame already has its slide-in.
  if (signature !== prev.signature) {
    const keys = new Set(pages.map((p) => p.key));
    const prevKeys = new Set(prev.pages.map((p) => p.key));
    const popped = prev.pages.filter((p) => !keys.has(p.key));
    const pushed = pages.filter((p) => !prevKeys.has(p.key)).map((p) => p.key);
    setPrev({ signature, pages });
    if (popped.length) setLeaving((l) => [...l.filter((p) => keys.has(p.key) === false), ...popped]);
    if (pushed.length) setEntering((e) => new Set([...e, ...pushed]));
  }

  const all = [
    ...pages.map((page, i) => ({ page, below: i < pages.length - 1, isLeaving: false })),
    ...leaving.filter((l) => !pages.some((p) => p.key === l.key)).map((page) => ({ page, below: false, isLeaving: true })),
  ];

  return (
    <div className="relative h-full overflow-clip">
      {all.map(({ page, below, isLeaving }) => (
        <div
          key={page.key}
          className="page-stack-page overflow-y-auto overscroll-contain"
          data-below={below || undefined}
          data-entering={(!isLeaving && entering.has(page.key)) || undefined}
          data-leaving={isLeaving || undefined}
          inert={below || isLeaving}
          aria-hidden={below || isLeaving || undefined}
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (isLeaving) setLeaving((l) => l.filter((p) => p.key !== page.key));
            else
              setEntering((current) => {
                const next = new Set(current);
                next.delete(page.key);
                return next;
              });
          }}
        >
          {page.node}
        </div>
      ))}
    </div>
  );
}
