import { redirect } from "next/navigation";
import { currentDevice, deviceMediaToken, pairingRequired } from "@/lib/auth/screenDevice";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
import { Player } from "./Player";
import { NATIVE_PROTOCOL } from "./nativeMedia";
import { PairingCode } from "../_components/PairingCode";

// Who's watching (the TV's device cookie) decides everything here.
export const dynamic = "force-dynamic";

export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const { id } = await params;
  // Opened by the Fire TV app, which draws the media itself (see nativeMedia.ts).
  const { app } = await searchParams;
  const screenId = Number(id);

  if (!Number.isInteger(screenId)) {
    return <NotFound />;
  }

  // A TV paired with another screen plays that one. One that isn't paired
  // at all shows a code to pair it with — once pairing is required (see
  // pairingRequired); until then it plays as it always has.
  const device = await currentDevice();
  if (device && device.screenId !== screenId) {
    redirect(`/screen/${device.screenId}${app ? `?app=${encodeURIComponent(app)}` : ""}`);
  }
  if (!device && pairingRequired()) {
    return <PairingCode />;
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
      nativeMedia={app === NATIVE_PROTOCOL}
      mediaToken={device ? deviceMediaToken(device.id) : null}
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
