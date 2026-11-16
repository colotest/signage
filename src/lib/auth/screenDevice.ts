import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// A TV paired with a screen (0049): it holds a cookie naming its device
// and a secret, and the database a hash of the secret. See
// src/app/screen/pair/route.ts for how it gets one.

export const DEVICE_COOKIE_NAME = "screen_device";
export const PAIRING_COOKIE_NAME = "screen_pairing";

// As long as a browser lets a cookie last (Chrome caps it at 400 days);
// renewed every time the TV fetches a database token, about hourly.
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
export const PAIRING_MINUTES = 15;

export type ScreenDevice = { id: string; screenId: number };

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// Until this is switched on, a TV that isn't paired still plays its screen
// at /screen/<id> as before — so the TVs can be paired one by one before
// anything stops working. Once it is, an unpaired TV only shows a code.
export function pairingRequired() {
  return process.env.SCREEN_PAIRING_REQUIRED === "true";
}

export function newSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function sameHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Six characters a TV can show large and a person can type without
// mixing up: no 0/O, 1/I/L.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newPairingCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

// What someone typed, as stored: upper case, without spaces or dashes.
export function normalizePairingCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "<device id>.<secret>" — the device cookie's value.
export function deviceCookieValue(deviceId: string, secret: string) {
  return `${deviceId}.${secret}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readDevice(cookieValue: string | undefined): Promise<ScreenDevice | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  const id = cookieValue.slice(0, dot);
  const secret = cookieValue.slice(dot + 1);
  if (dot < 0 || !UUID.test(id) || !secret) return null;
  const { data, error } = await createAdminClient()
    .from("screen_devices")
    .select("id, screen_id, secret_hash")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !sameHash(data.secret_hash, hashSecret(secret))) return null;
  return { id: data.id, screenId: data.screen_id };
}

// The TV behind this request, if it's a paired one (once per request).
export const currentDevice = cache(async (): Promise<ScreenDevice | null> => {
  const cookieStore = await cookies();
  return readDevice(cookieStore.get(DEVICE_COOKIE_NAME)?.value);
});

// The Fire TV app downloads a screen's images and videos itself, without
// the page's cookies, so their addresses carry this instead: the device's
// id and a signature over it. It doesn't change, so the app (which keeps
// files by address) keeps its downloads; it stops working when the device
// is unpaired, as the route looks the device up every time.
function mediaSignature(deviceId: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(`media:${deviceId}`).digest("base64url").slice(0, 32);
}

export function deviceMediaToken(deviceId: string) {
  return `${deviceId}.${mediaSignature(deviceId)}`;
}

export async function deviceFromMediaToken(token: string): Promise<ScreenDevice | null> {
  const dot = token.indexOf(".");
  const id = token.slice(0, dot);
  if (dot < 0 || !UUID.test(id) || !sameHash(token.slice(dot + 1), mediaSignature(id))) return null;
  const { data, error } = await createAdminClient().from("screen_devices").select("id, screen_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, screenId: data.screen_id } : null;
}

// Roughly what a TV is, from its user agent, to tell two apart on the
// dashboard.
export function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "TV";
  if (userAgent.includes("AFT")) return "Fire TV";
  if (/Android/.test(userAgent)) return "Android";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Raspbian|armv7l|aarch64/.test(userAgent)) return "Raspberry Pi";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Mac OS X/.test(userAgent)) return "Mac";
  if (/Linux/.test(userAgent)) return "Linux";
  return "TV";
}
