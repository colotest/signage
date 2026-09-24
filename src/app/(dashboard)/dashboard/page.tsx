import { createAdminClient } from "@/lib/supabase/admin";
import { ScreenGrid } from "./_components/ScreenGrid";
import type { PlaylistEntryWithMedia, PlaylistItemWithMedia, ScheduledPlayback } from "@/types/domain";
import type { PlaylistWithEntries } from "../library/_components/PlaylistSection";
import { decksWithPages } from "../library/page";

export default async function DashboardPage() {
  const admin = createAdminClient();

  // Previews used to come from realtime presence — what the live player
  // last reported. That turned out to be unreliable enough (a screen could
  // sit reported "offline" for no real reason) that it's simpler and more
  // trustworthy to just show what's actually assigned, straight from the
  // database, rather than depending on a connected player to say so.
  //
  // The folders/media/playlists below feed each screen's Playback Menu,
  // which shows the same file tree and playlists as the Library page.
  const [
    { data: screens, error: screensError },
    { data: playlistItems, error: playlistError },
    { data: folders, error: foldersError },
    { data: media, error: mediaError },
    { data: playlists, error: playlistsError },
    { data: playlistEntries, error: entriesError },
    { data: schedules, error: schedulesError },
    { data: decks, error: decksError },
  ] = await Promise.all([
    admin
      .from("screens")
      .select("*")
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("playlist_items")
      .select("*, media_item:media_items(*)")
      .order("screen_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
    admin.from("playlists").select("*").order("position", { ascending: true }),
    admin
      .from("playlist_entries")
      .select("*, media_item:media_items(*)")
      .order("playlist_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("scheduled_playbacks").select("*").order("run_at", { ascending: true }),
    admin.from("decks").select("*").order("created_at", { ascending: false }),
  ]);

  if (screensError) throw new Error(screensError.message);
  if (decksError) throw new Error(decksError.message);
  if (playlistError) throw new Error(playlistError.message);
  if (foldersError) throw new Error(foldersError.message);
  if (mediaError) throw new Error(mediaError.message);
  if (playlistsError) throw new Error(playlistsError.message);
  if (entriesError) throw new Error(entriesError.message);
  // Tolerated until 0011_scheduled_playbacks.sql has been run — the table
  // simply isn't there yet, which shouldn't take the whole dashboard down.
  if (schedulesError) {
    if (schedulesError.code !== "PGRST205" && schedulesError.code !== "42P01") throw new Error(schedulesError.message);
    console.warn("scheduled_playbacks unavailable — has migration 0011 been run?", schedulesError.message);
  }

  const playlistsByScreen = new Map<number, PlaylistItemWithMedia[]>();
  for (const item of (playlistItems ?? []) as unknown as PlaylistItemWithMedia[]) {
    const list = playlistsByScreen.get(item.screen_id);
    if (list) list.push(item);
    else playlistsByScreen.set(item.screen_id, [item]);
  }

  const schedulesByScreen = new Map<number, ScheduledPlayback[]>();
  for (const schedule of schedules ?? []) {
    const list = schedulesByScreen.get(schedule.screen_id);
    if (list) list.push(schedule);
    else schedulesByScreen.set(schedule.screen_id, [schedule]);
  }

  const screensWithPlaylists = (screens ?? []).map((screen) => ({
    ...screen,
    playlist: playlistsByScreen.get(screen.id) ?? [],
    schedules: schedulesByScreen.get(screen.id) ?? [],
  }));

  const entriesByPlaylist = new Map<string, PlaylistEntryWithMedia[]>();
  for (const entry of (playlistEntries ?? []) as unknown as PlaylistEntryWithMedia[]) {
    const list = entriesByPlaylist.get(entry.playlist_id);
    if (list) list.push(entry);
    else entriesByPlaylist.set(entry.playlist_id, [entry]);
  }

  const playlistsWithEntries: PlaylistWithEntries[] = (playlists ?? []).map((playlist) => ({
    ...playlist,
    entries: entriesByPlaylist.get(playlist.id) ?? [],
  }));

  return (
    <ScreenGrid
      screens={screensWithPlaylists}
      library={{
        folders: folders ?? [],
        media: media ?? [],
        decks: decksWithPages(decks ?? [], media ?? []),
        playlists: playlistsWithEntries,
      }}
    />
  );
}
