"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDeckUploadUrls } from "@/lib/actions/decks";
import { planKulturPoster, saveKulturPoster, type PosterJob } from "@/lib/actions/kulturPoster";
import { renderPdfPages } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

// The Kultur Poster folder's reload button, beside its name: pulls the
// events on sale from colosseumberlin.com and makes or updates their
// posters (see kulturPoster.ts). The server makes the PDFs; their pages
// are rendered here, as for any PDF uploaded to the library, one poster
// at a time — a pull's worth at once would be a lot of canvas for a
// laptop to hold.
export function KulturPosterButton() {
  const router = useRouter();
  // Where a pull has got to: null when idle, "" while reading the site,
  // "3/12" while making posters.
  const [progress, setProgress] = useState<string | null>(null);

  async function pull() {
    if (progress !== null) return;
    setProgress("");
    try {
      const { jobs, archived } = await planKulturPoster();
      if (archived > 0) router.refresh();
      const failed: string[] = [];
      for (const [i, job] of jobs.entries()) {
        setProgress(`${i + 1}/${jobs.length}`);
        try {
          await makePoster(job);
        } catch (err) {
          console.error("Kultur Poster failed", job.name, err);
          failed.push(job.name);
        }
      }
      if (failed.length > 0) {
        alert(`${failed.length} of ${jobs.length} posters couldn't be made:\n\n${failed.join("\n")}`);
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

async function makePoster(job: PosterJob) {
  const bytes = Uint8Array.from(atob(job.pdf), (c) => c.charCodeAt(0));
  const file = new File([bytes], `${job.name}.pdf`, { type: "application/pdf" });
  const pages = await renderPdfPages(file);
  const { original, pages: slots } = await createDeckUploadUrls({ pageCount: pages.length });

  const supabase = createBrowserClient();
  const uploads = [
    supabase.storage.from("media").uploadToSignedUrl(original.storagePath, original.token, file),
    ...pages.map((page, i) => supabase.storage.from("media").uploadToSignedUrl(slots[i].storagePath, slots[i].token, page.blob)),
  ];
  for (const { error } of await Promise.all(uploads)) if (error) throw error;

  await saveKulturPoster({
    sourceKey: job.sourceKey,
    hash: job.hash,
    name: job.name,
    deckId: job.deckId,
    storagePath: original.storagePath,
    sizeBytes: file.size,
    pages: pages.map((page, i) => ({
      storagePath: slots[i].storagePath,
      width: page.width,
      height: page.height,
      sizeBytes: page.blob.size,
    })),
  });
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
