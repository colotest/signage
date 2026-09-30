import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Signup links carry a random token; only its sha256 is stored (see
// 0023_users.sql), so the database alone can't be used to sign up.
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hasExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
