// A Poster's files (see 0051_posters.sql), as the library calls them.

export type PosterPart = "a1" | "screen" | "newsletter";

export const POSTER_PART_LABELS: Record<PosterPart, string> = {
  a1: "A1 Poster",
  screen: "Screen 9:16",
  newsletter: "Newsletter 16:9",
};

// A file's own name, in a playlist and on a screen: its poster's, then
// which of its files it is.
export const posterPartName = (posterName: string, part: PosterPart) => `${posterName} · ${POSTER_PART_LABELS[part]}`;

// What a download is saved as: the same, less what a file name can't hold
// (a colon is a folder separator to the Mac's Finder).
export const posterPartFileName = (posterName: string, part: PosterPart, extension: string) =>
  `${posterName} – ${POSTER_PART_LABELS[part]}.${extension}`.replace(/[:/\\]/g, "-");
