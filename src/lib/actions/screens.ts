"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScreenOrientation } from "@/types/domain";

export async function createScreen() {
  await requireSession();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("screens")
    .insert({})
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

export async function setOrientation(id: number, orientation: ScreenOrientation) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("screens").update({ orientation }).eq("id", id);
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
