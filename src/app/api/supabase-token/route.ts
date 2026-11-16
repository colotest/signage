import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedInUserId } from "@/lib/auth/session";
import { DEVICE_COOKIE_MAX_AGE, DEVICE_COOKIE_NAME, cookieOptions, currentDevice } from "@/lib/auth/screenDevice";
import { signSupabaseToken, supabaseTokensEnabled } from "@/lib/supabase/token";

// The browser's Supabase client asks here for its token (see
// src/lib/supabase/token.ts), about once an hour. Open in proxy.ts: a TV
// has no session, and this checks who's asking itself.
//
// ?as=screen is the player asking: it gets its TV's token, even in a
// browser that's also signed in to the dashboard. Anything else gets the
// signed-in user's.
//
// 204 when there are no tokens yet (no SUPABASE_JWT_SECRET); 401 for no
// one we know. Either way the client carries on with the anon key.
export async function GET(request: NextRequest) {
  if (!supabaseTokensEnabled()) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  if (request.nextUrl.searchParams.get("as") === "screen") {
    const device = await currentDevice();
    if (!device) return unauthorized();
    const response = NextResponse.json(
      await signSupabaseToken({ kind: "screen", deviceId: device.id, screenId: device.screenId }),
      { headers: { "Cache-Control": "no-store" } },
    );
    // Keeps a TV that's on all the time paired for good: its cookie is
    // renewed as often as it asks.
    response.cookies.set(DEVICE_COOKIE_NAME, request.cookies.get(DEVICE_COOKIE_NAME)!.value, cookieOptions(DEVICE_COOKIE_MAX_AGE));
    await createAdminClient().from("screen_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    return response;
  }

  const userId = await getSignedInUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await signSupabaseToken({ kind: "staff", userId }), { headers: { "Cache-Control": "no-store" } });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
