import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { HandoverFormData, HandoverSection } from "@/lib/uebergabeprotokoll";

// The Übergabeprotokoll as a PDF, for emailing: its title, who it's for and
// when, then each part of the venue the event's Checkliste brings in, every
// item with its ✓ and ✕ boxes as filled in (a failed one's note and photos
// under it), and the signatures at the end. A4, in Helvetica — PDF's own,
// which covers German (WinAnsi); anything it can't write comes out as "?".

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const BOTTOM = 56; // above the footer
const CONTENT = PAGE.width - MARGIN * 2;

// The app's own colours (globals.css).
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TEXT = hex("#1c1c1e");
const MUTED = hex("#8e8e93");
const RULE = hex("#e5e5ea");
const NEUTRAL = hex("#c7c7cc");
const ACCENT = hex("#007aff");
const DANGER = hex("#ff3b30");
const WHITE = rgb(1, 1, 1);

const BOX = 15;
const BOX_GAP = 8;
const NUMBER_WIDTH = 34;
const PHOTO = { width: 150, height: 112, gap: 8 };
const SIGNATURE_HEIGHT = 70;

export type HandoverPdfInput = {
  form: string;
  title: string;
  customer: string | null;
  // DD/MM/YYYY.
  date: string;
  contactName: string | null;
  sections: HandoverSection[];
  data: HandoverFormData;
  // The failed items' photos, by path, as JPEG bytes (any that couldn't be
  // fetched are left out).
  photos: Map<string, Uint8Array>;
};

