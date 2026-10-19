"use server";

import { revalidatePath } from "next/cache";
import { plural, quote, recordActivity } from "@/lib/activity";
import { canSeeScreen } from "@/lib/auth/access";
import {
  assertGroupVisible,
  assertScreenVisible,
  requirePage,
  requireScreensPermission,
  type CurrentUser,
} from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_GRID, defaultGrid, regrid } from "@/lib/groups/grid";
import type { FitMode } from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

async function groupName(admin: Admin, id: string) {
  const { data } = await admin.from("screen_groups").select("name").eq("id", id).maybeSingle();
  return quote(data?.name);
}

// Creating, editing and arranging groups comes with the Screens page's
// settings, like the screen wrench menu it mirrors — and only for groups
// (and screens) the user can see. Playback (the group's menu, Fit/Fill,
// the play/pause/skip buttons) is for anyone who can see the group.
async function requireGroupSettings(groupId: string): Promise<CurrentUser> {
  const user = await requireScreensPermission("settings");
  assertGroupVisible(user, groupId);
  return user;
}

export async function createGroup(name: string, screenIds: number[]) {
  const user = await requireScreensPermission("settings");
  for (const id of screenIds) assertScreenVisible(user, id);
  const trimmed = name.trim() || "New Group";
  const admin = createAdminClient();
  const { rows, cols } = defaultGrid(screenIds.length);

  // At the top of the dashboard, like a new screen.
  const [{ data: firstScreen }, { data: firstGroup }] = await Promise.all([
    admin.from("screens").select("position").order("position", { ascending: true }).limit(1).maybeSingle(),
    admin.from("screen_groups").select("position").order("position", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const first = Math.min(firstScreen?.position ?? 1, firstGroup?.position ?? 1);

  const { data: group, error } = await admin
    .from("screen_groups")
    .insert({ name: trimmed, grid_rows: rows, grid_cols: cols, position: first - 1 })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (screenIds.length > 0) {
    const { error: membersError } = await admin
      .from("screen_group_members")
      .insert(screenIds.map((screenId, slot) => ({ group_id: group.id, screen_id: screenId, slot })));
    if (membersError) throw new Error(membersError.message);
  }

  recordActivity(user, {
    action: "group.create",
    summary: `Created group ${quote(trimmed)} with ${plural(screenIds.length, "screen")}`,
  });
  revalidatePath("/dashboard");
  return group;
}

// "Edit Group": the new set of members. Screens that stay keep their cells;
// new ones fill the free cells in order, and the grid grows by rows if it
// runs out.
export async function setGroupMembers(groupId: string, requestedIds: number[]) {
  const user = await requireGroupSettings(groupId);
  for (const id of requestedIds) assertScreenVisible(user, id);
  const admin = createAdminClient();
  const [{ data: group, error: groupError }, { data: current, error: currentError }] = await Promise.all([
    admin.from("screen_groups").select("grid_rows, grid_cols").eq("id", groupId).single(),
    admin.from("screen_group_members").select("screen_id, slot").eq("group_id", groupId),
  ]);
  if (groupError) throw new Error(groupError.message);
  if (currentError) throw new Error(currentError.message);

  // Members the user can't see weren't in the picker they chose from, so
  // leaving them out of the list doesn't mean taking them out of the group.
  const screenIds = [
    ...(current ?? []).filter((m) => !canSeeScreen(user.access, m.screen_id)).map((m) => m.screen_id),
    ...requestedIds,
  ];

  const wanted = new Set(screenIds);
  const removed = (current ?? []).filter((m) => !wanted.has(m.screen_id)).map((m) => m.screen_id);
  const kept = (current ?? []).filter((m) => wanted.has(m.screen_id));
  const keptIds = new Set(kept.map((m) => m.screen_id));
  const added = screenIds.filter((id) => !keptIds.has(id));

  if (removed.length > 0) {
    const { error } = await admin
      .from("screen_group_members")
      .delete()
      .eq("group_id", groupId)
      .in("screen_id", removed);
    if (error) throw new Error(error.message);
  }

  if (added.length > 0) {
    const taken = new Set(kept.map((m) => m.slot));
    const slots: number[] = [];
    for (let slot = 0; slots.length < added.length; slot++) {
      if (!taken.has(slot)) slots.push(slot);
    }
    const { error } = await admin
      .from("screen_group_members")
      .insert(added.map((screenId, i) => ({ group_id: groupId, screen_id: screenId, slot: slots[i] })));
    if (error) throw new Error(error.message);

    const highest = Math.max(...slots, ...kept.map((m) => m.slot));
    const rowsNeeded = Math.ceil((highest + 1) / group.grid_cols);
    if (rowsNeeded > MAX_GRID) {
      // Too many for the grid's width at any height: start over from a
      // square grid that holds them all.
      const { rows, cols } = defaultGrid(screenIds.length);
      await applyGrid(admin, groupId, rows, cols);
    } else if (rowsNeeded > group.grid_rows) {
      const { error: growError } = await admin
        .from("screen_groups")
        .update({ grid_rows: rowsNeeded })
        .eq("id", groupId);
      if (growError) throw new Error(growError.message);
    }
  }

  recordActivity(user, {
    action: "group.members",
    target: `group:${groupId}`,
    summary: async (admin) => `Set group ${await groupName(admin, groupId)} to ${plural(screenIds.length, "screen")}`,
  });
  revalidatePath("/dashboard");
}

export async function renameGroup(groupId: string, name: string) {
  const user = await requireGroupSettings(groupId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const before = await groupName(admin, groupId);
  const { error } = await admin.from("screen_groups").update({ name: trimmed }).eq("id", groupId);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "group.rename",
    target: `group:${groupId}`,
    summary: `Renamed group ${before} to ${quote(trimmed)}`,
  });
  revalidatePath("/dashboard");
}

// Resizes the arrangement grid. Members keep their row and column where
// they still fit; any that fall outside the new grid move into its free
// cells, in reading order. Refused if it can't hold every member.
export async function setGroupGrid(groupId: string, rows: number, cols: number) {
  const user = await requireGroupSettings(groupId);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > MAX_GRID || cols > MAX_GRID) {
    throw new Error("Invalid grid size");
  }
  const admin = createAdminClient();
  await applyGrid(admin, groupId, rows, cols);

  recordActivity(user, {
    action: "group.grid",
    target: `group:${groupId}`,
    summary: async (admin) => `Set the grid of group ${await groupName(admin, groupId)} to ${rows} × ${cols}`,
  });
  revalidatePath("/dashboard");
}

async function applyGrid(admin: Admin, groupId: string, rows: number, cols: number) {
  const [{ data: group, error: groupError }, { data: members, error: membersError }] = await Promise.all([
    admin.from("screen_groups").select("grid_cols").eq("id", groupId).single(),
    admin.from("screen_group_members").select("screen_id, slot").eq("group_id", groupId).order("slot"),
  ]);
  if (groupError) throw new Error(groupError.message);
  if (membersError) throw new Error(membersError.message);
  const list = members ?? [];
  if (list.length > rows * cols) throw new Error(`The grid needs room for ${plural(list.length, "screen")}`);

  const placed = regrid(new Map(list.map((m) => [m.screen_id, m.slot])), group.grid_cols, rows, cols);

  // Each update is its own statement, so everyone is first moved out past
  // any cell either grid could have, then into place: the unique cell
  // constraint never sees two members sharing one along the way.
  const shift = rows * cols + MAX_GRID * MAX_GRID;
  for (const m of list) {
    const { error } = await admin
      .from("screen_group_members")
      .update({ slot: shift + m.slot })
      .eq("group_id", groupId)
      .eq("screen_id", m.screen_id);
    if (error) throw new Error(error.message);
  }
  for (const [screenId, slot] of placed) {
    const { error } = await admin
      .from("screen_group_members")
      .update({ slot })
      .eq("group_id", groupId)
      .eq("screen_id", screenId);
    if (error) throw new Error(error.message);
  }
  const { error } = await admin.from("screen_groups").update({ grid_rows: rows, grid_cols: cols }).eq("id", groupId);
  if (error) throw new Error(error.message);
}

// Drops a member into a cell; whoever was there swaps into its old one.
export async function moveGroupMember(groupId: string, screenId: number, slot: number) {
  const user = await requireGroupSettings(groupId);
  const admin = createAdminClient();
  const { error } = await admin.rpc("move_group_member", { p_group_id: groupId, p_screen_id: screenId, p_slot: slot });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "group.arrange",
    target: `group:${groupId}`,
    summary: async (admin) => `Rearranged the screens in group ${await groupName(admin, groupId)}`,
  });
  revalidatePath("/dashboard");
}

