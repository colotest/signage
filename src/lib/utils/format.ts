import type { MediaItem } from "@/types/domain";

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${unitIndex > 0 && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatResolution(width: number | null, height: number | null): string {
  if (width == null || height == null) return "—";
  return `${width}×${height}`;
}

// A Finder-style "Kind" column — the file's format spelled out in words
// rather than a raw MIME type (e.g. "MP4 Video" instead of "video/mp4").
export function kindLabel(item: Pick<MediaItem, "media_type" | "mime_type">): string {
  if (item.media_type === "pdf") return "PDF Document";
  const subtype = item.mime_type.split("/")[1]?.toUpperCase() ?? "";
  return item.media_type === "video" ? `${subtype} Video` : `${subtype} Image`;
}
