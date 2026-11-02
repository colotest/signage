import { canSeeScreen, type Access } from "@/lib/auth/access";
import type { ScreenStatusRow } from "@/lib/realtime/useScreenStatuses";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { MediaItem, PlaylistItemWithMedia, Screen } from "@/types/domain";

// The venue's screens, for their pins on the Events page's map: each with
// what's on air (the dashboard's preview fallback) and its timers, each
// window with the playlist it plays then — to show what a screen will be
// on at a moment scrubbed to on the Events calendar.
export type VenueScreen = Screen & {
  onAir: PlaylistItemWithMedia[];
  schedules: { runAt: string; endsAt: string; media: MediaItem[] }[];
};

export type VenueScreens = {
  screens: VenueScreen[];
  // What each player last reported (see useScreenStatuses); null before
  // migration 0025, when the previews show what's on air instead.
  statuses: ScreenStatusRow[] | null;
  // Anything a player might report it's showing, by id.
  media: MediaItem[];
};

const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

// Only the screens the viewer's roles let them see — none without the
// Screens page.
export async function fetchVenueScreens(admin: ReturnType<typeof createAdminClient>, access: Access): Promise<VenueScreens> {
  if (!access.pages.screens) return { screens: [], statuses: null, media: [] };
  const [
    { data: screens, error: screensError },
    { data: onAir, error: onAirError },
    { data: media, error: mediaError },
    { data: schedules, error: schedulesError },
    { data: entries, error: entriesError },
    { data: statuses, error: statusesError },
  ] = await Promise.all([
    admin.from("screens").select("*").order("position", { ascending: true }),
    admin
      .from("playlist_items")
      .select("*, media_item:media_items(*)")
      .order("screen_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("media_items").select("*"),
    admin.from("scheduled_playbacks").select("*").order("run_at", { ascending: true }),
    admin
      .from("playlist_entries")
      .select("playlist_id, position, media_item:media_items(*)")
      .order("playlist_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("screen_status_live").select("*"),
  ]);
  for (const error of [screensError, onAirError, mediaError, entriesError]) if (error) throw new Error(error.message);
  // Tolerated, as on the dashboard, until 0011 and 0025 have been run.
  for (const error of [schedulesError, statusesError]) {
    if (error && !MISSING_TABLE.has(error.code)) throw new Error(error.message);
  }

  const onAirByScreen = new Map<number, PlaylistItemWithMedia[]>();
  for (const item of (onAir ?? []) as unknown as PlaylistItemWithMedia[]) {
    onAirByScreen.set(item.screen_id, [...(onAirByScreen.get(item.screen_id) ?? []), item]);
  }
  const mediaByPlaylist = new Map<string, MediaItem[]>();
  for (const entry of (entries ?? []) as unknown as { playlist_id: string; media_item: MediaItem | null }[]) {
    if (!entry.media_item) continue;
    mediaByPlaylist.set(entry.playlist_id, [...(mediaByPlaylist.get(entry.playlist_id) ?? []), entry.media_item]);
  }
  const schedulesByScreen = new Map<number, VenueScreen["schedules"]>();
  for (const s of schedulesError ? [] : (schedules ?? [])) {
    const window = { runAt: s.run_at, endsAt: s.ends_at, media: mediaByPlaylist.get(s.playlist_id) ?? [] };
    schedulesByScreen.set(s.screen_id, [...(schedulesByScreen.get(s.screen_id) ?? []), window]);
  }

  return {
    screens: (screens ?? [])
      .filter((screen) => canSeeScreen(access, screen.id))
      .map((screen) => ({
        ...screen,
        onAir: onAirByScreen.get(screen.id) ?? [],
        schedules: schedulesByScreen.get(screen.id) ?? [],
      })),
    statuses: statusesError ? null : (statuses ?? []),
    media: media ?? [],
  };
}

// What a screen shows at a moment: its timer's playlist if one's running
// then, or else what's on air — first item of either, null for nothing.
export function screenMediaAt(screen: VenueScreen, at: Date): MediaItem | null {
  const t = at.getTime();
  const window = screen.schedules.find((s) => new Date(s.runAt).getTime() <= t && t < new Date(s.endsAt).getTime());
  if (window) return window.media[0] ?? null;
  return screen.onAir[0]?.media_item ?? null;
}
