"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import {
  PAGES,
  USERS_PERMISSIONS,
  parseHsl,
  formatHsl,
  type RoleAccess,
} from "@/lib/auth/access";
import { requireUsersPermission, type CurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type RoleInput = { name: string; color: string; access: RoleAccess };

const MAX_NAME = 40;

// What a role may allow is capped by what its editor can do: nobody hands
// out a page, an option or a screen they don't have themselves. (The super
// admin has everything, so isn't capped.) For a role its editor already
// holds this loses nothing — whatever it allows, they have.
function cleanAccess(user: CurrentUser, input: RoleAccess): RoleAccess {
  const own = user.access;
  const pages = Object.fromEntries(
    PAGES.map((page) => [page.key, !!input.pages?.[page.key] && own.pages[page.key]]),
  ) as Record<(typeof PAGES)[number]["key"], boolean>;

  const ints = (list: unknown) => (Array.isArray(list) ? list.filter((v): v is number => Number.isInteger(v)) : []);
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);

  return {
    pages,
    screens: {
      // Screens and groups hidden from the editor stay hidden from the
      // role too: they weren't in the list the editor ticked from.
      hiddenScreens: [...new Set([...ints(input.screens?.hiddenScreens), ...own.screens.hiddenScreens])],
      hiddenGroups: [...new Set([...strings(input.screens?.hiddenGroups), ...own.screens.hiddenGroups])],
      settings: !!input.screens?.settings && own.screens.settings,
      reorder: !!input.screens?.reorder && own.screens.reorder,
    },
    users: Object.fromEntries(
      USERS_PERMISSIONS.map(({ key }) => [key, !!input.users?.[key] && own.users[key]]),
    ) as RoleAccess["users"],
  };
}

function cleanInput(user: CurrentUser, input: RoleInput) {
  const name = input.name.trim().slice(0, MAX_NAME);
  if (!name) throw new Error("Give the role a name.");
  const hsl = parseHsl(input.color);
  if (!hsl) throw new Error("That isn't a valid colour.");
  return { name, color: formatHsl(hsl), access: cleanAccess(user, input.access) };
}

// Roles are seen and edited only by those who hold them (the super admin
// holds all of them).
function assertHolds(user: CurrentUser, roleId: string) {
  if (!user.access.roleIds.includes(roleId)) throw new Error("You can only edit roles you have.");
}

// A new role goes to whoever made it, so it doesn't vanish from their view
// the moment it exists — the super admin has it already, as they have all.
export async function createRole(input: RoleInput) {
  const user = await requireUsersPermission("manageRoles");
  const role = cleanInput(user, input);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roles")
    .insert({ ...role, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!user.access.superAdmin) {
    const { error: assignError } = await admin.from("user_roles").insert({ user_id: user.id, role_id: data.id });
    if (assignError) throw new Error(assignError.message);
  }
  recordActivity(user, { action: "role.create", summary: `Created the role ${quote(role.name)}` });
  revalidatePath("/", "layout");
  return data.id;
}

export async function updateRole(id: string, input: RoleInput) {
  const user = await requireUsersPermission("manageRoles");
  assertHolds(user, id);
  const role = cleanInput(user, input);
  const admin = createAdminClient();
  const { data: before } = await admin.from("roles").select("name").eq("id", id).maybeSingle();
  const { error } = await admin.from("roles").update(role).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "role.update",
    target: `role:${id}`,
    summary:
      before && before.name !== role.name
        ? `Edited the role ${quote(before.name)}, now ${quote(role.name)}`
        : `Edited the role ${quote(role.name)}`,
  });
  revalidatePath("/", "layout");
}

// Also takes it off every user, file, folder and pending signup link.
export async function deleteRole(id: string) {
  const user = await requireUsersPermission("manageRoles");
  assertHolds(user, id);
  const admin = createAdminClient();
  const { data: before } = await admin.from("roles").select("name").eq("id", id).maybeSingle();
  const { error } = await admin.rpc("delete_role", { p_role_id: id });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "role.delete", summary: `Deleted the role ${quote(before?.name)}` });
  revalidatePath("/", "layout");
}
