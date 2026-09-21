"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FitMode, ScreenRotation } from "@/types/domain";

export async function createScreen() {
  await requireSession();
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
  revalidatePath("/dashboard");
  return data;
}

export async function renameScreen(id: number, name: string) {
  await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function setFitMode(id: number, fitMode: FitMode) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ fit_mode: fitMode }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function setScreenRotation(id: number, rotation: ScreenRotation) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ rotation }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function reorderScreens(orderedIds: number[]) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_screens", { p_ids: orderedIds });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteScreen(id: number) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
