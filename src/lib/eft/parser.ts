/**
 * NIST ITL-1 (EFT) parser.
 *
 * Reference: ANSI/NIST-ITL 1-2007. An EFT file is a sequence of records:
 *   - Type-1 (header, tagged ASCII) is always first and lists the rest in CNT.
 *   - Tagged records (1, 2, 9, 10, 13, 14, ...) use separators:
 *       FS (0x1C) ends a record, GS (0x1D) ends a field,
 *       RS (0x1E) ends a subfield, US (0x1F) ends an information item.
 *     Each field begins with its tag "TT.FFF:" then the value.
 *   - Binary records (3-8, incl. Type-4 fingerprint images) begin with a
 *     4-byte big-endian length and a fixed binary header.
 *
 * The Type-1 CNT (1.003) tells us the type of every following record, so we
 * walk the buffer record-by-record using each record's own length field.
 */

import {
  Demographics,
  EftParseResult,
  FingerprintImage,
  TaggedRecord,
} from "./types";
import {
  TYPE2_FIELDS,
  NAME_FIELD,
  parseName,
  normalizeDob,
} from "./fieldmap";
import {
  compressionFromType4Byte,
  compressionFromToken,
  detectCompression,
  decodeForEmbedding,
} from "./images";

// ASCII separators
const FS = 0x1c;
const GS = 0x1d;
const RS = 0x1e;
const US = 0x1f;

const BINARY_RECORD_TYPES = new Set([3, 4, 5, 6, 7, 8]);

export async function parseEft(input: Uint8Array): Promise<EftParseResult> {
  const buf = Buffer.from(input);
  const warnings: string[] = [];
  const recordTypes: number[] = [];
  const images: FingerprintImage[] = [];
  let demographics: Demographics = { extras: {} };

  // --- Type-1 header ---
  const type1Len = readTaggedLength(buf, 0);
  if (!type1Len || type1Len > buf.length) {
    throw new Error("Could not read a valid Type-1 record length. Is this a NIST ITL / EFT file?");
  }
  const type1 = parseTaggedRecord(buf.subarray(0, type1Len), 1);
  recordTypes.push(1);

  // CNT (1.003): describes the records that follow.
  const cntRaw = type1.fields.get(3) ?? "";
  const plan = parseContents(cntRaw, warnings);

  // --- Walk subsequent records ---
  let offset = type1Len;
  for (const planned of plan) {
    if (offset >= buf.length) {
      warnings.push(`Reached end of file before reading planned record type ${planned.type}.`);
      break;
    }

    let recLen: number;
    let isBinary = BINARY_RECORD_TYPES.has(planned.type);

    if (isBinary) {
      recLen = buf.readUInt32BE(offset);
    } else {
      recLen = readTaggedLength(buf, offset);
    }

    if (!recLen || offset + recLen > buf.length) {
      warnings.push(
        `Record type ${planned.type} reported invalid length ${recLen} at offset ${offset}; stopping walk.`,
      );
      break;
    }

    const recBytes = buf.subarray(offset, offset + recLen);
    recordTypes.push(planned.type);

    try {
      if (planned.type === 2) {
        const rec = parseTaggedRecord(recBytes, 2);
        demographics = extractDemographics(rec, warnings);
      } else if (planned.type === 4) {
        images.push(...(await parseType4(recBytes, warnings)));
      } else if (planned.type === 14) {
        images.push(...(await parseType14(recBytes, warnings)));
      } else if (planned.type === 13) {
        // Latent/variable image — extract opportunistically using Type-14 logic.
        images.push(...(await parseType14(recBytes, warnings)));
      }
      // Other record types (9 minutiae, 10 photo, etc.) are skipped for FD-258.
    } catch (e) {
      warnings.push(`Failed to parse record type ${planned.type}: ${(e as Error).message}`);
    }

    offset += recLen;
  }

  if (images.length === 0) {
    warnings.push("No fingerprint images (Type-4 / Type-14) were extracted.");
  }

  return { demographics, images, warnings, recordTypes };
}

// ------------------------------------------------------------------
// Tagged-field records (Type-1, Type-2, Type-14 header portion)
// ------------------------------------------------------------------

/**
 * Read the LEN value of a tagged record starting at `offset`.
 * The record begins with "TT.001:<digits>" terminated by GS.
 */
function readTaggedLength(buf: Buffer, offset: number): number {
  // Scan a bounded window for the first GS.
  const end = Math.min(buf.length, offset + 64);
  let header = "";
  for (let i = offset; i < end; i++) {
    if (buf[i] === GS) break;
    header += String.fromCharCode(buf[i]);
  }
  const m = /^\s*\d+\.0*1:(\d+)/.exec(header);
  if (!m) return 0;
  return parseInt(m[1], 10);
}

