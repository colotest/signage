"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ScreenPage } from "@/components/screenPages";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, MediaItem } from "@/types/domain";

export function MediaThumb({
  item,
  fit = "cover",
  live = false,
  sizes = "64px",
  sync,
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
  // For a live video: play in step with a screen's player instead of from
  // the start — see SyncedVideo.
  sync?: VideoSync;
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
    if (live && sync) {
      return <SyncedVideo url={url} fitClass={fitClass} sync={sync} />;
    }
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

// Where a screen's player reported being in a video, and when (local clock).
export type VideoSync = {
  positionMs: number;
  reportedAt: number;
  paused: boolean;
  // Whether the player loops this video (a single-item playlist) or moves
  // on at its end — decides whether running past the end wraps or holds.
  loop: boolean;
};

// Further out of step than this and the preview jumps to where the screen
// is; closer, it's left alone, since every seek costs a visible stutter.
const MAX_DRIFT_S = 0.5;

// A video that follows a screen's player: on every report it works out
// where the screen must be by now (the reported position, plus the time
// since if it's playing) and seeks there if it's drifted, or — paused —
// stops on exactly the reported frame.
function SyncedVideo({ url, fitClass, sync }: { url: string; fitClass: string; sync: VideoSync }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { positionMs, reportedAt, paused, loop } = sync;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function align() {
      const duration = video!.duration;
      // Until its metadata is in, there's no duration to wrap against and
      // nothing to seek; loadedmetadata calls back in here.
      if (!Number.isFinite(duration) || duration <= 0) return;
      const elapsed = paused ? 0 : (Date.now() - reportedAt) / 1000;
      const raw = positionMs / 1000 + elapsed;
      const target = loop ? raw % duration : Math.min(raw, duration);
      if (paused) {
        video!.pause();
        if (Math.abs(video!.currentTime - target) > 0.01) video!.currentTime = target;
        return;
      }
      let drift = Math.abs(video!.currentTime - target);
      if (loop) drift = Math.min(drift, duration - drift); // either side of the wrap
      if (drift > MAX_DRIFT_S) video!.currentTime = target;
      video!.play().catch(() => {});
    }

    align();
    video.addEventListener("loadedmetadata", align);
    // A backgrounded dashboard tab may have had its video throttled.
    function onVisible() {
      if (document.visibilityState === "visible") align();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      video.removeEventListener("loadedmetadata", align);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [positionMs, reportedAt, paused, loop]);

  return (
    <video
      ref={videoRef}
      src={url}
      muted
      loop={loop}
      playsInline
      preload="auto"
      className={`pointer-events-none h-full w-full ${fitClass}`}
    />
  );
}
