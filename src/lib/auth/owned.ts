import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanEdit, requirePage, type CurrentUser } from "./session";

// Files, PDFs and folders can be limited by their owner to certain roles
// (0032). These look up who owns one and who it's limited to, and refuse
// anyone else — for renaming, moving, deleting, replacing and sharing.
export type OwnedKind = "media" | "deck" | "folder";

type Admin = ReturnType<typeof createAdminClient>;

export async function ownershipOf(
  admin: Admin,
  kind: OwnedKind,
  id: string,
): Promise<{ ownerId: string | null; editRoleIds: string[] }> {
  if (kind === "folder") {
    const { data, error } = await admin.from("folders").select("created_by, edit_role_ids").eq("id", id).single();
    if (error) throw new Error(error.message);
    return { ownerId: data.created_by, editRoleIds: data.edit_role_ids ?? [] };
  }
  if (kind === "deck") {
    const { data, error } = await admin.from("decks").select("uploaded_by, edit_role_ids").eq("id", id).single();
    if (error) throw new Error(error.message);
    return { ownerId: data.uploaded_by, editRoleIds: data.edit_role_ids ?? [] };
  }
  const { data, error } = await admin
    .from("media_items")
    .select("uploaded_by, edit_role_ids, deck_id")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  // A PDF's pages go by the PDF's own limits.
  if (data.deck_id) return ownershipOf(admin, "deck", data.deck_id);
  return { ownerId: data.uploaded_by, editRoleIds: data.edit_role_ids ?? [] };
}

// For changing a file, PDF or folder: the library itself, plus — if its
// owner has limited it — one of the roles it's limited to.
export async function requireEditable(kind: OwnedKind, id: string): Promise<CurrentUser> {
  const user = await requirePage("media");
  assertCanEdit(user, await ownershipOf(createAdminClient(), kind, id));
  return user;
}
