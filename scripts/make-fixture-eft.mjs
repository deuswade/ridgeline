/**
 * Generate a synthetic NIST ITL-1 (EFT) fixture so the app runs end-to-end
 * without a real transmission file.
 *
 * Produces fixtures/sample.eft containing:
 *   - Type-1 header with a CNT listing the records
 *   - Type-2 demographics (name, DOB, sex, height, weight, eyes, hair, ...)
 *   - 14 Type-14 records with UNCOMPRESSED grayscale images (one per FD-258 box)
 *
 * The images are simple gradients with a position number band so you can verify
 * placement on the card visually.
 *
 * Run: npm run make:fixture
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FS = 0x1c, GS = 0x1d, RS = 0x1e, US = 0x1f;
const b = (s) => Buffer.from(s, "latin1");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "fixtures");

// ---- helpers -----------------------------------------------------------

/**
 * Assemble a tagged record. `fields` is [tag, value] where value is a string
 * or Buffer (for binary 999). The 001 LEN field is computed and prepended.
 */
function buildTaggedRecord(typeNum, fields) {
  // Compose body once with a placeholder LEN, then fix the LEN iteratively.
  let len = 0;
  for (let iter = 0; iter < 4; iter++) {
    const parts = [];
    parts.push(b(`${typeNum}.001:${len}`));
    for (const [tag, value] of fields) {
      parts.push(Buffer.from([GS]));
      parts.push(b(`${tag}:`));
      parts.push(Buffer.isBuffer(value) ? value : b(value));
    }
    parts.push(Buffer.from([FS]));
    const rec = Buffer.concat(parts);
    if (rec.length === len) return rec;
    len = rec.length;
  }
  // Final pass with stable len
  const parts = [];
  parts.push(b(`${typeNum}.001:${len}`));
  for (const [tag, value] of fields) {
    parts.push(Buffer.from([GS]));
    parts.push(b(`${tag}:`));
    parts.push(Buffer.isBuffer(value) ? value : b(value));
  }
  parts.push(Buffer.from([FS]));
  return Buffer.concat(parts);
}

/**
 * Load one impression as a PNG. The 14 prints are cropped from a license-free
 * sample FD-258 card (fixtures/prints/fp_NN.png) — see scripts/README note.
 * Returns the raw PNG bytes plus its pixel dimensions (read from the IHDR).
 */
function readPrint(pos) {
  const p = join(__dirname, "..", "fixtures", "prints", `fp_${String(pos).padStart(2, "0")}.png`);
  const buf = readFileSync(p);
  const w = buf.readUInt32BE(16); // IHDR width
  const h = buf.readUInt32BE(20); // IHDR height
  return { data: buf, w, h };
}

// ---- Type-2 demographics ----------------------------------------------

const type2 = buildTaggedRecord(2, [
  ["2.002", "00"],
  ["2.018", "DOE,JOHN,QUINCY"],
  ["2.020", "NEW YORK, NY"],
  ["2.022", "19900215"],
  ["2.024", "M"],
  ["2.025", "W"],
  ["2.027", "511"],
  ["2.029", "180"],
  ["2.031", "BLU"],
  ["2.032", "BRO"],
  // FBI (2.014), Social/SOC (2.016), and Misc/MNU (2.010) intentionally omitted.
]);

// ---- Type-14 image records (14 boxes) ----------------------------------

const imageRecords = [];
for (let pos = 1; pos <= 14; pos++) {
  const { data: img, w, h } = readPrint(pos);
  imageRecords.push(
    buildTaggedRecord(14, [
      ["14.002", "00"],
      ["14.003", "0"], // IMP: live-scan rolled
      ["14.004", "SAMPLE"],
      ["14.005", "20260101"],
      ["14.006", String(w)], // HLL
      ["14.007", String(h)], // VLL
      ["14.008", "1"], // SLC
      ["14.009", "500"], // HPS
      ["14.010", "500"], // VPS
      ["14.011", "PNG"], // CGA: PNG-encoded image
      ["14.013", String(pos)], // FGP
      ["14.999", img], // image data (binary PNG)
    ]),
  );
}

// ---- Type-1 header ------------------------------------------------------
// CNT: first item "1<US>1", then one entry per following record.
const cntEntries = [`1${String.fromCharCode(US)}${imageRecords.length + 1}`];
cntEntries.push(`2${String.fromCharCode(US)}00`);
for (let i = 0; i < imageRecords.length; i++) {
  cntEntries.push(`14${String.fromCharCode(US)}${String(i + 1).padStart(2, "0")}`);
}
const cnt = cntEntries.join(String.fromCharCode(RS));

const type1 = buildTaggedRecord(1, [
  ["1.002", "0400"],
  ["1.003", cnt],
  ["1.004", "DOM"],
  ["1.005", "20260101"],
  ["1.006", "1"],
  ["1.007", "DAI000000"],
  ["1.008", "ORI000000"],
  ["1.009", "TCN-SAMPLE-0001"],
  ["1.011", "00.00"],
  ["1.012", "00.00"],
]);

const file = Buffer.concat([type1, type2, ...imageRecords]);

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "sample.eft");
writeFileSync(outPath, file);
console.log(`Wrote ${outPath} (${file.length} bytes, ${imageRecords.length} images).`);
