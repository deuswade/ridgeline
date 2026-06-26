/**
 * FD-258 PDF generation with pdf-lib.
 *
 * Loads the blank FD-258 template from /public (if present), or creates a
 * blank 8"x8" page, then overlays demographic text and the 14 fingerprint
 * impressions at the layout coordinates plus the user's mm calibration offsets.
 *
 * Output page is forced to exactly 8" x 8" (576 x 576 pt) so that printing at
 * 100% scale onto a blank FD-258 card aligns 1:1.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFImage, PDFName } from "pdf-lib";
import type { Demographics, FingerprintImage } from "@/lib/eft/types";
import {
  FD258_LAYOUT,
  getExtraFields,
  toPdfPoints,
  POINTS_PER_MM,
  POINTS_PER_INCH,
  CARD_WIDTH_PT,
  CARD_HEIGHT_PT,
  ORI_LINES,
  ORI_BOX,
  ORI_FONT_SIZE,
  ORI_LINE_MM,
  DOB_PARTS,
} from "./fd258-layout";

export interface GenerateOptions {
  demographics: Demographics;
  images: FingerprintImage[];
  /** Calibration offsets in millimeters. +X = right, +Y = down. */
  offsetXmm?: number;
  offsetYmm?: number;
  /** Raw bytes of /public/fd-258-template.pdf, if available. */
  templateBytes?: Uint8Array | null;
  /** Draw box outlines + captions where images are missing (debug aid). */
  drawGuides?: boolean;
  /** User-entered values for the extra card boxes, keyed by ExtraField.name. */
  extras?: Record<string, string>;
  /** Print the fixed ORI block. Uncheck if the card already has ORI pre-printed. */
  printOri?: boolean;
  /**
   * Draw the FD-258 template behind the content. True for the on-screen preview
   * (alignment aid); false for the actual print/download, which should contain
   * ONLY the entered data + prints to overlay onto a real pre-printed card.
   */
  includeTemplate?: boolean;
  /**
   * Output page size for the saved PDF. "card" = exactly 8x8. "letter" = the
   * 8x8 content pinned to the top-left of a US-Letter page (more reliable on
   * printers that won't honor a custom 8x8 size). Ignored for the preview.
   */
  pageSize?: "card" | "letter";
}

