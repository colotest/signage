"use client";

import { planKulturPoster, saveKulturPoster, type PosterJob } from "@/lib/actions/kulturPoster";
import { createPosterUploadUrls } from "@/lib/actions/posters";
import { renderPdfPages, type RenderedPage } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";

// A Kultur Poster pull, from the browser's side — shared by the folder's
// reload button and a poster's Edit Poster Text, which pulls once its text
// is set. The server makes the PDFs (see kulturPoster.ts); their images are
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

// A poster's three files: its A1 PDF, with an image of its page to stand
// for it in the library (no screen shows it, so it needn't be large), and
// its two PNGs — the portrait screen's at twice its 1080×1920, as sharp as
// a 4K screen shows it, the newsletter's at its own 1920×1080, plenty for
// an email.
async function makePoster(job: PosterJob) {
  const pdf = (format: keyof PosterJob["pdfs"]) =>
    new File([Uint8Array.from(atob(job.pdfs[format]), (c) => c.charCodeAt(0))], `${job.name} – ${format}.pdf`, { type: "application/pdf" });
  const a1 = pdf("a1");
  const [[a1Page], [screen], [newsletter]] = await Promise.all([
    renderPdfPages(a1, undefined, { maxEdge: 1600 }),
    renderPdfPages(pdf("screen"), undefined, { type: "image/png", maxEdge: 3840 }),
    renderPdfPages(pdf("newsletter"), undefined, { type: "image/png", maxEdge: 1920 }),
  ]);
  const slots = await createPosterUploadUrls();

  const supabase = createBrowserClient();
  const put = (slot: { storagePath: string; token: string }, body: Blob) =>
    supabase.storage.from("media").uploadToSignedUrl(slot.storagePath, slot.token, body);
  const uploads = await Promise.all([put(slots.a1, a1), put(slots.a1Page, a1Page.blob), put(slots.screen, screen.blob), put(slots.newsletter, newsletter.blob)]);
  for (const { error } of uploads) if (error) throw error;

  const image = (slot: { storagePath: string }, page: RenderedPage) => ({
    storagePath: slot.storagePath,
    width: page.width,
    height: page.height,
    sizeBytes: page.blob.size,
  });
  await saveKulturPoster({
    sourceKey: job.sourceKey,
    hash: job.hash,
    name: job.name,
    linkUrl: job.linkUrl,
    posterId: job.posterId,
    files: {
      a1: { storagePath: slots.a1.storagePath, sizeBytes: a1.size, page: image(slots.a1Page, a1Page) },
      screen: image(slots.screen, screen),
      newsletter: image(slots.newsletter, newsletter),
    },
  });
}
