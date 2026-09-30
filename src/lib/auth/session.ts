import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User, UserRole } from "@/types/domain";
import { ROLE_RANK } from "./roles";

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

// The signed-in user's id, from the cookie alone — no database round trip,
// so the proxy can call it on every request. A cookie from before
// per-user logins (no subject) counts as signed out.
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// The user behind this request, looked up fresh (once per request) so a
// deleted account or a changed role takes effect immediately rather than
// whenever its cookie runs out.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const userId = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, email, role, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role];
}

export function isAdmin(user: Pick<User, "role"> | null): boolean {
  return !!user && roleRank(user.role) >= ROLE_RANK.admin;
}

// Server Functions are reachable via direct POST requests, not just through
// the dashboard UI — call this at the top of every mutating Server Action
// so the app's own session is checked independently of the proxy gate.
// Returns the user, for the action to record its change against.
export async function requireSession(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// Same, for what only admins (and the super admin) may do. The UI hides
// these controls from everyone else; this is what actually enforces it.
export async function requireAdmin(): Promise<User> {
  const user = await requireSession();
  if (!isAdmin(user)) throw new Error("Forbidden");
  return user;
}
