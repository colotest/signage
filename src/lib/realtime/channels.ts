// Shared channel-name helpers so the player and the dashboard always agree
// on which Realtime channel corresponds to a given screen.

export function playlistChannelName(screenId: number) {
  return `playlist-changes:${screenId}`;
}

export function presenceChannelName(screenId: number) {
  return `screen-presence:${screenId}`;
}

export type PresencePayload = {
  mediaItemId: string;
  name: string;
  mediaType: "image" | "video" | "pdf";
  storagePath: string;
  startedAt: number;
};