// The group card's Fit/Fill pill: a card control, so — like a screen's —
// it applies straight away, here to every member.
export async function setGroupFitMode(groupId: string, fitMode: FitMode) {
  const user = await requirePage("screens");
  assertGroupVisible(user, groupId);
  const admin = createAdminClient();
  const { data: members, error: membersError } = await admin
    .from("screen_group_members")
    .select("screen_id")
    .eq("group_id", groupId);
  if (membersError) throw new Error(membersError.message);
  const ids = (members ?? []).map((m) => m.screen_id);
  const [{ error }, { error: screensError }] = await Promise.all([
    admin.from("screen_groups").update({ fit_mode: fitMode }).eq("id", groupId),
    ids.length > 0
      ? admin.from("screens").update({ fit_mode: fitMode }).in("id", ids)
      : Promise.resolve({ error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (screensError) throw new Error(screensError.message);
  recordActivity(user, {
    action: "group.fit",
    target: `group:${groupId}`,
    summary: async (admin) =>
      `Set every screen in group ${await groupName(admin, groupId)} to ${fitMode === "cover" ? "fill" : "fit"} the screen`,
  });
  revalidatePath("/dashboard");
}

// The screens keep playing whatever they have; only the grouping (and the
// group's own setup) goes.
export async function deleteGroup(groupId: string) {
  const user = await requireGroupSettings(groupId);
  const admin = createAdminClient();
  const { data: deleted, error } = await admin.from("screen_groups").delete().eq("id", groupId).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "group.delete", summary: `Deleted group ${quote(deleted?.[0]?.name)}` });
  revalidatePath("/dashboard");
}

// Screens and groups share the dashboard grid's order. Keys are
// "s:<screen id>" or "g:<group id>".
//
// The grid a user drags around only holds what they can see, so their new
// order is laid back into the places those tiles had among all of them:
// tiles hidden from them keep their own spots.
export async function reorderDashboard(keys: string[]) {
  const user = await requireScreensPermission("reorder");
  const admin = createAdminClient();
  const [{ data: screens, error: screensError }, { data: groups, error: groupsError }] = await Promise.all([
    admin.from("screens").select("id, position"),
    admin.from("screen_groups").select("id, position, created_at"),
  ]);
  if (screensError) throw new Error(screensError.message);
  if (groupsError) throw new Error(groupsError.message);
  const all = [
    ...(screens ?? []).map((s) => ({ key: `s:${s.id}`, position: s.position })),
    ...(groups ?? []).map((g) => ({ key: `g:${g.id}`, position: g.position })),
  ].sort((a, b) => a.position - b.position);
  const visible = (key: string) =>
    key.startsWith("s:") ? canSeeScreen(user.access, Number(key.slice(2))) : !user.access.screens.hiddenGroups.includes(key.slice(2));
  const known = new Set(all.map((t) => t.key));
  const moved = keys.filter((key) => known.has(key) && visible(key));
  const queue = [...moved];
  const merged = all.map((t) => (visible(t.key) && moved.includes(t.key) ? queue.shift()! : t.key));

  const { error } = await admin.rpc("reorder_dashboard", { p_keys: merged });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "screens.reorder", target: "screens", summary: "Reordered the screens" });
  revalidatePath("/dashboard");
}
