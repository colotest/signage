import "server-only";
import { SignJWT } from "jose";

// A short-lived token the browser's Supabase client uses instead of the
// bare anon key (src/lib/supabase/client.ts), so the database can tell who
// is asking: someone signed in to the dashboard, or one particular paired
// TV. Signed with the project's JWT secret, so Supabase accepts it as one
// of its own (role "authenticated"); the database's rules read the claims
// below.
//
// Until SUPABASE_JWT_SECRET is set there are no tokens, and the browser
// carries on with the anon key as before.

export const SUPABASE_TOKEN_SECONDS = 60 * 60;

export type SupabaseTokenClaims = { kind: "staff"; userId: string } | { kind: "screen"; deviceId: string; screenId: number };

export function supabaseTokensEnabled() {
  return !!process.env.SUPABASE_JWT_SECRET;
}

export async function signSupabaseToken(claims: SupabaseTokenClaims): Promise<{ token: string; expiresAt: number }> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SUPABASE_TOKEN_SECONDS;
  const token = await new SignJWT({
    role: "authenticated",
    // What the database's rules check (see the migration that drops the
    // public reads): "staff", or "screen" with the screen it may read.
    app_kind: claims.kind,
    ...(claims.kind === "screen" ? { screen_id: claims.screenId } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.kind === "staff" ? claims.userId : claims.deviceId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}