/**
 * Parse a tagged-field record into a tag->value map. For records that may end
 * with a binary 999 DATA field (Type-13/14), pass the whole record; the 999
 * value will be the remaining bytes captured as a Latin-1 string (callers that
 * need the raw image bytes use parseType14, which slices the buffer directly).
 */
function parseTaggedRecord(recBytes: Buffer, expectedType: number): TaggedRecord {
  // Strip a trailing FS if present.
  let limit = recBytes.length;
  if (limit > 0 && recBytes[limit - 1] === FS) limit -= 1;

  const fields = new Map<number, string>();
  const raw: TaggedRecord["raw"] = [];

  let i = 0;
  while (i < limit) {
    // Read tag up to ':'
    let tag = "";
    while (i < limit && recBytes[i] !== 0x3a /* : */ && recBytes[i] !== GS) {
      tag += String.fromCharCode(recBytes[i]);
      i++;
    }
    if (i >= limit) break;
    if (recBytes[i] === GS) {
      // empty field without colon; skip
      i++;
      continue;
    }
    i++; // skip ':'

    // Read value up to GS (or end).
    const valStart = i;
    while (i < limit && recBytes[i] !== GS) i++;
    const valBytes = recBytes.subarray(valStart, i);
    const value = latin1(valBytes);
    if (i < limit) i++; // skip GS

    const parsed = /^(\d+)\.(\d+)$/.exec(tag.trim());
    if (parsed) {
      const fieldNum = parseInt(parsed[2], 10);
      fields.set(fieldNum, value);
      raw.push({ type: parseInt(parsed[1], 10), field: fieldNum, tag: tag.trim(), value });
    }
  }

  return { type: expectedType, fields, raw };
}

/** Parse the CNT (1.003) field into an ordered record plan. */
function parseContents(cnt: string, warnings: string[]): { type: number; idc: number }[] {
  const plan: { type: number; idc: number }[] = [];
  if (!cnt) {
    warnings.push("Type-1 CNT (1.003) field is empty; cannot determine record layout.");
    return plan;
  }
  // Subfields separated by RS; items within a subfield separated by US.
  const subfields = cnt.split(String.fromCharCode(RS));
  // First subfield is "1<US>N" (this record + count). Remaining are "type<US>idc".
  for (let s = 1; s < subfields.length; s++) {
    const items = subfields[s].split(String.fromCharCode(US));
    const type = parseInt(items[0], 10);
    const idc = parseInt(items[1] ?? "0", 10);
    if (!Number.isNaN(type)) plan.push({ type, idc: Number.isNaN(idc) ? 0 : idc });
  }
  if (plan.length === 0) warnings.push("CNT parsed to zero follow-on records.");
  return plan;
}

// ------------------------------------------------------------------
// Demographics
// ------------------------------------------------------------------

function extractDemographics(rec: TaggedRecord, warnings: string[]): Demographics {
  const demo: Demographics = { extras: {} };

  for (const def of TYPE2_FIELDS) {
    const value = rec.fields.get(def.field);
    if (value == null || value === "") continue;

    if (def.field === NAME_FIELD) {
      const name = parseName(value);
      demo.lastName = name.lastName;
      demo.firstName = name.firstName;
      demo.middleName = name.middleName;
      demo.fullName = name.fullName;
      continue;
    }
    if (def.key === "dateOfBirth") {
      demo.dateOfBirth = normalizeDob(value);
      continue;
    }
    (demo as any)[def.key] = value.replace(/\^/g, " ").trim();
  }

  // Capture any unmapped fields for visibility.
  const mapped = new Set(TYPE2_FIELDS.map((d) => d.field).concat([1, 2]));
  for (const f of rec.raw) {
    if (!mapped.has(f.field)) demo.extras[f.tag] = f.value;
  }

  if (!demo.fullName) warnings.push("No name (2.018 NAM) found in Type-2 record.");
  return demo;
}

// ------------------------------------------------------------------
// Type-4 (binary fingerprint image)
// ------------------------------------------------------------------

async function parseType4(rec: Buffer, warnings: string[]): Promise<FingerprintImage[]> {
  // Fixed header: LEN(4) IDC(1) IMP(1) FGP(6) ISR(1) HLL(2) VLL(2) GCA(1) = 18
  if (rec.length < 18) {
    warnings.push("Type-4 record shorter than its fixed header; skipping.");
    return [];
  }
  // Layout: LEN[0..3] IDC[4] IMP[5] FGP[6..11] ISR[12] HLL[13..14] VLL[15..16] GCA[17] DATA[18..]
  const imp = rec[5];
  const fgpPrimary = rec[6]; // first of 6 FGP bytes
  const hll = rec.readUInt16BE(13);
  const vll = rec.readUInt16BE(15);
  const gca = rec[17];
  const data = rec.subarray(18);

  const compression = compressionFromType4Byte(gca);
  const img: FingerprintImage = {
    sourceType: 4,
    fingerPosition: normalizeFgp(fgpPrimary, imp),
    width: hll,
    height: vll,
    compression: compression === "UNKNOWN" ? detectCompression(data) : compression,
    data: new Uint8Array(data),
  };

  const decoded = await decodeForEmbedding({
    bytes: img.data,
    compression: img.compression,
    width: hll,
    height: vll,
  });
  img.pngData = decoded.pngData;
  img.decodeNote = decoded.note;
  if (decoded.note) warnings.push(`FGP ${img.fingerPosition} (Type-4): ${decoded.note}`);

  return [img];
}

