"use client";

import * as pdfjs from "pdfjs-dist";

// The same worker the player's PdfSlide uses, resolved through the bundler
// rather than a CDN so this keeps working on a venue connection that can't
// reach one.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

// Long edge of a rendered page, in pixels. 1080p screens are the target and
// a page is shown whole, so this is a comfortable margin over what any of
// them can actually display, without making every page a multi-megabyte
// file.
const MAX_EDGE = 1920;
// Slides are mostly flat colour and text, where JPEG at this quality is
// indistinguishable at screen size and a fraction of a PNG's size. The
// original PDF is kept either way, so nothing is lost for good.
const JPEG_QUALITY = 0.92;

export type RenderedPage = {
  blob: Blob;
  width: number;
  height: number;
};

// Renders every page of a PDF to a JPEG, in the browser — there's no
// server-side converter anywhere in this app, and this keeps it that way.
// onProgress reports pages finished so an upload of a long deck can say
// where it's got to.
export async function renderPdfPages(file: File, onProgress?: (done: number, total: number) => void): Promise<RenderedPage[]> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      // Never upscale a page that's already larger than we need it, and
      // never blow a small one up past its own resolution either.
      const viewport = page.getViewport({ scale: Math.min(MAX_EDGE / Math.max(base.width, base.height), 4) });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser wouldn't give us a canvas to render the PDF on.");

      // A PDF page's own background is transparent where nothing is drawn,
      // and JPEG has no transparency — without this, blank areas come out
      // black instead of the white they're meant to be.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) throw new Error(`Page ${pageNumber} wouldn't render.`);
      pages.push({ blob, width: canvas.width, height: canvas.height });

      // Frees the canvas's own backing store right away rather than at the
      // next collection — a long deck at this size is a lot of memory to
      // leave lying around on a laptop, let alone a tablet.
      canvas.width = 0;
      canvas.height = 0;

      onProgress?.(pageNumber, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
