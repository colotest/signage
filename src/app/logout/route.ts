import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Where the dashboard sends a cookie whose user no longer exists (deleted,
// or a login from before per-user accounts). A page can't clear a cookie
// itself, and just redirecting to /login would bounce straight back —
// the proxy only checks the cookie's signature, which is still valid.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
