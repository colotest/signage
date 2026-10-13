"use server";

import { revalidatePath } from "next/cache";
import { mediaNames, plural, quote, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ScreenBackground,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
  SetupItemWithMedia,
} from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

// Edits to a Playback Menu's setup (see 0030): none of these reach a screen
// on their own — only commitSetup does.

// `screen “Lobby”` or `group “Foyer”`, for the activity log.
async function setupOwner(admin: Admin, setupId: string) {
  const { data } = await admin
    .from("setups")
    .select("screen:screens!setups_screen_id_fkey(name), group:screen_groups(name)")
    .eq("id", setupId)
    .maybeSingle();
  const row = data as unknown as { screen: { name: string } | null; group: { name: string } | null } | null;
  if (row?.group) return `group ${quote(row.group.name)}`;
  return `screen ${quote(row?.screen?.name)}`;
}

// Appends (or, from the file browser, prepends) to a setup's playlist, each
// with its own duration, and hands the inserted rows back with their media
// so the menu can swap its optimistic rows for the real ones.
export async function addItemsToSetup(
  setupId: string,
  items: { mediaId: string; durationSeconds?: number }[],
  at: "start" | "end",
): Promise<SetupItemWithMedia[]> {
  const user = await requireSession();
  if (items.length === 0) return [];
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("setup_items")
    .select("id, position")
    .eq("setup_id", setupId)
    .order("position", { ascending: true });
  if (existingError) throw new Error(existingError.message);

  const startPosition = at === "end" ? (existing?.at(-1)?.position ?? -1) + 1 : 0;
  const { data: inserted, error: insertError } = await admin
    .from("setup_items")
    .insert(
      items.map((item, i) => ({
        setup_id: setupId,
        media_item_id: item.mediaId,
        position: startPosition + i,
        duration_seconds: Math.max(1, Math.round(item.durationSeconds ?? 10)),
      })),
    )
    .select("*, media_item:media_items(*)");
  if (insertError) throw new Error(insertError.message);

  const rows = ((inserted ?? []) as unknown as SetupItemWithMedia[]).sort((a, b) => a.position - b.position);

  // Front insertion: the new rows took positions 0..n-1, colliding with
  // what was already there — renumber everything so they genuinely lead.
  if (at === "start" && existing && existing.length > 0) {
    const { error } = await admin.rpc("reorder_setup_items", {
      p_setup_id: setupId,
      p_ids: [...rows.map((r) => r.id), ...existing.map((r) => r.id)],
    });
    if (error) throw new Error(error.message);
  }

  recordActivity(user, {
    action: "setup.add",
    summary: async (admin) =>
      `Added ${await mediaNames(admin, items.map((i) => i.mediaId))} to the setup of ${await setupOwner(admin, setupId)}`,
  });
  return rows;
}

export async function removeSetupItem(itemId: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: removed, error } = await admin
    .from("setup_items")
    .delete()
    .eq("id", itemId)
    .select("setup_id, media_item:media_items(name)");
  if (error) throw new Error(error.message);
  const item = removed?.[0] as unknown as { setup_id: string; media_item: { name: string } | null } | undefined;
  if (item) {
    recordActivity(user, {
      action: "setup.remove",
      summary: async (admin) =>
        `Removed ${quote(item.media_item?.name)} from the setup of ${await setupOwner(admin, item.setup_id)}`,
    });
  }
}

export async function reorderSetup(setupId: string, orderedItemIds: string[]) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_setup_items", { p_setup_id: setupId, p_ids: orderedItemIds });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "setup.reorder",
    target: `setup:${setupId}`,
    summary: async (admin) => `Reordered the setup of ${await setupOwner(admin, setupId)}`,
  });
}

export async function updateSetupItemDuration(itemId: string, durationSeconds: number) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("setup_items")
    .update({ duration_seconds: Math.max(1, Math.round(durationSeconds)) })
    .eq("id", itemId)
    .select("setup_id, duration_seconds, media_item:media_items(name)");
  if (error) throw new Error(error.message);
  const item = updated?.[0] as unknown as
    | { setup_id: string; duration_seconds: number; media_item: { name: string } | null }
    | undefined;
  if (item) {
    recordActivity(user, {
      action: "setup.duration",
      target: `setup_item:${itemId}`,
      summary: async (admin) =>
        `Set ${quote(item.media_item?.name)} in the setup of ${await setupOwner(admin, item.setup_id)} to ${plural(item.duration_seconds, "second")}`,
    });
  }
}

export type SetupSettings = {
  background?: ScreenBackground;
  transition?: ScreenTransition;
  transition_speed?: ScreenTransitionSpeed;
  slide_direction?: ScreenSlideDirection;
};

export async function updateSetupSettings(setupId: string, settings: SetupSettings) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("setups").update(settings).eq("id", setupId);
  if (error) throw new Error(error.message);
  const [key, value] = Object.entries(settings)[0] ?? [];
  if (!key) return;
  recordActivity(user, {
    action: `setup.${key}`,
    target: `setup:${setupId}`,
    summary: async (admin) => `Set the ${key.replace("_", " ")} of ${await setupOwner(admin, setupId)}'s setup to ${value}`,
  });
}

// The Playback Menu's checkmark: puts the setup on air, on its screen or on
// every screen in its group (commit_setup in 0030).
export async function commitSetup(setupId: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("commit_setup", { p_setup_id: setupId });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "setup.commit",
    summary: async (admin) => `Put the setup of ${await setupOwner(admin, setupId)} on air`,
  });
  revalidatePath("/dashboard");
}
