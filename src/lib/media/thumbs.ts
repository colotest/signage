import { THUMB_WIDTHS } from "./url";

// Resized copies of an image, kept in the media bucket beside the
// originals (made by src/app/m/[...path]/route.ts the first time each
// width is asked for).
export const THUMBS_PREFIX = "_thumbs";

export function thumbPath(storagePath: string, width: number) {
  return `${THUMBS_PREFIX}/${width}/${storagePath}.webp`;
}

// Removes every resized copy these files could have, once the files
// themselves are gone. Most won't exist, and removing those is a no-op.
// Best effort: a copy left behind is only ever reached through its
// original, which is gone.
export async function removeThumbs(bucket: { remove(paths: string[]): Promise<unknown> }, storagePaths: string[]) {
  const paths = storagePaths.flatMap((path) => THUMB_WIDTHS.map((width) => thumbPath(path, width)));
  // Storage takes at most 1000 at a time.
  for (let i = 0; i < paths.length; i += 1000) {
    await bucket.remove(paths.slice(i, i + 1000)).catch(() => {});
  }
}
