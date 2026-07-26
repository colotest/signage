"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createFolder(name: string) {
  await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { data, error } = await admin.from("folders").insert({ name: trimmed }).select().single();
  if (error) throw new Error(error.message);
  revalidatePath("/library");
  return data;
}

export async function renameFolder(id: string, name: string) {
  await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { error } = await admin.from("folders").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function deleteFolder(id: string) {
  await requireSession();
  const admin = createAdminClient();
  // media_items.folder_id references folders with ON DELETE SET NULL, so
  // files move to "Unsorted" automatically rather than being deleted.
  const { error } = await admin.from("folders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}
