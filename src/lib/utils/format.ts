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

// The file browser's "Resolution & Duration" column — "1920×1080 px &
// 1:05 min" (or "& 10s" under a minute), or whichever half applies, or nothing at all (a folder, a
// built-in page) rather than a placeholder dash. `extent` stands in for the
// duration where something else measures the length, like a PDF's pages.
export function formatResolutionAndDuration(
  width: number | null,
  height: number | null,
  seconds: number | null,
  extent?: string,
): string {
  const parts: string[] = [];
  if (width != null && height != null) parts.push(`${width}×${height} px`);
  if (seconds != null) {
    // "10s" under a minute, "1:10 min" from a full minute on.
    const total = Math.round(seconds);
    parts.push(total < 60 ? `${total}s` : `${formatDuration(total)} min`);
  }
  else if (extent) parts.push(extent);
  return parts.join(" & ");
}

// A Finder-style "Kind" column — the file's format spelled out in words
// rather than a raw MIME type (e.g. "MP4 Video" instead of "video/mp4").
export function kindLabel(item: Pick<MediaItem, "media_type" | "mime_type"> & Partial<Pick<MediaItem, "deck_id">>): string {
  if (item.media_type === "pdf") return "PDF Document";
  if (item.media_type === "page") return "Page";
  if ("deck_id" in item && item.deck_id) return "PDF Page";
  const subtype = item.mime_type.split("/")[1]?.toUpperCase() ?? "";
  return item.media_type === "video" ? `${subtype} Video` : `${subtype} Image`;
}
