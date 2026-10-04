// What an upload link accepts, shared by the public upload page (which
// explains it and filters before uploading) and the Server Actions behind
// it (which are what actually enforce it).

// Supabase's own per-file limit for this project — the largest thing the
// storage bucket would take anyway, so the page says so up front instead
// of letting a big video fail after a long upload.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// A PDF is split into one image per page in the uploader's browser, and
// each page needs its own upload slot — this keeps one public request from
// asking for thousands of them.
export const MAX_PDF_PAGES = 200;

export const ACCEPT_ATTRIBUTE = "image/*,video/*,application/pdf";

// Slides can't be shown as-is; they're turned away with a pointer to
// exporting a PDF, which then uploads as a deck.
const PRESENTATION_EXTENSIONS = [".ppt", ".pptx", ".pps", ".ppsx", ".key", ".odp"];

export type Rejection = "presentation" | "type" | "size";

// Why a file can't go up, or null if it can — as a code, for the page to
// put into words in whichever language it's showing.
export function rejectionReason(file: File): Rejection | null {
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  if (PRESENTATION_EXTENSIONS.some((ext) => name.endsWith(ext))) return "presentation";
  if (!isPdf && !file.type.startsWith("image/") && !file.type.startsWith("video/")) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}
