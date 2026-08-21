import { createAdminClient } from "@/lib/supabase/admin";
import { ScreenGrid } from "./_components/ScreenGrid";
import type { PlaylistItemWithMedia } from "@/types/domain";

export default async function DashboardPage() {
  const admin = createAdminClient();

  // Previews used to come from realtime presence — what the live player
  // last reported. That turned out to be unreliable enough (a screen could
  // sit reported "offline" for no real reason) that it's simpler and more
  // trustworthy to just show what's actually assigned, straight from the
  // database, rather than depending on a connected player to say so.
  const [{ data: screens, error: screensError }, { data: playlistItems, error: playlistError }] =
    await Promise.all([
      admin.from("screens").select("*").order("id", { ascending: true }),
      admin
        .from("playlist_items")
        .select("*, media_item:media_items(*)")
        .order("screen_id", { ascending: true })
        .order("position", { ascending: true }),
    ]);

  if (screensError) throw new Error(screensError.message);
  if (playlistError) throw new Error(playlistError.message);

  const playlistsByScreen = new Map<number, PlaylistItemWithMedia[]>();
  for (const item of (playlistItems ?? []) as unknown as PlaylistItemWithMedia[]) {
    const list = playlistsByScreen.get(item.screen_id);
    if (list) list.push(item);
    else playlistsByScreen.set(item.screen_id, [item]);
  }

  const screensWithPlaylists = (screens ?? []).map((screen) => ({
    ...screen,
    playlist: playlistsByScreen.get(screen.id) ?? [],
  }));

  return <ScreenGrid screens={screensWithPlaylists} />;
}
