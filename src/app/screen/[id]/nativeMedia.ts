import type { MediaItem, ScreenSlideDirection, ScreenTransition } from "@/types/domain";

// The Fire TV app (android/) opens this player in a transparent WebView,
// with ?app=<NATIVE_PROTOCOL>, and puts this object on window before the
// page's scripts run. Images and videos are then drawn by the app rather
// than here: it decodes them with the stick's own hardware onto views
// underneath the page, runs the transitions between them natively, and
// keeps every file on its own storage. The page still decides what's on
// screen and when — playlists, timing, timed playback, remote controls,
// status — and still draws the code-rendered pages and the placeholder
// itself, on top; wherever the page is transparent, the app shows through.
//
// Each show() gets a new handle, and calls or events for an older one are
// ignored, so a slide that's already been replaced can't pause or end the
// one that replaced it.
export type NativeMediaBridge = {
  // A JSON NativeSlide.
  show(handle: number, slide: string): void;
  setPaused(handle: number, paused: boolean): void;
  setLoop(handle: number, loop: boolean): void;
  setLayout(fit: string, rotation: number): void;
  // Where in the video on screen playback is, in milliseconds.
  positionMs(): number;
  // The screen's background, as #rrggbb: behind every slide, around a
  // letterboxed one, and behind the page.
  setBackground(color: string): void;
  // Downloads a file into the app's own media store ahead of time.
  preload(url: string): void;
  // Decodes an image that's about to be shown, so it appears without delay.
  prepare(url: string): void;
  // Deletes every stored file whose URL isn't in this JSON array.
  retain(urlsJson: string): void;
};

// What to show next, and how to get there from what's showing now. "none"
// is a slide the page draws itself (or nothing at all): the app takes its
// own slide off screen with the same transition, while the page brings its
// slide on.
export type NativeSlide = {
  kind: "image" | "video" | "none";
  url: string | null;
  transition: ScreenTransition;
  direction: ScreenSlideDirection;
  durationMs: number;
  paused: boolean;
  loop: boolean;
  // A video slows to a stop over this long at its end, landing on its last
  // frame, before the transition to whatever's next (0 for none — a cut).
  // Not while it loops, which has no end.
  easeOutMs: number;
};

// Which ?app= value this page speaks. The app sends its own; any other
// value (an older app) gets the plain browser player, which still works in
// its WebView, rather than calls it doesn't understand. Bump both together
// on a breaking change.
export const NATIVE_PROTOCOL = "2";

// Formats the app decodes itself. Anything else — an animated GIF, an SVG
// — is left to the page, which handles it like any browser would.
const NATIVE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function nativeKind(media: MediaItem): "image" | "video" | "none" {
  if (media.media_type === "video") return "video";
  if (media.media_type === "image" && NATIVE_IMAGE_TYPES.includes(media.mime_type)) return "image";
  return "none";
}

declare global {
  interface Window {
    SignageNative?: NativeMediaBridge;
    // Called by the app: "ended", or "change" when a video starts, pauses
    // or jumps (a loop back to the start).
    __signageNative?: (handle: number, event: string) => void;
  }
}

export function nativeMediaBridge(): NativeMediaBridge | undefined {
  return typeof window === "undefined" ? undefined : window.SignageNative;
}