export async function handoverPdf(input: HandoverPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Übergabeprotokoll ${input.form} – ${input.title}`);
  doc.setCreator("Colo Cloud");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  // Room for this much more on the page, or on to the next.
  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };

  const text = (s: string, x: number, size: number, font: PDFFont, color: RGB = TEXT) =>
    page.drawText(safe(font, s), { x, y, size, font, color });

  // ── Title ──
  y -= 24;
  text("Übergabeprotokoll", MARGIN, 24, bold);
  y -= 22;
  for (const line of wrap(regular, `Kunde: ${input.customer ?? "–"}, Veranstaltung: ${input.title}`, 12, CONTENT)) {
    text(line, MARGIN, 12, regular, MUTED);
    y -= 16;
  }
  text(`${input.form}, Datum: ${input.date}`, MARGIN, 12, regular, MUTED);
  y -= 30;

  const images = new Map<string, PDFImage | null>();
  async function photo(path: string) {
    if (!images.has(path)) {
      const bytes = input.photos.get(path);
      images.set(path, bytes ? await doc.embedJpg(bytes).catch(() => null) : null);
    }
    return images.get(path) ?? null;
  }

  // ── The venue, part by part ──
  for (const section of input.sections) {
    // The heading kept with at least its first row.
    ensure(60);
    y -= 4;
    text(section.title, MARGIN, 15, bold);
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.8, color: TEXT });
    y -= 16;

    for (const group of section.groups) {
      if (group.title) {
        ensure(40);
        y -= 4;
        text(group.title, MARGIN, 11, bold, MUTED);
        y -= 16;
      }
      for (const item of group.items) {
        const answer = input.data.items[item.key];
        const labelX = MARGIN + NUMBER_WIDTH;
        const labelWidth = CONTENT - NUMBER_WIDTH - BOX * 2 - BOX_GAP - 12;
        const lines = wrap(regular, item.label, 11, labelWidth);
        const rowHeight = lines.length * 14;
        ensure(rowHeight + 8);
        const top = y;
        text(item.number, MARGIN, 11, regular, MUTED);
        for (const line of lines) {
          text(line, labelX, 11, regular);
          y -= 14;
        }
        // The two boxes, at the right, centred on the first line (whose
        // baseline is top).
        const boxY = top + 11.5;
        const okX = PAGE.width - MARGIN - BOX * 2 - BOX_GAP;
        drawBox(page, okX, boxY, "ok", answer?.state === "ok");
        drawBox(page, okX + BOX + BOX_GAP, boxY, "issue", answer?.state === "issue");
        y = top - rowHeight;

        // A failed item's note and photos.
        if (answer?.state === "issue") {
          if (answer.note) {
            const noteLines = wrap(regular, answer.note, 10, CONTENT - NUMBER_WIDTH);
            y -= 2;
            ensure(14);
            text("Anmerkung:", labelX, 10, bold, DANGER);
            y -= 13;
            for (const line of noteLines) {
              ensure(13);
              text(line, labelX, 10, regular);
              y -= 13;
            }
          }
          const shots = (await Promise.all((answer.photos ?? []).map(photo))).filter((p): p is PDFImage => !!p);
          if (shots.length) {
            y -= 4;
            let x = labelX;
            let rowTall = 0;
            for (const shot of shots) {
              const scale = Math.min(PHOTO.width / shot.width, PHOTO.height / shot.height);
              const w = shot.width * scale;
              const h = shot.height * scale;
              if (x + w > PAGE.width - MARGIN) {
                y -= rowTall + PHOTO.gap;
                x = labelX;
                rowTall = 0;
              }
              if (y - h < BOTTOM) {
                newPage();
                x = labelX;
                rowTall = 0;
              }
              page.drawImage(shot, { x, y: y - h, width: w, height: h });
              x += w + PHOTO.gap;
              rowTall = Math.max(rowTall, h);
            }
            y -= rowTall + 2;
          }
        }
        y += 2;
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.5, color: RULE });
        y -= 16;
      }
    }
    y -= 12;
  }

  // ── Bestätigung ──
  ensure(SIGNATURE_HEIGHT + 120);
  y -= 4;
  text("Bestätigung", MARGIN, 15, bold);
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.8, color: TEXT });
  y -= 22;
  text(`Berlin, den ${input.date}`, MARGIN, 11, regular);
  y -= 16;
  const columnWidth = (CONTENT - 32) / 2;
  const signers = [
    { key: "veranstalter" as const, name: input.contactName, label: "Unterschrift Veranstalter" },
    { key: "eigentuemer" as const, name: null, label: "Unterschrift Eigentümer" },
  ];
  const lineY = y - SIGNATURE_HEIGHT;
  for (const [i, signer] of signers.entries()) {
    const x = MARGIN + i * (columnWidth + 32);
    const png = input.data.signatures[signer.key];
    if (png) {
      const image = await doc.embedPng(Buffer.from(png.slice(png.indexOf(",") + 1), "base64")).catch(() => null);
      if (image) {
        const scale = Math.min(columnWidth / image.width, (SIGNATURE_HEIGHT - 4) / image.height);
        page.drawImage(image, { x, y: lineY + 2, width: image.width * scale, height: image.height * scale });
      }
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + columnWidth, y: lineY }, thickness: 0.8, color: TEXT });
    // The labels level, under the contact's name — or the room for one.
    y = lineY - 16;
    if (signer.name) text(signer.name, x, 11, bold);
    y = lineY - 30;
    text(signer.label, x, 10, regular, MUTED);
    y = lineY + SIGNATURE_HEIGHT;
  }

  // ── Footer, on every page ──
  const pages = doc.getPages();
  for (const [i, p] of pages.entries()) {
    const left = safe(regular, `Übergabeprotokoll ${input.form} · ${input.title}`);
    const right = `Seite ${i + 1} / ${pages.length}`;
    p.drawText(truncate(regular, left, 8, CONTENT - 80), { x: MARGIN, y: 30, size: 8, font: regular, color: MUTED });
    p.drawText(right, { x: PAGE.width - MARGIN - regular.widthOfTextAtSize(right, 8), y: 30, size: 8, font: regular, color: MUTED });
  }

  return doc.save();
}

// A ✓ or ✕ box: filled blue or red with a white mark when it's the one
// picked; otherwise an outline with the mark faint in it, as on the page.
function drawBox(page: PDFPage, x: number, top: number, kind: "ok" | "issue", picked: boolean) {
  const colour = kind === "ok" ? ACCENT : DANGER;
  page.drawRectangle({
    x,
    y: top - BOX,
    width: BOX,
    height: BOX,
    color: picked ? colour : undefined,
    borderColor: picked ? colour : NEUTRAL,
    borderWidth: picked ? 0 : 1,
  });
  const mark = picked ? WHITE : NEUTRAL;
  const at = (u: number, v: number) => ({ x: x + u * BOX, y: top - v * BOX });
  const stroke = { thickness: 1.6, color: mark };
  if (kind === "ok") {
    page.drawLine({ start: at(0.24, 0.52), end: at(0.43, 0.7), ...stroke });
    page.drawLine({ start: at(0.43, 0.7), end: at(0.77, 0.3), ...stroke });
  } else {
    page.drawLine({ start: at(0.3, 0.3), end: at(0.7, 0.7), ...stroke });
    page.drawLine({ start: at(0.7, 0.3), end: at(0.3, 0.7), ...stroke });
  }
}

// What the font can write, the rest as "?" (an emoji in a note, say).
const writable = new WeakMap<PDFFont, Map<string, boolean>>();
function safe(font: PDFFont, s: string) {
  let known = writable.get(font);
  if (!known) writable.set(font, (known = new Map()));
  let out = "";
  for (const ch of s.replace(/\t/g, " ")) {
    if (!known.has(ch)) {
      try {
        font.encodeText(ch);
        known.set(ch, true);
      } catch {
        known.set(ch, false);
      }
    }
    out += known.get(ch) ? ch : "?";
  }
  return out;
}

// Lines no wider than width, broken between words (or inside one too long
// for a line of its own), keeping the text's own line breaks.
function wrap(font: PDFFont, s: string, size: number, width: number): string[] {
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
  const lines: string[] = [];
  for (const paragraph of s.split(/\r?\n/).map((p) => safe(font, p))) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (!fits(rest)) {
        let n = rest.length - 1;
        while (n > 1 && !fits(rest.slice(0, n))) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function truncate(font: PDFFont, s: string, size: number, width: number) {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let t = s;
  while (t && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}
