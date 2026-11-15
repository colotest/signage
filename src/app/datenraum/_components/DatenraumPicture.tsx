"use client";

import Image, { getImageProps } from "next/image";
import { useState } from "react";

// A Datenraum picture, resized by next/image rather than the original file:
// uploads are often full-resolution PNGs of several megabytes (up to 12),
// where a WebP at the size it's shown is a fraction of that. Urgent ones
// (what's in view first) are fetched straight away and ahead of the rest;
// the others wait until they're near and come after. If resizing fails —
// the optimizer can give up on a very large original — the original is
// shown instead (as in MediaThumb).
export function DatenraumPicture({
  src,
  alt,
  sizes,
  urgent = false,
  className,
}: {
  src: string;
  alt: string;
  // How wide it's shown (an img sizes attribute), to pick the size fetched.
  sizes: string;
  urgent?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={failed}
      onError={() => setFailed(true)}
      loading={urgent ? "eager" : "lazy"}
      fetchPriority={urgent ? "high" : "low"}
      draggable={false}
      className={className}
    />
  );
}

// The same picture fetched ahead, quietly, before it's shown — the very
// file a DatenraumPicture with these sizes will then ask for, so it's there
// already. Each only once.
const fetched = new Set<string>();
export function prefetchPicture(src: string, sizes: string) {
  const key = `${src} ${sizes}`;
  if (fetched.has(key) || typeof window === "undefined") return;
  fetched.add(key);
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  const img = new window.Image();
  img.fetchPriority = "low";
  img.decoding = "async";
  if (props.sizes) img.sizes = props.sizes;
  if (props.srcSet) img.srcset = props.srcSet;
  img.src = props.src;
}

// How wide a slider's picture is shown: the full height of the segment
// beside the text (the window's, less the strip at the top and the margin
// below) times its aspect — or, on a narrow screen, of the 4:3 box under
// its text.
export function sliderSizes(aspect: number, widePx: number) {
  const a = aspect.toFixed(3);
  return `(min-width: ${widePx}px) calc(${a} * (100vh - 150px)), calc(${a} * 75vw)`;
}
