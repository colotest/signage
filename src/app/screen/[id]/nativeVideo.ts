// The Fire TV app (android/) opens this player with ?app=1 in a transparent
// WebView and puts this object on window before the page's scripts run.
// Videos are handed to it rather than played in a <video>: it decodes them
// with the stick's own hardware player straight onto a surface underneath
// the page, which is the one path a stick plays video smoothly on, and keeps
// each file on its own storage. Everything else — images, pages, the
// placeholder, transitions — still renders here, on top of it, so wherever
// the page is transparent the video shows through.
//
// One video at a time. Each play() gets a new handle, and calls or events
// for an older handle are ignored, so a slide that's already been replaced
// can't pause or end the one that replaced it.
export type NativeVideoBridge = {
  play(handle: number, url: string, paused: boolean, loop: boolean, fit: string, rotation: number): void;
  setPaused(handle: number, paused: boolean): void;
  setLoop(handle: number, loop: boolean): void;
  setLayout(fit: string, rotation: number): void;
  stop(): void;
  // Where in the current video playback is, in milliseconds.
  positionMs(): number;
  // The screen's background, as #rrggbb: painted behind the page and around
  // a letterboxed video.
  setBackground(color: string): void;
  // Downloads a video into the app's own media store ahead of time.
  preload(url: string): void;
  // Deletes every stored video whose URL isn't in this JSON array.
  retain(urlsJson: string): void;
};

declare global {
  interface Window {
    SignageNative?: NativeVideoBridge;
    // Called by the app: "ended", or "change" when playback starts, pauses
    // or jumps (a loop back to the start).
    __signageNative?: (handle: number, event: string) => void;
  }
}

export function nativeVideoBridge(): NativeVideoBridge | undefined {
  return typeof window === "undefined" ? undefined : window.SignageNative;
}
