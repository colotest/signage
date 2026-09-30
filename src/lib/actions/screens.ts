"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity, screenName } from "@/lib/activity";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FitMode,
  ScreenBackground,
  ScreenRotation,
  ScreenSlideDirection,
  ScreenTransition,
  ScreenTransitionSpeed,
} from "@/types/domain";

export async function createScreen() {
  // Adding screens is for admins only (see ScreenGrid).
  const user = await requireAdmin();
  const admin = createAdminClient();

  // Reuse the smallest free id (e.g. a deleted screen's slot) instead of
  // always incrementing, so the URL namespace doesn't grow unbounded as
  // TVs get reconfigured.
  const { data: nextId, error: idError } = await admin.rpc("next_free_screen_id");
  if (idError) throw new Error(idError.message);

  // New screens land at the top of the dashboard's manual order, so they're
  // in view right away rather than easy to forget below the fold. Going
  // negative is fine — the next drag-reorder renumbers everything from 0.
  const { data: first, error: positionError } = await admin
    .from("screens")
    .select("position")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (positionError) throw new Error(positionError.message);

  const { data, error } = await admin
    .from("screens")
    .insert({ id: nextId, position: (first?.position ?? 1) - 1 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "screen.create", summary: `Added screen ${quote(data.name)} (/screen/${data.id})` });
  revalidatePath("/dashboard");
  return data;
}

// Rename, rotation and delete live in the wrench menu, which only admins get.
export async function renameScreen(id: number, name: string) {
  const user = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const before = await screenName(admin, id);
  const { error } = await admin.from("screens").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "screen.rename", target: `screen:${id}`, summary: `Renamed screen ${before} to ${quote(trimmed)}` });
  revalidatePath("/dashboard");
}

export async function setFitMode(id: number, fitMode: FitMode) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ fit_mode: fitMode }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.fit",
    target: `screen:${id}`,
    summary: async (admin) => `Set screen ${await screenName(admin, id)} to ${fitMode === "cover" ? "fill" : "fit"} the screen`,
  });
  revalidatePath("/dashboard");
}

export async function setScreenBackground(id: number, background: ScreenBackground) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ background }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.background",
    target: `screen:${id}`,
    summary: async (admin) => `Set the background of screen ${await screenName(admin, id)} to ${background}`,
  });
  revalidatePath("/dashboard");
}

export async function setScreenTransition(id: number, transition: ScreenTransition) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ transition }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.transition",
    target: `screen:${id}`,
    summary: async (admin) => `Set the transition on screen ${await screenName(admin, id)} to ${transition}`,
  });
  revalidatePath("/dashboard");
}

export async function setScreenTransitionSpeed(id: number, speed: ScreenTransitionSpeed) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ transition_speed: speed }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.transition_speed",
    target: `screen:${id}`,
    summary: async (admin) => `Set the transition speed on screen ${await screenName(admin, id)} to ${speed}`,
  });
  revalidatePath("/dashboard");
}

export async function setScreenSlideDirection(id: number, direction: ScreenSlideDirection) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ slide_direction: direction }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.slide_direction",
    target: `screen:${id}`,
    summary: async (admin) => `Set the slide direction on screen ${await screenName(admin, id)} to ${direction}`,
  });
  revalidatePath("/dashboard");
}

export async function setScreenRotation(id: number, rotation: ScreenRotation) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ rotation }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.rotation",
    target: `screen:${id}`,
    summary: async (admin) => `Rotated screen ${await screenName(admin, id)} to ${rotation}°`,
  });
  revalidatePath("/dashboard");
}

export async function reorderScreens(orderedIds: number[]) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_screens", { p_ids: orderedIds });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "screens.reorder", target: "screens", summary: "Reordered the screens" });
  revalidatePath("/dashboard");
}

export async function deleteScreen(id: number) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const { data: deleted, error } = await admin.from("screens").delete().eq("id", id).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "screen.delete", summary: `Deleted screen ${quote(deleted?.[0]?.name)} (/screen/${id})` });
  revalidatePath("/dashboard");
}
