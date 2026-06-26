/**
 * Generate a PLACEHOLDER FD-258 template (only needed if you don't already have
 * a real card PDF). The project SHIPS WITH the real FD-258 at
 * public/fd-258-template.pdf, so you normally never need this.
 *
 * IMPORTANT: to avoid clobbering the real template, this writes to
 * public/fd-258-template.placeholder.pdf — NOT public/fd-258-template.pdf.
 * If you actually want to use it, copy it over the real one yourself.
 *
 * Run: npm run make:template
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MM = 72 / 25.4;
const CARD = 8 * 72; // 576 pt
const CARD_MM = 8 * 25.4;

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");

function topLeftToPdf(x, y, w, h) {
  return { x: x * MM, y: (CARD_MM - y - h) * MM, w: w * MM, h: h * MM };
}

const main = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([CARD, CARD]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const faint = rgb(0.8, 0.8, 0.8);

  page.drawText("FD-258 (placeholder template)", {
    x: 14 * MM,
    y: CARD - 12 * MM,
    size: 9,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Outer border
  page.drawRectangle({
    x: 6 * MM,
    y: 6 * MM,
    width: CARD - 12 * MM,
    height: CARD - 12 * MM,
    borderColor: faint,
    borderWidth: 1,
  });

  // Rolled + plain impression boxes mirroring the layout module.
  const colX = [12, 50, 88, 126, 164];
  const boxes = [];
  for (const yTop of [78, 120]) {
    for (const x of colX) boxes.push([x, yTop, 36, 38]);
  }
  boxes.push([12, 162, 72, 32], [86, 162, 26, 32], [114, 162, 26, 32], [142, 162, 49, 32]);

  for (const [x, y, w, h] of boxes) {
    const r = topLeftToPdf(x, y, w, h);
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      borderColor: faint,
      borderWidth: 0.75,
    });
  }

  const bytes = await doc.save();
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "fd-258-template.placeholder.pdf");
  writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.length} bytes).`);
  console.log("NOTE: this did NOT touch the real public/fd-258-template.pdf.");
};

main();
