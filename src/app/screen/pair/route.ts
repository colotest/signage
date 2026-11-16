import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_COOKIE_NAME,
  PAIRING_COOKIE_NAME,
  PAIRING_MINUTES,
  cookieOptions,
  deviceCookieValue,
  deviceLabel,
  hashSecret,
  newPairingCode,
  newSecret,
  readDevice,
  sameHash,
} from "@/lib/auth/screenDevice";
import { createAdminClient } from "@/lib/supabase/admin";

// A TV pairing itself with a screen (0049). Open, like the rest of
// /screen/*: a TV has no session.
//
// POST: a new code for the TV to show, with its secret in a cookie.
// GET, every few seconds while it shows it: "waiting" until someone types
// the code into a screen's wrench menu on the dashboard; then "paired",
// with the screen — and the TV gets its device cookie for good.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  const admin = createAdminClient();
  // Codes nobody entered in time.
  await admin.from("screen_pairings").delete().lt("expires_at", new Date().toISOString());

  const secret = newSecret();
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000);
  // A clash with a code still on another TV is unlikely (31^6), but try
  // again rather than fail.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPairingCode();
    const { error } = await admin
      .from("screen_pairings")
      .insert({ code, secret_hash: hashSecret(secret), expires_at: expiresAt.toISOString() });
    if (error?.code === "23505") continue;
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
    const response = NextResponse.json({ code, expiresAt: expiresAt.getTime() }, { headers: NO_STORE });
    response.cookies.set(PAIRING_COOKIE_NAME, `${code}.${secret}`, cookieOptions(PAIRING_MINUTES * 60));
    return response;
  }
  return NextResponse.json({ error: "Couldn't make a code" }, { status: 500, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const value = request.cookies.get(PAIRING_COOKIE_NAME)?.value ?? "";
  const dot = value.indexOf(".");
  const code = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (dot < 0 || !code || !secret) return gone();

  const admin = createAdminClient();
  const { data: pairing, error } = await admin.from("screen_pairings").select("*").eq("code", code).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  if (!pairing || !sameHash(pairing.secret_hash, hashSecret(secret))) return gone();
  if (pairing.screen_id === null) {
    if (Date.parse(pairing.expires_at) < Date.now()) return gone();
    return NextResponse.json({ status: "waiting", code }, { headers: NO_STORE });
  }

  // Claimed: this TV becomes a device of that screen. One it was before
  // (paired again, maybe to another screen) is let go.
  const previous = await readDevice(request.cookies.get(DEVICE_COOKIE_NAME)?.value);
  if (previous) await admin.from("screen_devices").delete().eq("id", previous.id);

  const deviceSecret = newSecret();
  const { data: device, error: insertError } = await admin
    .from("screen_devices")
    .insert({
      screen_id: pairing.screen_id,
      secret_hash: hashSecret(deviceSecret),
      label: deviceLabel(request.headers.get("user-agent")),
      paired_by: pairing.claimed_by,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE });
  await admin.from("screen_pairings").delete().eq("code", code);

  const response = NextResponse.json({ status: "paired", screenId: pairing.screen_id }, { headers: NO_STORE });
  response.cookies.set(DEVICE_COOKIE_NAME, deviceCookieValue(device.id, deviceSecret), cookieOptions(DEVICE_COOKIE_MAX_AGE));
  response.cookies.delete(PAIRING_COOKIE_NAME);
  return response;
}

// No code (any more): the TV asks for a new one.
function gone() {
  const response = NextResponse.json({ status: "expired" }, { status: 410, headers: NO_STORE });
  response.cookies.delete(PAIRING_COOKIE_NAME);
  return response;
}
