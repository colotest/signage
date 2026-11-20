"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { pullKulturPoster } from "./kulturPosterPull";

// The Kultur Poster folder's reload button, beside its name: pulls the
// events on sale from colosseumberlin.com and makes or updates their
// posters (see kulturPosterPull).
export function KulturPosterButton() {
  const router = useRouter();
  // Where a pull has got to: null when idle, "" while reading the site,
  // "3/12" while making posters.
  const [progress, setProgress] = useState<string | null>(null);

  async function pull() {
    if (progress !== null) return;
    setProgress("");
    try {
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

  const busy = progress !== null;
  return (
    <button
      type="button"
      // Kept from the row, whose click opens and closes the folder.
      onClick={(e) => {
        e.stopPropagation();
        pull();
      }}
      disabled={busy}
      title={busy ? "Pulling posters from colosseumberlin.com…" : "Pull posters from colosseumberlin.com"}
      aria-label="Pull posters from colosseumberlin.com"
      className="no-press inline-flex shrink-0 items-center gap-1 text-muted hover:text-foreground disabled:hover:text-muted"
    >
      <ReloadGlyph className={cn("h-[15px] w-[15px]", busy && "animate-spin")} />
      {progress && <span className="text-[12px] tabular-nums">{progress}</span>}
    </button>
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
