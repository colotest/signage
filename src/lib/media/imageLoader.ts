"use client";

import { MEDIA_ROUTE } from "./url";

// next/image's loader for the whole app (next.config.ts): a media file is
// resized by its own route (/m/<path>?w=…), which checks who's asking
// first. Next's built-in optimizer can't be used for these: it fetches the
// original itself, with none of the viewer's cookies, and keeps the
// result in a cache it then serves to anyone who asks for the same
// address.
export default function mediaImageLoader({ src, width }: { src: string; width: number; quality?: number }) {
  if (!src.startsWith(MEDIA_ROUTE)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