// ------------------------------------------------------------------
// Type-14 (variable-resolution fingerprint, tagged with binary 999 DATA)
// ------------------------------------------------------------------

async function parseType14(rec: Buffer, warnings: string[]): Promise<FingerprintImage[]> {
  // Parse the leading ASCII fields, but slice the raw image bytes for field 999
  // directly from the buffer (it is binary and must not be string-coerced).
  const { fields, dataStart, dataEnd } = splitTaggedWithBinaryData(rec);

  const hll = parseIntSafe(fields.get(6));
  const vll = parseIntSafe(fields.get(7));
  const cga = fields.get(11) ?? "";
  const imp = parseIntSafe(fields.get(3));
  const fgp = parseIntSafe(fields.get(13)) || parseIntSafe(firstItem(fields.get(13)));

  const data = new Uint8Array(rec.subarray(dataStart, dataEnd));
  let compression = compressionFromToken(cga);
  if (compression === "UNKNOWN" || compression === "NONE") {
    const sniffed = detectCompression(data);
    if (sniffed !== "UNKNOWN") compression = sniffed;
  }

  const img: FingerprintImage = {
    sourceType: 14,
    fingerPosition: normalizeFgp(fgp, imp),
    width: hll,
    height: vll,
    compression,
    data,
  };

  const decoded = await decodeForEmbedding({
    bytes: data,
    compression,
    width: hll,
    height: vll,
  });
  img.pngData = decoded.pngData;
  img.decodeNote = decoded.note;
  if (decoded.note) warnings.push(`FGP ${img.fingerPosition} (Type-14): ${decoded.note}`);

  return [img];
}

/**
 * For Type-13/14 records, parse ASCII fields up to and including the 999 tag,
 * then return the byte range of the 999 DATA value (everything after "999:"
 * up to a trailing FS).
 */
function splitTaggedWithBinaryData(rec: Buffer): {
  fields: Map<number, string>;
  dataStart: number;
  dataEnd: number;
} {
  const fields = new Map<number, string>();
  let i = 0;
  let dataStart = rec.length;
  let dataEnd = rec.length;
  if (dataEnd > 0 && rec[dataEnd - 1] === FS) dataEnd -= 1;

  while (i < rec.length) {
    // Read tag up to ':'
    let tag = "";
    const tagStart = i;
    while (i < rec.length && rec[i] !== 0x3a && rec[i] !== GS) {
      tag += String.fromCharCode(rec[i]);
      i++;
    }
    if (i >= rec.length) break;
    if (rec[i] === GS) {
      i++;
      continue;
    }
    i++; // skip ':'

    const fieldMatch = /^(\d+)\.(\d+)$/.exec(tag.trim());
    const fieldNum = fieldMatch ? parseInt(fieldMatch[2], 10) : NaN;

    if (fieldNum === 999) {
      // Remaining bytes (minus trailing FS) are the image.
      dataStart = i;
      break;
    }

    // Read value up to GS.
    const valStart = i;
    while (i < rec.length && rec[i] !== GS) i++;
    const value = latin1(rec.subarray(valStart, i));
    if (i < rec.length) i++; // skip GS
    if (!Number.isNaN(fieldNum)) fields.set(fieldNum, value);
  }

  return { fields, dataStart, dataEnd };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Latin-1 decode that preserves bytes 1:1 (no UTF-8 mangling). */
function latin1(b: Buffer): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function parseIntSafe(v?: string): number {
  if (v == null) return 0;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function firstItem(v?: string): string | undefined {
  if (v == null) return undefined;
  return v.split(String.fromCharCode(US))[0];
}

/**
 * Normalize a raw FGP/IMP into one of the 14 FD-258 box positions (1-14).
 * NIST FGP codes: 1-10 individual fingers; 13 right four plain; 14 left four
 * plain; 15 right thumb plain; 16 left thumb plain. We collapse these to the
 * card's layout: 1-10 rolled boxes, 11 = right thumb plain, 12 = left thumb
 * plain, 13 = right four, 14 = left four.
 */
function normalizeFgp(fgp: number, _imp: number): number {
  switch (fgp) {
    case 15:
      return 11; // right thumb plain
    case 16:
      return 12; // left thumb plain
    case 13:
      return 13; // right four
    case 14:
      return 14; // left four
    default:
      return fgp; // 1-10 rolled, others passed through
  }
}
