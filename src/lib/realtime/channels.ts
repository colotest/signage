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

export type ControlMessage = { type: "play" | "pause" | "next" | "prev" };
