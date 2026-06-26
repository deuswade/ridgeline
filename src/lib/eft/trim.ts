/**
 * Trim the white margin around a fingerprint print.
 *
 * Fingerprint captures (rolled and especially plain/slap) carry a lot of blank
 * background. Placing the raw image in a card box makes the ridges look small;
 * enlarging the whole image just spills past the box lines. Instead we crop to
 * the inked content here, so the card layout can fit the *content* to each box
 * (with a small inset) and the print fills the box without crossing its border.
 *
 * Uses @pdf-lib/upng to decode/encode PNG. Density-based row/column scanning
 * makes the crop robust against isolated specks. On any failure the original
 * bytes are returned unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import UPNG from "@pdf-lib/upng";

const INK_LUMA = 180; // pixels darker than this count as ridge ink
const DENSITY = 0.04; // a row/col is "content" if dark count >= 4% of the densest
const PAD = 0.02; // keep a 2% margin of the source around the content

export function trimPng(png: Uint8Array): Uint8Array {
  try {
    const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
    const img: any = UPNG.decode(ab);
    const w: number = img.width;
    const h: number = img.height;
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);

    const rowDark = new Array(h).fill(0);
    const colDark = new Array(w).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (rgba[i + 3] < 20) continue; // transparent
        const luma = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
        if (luma < INK_LUMA) {
          rowDark[y]++;
          colDark[x]++;
        }
      }
    }
    let maxRow = 0;
    for (let y = 0; y < h; y++) if (rowDark[y] > maxRow) maxRow = rowDark[y];
    let maxCol = 0;
    for (let x = 0; x < w; x++) if (colDark[x] > maxCol) maxCol = colDark[x];
    if (maxRow === 0 || maxCol === 0) return png; // blank image

    const rT = Math.max(1, maxRow * DENSITY);
    const cT = Math.max(1, maxCol * DENSITY);
    let y0 = 0;
    while (y0 < h && rowDark[y0] < rT) y0++;
    let y1 = h - 1;
    while (y1 > y0 && rowDark[y1] < rT) y1--;
    let x0 = 0;
    while (x0 < w && colDark[x0] < cT) x0++;
    let x1 = w - 1;
    while (x1 > x0 && colDark[x1] < cT) x1--;

    const padX = Math.round(w * PAD);
    const padY = Math.round(h * PAD);
    x0 = Math.max(0, x0 - padX);
    y0 = Math.max(0, y0 - padY);
    x1 = Math.min(w - 1, x1 + padX);
    y1 = Math.min(h - 1, y1 + padY);

    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    if (cw <= 0 || ch <= 0 || (cw >= w && ch >= h)) return png; // nothing to gain

    const out = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const src = ((y + y0) * w + x0) * 4;
      out.set(rgba.subarray(src, src + cw * 4), y * cw * 4);
    }
    return new Uint8Array(UPNG.encode([out.buffer], cw, ch, 0));
  } catch {
    return png;
  }
}