export async function generateFd258Pdf(opts: GenerateOptions): Promise<Uint8Array> {
  const {
    demographics,
    images,
    offsetXmm = 0,
    offsetYmm = 0,
    templateBytes,
    drawGuides = true,
    extras = {},
    printOri = true,
    includeTemplate = true,
    pageSize = "card",
  } = opts;

  let pdfDoc: PDFDocument;
  let page: PDFPage;
  const haveTemplate = includeTemplate && !!(templateBytes && templateBytes.byteLength > 0);

  if (haveTemplate) {
    pdfDoc = await PDFDocument.load(templateBytes!);
    // Keep only the card (page 0); drop the back / privacy-notice page.
    while (pdfDoc.getPageCount() > 1) pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    page = pdfDoc.getPage(0);
    // The template carries an interactive ORI widget annotation; drop all page
    // annotations so ORI is fixed pre-printed text, not an editable box.
    try {
      page.node.delete(PDFName.of("Annots"));
    } catch {
      /* no annotations */
    }
    // Force the page box to exactly 8"x8" so print scaling is 1:1.
    page.setSize(CARD_WIDTH_PT, CARD_HEIGHT_PT);
  } else {
    pdfDoc = await PDFDocument.create();
    page = pdfDoc.addPage([CARD_WIDTH_PT, CARD_HEIGHT_PT]);
  }
  // Only draw our own guide boxes for the on-screen fallback (no real template,
  // preview mode). Never on the data-only print/download output.
  const guides = drawGuides && !haveTemplate && includeTemplate;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Draw a value as text within a box, optionally right-aligned / wrapped.
  // Everything is DRAWN text (no interactive form fields), so it renders
  // identically in every viewer and never paints a white background.
  const draw = (
    value: string | undefined | null,
    rect: { x: number; y: number; w: number; h: number },
    fontSize: number,
    align?: "left" | "right" | "center",
    multiline = false,
  ) => {
    if (value == null || value === "") return;
    const t = sanitize(value, multiline);
    const p = toPdfPoints(rect as any, offsetXmm, offsetYmm);
    let x = p.x;
    if (!multiline && (align === "right" || align === "center")) {
      const tw = font.widthOfTextAtSize(t, fontSize);
      x = align === "right" ? Math.max(p.x, p.x + p.w - tw) : p.x + (p.w - tw) / 2;
    }
    page.drawText(t, {
      x,
      y: p.y + (p.h - fontSize) / 2,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      maxWidth: rect.w * POINTS_PER_MM,
      lineHeight: fontSize * 1.1,
    });
  };

  // --- Extracted demographics ---
  for (const tf of FD258_LAYOUT.textFields) {
    draw((demographics as any)[tf.key], tf.rect, tf.fontSize);
  }
  // --- User-entered extra fields ---
  for (const f of getExtraFields()) {
    draw(extras[f.name], f.rect, f.fontSize, f.align, f.multiline);
  }

  // --- Fixed ORI block (centered, 3 lines) — skip if the card pre-prints it ---
  if (printOri) {
    ORI_LINES.forEach((line, i) => {
      draw(line, { x: ORI_BOX.x, y: ORI_BOX.y + i * ORI_LINE_MM, w: ORI_BOX.w, h: ORI_LINE_MM }, ORI_FONT_SIZE, "center");
    });
  }

  // --- Date of birth as Month / Day / Year, centered under the sub-labels ---
  const dobMatch = demographics.dateOfBirth
    ? /(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/.exec(demographics.dateOfBirth)
    : null;
  if (dobMatch) {
    draw(dobMatch[1], DOB_PARTS.month, DOB_PARTS.fontSize, "center");
    draw(dobMatch[2], DOB_PARTS.day, DOB_PARTS.fontSize, "center");
    draw(dobMatch[3], DOB_PARTS.year, DOB_PARTS.fontSize, "center");
  } else if (demographics.dateOfBirth) {
    draw(demographics.dateOfBirth, { x: 174, y: 29.5, w: 28, h: 4 }, 8, "center");
  }

  // --- Fingerprint images ---
  const byPosition = new Map<number, FingerprintImage>();
  for (const img of images) {
    // Keep the first image seen for each position (rolled preferred by order).
    if (!byPosition.has(img.fingerPosition)) byPosition.set(img.fingerPosition, img);
  }

  for (const box of FD258_LAYOUT.imageBoxes) {
    const rectPt = toPdfPoints(box.rect, offsetXmm, offsetYmm);
    const img = byPosition.get(box.position);

    let embedded: PDFImage | undefined;
    if (img?.pngData && img.pngData.byteLength > 0) {
      try {
        embedded = img.compression === "JPEGB"
          ? await pdfDoc.embedJpg(img.pngData)
          : await pdfDoc.embedPng(img.pngData);
      } catch {
        embedded = undefined;
      }
    }

    if (embedded) {
      // The image is already trimmed to its inked content, and the box is inset
      // inside the printed grid lines, so fill the box almost fully — maximizes
      // print size while staying clear of the lines.
      const inset = 0.98;
      const fit = fitContain(embedded.width, embedded.height, rectPt.w * inset, rectPt.h * inset);
      page.drawImage(embedded, {
        x: rectPt.x + (rectPt.w - fit.w) / 2,
        y: rectPt.y + (rectPt.h - fit.h) / 2,
        width: fit.w,
        height: fit.h,
      });
    } else if (guides) {
      // Placeholder box + caption so the card is still usable / debuggable.
      page.drawRectangle({
        x: rectPt.x,
        y: rectPt.y,
        width: rectPt.w,
        height: rectPt.h,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.5,
      });
      page.drawText(box.caption + (img ? " (no image)" : ""), {
        x: rectPt.x + 2,
        y: rectPt.y + 2,
        size: 6,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  const cardBytes = await pdfDoc.save();
  if (pageSize === "letter") {
    // Place the 8x8 card content at the TOP-LEFT of a US-Letter page. Printers
    // reliably honor Letter (unlike custom 8x8), so the content prints at the
    // top — and an 8x8 card fed to the top-left of the tray catches it 1:1.
    const LETTER_W = 8.5 * POINTS_PER_INCH; // 612
    const LETTER_H = 11 * POINTS_PER_INCH; // 792
    const out = await PDFDocument.create();
    const lp = out.addPage([LETTER_W, LETTER_H]);
    const [emb] = await out.embedPdf(cardBytes, [0]);
    // Center horizontally (0.25" each side clears the printer's L/R margins),
    // top-aligned (small gap below the top printable margin).
    lp.drawPage(emb, {
      x: (LETTER_W - CARD_WIDTH_PT) / 2,
      y: LETTER_H - CARD_HEIGHT_PT,
      width: CARD_WIDTH_PT,
      height: CARD_HEIGHT_PT,
    });
    return out.save();
  }
  return cardBytes;
}

function fitContain(iw: number, ih: number, bw: number, bh: number) {
  if (iw <= 0 || ih <= 0) return { w: bw, h: bh };
  const scale = Math.min(bw / iw, bh / ih);
  return { w: iw * scale, h: ih * scale };
}

/** Strip control chars / NIST separators from text values. */
function sanitize(s: string, keepNewlines = false): string {
  if (keepNewlines) {
    return s.replace(/\r\n?/g, "\n").replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim();
  }
  return s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
}
