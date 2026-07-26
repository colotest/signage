import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "signage_session";
const SESSION_DURATION = "7d";

function secretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

// Server Functions are reachable via direct POST requests, not just through
// the dashboard UI — call this at the top of every mutating Server Action
// so the app's own session cookie is checked independently of the proxy gate.
export async function requireSession(): Promise<void> {
  const cookieStore = await cookies();
  const authed = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!authed) {
    throw new Error("Unauthorized");
  }
}
