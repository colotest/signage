// Shared channel-name helpers so the player and the dashboard always agree
// on which Realtime channel corresponds to a given screen.

export function playlistChannelName(screenId: number) {
  return `playlist-changes:${screenId}`;
}

export function presenceChannelName(screenId: number) {
  return `screen-presence:${screenId}`;
}

// A player always tracks presence once connected, even with nothing
// assigned — the media fields are only present when something is actually
// showing, so "connected" and "has content" can be told apart.
export type PresencePayload = {
  mediaItemId: string;
  name: string;
  mediaType: "image" | "video" | "pdf";
  storagePath: string;
  startedAt: number;
  paused: boolean;
} | {
  mediaItemId?: undefined;
};

// One-off playback commands sent from a dashboard tile to a screen's live
// player. Broadcast-only (never persisted) — the player applies the command
// immediately and reports the resulting paused state back via presence, so
// there's nothing for the dashboard to reconcile on its own.
export function controlChannelName(screenId: number) {
  return `screen-control:${screenId}`;
}

export type ControlMessage = { type: "play" | "pause" | "next" | "prev" };
