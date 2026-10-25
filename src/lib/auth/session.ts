import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, User } from "@/types/domain";
import {
  canEditOwned,
  canSeeGroup,
  canSeeScreen,
  landingPath,
  resolveAccess,
  type Access,
  type PageKey,
  type RoleSummary,
  type UsersPermission,
} from "./access";

export const SESSION_COOKIE_NAME = "signage_session";
const SESSION_DURATION = "7d";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey());
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await signSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

// The signed-in user's id and when their cookie was issued (in seconds),
// from the cookie alone — no database round trip, so the proxy can call it
// on every request. A cookie from before per-user logins (no subject)
// counts as signed out.
async function readSession(token: string | undefined): Promise<{ userId: string; issuedAt: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub ? { userId: payload.sub, issuedAt: payload.iat ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  return (await readSession(token))?.userId ?? null;
}

// A couple of seconds' grace: the cookie's time is the server's, in whole
// seconds, and the password's change the database's.
const CLOCK_GRACE_SECONDS = 2;

// The signed-in user, with their roles and what those add up to.
export type CurrentUser = User & {
  access: Access;
  // The roles they hold — every role, for the super admin.
  roles: RoleSummary[];
};

// The user behind this request, looked up fresh (once per request) so a
// deleted account, a changed role or a changed password takes effect
// immediately rather than whenever its cookie runs out.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const session = await readSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  const admin = createAdminClient();
  // "*" rather than a list: password_changed_at doesn't exist before 0042,
  // and naming it would fail every page until that migration has run.
  const { data: row, error } = await admin.from("users").select("*").eq("id", session.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  // Signed in before the password last changed (on this device or another).
  const changedAt = row.password_changed_at ? Date.parse(row.password_changed_at) / 1000 : null;
  if (changedAt !== null && session.issuedAt < changedAt - CLOCK_GRACE_SECONDS) return null;
  const user = { id: row.id, email: row.email, nickname: row.nickname, is_super_admin: row.is_super_admin, created_at: row.created_at };

  // The super admin holds every role, including ones made after them.
  const { data: roleRows, error: rolesError } = user.is_super_admin
    ? await admin.from("roles").select("id, name, color, access").order("created_at", { ascending: true })
    : await admin
        .from("user_roles")
        .select("role:roles(id, name, color, access, created_at)")
        .eq("user_id", user.id)
        .then((result) => ({
          ...result,
          data: (result.data ?? [])
            .map((row) => (row as unknown as { role: Role | null }).role)
            .filter((role): role is Role => role !== null)
            .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        }));
  if (rolesError) throw new Error(rolesError.message);
  const roles = roleRows ?? [];

  return {
    ...user,
    access: resolveAccess(user.is_super_admin, roles),
    roles: roles.map(({ id, name, color }) => ({ id, name, color })),
  };
});

// Server Functions are reachable via direct POST requests, not just through
// the dashboard UI — every mutating Server Action starts with one of these,
// so the app's own session (and the user's roles) are checked
// independently of the proxy gate and of what the UI chose to show.
// Each returns the user, for the action to record its change against.
export async function requireSession(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requirePage(page: PageKey): Promise<CurrentUser> {
  const user = await requireSession();
  if (!user.access.pages[page]) throw new Error("Forbidden");
  return user;
}

// The Screens page's own options: its wrench menus (and adding screens and
// groups), or rearranging its grid.
export async function requireScreensPermission(permission: "settings" | "reorder"): Promise<CurrentUser> {
  const user = await requirePage("screens");
  if (!user.access.screens[permission]) throw new Error("Forbidden");
  return user;
}

export async function requireUsersPermission(permission: UsersPermission): Promise<CurrentUser> {
  const user = await requirePage("users");
  if (!user.access.users[permission]) throw new Error("Forbidden");
  return user;
}

export function assertScreenVisible(user: CurrentUser, screenId: number) {
  if (!canSeeScreen(user.access, screenId)) throw new Error("Forbidden");
}

export function assertGroupVisible(user: CurrentUser, groupId: string) {
  if (!canSeeGroup(user.access, groupId)) throw new Error("Forbidden");
}

export function assertCanEdit(user: CurrentUser, item: { ownerId: string | null; editRoleIds: string[] }) {
  if (!canEditOwned(user, item)) throw new Error("This is limited to roles you don't have.");
}

// For a page itself: whoever's roles don't reach it is sent to one they do
// reach (or to the empty /home), rather than shown an error.
export async function pageViewer(page: PageKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  if (!user.access.pages[page]) redirect(landingPath(user.access));
  return user;
}
