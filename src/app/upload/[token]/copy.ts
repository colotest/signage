import { MAX_UPLOAD_BYTES, type Rejection } from "@/lib/uploads/limits";

// Every word the upload page shows, in German (the default) and English.

export type Lang = "de" | "en";

export const LANG_COOKIE = "upload_lang";

export function parseLang(value: string | undefined): Lang {
  return value === "en" ? "en" : "de";
}

const MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

export const COPY = {
  de: {
    dateLocale: "de-DE",
    introLine1: "Gerne können Sie hier Ihre Dateien zur Darstellung einreichen und aktualisieren.",
    // "Die Dateien sind für <owner> sichtbar im Ordner <folder>"
    introLine2: ["Die Dateien sind für ", " sichtbar im Ordner ", "."] as const,
    ownerFallback: "unser Team",
    columnName: "Name",
    columnAdded: "Hinzugefügt",
    empty: "Noch keine Dateien — ziehen Sie sie hierher oder wählen Sie sie unten aus.",
    itemCount: (n: number) => `${n} ${n === 1 ? "Datei" : "Dateien"}`,
    uploadingCount: (n: number) => `${n} ${n === 1 ? "Datei wird" : "Dateien werden"} hochgeladen…`,
    choose: "Dateien auswählen",
    uploading: "Wird hochgeladen…",
    replace: "Aktualisieren",
    replacing: "Wird aktualisiert…",
    replacePage: (done: number, total: number) => `Seite ${done}/${total}`,
    dropHere: (folder: string) => `Hier ablegen, um in „${folder}“ hochzuladen`,
    confirmReplace: (name: string, file: string) =>
      `„${name}“ durch „${file}“ ersetzen? Die bisherige Datei wird dabei überschrieben.`,
    uploaded: (n: number) => `✓ ${n} ${n === 1 ? "Datei" : "Dateien"} hochgeladen. Vielen Dank!`,
    replaced: (name: string) => `✓ „${name}“ wurde aktualisiert. Vielen Dank!`,
    uploadFailed: (file: string) => `„${file}“ konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.`,
    replaceFailed: (name: string) => `„${name}“ konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.`,
    replaceNeedsPdf: (name: string) => `„${name}“ ist ein PDF und kann nur durch ein PDF ersetzt werden.`,
    replaceNeedsMedia: (name: string) => `„${name}“ kann nur durch ein Bild oder Video ersetzt werden.`,
    rejection: (file: string, reason: Rejection) =>
      ({
        presentation: `„${file}“ ist eine Präsentation — bitte zuerst als PDF exportieren und dann das PDF hochladen.`,
        type: `„${file}“ ist kein Bild, Video oder PDF.`,
        size: `„${file}“ ist größer als ${MAX_MB} MB.`,
      })[reason],
    screensTitle: "Unsere Bildschirme",
    screens: [
      { size: "42 Zoll (106 cm)", orientation: "hochkant", format: "16:9", ideal: "ideal 1080 × 1920 px" },
      { size: "60 Zoll (152 cm)", orientation: "quer", format: "16:9", ideal: "ideal 3840 × 2160 px (4K)" },
    ],
    guideTitle: "Was Sie hochladen können",
    types: [
      { label: "Bilder", formats: "JPG, PNG, WebP, GIF" },
      { label: "Videos", formats: "MP4, MOV, WebM" },
      { label: "Dokumente", formats: "PDF — jede Seite wird zu einer Folie" },
    ],
    maxSize: ["Bis zu ", `${MAX_MB} MB`, " pro Datei."] as const,
    presentationsLabel: "Präsentationen",
    presentationsHint:
      " (PowerPoint, Keynote, Google Slides): bitte zuerst als PDF exportieren: ‚Datei‘ → ‚Exportieren‘ (oder ‚Herunterladen‘) → ‚PDF‘ — dann das PDF hochladen.",
    inactiveTitle: "Dieser Upload-Link ist nicht aktiv.",
    inactiveBody:
      "Er wurde möglicherweise deaktiviert, oder der Ordner, auf den er verweist, wurde entfernt. Bitte fragen Sie bei der Person nach, die ihn Ihnen geschickt hat.",
  },
  en: {
    dateLocale: "en-GB",
    introLine1: "You're welcome to submit and update your files for display here.",
    introLine2: ["The files are visible to ", " in the folder ", "."] as const,
    ownerFallback: "our team",
    columnName: "Name",
    columnAdded: "Added",
    empty: "No files yet — drop them here, or choose them below.",
    itemCount: (n: number) => `${n} file${n === 1 ? "" : "s"}`,
    uploadingCount: (n: number) => `Uploading ${n} file${n === 1 ? "" : "s"}…`,
    choose: "Choose Files",
    uploading: "Uploading…",
    replace: "Replace",
    replacing: "Replacing…",
    replacePage: (done: number, total: number) => `Page ${done}/${total}`,
    dropHere: (folder: string) => `Drop to upload to “${folder}”`,
    confirmReplace: (name: string, file: string) =>
      `Replace “${name}” with “${file}”? The current file will be overwritten.`,
    uploaded: (n: number) => `✓ ${n} file${n === 1 ? "" : "s"} uploaded. Thank you!`,
    replaced: (name: string) => `✓ “${name}” was updated. Thank you!`,
    uploadFailed: (file: string) => `“${file}” couldn't be uploaded. Please try again.`,
    replaceFailed: (name: string) => `“${name}” couldn't be updated. Please try again.`,
    replaceNeedsPdf: (name: string) => `“${name}” is a PDF and can only be replaced with a PDF.`,
    replaceNeedsMedia: (name: string) => `“${name}” can only be replaced with an image or video.`,
    rejection: (file: string, reason: Rejection) =>
      ({
        presentation: `“${file}” is a presentation — export it as a PDF first, then upload the PDF.`,
        type: `“${file}” isn't an image, video or PDF.`,
        size: `“${file}” is larger than ${MAX_MB} MB.`,
      })[reason],
    screensTitle: "Our screens",
    screens: [
      { size: "42 inch (106 cm)", orientation: "portrait", format: "16:9", ideal: "ideally 1080 × 1920 px" },
      { size: "60 inch (152 cm)", orientation: "landscape", format: "16:9", ideal: "ideally 3840 × 2160 px (4K)" },
    ],
    guideTitle: "What you can upload",
    types: [
      { label: "Images", formats: "JPG, PNG, WebP, GIF" },
      { label: "Videos", formats: "MP4, MOV, WebM" },
      { label: "Documents", formats: "PDF — each page becomes a slide" },
    ],
    maxSize: ["Up to ", `${MAX_MB} MB`, " per file."] as const,
    presentationsLabel: "Presentations",
    presentationsHint:
      " (PowerPoint, Keynote, Google Slides): export them as a PDF first: 'File' → 'Export' (or 'Download') → 'PDF' — then upload the PDF.",
    inactiveTitle: "This upload link isn't active.",
    inactiveBody:
      "It may have been turned off, or the folder it pointed to was removed. Ask whoever sent it for a new one.",
  },
} satisfies Record<Lang, unknown>;

export type Copy = (typeof COPY)[Lang];
