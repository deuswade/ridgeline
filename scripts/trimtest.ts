/**
 * Dev sanity check for trimPng: crops a white image with a centered dark block.
 * Run: npx tsx scripts/trimtest.ts
 */
import UPNG from "@pdf-lib/upng";
import { trimPng } from "../src/lib/eft/trim";

const W = 200, H = 200;
const rgba = new Uint8Array(W * H * 4);
rgba.fill(255);
for (let y = 70; y < 130; y++)
  for (let x = 80; x < 120; x++) {
    const i = (y * W + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 20;
  }
const png = new Uint8Array(UPNG.encode([rgba.buffer as ArrayBuffer], W, H, 0));
const trimmed = trimPng(png);
const buf = trimmed.buffer.slice(
  trimmed.byteOffset,
  trimmed.byteOffset + trimmed.byteLength,
) as ArrayBuffer;
const out = UPNG.decode(buf) as { width: number; height: number };
console.log(`original ${W}x${H} -> trimmed ${out.width}x${out.height} (content 40x60)`);
const ok = out.width < 70 && out.height < 90 && out.width > 35 && out.height > 55;
console.log(ok ? "TRIM PASS" : "TRIM FAIL");
