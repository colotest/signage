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
} | {
  mediaItemId?: undefined;
};
