"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { MediaItem } from "@/types/domain";

// A web page, full screen, in the player's own browser: whatever address
// is set on the page's row (page_url, from its "⋯" menu in the library —
// see WebsiteDialog). Until one is set, it's black like any slide still
// loading.
//
// The page sits in a sandboxed frame. Scripts, forms and its own storage
// work as on any tab, but it may not navigate the player away (a site's
// frame-busting `top.location = …` would otherwise take the screen off
// its playlist for good), nor open popups or dialogs over it.
//
// Not every site lets itself be shown in another page's frame
// (X-Frame-Options, or a CSP frame-ancestors): those show the browser's
// own refusal instead, which is why Edit Website checks for it when an
// address is saved.
const SANDBOX = "allow-scripts allow-same-origin allow-forms";

// A thumbnail lays the page out as a screen would — at this many CSS
// pixels along its longer side — and shrinks that to fit, rather than
// showing the site's phone layout squeezed into a few dozen pixels.
const PREVIEW_LONG_SIDE = 1920;

export function Website({ item, preview }: { item?: MediaItem; preview?: "live" | "still" }) {
  const url = item?.page_url ?? null;
  // Held back until it has loaded, so a slow site comes in over the
  // screen's background rather than over a flash of white.
  const [loaded, setLoaded] = useState<string | null>(null);

  if (!url) return <div className="h-full w-full bg-[var(--screen-bg,#000)]" />;
  // A list row's thumbnail is far too small to read, and a library full of
  // them each loading the whole site would be a lot to ask: a globe will do.
  if (preview === "still") return <WebsiteGlyph url={url} />;

  const frame = (
    <iframe
      key={url}
      src={url}
      title={item?.name ?? "Website"}
      sandbox={SANDBOX}
      allow="autoplay; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => setLoaded(url)}
      // On the dashboard the frame is only to look at: clicks and drags
      // belong to the tile around it.
      tabIndex={preview ? -1 : undefined}
      className="block h-full w-full border-0 bg-white transition-opacity duration-300"
      style={{ opacity: loaded === url ? 1 : 0, pointerEvents: preview ? "none" : undefined }}
    />
  );

  return (
    <div className="h-full w-full overflow-hidden bg-[var(--screen-bg,#000)]">
      {preview === "live" ? <Scaled>{frame}</Scaled> : frame}
    </div>
  );
}

// Lays its child out at a screen's size and shrinks it into the box it's
// given, keeping the box's own proportions.
function Scaled({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = box && box.width > 0 && box.height > 0 ? Math.min(1, Math.max(box.width, box.height) / PREVIEW_LONG_SIDE) : 1;

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {box && (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: box.width / scale, height: box.height / scale, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function WebsiteGlyph({ url }: { url: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--screen-bg,#000)] text-white/80" title={url}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[55%] max-h-12 w-[55%] max-w-12" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.75 5.6 3.75 9S14.5 18.4 12 21M12 3C9.5 5.6 8.25 8.6 8.25 12S9.5 18.4 12 21" />
      </svg>
    </div>
  );
}
