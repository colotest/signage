import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

// Gates the whole dashboard behind a signed-in session cookie. This only
// checks the cookie's signature — whether its user still exists (and what
// they may do) is checked against the database by the dashboard layout and
// by every Server Action.
// /screen/* is intentionally excluded (see matcher below) — kiosk devices
// must load their player URL with no login step. /signup/* is open too:
// that's how someone without an account gets one.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authed = (await verifySession(token)) !== null;

  if (pathname === "/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!authed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!screen|signup|_next/static|_next/image|favicon.ico|sw.js).*)",
  ],
};
