"use server";

import { recordActivity, screenName } from "@/lib/activity";
import { normalizePairingCode } from "@/lib/auth/screenDevice";
import { assertScreenVisible, requireScreensPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// The TVs paired with a screen (0049), from its wrench menu — which comes
// with the Screens page's settings, and only for screens the user can see.

export type PairedDevice = { id: string; label: string | null; createdAt: string; lastSeenAt: string | null };

export async function listScreenDevices(screenId: number): Promise<PairedDevice[]> {
  const user = await requireScreensPermission("settings");
  assertScreenVisible(user, screenId);
  const { data, error } = await createAdminClient()
    .from("screen_devices")
    .select("id, label, created_at, last_seen_at")
    .eq("screen_id", screenId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at, lastSeenAt: row.last_seen_at }));
}

// Claims the code a TV is showing for this screen; the TV, asking every
// few seconds, then pairs itself (see src/app/screen/pair/route.ts).
export async function pairScreenDevice(screenId: number, code: string): Promise<{ error?: string }> {
  const user = await requireScreensPermission("settings");
  assertScreenVisible(user, screenId);
  const normalized = normalizePairingCode(code);
  if (normalized.length !== 6) return { error: "The code has 6 characters." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("screen_pairings")
    .update({ screen_id: screenId, claimed_by: user.id })
    .eq("code", normalized)
    .is("screen_id", null)
    .gt("expires_at", new Date().toISOString())
    .select("code");
  if (error) throw new Error(error.message);
  if (!data?.length) return { error: "That code isn't on any TV right now — check it, or show a new one." };
  recordActivity(user, {
    action: "screen.pair",
    target: `screen:${screenId}`,
    summary: async (admin) => `Paired a TV with screen ${await screenName(admin, screenId)}`,
  });
  return {};
}

// The TV stops being this screen's: its next request for anything is
// refused (its database token runs out within the hour).
export async function unpairScreenDevice(screenId: number, deviceId: string) {
  const user = await requireScreensPermission("settings");
  assertScreenVisible(user, screenId);
  const { error } = await createAdminClient().from("screen_devices").delete().eq("id", deviceId).eq("screen_id", screenId);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.unpair",
    target: `screen:${screenId}`,
    summary: async (admin) => `Unpaired a TV from screen ${await screenName(admin, screenId)}`,
  });
}
