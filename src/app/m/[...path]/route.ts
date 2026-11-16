import { NextResponse, type NextRequest } from "next/server";
import { getSignedInUserId } from "@/lib/auth/session";
import { currentDevice, deviceFromMediaToken } from "@/lib/auth/screenDevice";
import { thumbPath } from "@/lib/media/thumbs";
import { THUMB_WIDTHS } from "@/lib/media/url";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "media";

// How long the link handed over is good for. Long enough that a video a
// TV has had on screen for hours still loads its next part; the redirect
// itself is only kept for an hour, so a browser comes back here for a
// fresh one well before then.
const SIGNED_SECONDS = 12 * 60 * 60;
const REDIRECT_CACHE_SECONDS = 60 * 60;

// Every file in the media bucket, by its path: /m/<path> (see
// src/lib/media/url.ts). Whoever's asking has to be signed in, or a paired
// TV (by its cookie, or the token the Fire TV app's downloads carry); they
// then get sent on to a short-lived signed link to the file. Open in
// proxy.ts, since a TV has no session: the checks are here.
//
// ?w=<width> asks for an image resized to that width (as WebP) —
// next/image's sizes, through src/lib/media/imageLoader.ts.
// ?download=<name> has it sent as a download under that name.
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return notFound();
  const storagePath = segments.join("/");

  if (!(await mayView(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const search = request.nextUrl.searchParams;
  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET);

  const width = Number(search.get("w"));
  if (width && THUMB_WIDTHS.includes(width)) {
    const resized = await resizedCopy(storagePath, width);
    if (resized) return redirectTo(resized);
    // Not an image (or not one it could read): the original, then.
  }

  const download = search.get("download");
  const { data, error } = await storage.createSignedUrl(
    storagePath,
    SIGNED_SECONDS,
    download ? { download } : undefined,
  );
  if (error || !data) return notFound();
  return redirectTo(data.signedUrl);
}

async function mayView(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("d");
  if (token) return (await deviceFromMediaToken(token)) !== null;
  if (await currentDevice()) return true;
  return (await getSignedInUserId()) !== null;
}

// The signed link to a copy of the image this wide, made first if there
// isn't one yet; null if it can't be made.
async function resizedCopy(storagePath: string, width: number): Promise<string | null> {
  const storage = createAdminClient().storage.from(BUCKET);
  const copyPath = thumbPath(storagePath, width);

  const existing = await storage.createSignedUrl(copyPath, SIGNED_SECONDS);
  if (existing.data) return existing.data.signedUrl;

  const { data: original, error: downloadError } = await storage.download(storagePath);
  if (downloadError || !original) return null;
  let resized: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    resized = await sharp(Buffer.from(await original.arrayBuffer()), { limitInputPixels: false })
      .rotate() // upright, from its EXIF orientation, as next/image did
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
  // upsert: two requests for the same size at once both make it.
  const { error: uploadError } = await storage.upload(copyPath, resized, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) return null;
  const made = await storage.createSignedUrl(copyPath, SIGNED_SECONDS);
  return made.data?.signedUrl ?? null;
}

function redirectTo(url: string) {
  return NextResponse.redirect(url, {
    status: 302,
    // private: it's this viewer's to keep, never a shared cache's.
    headers: { "Cache-Control": `private, max-age=${REDIRECT_CACHE_SECONDS}` },
  });
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
