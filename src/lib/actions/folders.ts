"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createFolder(name: string, parentId: string | null = null) {
  const user = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folders")
    .insert({ name: trimmed, parent_id: parentId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "folder.create", summary: `Created folder ${quote(trimmed)}` });
  revalidatePath("/library");
  return data;
}

export async function renameFolder(id: string, name: string) {
  const user = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { data: before } = await admin.from("folders").select("name").eq("id", id).maybeSingle();
  const { error } = await admin.from("folders").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "folder.rename",
    target: `folder:${id}`,
    summary: `Renamed folder ${quote(before?.name)} to ${quote(trimmed)}`,
  });
  revalidatePath("/library");
}

export async function deleteFolder(id: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  // media_items.folder_id references folders with ON DELETE SET NULL, so
  // files move to "Unsorted" automatically rather than being deleted.
  const { data: deleted, error } = await admin.from("folders").delete().eq("id", id).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "folder.delete", summary: `Deleted folder ${quote(deleted?.[0]?.name)}` });
  revalidatePath("/library");
}
