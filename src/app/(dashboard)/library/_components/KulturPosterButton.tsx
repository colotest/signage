"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addManualPoster } from "@/lib/actions/kulturPoster";
import { cn } from "@/lib/utils/cn";
import { pullKulturPoster } from "./kulturPosterPull";
import { PosterTextDialog } from "./PosterTextDialog";

// The Kultur Poster folder's buttons, beside its name: reload pulls the
// events on sale from colosseumberlin.com and makes or updates their
// posters (see kulturPosterPull); + adds a poster made by hand, which a
// pull never replaces — it starts as placeholders, and opens straight
// into its Edit Poster to be set.
export function KulturPosterButton() {
  const router = useRouter();
  // Where a pull has got to: null when idle, "" while reading the site,
  // "3/12" while making posters.
  const [progress, setProgress] = useState<string | null>(null);
  // The poster just added, being set.
  const [added, setAdded] = useState<string | null>(null);

  async function pull(first?: () => Promise<void>) {
    if (progress !== null) return;
    setProgress("");
    try {
      await first?.();
      const { made, failed } = await pullKulturPoster((done, total) => setProgress(total ? `${Math.min(done + 1, total)}/${total}` : ""));
      if (failed.length > 0) {
        alert(`${failed.length} of ${made + failed.length} posters couldn't be made:\n\n${failed.join("\n")}`);
      }
    } catch (err) {
      console.error("Kultur Poster pull failed", err);
      alert(`Couldn't pull the events: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setProgress(null);
      router.refresh();
    }
  }

  function add() {
    let key: string | null = null;
    pull(async () => {
      key = await addManualPoster();
    }).then(() => key && setAdded(key));
  }

  const busy = progress !== null;
  // Kept from the row, whose click opens and closes the folder.
  const button = (onClick: () => void) => ({
    type: "button" as const,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    disabled: busy,
    className: "no-press inline-flex shrink-0 items-center gap-1 text-muted hover:text-foreground disabled:hover:text-muted",
  });
  return (
    <>
      <span className="inline-flex shrink-0 items-center gap-2">
        <button
          {...button(() => pull())}
          title={busy ? "Pulling posters from colosseumberlin.com…" : "Pull posters from colosseumberlin.com"}
          aria-label="Pull posters from colosseumberlin.com"
        >
          <ReloadGlyph className={cn("h-[15px] w-[15px]", busy && "animate-spin")} />
          {progress && <span className="text-[12px] tabular-nums">{progress}</span>}
        </button>
        <button {...button(add)} title="Add a poster by hand" aria-label="Add a poster by hand">
          <PlusGlyph className="h-[15px] w-[15px]" />
        </button>
      </span>
      {added && (
        // Inside the folder's row, as React sees it, though drawn over the
        // page: kept from the row's clicks, drags and keys.
        <span className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <PosterTextDialog sourceKey={added} open onClose={() => setAdded(null)} />
        </span>
      )}
    </>
  );
}

// A circular arrow, as a reload button draws one.
function ReloadGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
