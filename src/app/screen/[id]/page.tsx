import { createAdminClient } from "@/lib/supabase/admin";
import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
import { Player } from "./Player";

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const screenId = Number(id);

  if (!Number.isInteger(screenId)) {
    return <NotFound />;
  }

  const admin = createAdminClient();
  const { data: screen } = await admin.from("screens").select("*").eq("id", screenId).single();

  if (!screen) {
    return <NotFound />;
  }

  const { data: playlist } = await admin
    .from("playlist_items")
    .select("*, media_item:media_items(*)")
    .eq("screen_id", screenId)
    .order("position", { ascending: true });

  return (
    <Player
      screen={screen as Screen}
      initialPlaylist={(playlist ?? []) as unknown as PlaylistItemWithMedia[]}
    />
  );
}

function NotFound() {
  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-black text-white/40">
      Screen not found.
    </div>
  );
}
