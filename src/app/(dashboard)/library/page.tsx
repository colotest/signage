import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryView } from "./_components/LibraryView";
import type { PlaylistEntryWithMedia } from "@/types/domain";
import type { PlaylistWithEntries } from "./_components/PlaylistSection";

export default async function LibraryPage() {
  const admin = createAdminClient();

  const [
    { data: folders, error: foldersError },
    { data: media, error: mediaError },
    { data: playlists, error: playlistsError },
    { data: playlistEntries, error: entriesError },
  ] = await Promise.all([
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
    admin.from("playlists").select("*").order("position", { ascending: true }),
    admin
      .from("playlist_entries")
      .select("*, media_item:media_items(*)")
      .order("playlist_id", { ascending: true })
      .order("position", { ascending: true }),
  ]);

  if (foldersError) throw new Error(foldersError.message);
  if (mediaError) throw new Error(mediaError.message);
  if (playlistsError) throw new Error(playlistsError.message);
  if (entriesError) throw new Error(entriesError.message);

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

  return <LibraryView folders={folders ?? []} media={media ?? []} playlists={playlistsWithEntries} />;
}
