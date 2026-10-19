"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { canRestrictOwned } from "@/lib/auth/access";
import { ownershipOf, type OwnedKind } from "@/lib/auth/owned";
import { requirePage } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const TABLE = { media: "media_items", deck: "decks", folder: "folders" } as const;
const NOUN = { media: "file", deck: "PDF", folder: "folder" } as const;

// Limits a file, PDF or folder to one more of its owner's roles, or lifts
// that limit again. Only its owner (or the super admin) may, and only with
// roles they hold themselves. A PDF's pages follow the PDF, so they can't
// be limited on their own.
export async function setEditRole(kind: OwnedKind, id: string, roleId: string, limited: boolean) {
  const user = await requirePage("media");
  if (!user.access.roleIds.includes(roleId)) throw new Error("You can only use roles you have.");
  const admin = createAdminClient();
  const { ownerId, editRoleIds } = await ownershipOf(admin, kind, id);
  if (!canRestrictOwned(user, ownerId)) throw new Error("Only its owner can limit who edits this.");
  if (kind === "media") {
    const { data: item } = await admin.from("media_items").select("deck_id").eq("id", id).single();
    if (item?.deck_id) throw new Error("A PDF's pages follow the PDF itself.");
  }

  const next = limited ? [...new Set([...editRoleIds, roleId])] : editRoleIds.filter((r) => r !== roleId);
  const { data: updated, error } = await admin
    .from(TABLE[kind])
    .update({ edit_role_ids: next })
    .eq("id", id)
    .select("name");
  if (error) throw new Error(error.message);

  const { data: role } = await admin.from("roles").select("name").eq("id", roleId).maybeSingle();
  recordActivity(user, {
    action: `${kind}.limit`,
    summary: limited
      ? `Limited editing the ${NOUN[kind]} ${quote(updated?.[0]?.name)} to ${quote(role?.name)}`
      : `Lifted the ${quote(role?.name)} limit on the ${NOUN[kind]} ${quote(updated?.[0]?.name)}`,
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
}
