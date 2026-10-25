import "server-only";
import { headers } from "next/headers";

// Where links the app hands out (signup, password reset, email change)
// point. APP_URL when it's set — which it should be in production: a reset
// link built from the request's own Host header could otherwise be pointed
// at someone else's site by whoever asked for it. Failing that, the
// production domain Vercel gives every deploy, and last of all the host
// this request came in on (local development).
export async function appOrigin(): Promise<string> {
  // "colo-cloud.app" works as well as "https://colo-cloud.app".
  if (process.env.APP_URL) {
    const url = process.env.APP_URL.trim().replace(/\/+$/, "");
    return /^https?:\/\//.test(url) ? url : `https://${url}`;
  }
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}
