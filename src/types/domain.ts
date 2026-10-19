import type {
  Database,
  FitMode,
  MediaType,
  ScreenBackground,
  ScreenRotation,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
} from "./database.types";

export type {
  FitMode,
  MediaType,
  ScreenBackground,
  ScreenRotation,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
};

// A user as the app hands them around — never with their password hash
// (nor the unused legacy role column).
export type User = Omit<Database["public"]["Tables"]["users"]["Row"], "password_hash" | "role">;
export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type ActivityEntry = Database["public"]["Tables"]["activity_log"]["Row"];

export type Screen = Database["public"]["Tables"]["screens"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type MediaItem = Database["public"]["Tables"]["media_items"]["Row"];
export type PlaylistItem = Database["public"]["Tables"]["playlist_items"]["Row"];

// A PDF uploaded to the library, split into one media item per page (see
// 0015_pdf_decks.sql). The deck row itself is the original PDF; its pages
// are ordinary media items, so everything downstream — playlists, per-page
// durations, the player — treats them as the images they are.
export type Deck = Database["public"]["Tables"]["decks"]["Row"];

export type DeckWithPages = Deck & {
  pages: MediaItem[];
};

// What the player and Media Menu actually need: a playlist row joined with its media item.
export type PlaylistItemWithMedia = PlaylistItem & {
  media_item: MediaItem;
};

// Reusable, named playlists — independent of any screen. Deliberately a
// separate concept from PlaylistItem above (which is "what a screen is
// currently showing"), even though the two are structurally similar.
export type Playlist = Database["public"]["Tables"]["playlists"]["Row"];
export type PlaylistEntry = Database["public"]["Tables"]["playlist_entries"]["Row"];

export type PlaylistEntryWithMedia = PlaylistEntry & {
  media_item: MediaItem;
};

// A one-off timer: at run_at, the screen's playlist is replaced wholesale
// with this playlist's entries (see 0011_scheduled_playbacks.sql).
export type ScheduledPlayback = Database["public"]["Tables"]["scheduled_playbacks"]["Row"];

export function mediaPublicUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/media/${storagePath}`;
}

// A group of screens on the dashboard, arranged in its own grid (see
// 0030_screen_groups_and_setups.sql).
export type ScreenGroup = Database["public"]["Tables"]["screen_groups"]["Row"];
export type ScreenGroupMember = Database["public"]["Tables"]["screen_group_members"]["Row"];

// What a screen's or group's Playback Menu edits: a playlist plus playback
// settings, kept apart from what's on air until the menu's checkmark
// commits it (commit_setup in 0030).
export type Setup = Database["public"]["Tables"]["setups"]["Row"];
export type SetupItem = Database["public"]["Tables"]["setup_items"]["Row"];

export type SetupItemWithMedia = SetupItem & {
  media_item: MediaItem;
};

export type SetupWithItems = Setup & {
  items: SetupItemWithMedia[];
};
