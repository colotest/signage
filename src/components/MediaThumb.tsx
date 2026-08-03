"use client";

import { useRef } from "react";
import { mediaPublicUrl } from "@/types/domain";
import type { MediaItem } from "@/types/domain";

export function MediaThumb({ item }: { item: MediaItem }) {
  if (item.media_type === "image") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={item.name} className="h-full w-full object-cover" />;
  }

  if (item.media_type === "video") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    return <VideoThumb url={url} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-2xl text-muted">▤</div>
  );
}

// Shows the video's first frame as a static thumbnail, without playing it.
// There's no server-side thumbnail generation (no ffmpeg pipeline) — instead
// we nudge currentTime forward a hair once the browser has data, which
// reliably forces it to decode and paint a frame instead of staying blank.
function VideoThumb({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <video
      ref={videoRef}
      src={url}
      muted
      playsInline
      preload="metadata"
      className="pointer-events-none h-full w-full object-cover"
      onLoadedData={() => {
        const video = videoRef.current;
        if (video && video.currentTime === 0) video.currentTime = 0.01;
      }}
    />
  );
}
