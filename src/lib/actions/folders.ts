"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { assertCanEdit, requirePage } from "@/lib/auth/session";
import { requireEditable } from "@/lib/auth/owned";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createFolder(name: string, parentId: string | null = null) {
  const user = await requirePage("media");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("folders")
    .insert({ name: trimmed, parent_id: parentId, created_by: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "folder.create", summary: `Created folder ${quote(trimmed)}` });
  revalidatePath("/library");
  return data;
}

export async function renameFolder(id: string, name: string) {
  const user = await requireEditable("folder", id);
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
  const user = await requireEditable("folder", id);
  const admin = createAdminClient();
  // Its subfolders go with it, so each of those has to be one the user may
  // delete too.
  const { data: folders, error: foldersError } = await admin.from("folders").select("id, parent_id, created_by, edit_role_ids");
  if (foldersError) throw new Error(foldersError.message);
  const doomed = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const folder of folders ?? []) {
      if (folder.parent_id && doomed.has(folder.parent_id) && !doomed.has(folder.id)) {
        doomed.add(folder.id);
        grew = true;
        assertCanEdit(user, { ownerId: folder.created_by, editRoleIds: folder.edit_role_ids ?? [] });
      }
    }
  }

  // media_items.folder_id references folders with ON DELETE SET NULL, so
  // files move to "Unsorted" automatically rather than being deleted.
  const { data: deleted, error } = await admin.from("folders").delete().eq("id", id).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "folder.delete", summary: `Deleted folder ${quote(deleted?.[0]?.name)}` });
  revalidatePath("/library");
}
