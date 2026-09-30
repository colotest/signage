import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Stored as "scrypt$<salt>$<hash>", both base64. scrypt's defaults
// (N=16384, r=8, p=1) are what Node uses when no options are passed.
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

// A real hash of nothing in particular — checked against when the email
// isn't found, so a wrong email takes as long as a wrong password and
// login timing doesn't reveal which accounts exist.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function verifyPassword(candidate: string, stored: string | null): Promise<boolean> {
  const [scheme, saltB64, keyB64] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await derive(candidate, Buffer.from(saltB64, "base64"));
  return stored !== null && expected.length === actual.length && timingSafeEqual(expected, actual);
}
