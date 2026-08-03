"use client";

import { useRef } from "react";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, MediaItem } from "@/types/domain";

export function MediaThumb({ item, fit = "cover" }: { item: MediaItem; fit?: FitMode }) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  if (item.media_type === "image") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={item.name} className={`h-full w-full ${fitClass}`} />;
  }

  if (item.media_type === "video") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    return <VideoThumb url={url} fitClass={fitClass} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-2xl text-muted">▤</div>
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
