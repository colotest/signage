import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryView } from "./_components/LibraryView";
import type { DeckWithPages, MediaItem, PlaylistEntryWithMedia } from "@/types/domain";
import type { PlaylistWithEntries } from "./_components/PlaylistSection";

export default async function LibraryPage() {
  const admin = createAdminClient();

  const [
    { data: folders, error: foldersError },
    { data: media, error: mediaError },
    { data: playlists, error: playlistsError },
    { data: playlistEntries, error: entriesError },
    { data: decks, error: decksError },
  ] = await Promise.all([
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
    admin.from("playlists").select("*").order("position", { ascending: true }),
    admin
      .from("playlist_entries")
      .select("*, media_item:media_items(*)")
      .order("playlist_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("decks").select("*").order("created_at", { ascending: false }),
  ]);

  if (foldersError) throw new Error(foldersError.message);
  if (mediaError) throw new Error(mediaError.message);
  if (playlistsError) throw new Error(playlistsError.message);
  if (entriesError) throw new Error(entriesError.message);
  if (decksError) throw new Error(decksError.message);

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
    <LibraryView
      folders={folders ?? []}
      media={media ?? []}
      decks={decksWithPages(decks ?? [], media ?? [])}
      playlists={playlistsWithEntries}
    />
  );
}

// A deck's pages come out of the same media_items the library already
// fetches — they're ordinary items that happen to carry a deck_id — so
// they're grouped here rather than fetched a second time.
export function decksWithPages(decks: DeckWithPages[] | Omit<DeckWithPages, "pages">[], media: MediaItem[]): DeckWithPages[] {
  const pagesByDeck = new Map<string, MediaItem[]>();
  for (const item of media) {
    if (!item.deck_id) continue;
    const list = pagesByDeck.get(item.deck_id);
    if (list) list.push(item);
    else pagesByDeck.set(item.deck_id, [item]);
  }
  for (const pages of pagesByDeck.values()) {
    pages.sort((a, b) => (a.deck_position ?? 0) - (b.deck_position ?? 0));
  }
  return decks.map((deck) => ({ ...deck, pages: pagesByDeck.get(deck.id) ?? [] }));
}
