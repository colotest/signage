// Where a file in the media bucket is fetched from: /m/<path>, the app's
// own route (src/app/m/[...path]/route.ts), which checks who's asking —
// a signed-in user, or a paired TV — and then hands over a short-lived
// signed link to the file itself. The address itself never changes, so
// everything that keeps files by address (the player's service worker, the
// Fire TV app, the browser) keeps working as before.
//
// Safe on the client: it only builds a string.

export type MediaUrlOptions = {
  // A paired TV's media token (see screenDevice.ts), for the Fire TV app,
  // whose own downloads carry no cookies.
  token?: string | null;
  // A resized copy, this many pixels wide — one of THUMB_WIDTHS.
  width?: number;
  // Sent as a download under this file name.
  download?: string;
};

export const MEDIA_ROUTE = "/m/";

export function mediaUrl(storagePath: string, options: MediaUrlOptions = {}): string {
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  const params = new URLSearchParams();
  if (options.token) params.set("d", options.token);
  if (options.width) params.set("w", String(options.width));
  if (options.download) params.set("download", options.download);
  const query = params.toString();
  return `${MEDIA_ROUTE}${path}${query ? `?${query}` : ""}`;
}

// The widths next/image asks for (its default imageSizes and deviceSizes —
// next.config.ts doesn't change them). The route only makes these, so a
// stranger with a valid link can't fill the bucket with every width there
// is.
export const THUMB_WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
