"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ScreenPage } from "@/components/screenPages";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, MediaItem } from "@/types/domain";

export function MediaThumb({
  item,
  fit = "cover",
  live = false,
  sizes = "64px",
}: {
  item: MediaItem;
  fit?: FitMode;
  // Actually plays the video instead of showing a static first frame — a
  // handful of muted, small preview videos costs negligible CPU/bandwidth,
  // so screen tiles (where there's only ever one per screen) use this for
  // a genuinely live-looking preview. Lists of many items (media library,
  // assignment menus) keep the still-frame default instead.
  live?: boolean;
  // How wide the thumbnail renders, for picking a resized variant — the
  // default fits the small list thumbnails; larger callers pass their own.
  sizes?: string;
}) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  // Pages render themselves live at any size, so the thumbnail is the real
  // thing — a ticking clock on the screen tile, just like the TV.
  if (item.media_type === "page") {
    return <ScreenPage item={item} />;
  }

  if (item.media_type === "image") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    return <ImageThumb key={url} url={url} alt={item.name} sizes={sizes} fitClass={fitClass} />;
  }

  if (item.media_type === "video") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    if (live) {
      return (
        <video
          src={url}
          autoPlay
          loop
          muted
          playsInline
          className={`pointer-events-none h-full w-full ${fitClass}`}
        />
      );
    }
    return <VideoThumb url={url} fitClass={fitClass} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-2xl text-muted">▤</div>
  );
}

// Resized by next/image rather than the original file: uploads are
// full-resolution print/screen assets (some several MB, 4500×8000), and a
// 32px list thumbnail was downloading all of it. The TV player doesn't use
// this component and still gets the originals. If resizing fails (the
// optimizer gives up on an original that takes too long to fetch), falls
// back to the original rather than showing nothing.
function ImageThumb({ url, alt, sizes, fitClass }: { url: string; alt: string; sizes: string; fitClass: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative block h-full w-full">
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized={failed}
        onError={() => setFailed(true)}
        className={fitClass}
      />
    </span>
  );
}

// Shows the video's first frame as a static thumbnail, without playing it.
// There's no server-side thumbnail generation (no ffmpeg pipeline) — instead
// we rely on two overlapping tricks, since browsers vary in how reliably
// either one alone decodes and paints a frame on its own:
// - a Media Fragments URI (#t=0.1) hints the browser to seek there itself
//   while loading metadata, which several browsers honor without any JS;
// - a JS nudge to currentTime as a fallback, tried on whichever of
//   loadedmetadata/loadeddata/canplay fires first for a given browser.
function VideoThumb({ url, fitClass }: { url: string; fitClass: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekedRef = useRef(false);

  function trySeek() {
    if (seekedRef.current) return;
    const video = videoRef.current;
    if (video && video.currentTime === 0) {
      seekedRef.current = true;
      video.currentTime = 0.1;
    }
  }

  return (
    <video
      ref={videoRef}
      src={`${url}#t=0.1`}
      muted
      playsInline
      preload="metadata"
      className={`pointer-events-none h-full w-full ${fitClass}`}
      onLoadedMetadata={trySeek}
      onLoadedData={trySeek}
      onCanPlay={trySeek}
    />
  );
}
