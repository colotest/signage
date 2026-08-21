import type { Database, FitMode, MediaType, ScreenRotation } from "./database.types";

export type { FitMode, MediaType, ScreenRotation };

export type Screen = Database["public"]["Tables"]["screens"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type MediaItem = Database["public"]["Tables"]["media_items"]["Row"];
export type PlaylistItem = Database["public"]["Tables"]["playlist_items"]["Row"];

// What the player and Media Menu actually need: a playlist row joined with its media item.
export type PlaylistItemWithMedia = PlaylistItem & {
  media_item: MediaItem;
};

export function mediaPublicUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/media/${storagePath}`;
}
