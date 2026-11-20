"use client";

import { createDeckUploadUrls } from "@/lib/actions/decks";
import { planKulturPoster, saveKulturPoster, type PosterJob } from "@/lib/actions/kulturPoster";
import { renderPdfPages } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";

// A Kultur Poster pull, from the browser's side — shared by the folder's
// reload button and a poster's Edit Poster Text, which pulls once its text
// is set. The server makes the PDFs (see kulturPoster.ts); their pages are
// rendered here, as for any PDF uploaded to the library, one poster at a
// time — a pull's worth at once would be a lot of canvas for a laptop to
// hold. Resolves to the posters that couldn't be made, by name.
export async function pullKulturPoster(onProgress: (done: number, total: number) => void) {
  const { jobs } = await planKulturPoster();
  const failed: string[] = [];
  for (const [i, job] of jobs.entries()) {
    onProgress(i, jobs.length);
    try {
      await makePoster(job);
    } catch (err) {
      console.error("Kultur Poster failed", job.name, err);
      failed.push(job.name);
    }
  }
  onProgress(jobs.length, jobs.length);
  return { made: jobs.length - failed.length, failed };
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
