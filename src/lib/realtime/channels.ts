// Shared channel-name helpers so the player and the dashboard always agree
// on which Realtime channel corresponds to a given screen.

export function playlistChannelName(screenId: number) {
  return `playlist-changes:${screenId}`;
}

// One-off playback commands sent from a dashboard tile to a screen's live
// player. Broadcast-only (never persisted) — the player applies the command
// immediately with no report-back to the dashboard.
export function controlChannelName(screenId: number) {
  return `screen-control:${screenId}`;
}

// "reload" makes the player do a full page reload — a remote stand-in for
// walking over to the TV and refreshing it by hand.
//
// "tune" sets the dials on one of the code-drawn pages (see
// screenPages/dials.ts) — the whole set each time, so a message that goes
// missing costs nothing once the next arrives. Live only: it holds until
// the player reloads, and the page's own defaults come back after that.
export type ControlMessage =
  | { type: "play" | "pause" | "next" | "prev" | "reload" }
  | { type: "tune"; page: string; tuning: Record<string, number> };
