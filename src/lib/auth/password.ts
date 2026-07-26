import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Compare digests (fixed 32-byte length) rather than the raw strings so
// timingSafeEqual never throws on a length mismatch, which would otherwise
// leak the correct password's length via an early error.
export function verifyPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
