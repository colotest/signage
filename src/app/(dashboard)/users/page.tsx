import { canSeeGroup, canSeeScreen } from "@/lib/auth/access";
import { pageViewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayNameOf } from "@/lib/uploads/uploaders";
import { UsersView, type UserWithActivity } from "./_components/UsersView";

const RECENT_COUNT = 5;

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export default async function UsersPage() {
  const viewer = await pageViewer("users");
  const { users: can } = viewer.access;
  const admin = createAdminClient();

  const [
    { data: users, error },
    { data: memberships, error: membershipsError },
    { data: roles, error: rolesError },
    { data: screens, error: screensError },
    { data: groups, error: groupsError },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, email, nickname, is_super_admin, created_at")
      .order("created_at", { ascending: true }),
    // Only the viewer's own roles are ever shown, on anyone.
    admin.from("user_roles").select("user_id, role_id").in("role_id", viewer.access.roleIds),
    // The role editor needs each of the viewer's roles in full.
    can.manageRoles
      ? admin.from("roles").select("*").in("id", viewer.access.roleIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    // And everything in the Screens grid the viewer can see, to tick.
    can.manageRoles
      ? admin.from("screens").select("id, name, position").order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    can.manageRoles
      ? admin.from("screen_groups").select("id, name, position").order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const err of [error, membershipsError, rolesError, screensError, groupsError]) {
    if (err) throw new Error(err.message);
  }

  // Each user's latest few changes — one small query per user, which is
  // fine at a venue's handful of accounts; the rest loads on demand, from
  // "Show all". Plus when everyone's changes from the last day and a half
  // happened: "today" depends on the viewer's own timezone, so the page
  // counts today's changes from these itself. None of it for those whose
  // roles don't let them see what others changed.
  const [recentByUser, latest] = can.viewChanges
    ? await Promise.all([
        Promise.all(
          (users ?? []).map(async (user) => {
            const { data: recent, error: activityError } = await admin
              .from("activity_log")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(RECENT_COUNT);
            if (activityError) throw new Error(activityError.message);
            return [user.id, recent ?? []] as const;
          }),
        ).then((entries) => new Map(entries)),
        admin
          .from("activity_log")
          .select("user_id, created_at")
          .gte("created_at", hoursAgo(36))
          .then(({ data, error: latestError }) => {
            if (latestError) throw new Error(latestError.message);
            return data ?? [];
          }),
      ])
    : [new Map(), []];

  const latestByUser = new Map<string, string[]>();
  for (const row of latest) {
    if (!row.user_id) continue;
    const list = latestByUser.get(row.user_id);
    if (list) list.push(row.created_at);
    else latestByUser.set(row.user_id, [row.created_at]);
  }
  const rolesByUser = new Map<string, string[]>();
  for (const row of memberships ?? []) {
    const list = rolesByUser.get(row.user_id);
    if (list) list.push(row.role_id);
    else rolesByUser.set(row.user_id, [row.role_id]);
  }

  const withActivity: UserWithActivity[] = (users ?? []).map((user) => ({
    ...user,
    displayName: displayNameOf(user),
    // The super admin holds every role — flagging all of them on their
    // card says nothing, so it's left plain.
    roleIds: user.is_super_admin ? [] : (rolesByUser.get(user.id) ?? []),
    recent: recentByUser.get(user.id) ?? [],
    latestChangeTimes: latestByUser.get(user.id) ?? [],
  }));

  return (
    <UsersView
      users={withActivity}
      roles={roles ?? []}
      screens={(screens ?? []).filter((s) => canSeeScreen(viewer.access, s.id)).map(({ id, name }) => ({ id, name }))}
      groups={(groups ?? []).filter((g) => canSeeGroup(viewer.access, g.id)).map(({ id, name }) => ({ id, name }))}
    />
  );
}
