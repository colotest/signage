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

export const ACCEPTED_TYPES = [
  { label: "Images", formats: "JPG, PNG, WebP, GIF" },
  { label: "Videos", formats: "MP4, MOV, WebM" },
  { label: "Documents", formats: "PDF — each page becomes a slide" },
];

export const ACCEPT_ATTRIBUTE = "image/*,video/*,application/pdf";

// Slides can't be shown as-is; they're turned away with a pointer to
// exporting a PDF, which then uploads as a deck.
const PRESENTATION_EXTENSIONS = [".ppt", ".pptx", ".pps", ".ppsx", ".key", ".odp"];

// Why a file can't go up, or null if it can.
export function rejectionReason(file: File): string | null {
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  if (PRESENTATION_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return "is a presentation — export it as a PDF first, then upload the PDF";
  }
  if (!isPdf && !file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return "isn't an image, video or PDF";
  }
  if (file.size > MAX_UPLOAD_BYTES) return `is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  return null;
}
