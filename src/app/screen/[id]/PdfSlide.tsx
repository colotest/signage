"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Must be set in the same module that renders <Document>/<Page> — react-pdf
// re-executes this on import order otherwise. This component is only ever
// loaded client-side (see the ssr: false dynamic import in Player.tsx),
// since pdf.js needs browser canvas APIs that don't exist during SSR.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfSlide({ url, fit }: { url: string; fit: "contain" | "cover" }) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    function measure() {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // A canvas has no native object-fit, so we compute the scale ourselves:
  // "contain" fits the whole page inside the screen, "cover" fills the
  // screen and lets the page overflow (clipped by the container below).
  const scale =
    pageSize && containerSize.width && containerSize.height
      ? fit === "cover"
        ? Math.max(containerSize.width / pageSize.width, containerSize.height / pageSize.height)
        : Math.min(containerSize.width / pageSize.width, containerSize.height / pageSize.height)
      : 1;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
      <Document file={url} loading={null} error={null}>
        <Page
          pageNumber={1}
          scale={scale}
          onLoadSuccess={(page) => setPageSize({ width: page.originalWidth, height: page.originalHeight })}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </Document>
    </div>
  );
}
