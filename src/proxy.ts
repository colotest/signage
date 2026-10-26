import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

// Gates the whole dashboard behind a signed-in session cookie. This only
// checks the cookie's signature — whether its user still exists (and what
// they may do) is checked against the database by the dashboard layout and
// by every Server Action.
// /screen/* is intentionally excluded (see matcher below) — kiosk devices
// must load their player URL with no login step. /signup/* is open too:
// that's how someone without an account gets one. So is /upload/*: a
// folder's upload link, whose token is checked by the page and its actions.
// /forgot, /reset/* and /confirm-email/* too: forgetting a password, or
// opening an emailed link on a device that isn't signed in.
// And /tv.apk, the Fire TV app, fetched by a stick's Downloader with no
// session (see android/), and /email/*, what emails load from the site
// (the brand font) — a mail app has no session either.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authed = (await verifySession(token)) !== null;

  if (pathname === "/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/home", request.url));
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
    // The Home Screen files are fetched by iOS itself, which doesn't carry
    // the session cookie — gated, they came back as a redirect to /login,
    // so the web app got no icon at all and no manifest to install from.
    "/((?!screen|signup|upload/|forgot|reset/|confirm-email/|_next/static|_next/image|favicon.ico|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest|sw.js|tv.apk|email/).*)",
  ],
};
